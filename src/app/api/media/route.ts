import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
    cleanMediaDescription,
    cleanMediaTags,
    cleanMediaTitle,
    mediaLanguages,
    mediaScanText,
    normalizeMediaFiles,
    normalizeMediaLicense,
    type MediaFile,
    type MediaFilesError,
    type MediaLicense,
} from "@/components/Editor/media-publish";
import { getActiveSession, getSignedInSession } from "@/lib/server/active-session";
import {
    commitServerPatches,
    commitServerMutations,
    deleteServerDocument,
    getServerDocument,
    isWriteConflict,
    listServerCollection,
    patchServerDocument,
    queryServerCollection,
} from "@/lib/server/firebase-rest";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { scanUntrustedCode, type SecurityScanResult } from "@/lib/server/security-scanner";
import { isDocId } from "@/lib/server/validate";

type MediaPost = {
    title?: string;
    description?: string;
    language?: string;
    languages?: string[];
    tags?: string[];
    ownerEmail?: string;
    ownerName?: string;
    ownerAvatar?: string | null;
    showAuthor?: boolean;
    sourceProjectId?: string | null;
    fileCount?: number;
    createdAt?: string;
    updatedAt?: string;
    status?: string;
    contributedToSecurity?: boolean;
    license?: string;
    likeCount?: number;
    commentCount?: number;
};

type MediaFileDoc = { name?: string; lang?: string; code?: string; order?: number };
type Engagement = { postId?: string; userEmail?: string; createdAt?: string };
type MediaComment = { postId?: string; authorEmail?: string; authorName?: string; authorAvatar?: string | null; text?: string; createdAt?: string };
type PostFields = { title: string; description: string; tags: string[]; license: MediaLicense; showAuthor: boolean };
type Mutations = Parameters<typeof commitServerMutations>[0];

/** Actions that store code; they share a second, stricter rate limit. */
const PUBLISHING_ACTIONS = new Set(["publish", "publishFiles", "update"]);
/** JSON text of a request; 1 000 000 characters of code stay well below it after escaping. */
const MAX_BODY_CHARS = 4_000_000;

const emailId = (email: string) => createHash("sha256").update(email).digest("hex").slice(0, 40);
const cleanText = (value: unknown, max: number) => typeof value === "string" ? value.trim().replace(/\0/g, "").slice(0, max) : "";
const fileDocId = (index: number) => String(index).padStart(3, "0");
const byOrder = (a: MediaFileDoc, b: MediaFileDoc) => Number(a.order || 0) - Number(b.order || 0);

/** Errors carry a Turkish message and a stable `code` that clients translate. */
function failure(status: number, error: string, code: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
    return NextResponse.json({ error, code, ...extra }, { status, headers: jsonSecurityHeaders(headers) });
}

const FILE_ERRORS: Record<MediaFilesError, { status: number; message: string }> = {
    invalid_files: { status: 400, message: "Dosyalar okunamadı." },
    no_files: { status: 400, message: "Yayınlamak için en az bir dosya seçin." },
    too_many_files: { status: 413, message: "Bir yayında en fazla 50 dosya olabilir." },
    file_too_large: { status: 413, message: "Dosya başına 500.000 karakter sınırı aşıldı." },
    total_too_large: { status: 413, message: "Media yayını toplam 1.000.000 karakter sınırını aşıyor." },
};

function filesFailure(result: { error: MediaFilesError; name?: string }) {
    const entry = FILE_ERRORS[result.error];
    return failure(entry.status, result.name ? `${result.name}: ${entry.message}` : entry.message, result.error, result.name ? { file: result.name } : {});
}

function scanFailure(scan: SecurityScanResult) {
    return failure(422, "Proje, herkese açık paylaşım için güvenlik incelemesine takıldı.", "blocked", {
        findings: scan.findings.map((finding) => finding.line ? `${finding.message} (satır ${finding.line})` : finding.message),
        // Lines refer to the scanned text (see mediaScanText), so clients can point at the file.
        details: scan.findings.map((finding) => ({ id: finding.id, severity: finding.severity, message: finding.message, line: finding.line ?? null })),
    });
}

function readPostFields(body: Record<string, unknown>): PostFields {
    return {
        title: cleanMediaTitle(body.title),
        description: cleanMediaDescription(body.description),
        tags: cleanMediaTags(body.tags),
        license: normalizeMediaLicense(body.license),
        showAuthor: body.showAuthor === true,
    };
}

async function readBody(request: NextRequest): Promise<Record<string, unknown> | "too_large" | null> {
    if (Number(request.headers.get("content-length") || 0) > MAX_BODY_CHARS * 3) return "too_large";
    let text: string;
    try {
        text = await request.text();
    } catch {
        return null;
    }
    if (text.length > MAX_BODY_CHARS) return "too_large";
    try {
        const parsed = JSON.parse(text) as unknown;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
        return null;
    }
}

function publicPost(post: MediaPost & { _id: string }, likeCount: number, commentCount: number, liked: boolean, viewerEmail = "") {
    return {
        id: post._id,
        title: post.title || "İsimsiz proje",
        description: post.description || "",
        language: post.language || "text",
        languages: post.languages || [post.language || "text"],
        tags: post.tags || [],
        author: post.showAuthor ? (post.ownerName || "Hanogt geliştiricisi") : "Anonim geliştirici",
        authorAvatar: post.showAuthor ? (post.ownerAvatar || null) : null,
        showAuthor: Boolean(post.showAuthor),
        fileCount: post.fileCount || 1,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        likeCount,
        commentCount,
        liked,
        owned: Boolean(viewerEmail && post.ownerEmail === viewerEmail),
        contributedToSecurity: Boolean(post.contributedToSecurity),
        license: post.license || "all-rights-reserved",
    };
}

/** The signed-in, active viewer (or an anonymous one) and their research consent. */
async function optionalViewer() {
    // Anonymous visitors must still be able to browse Media even when the
    // session lookup fails (expired cookie, transient Firestore error).
    try {
        const session = await getSignedInSession();
        const email = session?.user?.email?.toLowerCase();
        if (!email) return { email: "", consent: false };
        const user = await getServerDocument<{ banned?: boolean; suspended?: boolean; securityResearchConsent?: boolean }>(`users/${email}`);
        return user && !user.banned && !user.suspended ? { email, consent: Boolean(user.securityResearchConsent) } : { email: "", consent: false };
    } catch {
        return { email: "", consent: false };
    }
}

type OwnProject = { name?: string; lang?: string; email?: string; fileCount?: number; date?: string; createdAt?: string; updatedAt?: string };

/** Lists the caller's code projects for the publish dialog (server-side, no client index needed). */
async function listPublishableProjects(email: string) {
    const projects = await queryServerCollection<OwnProject>("projects", "email", "EQUAL", email, { limit: 200 });
    return projects
        .map((project) => ({
            id: project._id,
            name: cleanText(project.name, 120) || "İsimsiz proje",
            lang: cleanText(project.lang, 30) || "text",
            fileCount: Number(project.fileCount || 1),
            updatedAt: String(project.updatedAt || project.createdAt || ""),
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Writes a new post with its files atomically ("publish" and "publishFiles" store the same shape). */
async function createPost(options: {
    email: string;
    ownerName: string;
    ownerAvatar: string | null;
    fields: PostFields;
    files: MediaFile[];
    sourceProjectId: string | null;
    contribute: boolean;
}) {
    const { email, fields, files, contribute } = options;
    const postId = randomUUID();
    const languages = mediaLanguages(files);
    const now = new Date();
    await commitServerPatches([
        {
            path: `media_posts/${postId}`,
            data: {
                title: fields.title,
                description: fields.description,
                language: languages[0] || "plaintext",
                languages,
                tags: fields.tags,
                license: fields.license,
                ownerEmail: email,
                ownerName: options.ownerName,
                ownerAvatar: options.ownerAvatar,
                showAuthor: fields.showAuthor,
                sourceProjectId: options.sourceProjectId,
                fileCount: files.length,
                likeCount: 0,
                commentCount: 0,
                status: "published",
                contributedToSecurity: contribute,
                createdAt: now,
                updatedAt: now,
            },
            exists: false,
        },
        ...files.map((file, index) => ({
            path: `media_posts/${postId}/files/${fileDocId(index)}`,
            data: { name: file.name, lang: file.lang, code: file.code, order: index },
            exists: false,
        })),
        ...(contribute ? [{
            path: `security_training_contributions/${postId}`,
            data: { postId, ownerEmail: email, consentVersion: "2026-09-03", purpose: "human-reviewed-security-improvement", status: "eligible", createdAt: now },
            exists: false,
        }] : []),
    ]);
    return postId;
}

export async function GET(request: NextRequest) {
    const id = cleanText(request.nextUrl.searchParams.get("id"), 100);
    const scope = cleanText(request.nextUrl.searchParams.get("scope"), 30);
    if (scope === "my-projects") {
        const activeSession = await getActiveSession();
        if (!activeSession) return failure(401, "Projelerinizi görmek için giriş yapın.", "unauthenticated");
        try {
            return NextResponse.json({ projects: await listPublishableProjects(activeSession.email) }, { headers: jsonSecurityHeaders() });
        } catch {
            return failure(503, "Projeleriniz şu anda yüklenemiyor.", "unavailable");
        }
    }
    try {
        const viewer = await optionalViewer();
        const { email } = viewer;
        const viewerInfo = { signedIn: Boolean(email), securityResearchConsent: viewer.consent };
        if (scope === "viewer") {
            // Light lookup for the editor's publish dialog: the viewer and, optionally, one post without files or comments.
            const postId = cleanText(request.nextUrl.searchParams.get("postId"), 100);
            const post = isDocId(postId, 100) ? await getServerDocument<MediaPost>(`media_posts/${postId}`) : null;
            return NextResponse.json({
                viewer: viewerInfo,
                post: post && post.status === "published" ? publicPost({ ...post, _id: postId }, Number(post.likeCount || 0), Number(post.commentCount || 0), false, email) : null,
            }, { headers: jsonSecurityHeaders() });
        }
        if (id) {
            if (!isDocId(id, 100)) return failure(404, "Proje bulunamadı.", "invalid_id");
            const post = await getServerDocument<MediaPost>(`media_posts/${id}`);
            if (!post || post.status !== "published") return failure(404, "Proje bulunamadı.", "not_found");
            const [files, comments, myLike] = await Promise.all([
                listServerCollection<MediaFileDoc>(`media_posts/${id}/files`, 50),
                queryServerCollection<MediaComment>("media_comments", "postId", "EQUAL", id, { limit: 300 }),
                email ? getServerDocument<Engagement>(`media_likes/${id}_${emailId(email)}`) : Promise.resolve(null),
            ]);
            return NextResponse.json({
                post: publicPost({ ...post, _id: id }, Number(post.likeCount || 0), Number(post.commentCount || comments.length), Boolean(myLike), email),
                files: files.sort(byOrder).map(({ name, lang, code, order }) => ({ name, lang, code, order })),
                comments: comments
                    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")))
                    .map((comment) => ({ id: comment._id, author: comment.authorName || "Kullanıcı", authorAvatar: comment.authorAvatar || null, text: comment.text || "", createdAt: comment.createdAt })),
                viewer: viewerInfo,
            }, { headers: jsonSecurityHeaders() });
        }

        const [posts, viewerLikes] = await Promise.all([
            listServerCollection<MediaPost>("media_posts", 200),
            email ? queryServerCollection<Engagement>("media_likes", "userEmail", "EQUAL", email, { limit: 1000 }) : Promise.resolve([]),
        ]);
        const liked = new Set(viewerLikes.map((like) => like.postId).filter((value): value is string => Boolean(value)));
        const result = posts
            .filter((post) => post.status === "published")
            .map((post) => publicPost(post, Number(post.likeCount || 0), Number(post.commentCount || 0), liked.has(post._id), email))
            .sort((a, b) => (b.likeCount - a.likeCount) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
        return NextResponse.json({ posts: result, viewer: viewerInfo }, { headers: jsonSecurityHeaders({ "Cache-Control": "private, max-age=15" }) });
    } catch {
        return failure(503, "Hanogt Media şu anda yüklenemiyor.", "unavailable");
    }
}

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return failure(403, "Geçersiz istek kaynağı.", "invalid_origin");
    const activeSession = await getActiveSession();
    if (!activeSession) return failure(401, "Bu işlem için giriş yapmanız gerekiyor.", "unauthenticated");
    const { email, session, user } = activeSession;
    const sessionName = session?.user?.name || email.split("@")[0];
    const sessionImage = session?.user?.image || null;
    const body = await readBody(request);
    if (body === "too_large") return failure(413, "Gönderilen veri çok büyük.", "payload_too_large");
    if (!body) return failure(400, "İstek okunamadı.", "invalid_request");
    const action = cleanText(body.action, 30);

    try {
        const rate = await enforceRateLimit(`media:${email}`, 40, 60_000);
        if (!rate.allowed) return failure(429, "Çok fazla işlem. Biraz sonra tekrar deneyin.", "rate_limited", {}, { "Retry-After": String(rate.retryAfterSeconds) });
        if (PUBLISHING_ACTIONS.has(action)) {
            const publishRate = await enforceRateLimit(`media-publish:${email}`, 30, 10 * 60_000);
            if (!publishRate.allowed) return failure(429, "Kısa sürede çok fazla yayın işlemi yapıldı. Biraz sonra tekrar deneyin.", "rate_limited", {}, { "Retry-After": String(publishRate.retryAfterSeconds) });
        }

        if (action === "consent") {
            const enabled = body.enabled === true;
            await patchServerDocument(`users/${email}`, {
                securityResearchConsent: enabled,
                securityResearchConsentAt: new Date(),
                securityResearchConsentVersion: "2026-09-03",
            }, { updateFields: ["securityResearchConsent", "securityResearchConsentAt", "securityResearchConsentVersion"] });
            if (!enabled) {
                const contributions = await queryServerCollection("security_training_contributions", "ownerEmail", "EQUAL", email, { limit: 1000 });
                await Promise.all(contributions.map((item) => deleteServerDocument(item._path)));
            }
            return NextResponse.json({ success: true, enabled }, { headers: jsonSecurityHeaders() });
        }

        if (action === "publish" || action === "publishFiles") {
            const fields = readPostFields(body);
            let files: MediaFile[];
            let sourceProjectId: string | null = null;
            if (action === "publish") {
                // A project saved to the cloud from the editor (projects/{id}).
                const projectId = cleanText(body.projectId, 100);
                if (!projectId || !fields.title) return failure(400, "Proje ve başlık gereklidir.", fields.title ? "invalid_request" : "title_required");
                if (!isDocId(projectId, 100)) return failure(404, "Proje bulunamadı veya yetkiniz yok.", "not_found");
                const project = await getServerDocument<{ email?: string }>(`projects/${projectId}`);
                if (!project || String(project.email || "").toLowerCase() !== email) return failure(404, "Proje bulunamadı veya yetkiniz yok.", "not_found");
                const projectFiles = await listServerCollection<MediaFileDoc>(`projects/${projectId}/files`, 50);
                if (!projectFiles.length) return failure(409, "Paylaşılabilir proje dosyası bulunamadı.", "no_files");
                const normalized = normalizeMediaFiles(projectFiles.sort(byOrder).map((file) => ({
                    name: typeof file.name === "string" ? file.name : "",
                    lang: typeof file.lang === "string" ? file.lang : "",
                    code: typeof file.code === "string" ? file.code : "",
                })));
                if (!normalized.ok) return filesFailure(normalized);
                files = normalized.files;
                sourceProjectId = projectId;
            } else {
                // Files sent by the editor: [{ name, lang, code }], no cloud project needed.
                if (!fields.title) return failure(400, "Başlık gereklidir.", "title_required");
                const normalized = normalizeMediaFiles(body.files);
                if (!normalized.ok) return filesFailure(normalized);
                files = normalized.files;
            }
            const scan = scanUntrustedCode(mediaScanText(files));
            if (!scan.allowed) return scanFailure(scan);
            const profile = await getServerDocument<{ username?: string; avatarUrl?: string }>(`public_profiles/${email}`);
            const postId = await createPost({
                email,
                ownerName: profile?.username || sessionName,
                ownerAvatar: profile?.avatarUrl || sessionImage,
                fields,
                files,
                sourceProjectId,
                contribute: body.contribute === true && user.securityResearchConsent === true,
            });
            return NextResponse.json({ success: true, id: postId }, { status: 201, headers: jsonSecurityHeaders() });
        }

        const postId = cleanText(body.postId, 100);

        if (action === "update") {
            // Owner only. Every field is optional; `files` replaces all files after a new scan.
            if (!isDocId(postId, 100)) return failure(404, "Proje bulunamadı.", "not_found");
            const changes: Record<string, unknown> = {};
            if (body.title !== undefined) {
                const title = cleanMediaTitle(body.title);
                if (!title) return failure(400, "Başlık gereklidir.", "title_required");
                changes.title = title;
            }
            if (body.description !== undefined) changes.description = cleanMediaDescription(body.description);
            if (body.tags !== undefined) changes.tags = cleanMediaTags(body.tags);
            if (body.license !== undefined) changes.license = normalizeMediaLicense(body.license);
            if (body.showAuthor !== undefined) changes.showAuthor = body.showAuthor === true;
            let files: MediaFile[] | null = null;
            if (body.files !== undefined && body.files !== null) {
                const normalized = normalizeMediaFiles(body.files);
                if (!normalized.ok) return filesFailure(normalized);
                const scan = scanUntrustedCode(mediaScanText(normalized.files));
                if (!scan.allowed) return scanFailure(scan);
                files = normalized.files;
            }
            if (!Object.keys(changes).length && !files) return failure(400, "Güncellenecek bir değişiklik yok.", "nothing_to_update");
            const profile = await getServerDocument<{ username?: string; avatarUrl?: string }>(`public_profiles/${email}`);
            for (let attempt = 0; ; attempt += 1) {
                const post = await getServerDocument<MediaPost>(`media_posts/${postId}`);
                if (!post || post.status !== "published") return failure(404, "Proje bulunamadı.", "not_found");
                if (post.ownerEmail !== email) return failure(403, "Bu yayını yalnızca sahibi değiştirebilir.", "forbidden");
                // The version check also stops the write if the post was deleted meanwhile.
                if (!post._updateTime) return failure(409, "İşlem başka bir güncellemeyle çakıştı; tekrar deneyin.", "conflict");
                const now = new Date();
                const languages = files ? mediaLanguages(files) : [];
                const mutations: Mutations = [{
                    type: "update",
                    path: `media_posts/${postId}`,
                    // Likes and comments are left untouched; the owner's public name follows the profile.
                    data: {
                        ...changes,
                        ownerName: profile?.username || sessionName,
                        ownerAvatar: profile?.avatarUrl || sessionImage,
                        updatedAt: now,
                        ...(files ? { fileCount: files.length, language: languages[0] || "plaintext", languages } : {}),
                    },
                    updateTime: post._updateTime,
                }];
                if (files) {
                    const existing = await listServerCollection<MediaFileDoc>(`media_posts/${postId}/files`, 100);
                    const kept = new Set(files.map((_, index) => fileDocId(index)));
                    mutations.push(
                        ...files.map((file, index) => ({
                            type: "update" as const,
                            path: `media_posts/${postId}/files/${fileDocId(index)}`,
                            data: { name: file.name, lang: file.lang, code: file.code, order: index },
                        })),
                        ...existing.filter((file) => !kept.has(file._id)).map((file) => ({ type: "delete" as const, path: file._path })),
                    );
                }
                try {
                    // One commit: the post and all of its files change together or not at all.
                    await commitServerMutations(mutations);
                    return NextResponse.json({ success: true, id: postId, updatedAt: now.toISOString() }, { headers: jsonSecurityHeaders() });
                } catch (error) {
                    // A like or comment changed the post in between: read it again.
                    if (isWriteConflict(error) && attempt < 2) continue;
                    throw error;
                }
            }
        }

        const post = isDocId(postId, 100) ? await getServerDocument<MediaPost>(`media_posts/${postId}`) : null;
        if (!post || post.status !== "published") return failure(404, "Proje bulunamadı.", "not_found");

        if (action === "like") {
            const path = `media_likes/${postId}_${emailId(email)}`;
            const existing = await getServerDocument<Engagement>(path);
            await commitServerMutations(existing ? [
                { type: "delete", path, updateTime: existing._updateTime },
                { type: "increment", path: `media_posts/${postId}`, fields: { likeCount: -1 } },
            ] : [
                { type: "create", path, data: { postId, userEmail: email, createdAt: new Date() } },
                { type: "increment", path: `media_posts/${postId}`, fields: { likeCount: 1 } },
            ]);
            return NextResponse.json({ success: true, liked: !existing }, { headers: jsonSecurityHeaders() });
        }
        if (action === "comment") {
            const text = cleanText(body.text, 1200);
            if (!text) return failure(400, "Yorum boş olamaz.", "empty_comment");
            const profile = await getServerDocument<{ username?: string; avatarUrl?: string }>(`public_profiles/${email}`);
            const id = randomUUID();
            await commitServerMutations([
                { type: "create", path: `media_comments/${id}`, data: { postId, authorEmail: email, authorName: profile?.username || sessionName, authorAvatar: profile?.avatarUrl || sessionImage, text, createdAt: new Date() } },
                { type: "increment", path: `media_posts/${postId}`, fields: { commentCount: 1 } },
            ]);
            return NextResponse.json({ success: true, id }, { status: 201, headers: jsonSecurityHeaders() });
        }
        if (action === "report") {
            const category = ["malware", "copyright", "personal_data", "spam", "other"].includes(String(body.category)) ? String(body.category) : "other";
            const reason = cleanText(body.reason, 1200);
            if (!reason) return failure(400, "Bildirim açıklaması gereklidir.", "empty_report");
            const id = `${postId}_${emailId(email)}`;
            await patchServerDocument(`media_reports/${id}`, { postId, reporterEmail: email, category, reason, status: "open", createdAt: new Date() });
            return NextResponse.json({ success: true }, { status: 201, headers: jsonSecurityHeaders() });
        }
        if (action === "delete") {
            if (post.ownerEmail !== email) return failure(403, "Yetkiniz yok.", "forbidden");
            const [files, likes, comments, reports] = await Promise.all([
                listServerCollection(`media_posts/${postId}/files`, 50),
                queryServerCollection("media_likes", "postId", "EQUAL", postId, { limit: 1000 }),
                queryServerCollection("media_comments", "postId", "EQUAL", postId, { limit: 1000 }),
                queryServerCollection("media_reports", "postId", "EQUAL", postId, { limit: 1000 }),
            ]);
            await Promise.all([...files, ...likes, ...comments, ...reports].map((item) => deleteServerDocument(item._path)));
            await Promise.all([
                deleteServerDocument(`security_training_contributions/${postId}`),
                deleteServerDocument(`media_posts/${postId}`),
            ]);
            return NextResponse.json({ success: true }, { headers: jsonSecurityHeaders() });
        }
        return failure(400, "Geçersiz işlem.", "invalid_action");
    } catch (error) {
        const conflict = isWriteConflict(error);
        return failure(conflict ? 409 : 500, conflict ? "İşlem başka bir güncellemeyle çakıştı; tekrar deneyin." : "Media işlemi tamamlanamadı.", conflict ? "conflict" : "failed");
    }
}
