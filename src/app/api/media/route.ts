import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getActiveSession } from "@/lib/server/active-session";
import {
    commitServerPatches,
    commitServerMutations,
    deleteServerDocument,
    getServerDocument,
    listServerCollection,
    patchServerDocument,
    queryServerCollection,
} from "@/lib/server/firebase-rest";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { scanUntrustedCode } from "@/lib/server/security-scanner";

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
    fileCount?: number;
    createdAt?: string;
    updatedAt?: string;
    status?: string;
    contributedToSecurity?: boolean;
    license?: string;
    likeCount?: number;
    commentCount?: number;
};

type MediaFile = { name?: string; lang?: string; code?: string; order?: number };
type Engagement = { postId?: string; userEmail?: string; createdAt?: string };
type MediaComment = { postId?: string; authorEmail?: string; authorName?: string; authorAvatar?: string | null; text?: string; createdAt?: string };

const emailId = (email: string) => createHash("sha256").update(email).digest("hex").slice(0, 40);
const cleanText = (value: unknown, max: number) => typeof value === "string" ? value.trim().replace(/\0/g, "").slice(0, max) : "";
const cleanTags = (value: unknown) => Array.isArray(value)
    ? [...new Set(value.map((tag) => cleanText(tag, 24).toLowerCase()).filter(Boolean))].slice(0, 6)
    : [];

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

async function optionalActiveEmail() {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email?.toLowerCase();
    if (!email) return "";
    const user = await getServerDocument<{ banned?: boolean; suspended?: boolean }>(`users/${email}`);
    return user && !user.banned && !user.suspended ? email : "";
}

export async function GET(request: NextRequest) {
    const id = cleanText(request.nextUrl.searchParams.get("id"), 100);
    try {
        const email = await optionalActiveEmail();
        if (id) {
            const post = await getServerDocument<MediaPost>(`media_posts/${id}`);
            if (!post || post.status !== "published") return NextResponse.json({ error: "Proje bulunamadı." }, { status: 404 });
            const [files, comments] = await Promise.all([
                listServerCollection<MediaFile>(`media_posts/${id}/files`, 50),
                queryServerCollection<MediaComment>("media_comments", "postId", "EQUAL", id, { limit: 300 }),
            ]);
            const myLike = email ? await getServerDocument<Engagement>(`media_likes/${id}_${emailId(email)}`) : null;
            const viewer = email ? await getServerDocument<{ securityResearchConsent?: boolean }>(`users/${email}`) : null;
            return NextResponse.json({
                post: publicPost({ ...post, _id: id }, Number(post.likeCount || 0), Number(post.commentCount || comments.length), Boolean(myLike), email),
                files: files.sort((a, b) => Number(a.order || 0) - Number(b.order || 0)).map(({ name, lang, code, order }) => ({ name, lang, code, order })),
                comments: comments
                    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")))
                    .map((comment) => ({ id: comment._id, author: comment.authorName || "Kullanıcı", authorAvatar: comment.authorAvatar || null, text: comment.text || "", createdAt: comment.createdAt })),
                viewer: { signedIn: Boolean(email), securityResearchConsent: Boolean(viewer?.securityResearchConsent) },
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
        const viewer = email ? await getServerDocument<{ securityResearchConsent?: boolean }>(`users/${email}`) : null;
        return NextResponse.json({ posts: result, viewer: { signedIn: Boolean(email), securityResearchConsent: Boolean(viewer?.securityResearchConsent) } }, { headers: jsonSecurityHeaders({ "Cache-Control": "private, max-age=15" }) });
    } catch {
        return NextResponse.json({ error: "Hanogt Media şu anda yüklenemiyor." }, { status: 503, headers: jsonSecurityHeaders() });
    }
}

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
    const activeSession = await getActiveSession();
    if (!activeSession) return NextResponse.json({ error: "Etkin oturum gerekli." }, { status: 401 });
    const { email, session, user } = activeSession;
    const sessionName = session?.user?.name || email.split("@")[0];
    const sessionImage = session?.user?.image || null;
    const rate = await enforceRateLimit(`media:${email}`, 40, 60_000);
    if (!rate.allowed) return NextResponse.json({ error: "Çok fazla işlem. Biraz sonra tekrar deneyin." }, { status: 429 });
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = cleanText(body.action, 30);

    try {
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

        if (action === "publish") {
            const projectId = cleanText(body.projectId, 100);
            const title = cleanText(body.title, 100);
            const description = cleanText(body.description, 1200);
            const license = ["all-rights-reserved", "MIT", "Apache-2.0", "GPL-3.0"].includes(String(body.license)) ? String(body.license) : "all-rights-reserved";
            if (!projectId || !title) return NextResponse.json({ error: "Proje ve başlık gereklidir." }, { status: 400 });
            const project = await getServerDocument<{ email?: string; lang?: string; name?: string }>(`projects/${projectId}`);
            if (!project || project.email !== email) return NextResponse.json({ error: "Proje bulunamadı veya yetkiniz yok." }, { status: 404 });
            const files = await listServerCollection<MediaFile>(`projects/${projectId}/files`, 50);
            if (!files.length) return NextResponse.json({ error: "Paylaşılabilir proje dosyası bulunamadı." }, { status: 409 });
            const totalCodeLength = files.reduce((total, file) => total + String(file.code || "").length, 0);
            if (totalCodeLength > 1_000_000) return NextResponse.json({ error: "Media yayını toplam 1.000.000 karakter sınırını aşıyor." }, { status: 413 });
            const combined = files.map((file) => `// ${file.name || "file"}\n${file.code || ""}`).join("\n");
            const scan = scanUntrustedCode(combined);
            if (!scan.allowed) return NextResponse.json({ error: "Proje, herkese açık paylaşım için güvenlik incelemesine takıldı.", findings: scan.findings.map((finding) => finding.message) }, { status: 422 });
            const profile = await getServerDocument<{ username?: string; avatarUrl?: string }>(`public_profiles/${email}`);
            const postId = randomUUID();
            const languages = [...new Set(files.map((file) => cleanText(file.lang, 30)).filter(Boolean))].slice(0, 12);
            const contribute = body.contribute === true && user.securityResearchConsent === true;
            const now = new Date();
            const writes = [
                {
                    path: `media_posts/${postId}`,
                    data: {
                        title,
                        description,
                        language: languages[0] || project.lang || "text",
                        languages,
                        tags: cleanTags(body.tags),
                        license,
                        ownerEmail: email,
                        ownerName: profile?.username || sessionName,
                        ownerAvatar: profile?.avatarUrl || sessionImage,
                        showAuthor: body.showAuthor === true,
                        sourceProjectId: projectId,
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
                    path: `media_posts/${postId}/files/${String(index).padStart(3, "0")}`,
                    data: { name: cleanText(file.name, 120) || `file-${index + 1}`, lang: cleanText(file.lang, 30) || "text", code: String(file.code || "").slice(0, 500_000), order: index },
                    exists: false,
                })),
                ...(contribute ? [{
                    path: `security_training_contributions/${postId}`,
                    data: { postId, ownerEmail: email, consentVersion: "2026-09-03", purpose: "human-reviewed-security-improvement", status: "eligible", createdAt: now },
                    exists: false,
                }] : []),
            ];
            await commitServerPatches(writes);
            return NextResponse.json({ success: true, id: postId }, { status: 201, headers: jsonSecurityHeaders() });
        }

        const postId = cleanText(body.postId, 100);
        const post = postId ? await getServerDocument<MediaPost>(`media_posts/${postId}`) : null;
        if (!post || post.status !== "published") return NextResponse.json({ error: "Proje bulunamadı." }, { status: 404 });

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
            if (!text) return NextResponse.json({ error: "Yorum boş olamaz." }, { status: 400 });
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
            if (!reason) return NextResponse.json({ error: "Bildirim açıklaması gereklidir." }, { status: 400 });
            const id = `${postId}_${emailId(email)}`;
            await patchServerDocument(`media_reports/${id}`, { postId, reporterEmail: email, category, reason, status: "open", createdAt: new Date() });
            return NextResponse.json({ success: true }, { status: 201, headers: jsonSecurityHeaders() });
        }
        if (action === "delete") {
            if (post.ownerEmail !== email) return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });
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
        return NextResponse.json({ error: "Geçersiz işlem." }, { status: 400 });
    } catch (error) {
        const conflict = error instanceof Error && "status" in error && (error as Error & { status?: number }).status === 409;
        return NextResponse.json({ error: conflict ? "İşlem başka bir güncellemeyle çakıştı; tekrar deneyin." : "Media işlemi tamamlanamadı." }, { status: conflict ? 409 : 500 });
    }
}
