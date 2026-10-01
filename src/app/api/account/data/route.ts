import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/server/active-session";
import {
    commitServerMutations,
    deleteFirebaseAuthUser,
    deleteServerDocument,
    deleteServerStorageObject,
    getServerDocument,
    listServerCollection,
    patchServerDocument,
    queryServerCollection,
} from "@/lib/server/firebase-rest";
import { voterHash } from "@/lib/server/ai-rankings";
import { likerHash } from "@/lib/server/arcade";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { isOwnedStoragePath } from "@/lib/server/validate";

type StoredMessage = { voicePath?: string };
type ArrayRecord = { friends?: string[]; blockedUsers?: string[]; likes?: string[]; comments?: Array<{ authorEmail?: string }> };

async function deleteCollection(path: string, onDocument?: (document: Record<string, unknown>) => Promise<void>) {
    const documents = await listServerCollection<Record<string, unknown>>(path);
    for (const document of documents) {
        if (onDocument) await onDocument(document);
        await deleteServerDocument(document._path);
    }
}

function publicAccountData(user: Record<string, unknown> | null) {
    if (!user) return {};
    const safe = { ...user };
    delete safe.password;
    delete safe.passwordHash;
    delete safe.role;
    delete safe.securityScore;
    delete safe._updateTime;
    delete safe._path;
    delete safe._id;
    return safe;
}

export async function GET() {
    const activeSession = await getActiveSession();
    if (!activeSession) return NextResponse.json({ error: "Etkin oturum gerekli." }, { status: 401 });
    const { email } = activeSession;

    const [user, projects, gameProjects, mediaPosts, groups, arcadeGames, newsComments, arcadeLikes, arenaVotes] = await Promise.all([
        getServerDocument<Record<string, unknown>>(`users/${email}`),
        queryServerCollection<Record<string, unknown>>("projects", "email", "EQUAL", email),
        queryServerCollection<Record<string, unknown>>("game_projects", "ownerEmail", "EQUAL", email),
        queryServerCollection<Record<string, unknown>>("media_posts", "ownerEmail", "EQUAL", email),
        queryServerCollection<Record<string, unknown>>("groups", "members", "ARRAY_CONTAINS", email),
        queryServerCollection<Record<string, unknown>>("arcade_games", "ownerEmail", "EQUAL", email).catch(() => []),
        queryServerCollection<Record<string, unknown>>("news_comments", "authorEmail", "EQUAL", email).catch(() => []),
        queryServerCollection<Record<string, unknown>>("arcade_likes", "liker", "EQUAL", likerHash(email)).catch(() => []),
        queryServerCollection<Record<string, unknown>>("arena_votes", "voter", "EQUAL", voterHash(email)).catch(() => []),
    ]);
    const exportedProjects = await Promise.all(projects.map(async (project) => ({
        ...publicAccountData(project),
        id: project._id,
        files: (await listServerCollection<Record<string, unknown>>(`projects/${project._id}/files`))
            .map((file) => publicAccountData(file)),
    })));
    const exportedGameProjects = await Promise.all(gameProjects.map(async (project) => ({
        ...publicAccountData(project),
        id: project._id,
        scripts: (await listServerCollection<Record<string, unknown>>(`game_projects/${project._id}/scripts`))
            .map((script) => publicAccountData(script)),
    })));

    return NextResponse.json({
        user: publicAccountData(user),
        projects: exportedProjects,
        gameProjects: exportedGameProjects,
        arcadeGames: arcadeGames.map((game) => ({ ...publicAccountData(game), id: game._id })),
        newsComments: newsComments.map((comment) => publicAccountData(comment)),
        arcadeLikes: arcadeLikes.map((like) => ({ gameId: like.gameId, createdAt: like.createdAt })),
        arenaVotes: arenaVotes.map((vote) => ({ category: vote.category, a: vote.a, b: vote.b, result: vote.result, day: vote.day })),
        mediaPosts: mediaPosts.map((post) => publicAccountData(post)),
        groups: groups.map((group) => publicAccountData(group)),
        exportedAt: new Date().toISOString(),
        note: "Kimlik bilgileri ve parola özetleri bu dosyaya dahil edilmez.",
    }, { headers: jsonSecurityHeaders() });
}

export async function DELETE(request: NextRequest) {
    if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
    const activeSession = await getActiveSession();
    if (!activeSession) return NextResponse.json({ error: "Etkin oturum gerekli." }, { status: 401 });
    const { email } = activeSession;
    const rate = await enforceRateLimit(`account-delete:${email}`, 2, 24 * 60 * 60_000);
    if (!rate.allowed) return NextResponse.json({ error: "Hesap silme isteği sınırı aşıldı." }, { status: 429 });

    const chats = await queryServerCollection<Record<string, unknown>>("chats", "participants", "ARRAY_CONTAINS", email);
    for (const chat of chats) {
        await deleteCollection(`chats/${chat._id}/messages`, async (message) => {
            // voicePath is written by clients: only delete files inside this chat's folder.
            const voicePath = (message as StoredMessage).voicePath;
            if (isOwnedStoragePath(voicePath, "voice-messages", chat._id)) await deleteServerStorageObject(voicePath);
        });
        await deleteServerDocument(chat._path);
    }

    const calls = await queryServerCollection<Record<string, unknown>>("calls", "participants", "ARRAY_CONTAINS", email);
    for (const call of calls) {
        await deleteCollection(`calls/${call._id}/callerCandidates`);
        await deleteCollection(`calls/${call._id}/calleeCandidates`);
        await deleteServerDocument(call._path);
    }

    const projects = await queryServerCollection<Record<string, unknown>>("projects", "email", "EQUAL", email);
    for (const project of projects) {
        await deleteCollection(`projects/${project._id}/files`);
        await deleteServerDocument(project._path);
    }

    const gameProjects = await queryServerCollection<Record<string, unknown>>("game_projects", "ownerEmail", "EQUAL", email);
    for (const project of gameProjects) {
        await deleteCollection(`game_projects/${project._id}/scripts`);
        await deleteServerDocument(project._path);
    }

    const arcadeGames = await queryServerCollection<Record<string, unknown>>("arcade_games", "ownerEmail", "EQUAL", email).catch(() => []);
    for (const game of arcadeGames) {
        const likes = await queryServerCollection<Record<string, unknown>>("arcade_likes", "gameId", "EQUAL", game._id).catch(() => []);
        for (const like of likes) await deleteServerDocument(like._path);
        await deleteServerDocument(game._path);
    }

    const newsComments = await queryServerCollection<Record<string, unknown>>("news_comments", "authorEmail", "EQUAL", email).catch(() => []);
    for (const comment of newsComments) {
        const newsId = typeof comment.newsId === "string" && /^[a-f0-9]{20}$/.test(comment.newsId) ? comment.newsId : "";
        await commitServerMutations([
            { type: "delete", path: String(comment._path) },
            ...(newsId ? [{ type: "increment" as const, path: `news_meta/${newsId}`, fields: { commentCount: -1 } }] : []),
        ]).catch(() => deleteServerDocument(String(comment._path)));
    }

    // Likes on other people's games (the like count is decremented) and pseudonymous arena votes.
    const arcadeLikes = await queryServerCollection<Record<string, unknown>>("arcade_likes", "liker", "EQUAL", likerHash(email)).catch(() => []);
    for (const like of arcadeLikes) {
        const gameId = typeof like.gameId === "string" ? like.gameId : "";
        await commitServerMutations([
            { type: "delete", path: String(like._path) },
            ...(gameId ? [{ type: "increment" as const, path: `arcade_games/${gameId}`, fields: { likes: -1 } }] : []),
        ]).catch(() => deleteServerDocument(String(like._path)));
    }
    const arenaVotes = await queryServerCollection<Record<string, unknown>>("arena_votes", "voter", "EQUAL", voterHash(email)).catch(() => []);
    for (const vote of arenaVotes) await deleteServerDocument(String(vote._path)).catch(() => undefined);

    const mediaPosts = await queryServerCollection<Record<string, unknown>>("media_posts", "ownerEmail", "EQUAL", email);
    for (const post of mediaPosts) {
        await deleteCollection(`media_posts/${post._id}/files`);
        for (const collectionName of ["media_likes", "media_comments", "media_reports"]) {
            const related = await queryServerCollection<Record<string, unknown>>(collectionName, "postId", "EQUAL", post._id);
            for (const item of related) await deleteServerDocument(item._path);
        }
        await deleteServerDocument(`security_training_contributions/${post._id}`);
        await deleteServerDocument(post._path);
    }
    for (const [collectionName, field] of [["media_likes", "userEmail"], ["media_comments", "authorEmail"], ["media_reports", "reporterEmail"], ["security_training_contributions", "ownerEmail"]] as const) {
        const records = await queryServerCollection<Record<string, unknown>>(collectionName, field, "EQUAL", email);
        for (const record of records) {
            const postId = typeof record.postId === "string" ? record.postId : "";
            if (postId && (collectionName === "media_likes" || collectionName === "media_comments")) {
                const post = await getServerDocument(`media_posts/${postId}`);
                if (post) {
                    const countField = collectionName === "media_likes" ? "likeCount" : "commentCount";
                    const currentCount = Number(post[countField] || 0);
                    await commitServerMutations(currentCount > 0 ? [
                        { type: "delete", path: record._path, updateTime: record._updateTime },
                        { type: "increment", path: `media_posts/${postId}`, fields: { [countField]: -1 } },
                    ] : [{ type: "delete", path: record._path, updateTime: record._updateTime }]);
                    continue;
                }
            }
            await deleteServerDocument(record._path);
        }
    }

    const groups = await queryServerCollection<Record<string, unknown> & { ownerEmail?: string; members?: string[]; admins?: string[] }>("groups", "members", "ARRAY_CONTAINS", email);
    for (const group of groups) {
        if (group.ownerEmail === email) {
            await deleteCollection(`groups/${group._id}/messages`, async (message) => {
                const voicePath = (message as StoredMessage).voicePath;
                if (isOwnedStoragePath(voicePath, "group-voice-messages", group._id)) await deleteServerStorageObject(voicePath);
            });
            await deleteCollection(`groups/${group._id}/files`);
            for (const collectionName of ["group_invites", "group_invite_links", "group_bans"]) {
                const related = await queryServerCollection<Record<string, unknown>>(collectionName, "groupId", "EQUAL", group._id).catch(() => []);
                for (const item of related) await deleteServerDocument(item._path);
            }
            await deleteServerDocument(group._path);
        } else {
            await patchServerDocument(group._path, {
                members: (group.members || []).filter((entry) => entry !== email),
                admins: (group.admins || []).filter((entry) => entry !== email),
                updatedAt: new Date(),
            }, { updateFields: ["members", "admins", "updatedAt"] });
        }
    }

    // Bans of this account and invite links it created in other groups; bans it
    // issued stay in force but no longer name it.
    for (const [collectionName, field] of [["group_bans", "email"], ["group_invite_links", "createdBy"]] as const) {
        const records = await queryServerCollection<Record<string, unknown>>(collectionName, field, "EQUAL", email).catch(() => []);
        for (const record of records) await deleteServerDocument(record._path);
    }
    const issuedBans = await queryServerCollection<Record<string, unknown>>("group_bans", "bannedBy", "EQUAL", email).catch(() => []);
    for (const ban of issuedBans) await patchServerDocument(ban._path, { bannedBy: null }, { updateFields: ["bannedBy"] });

    const remainingGroupMessages = await queryServerCollection<Record<string, unknown>>("messages", "fromEmail", "EQUAL", email, { allDescendants: true, limit: 1000 });
    for (const message of remainingGroupMessages) {
        if (!message._path.startsWith("groups/")) continue;
        const groupId = message._path.split("/")[1] || "";
        const voicePath = typeof message.voicePath === "string" ? message.voicePath : "";
        if (isOwnedStoragePath(voicePath, "group-voice-messages", groupId)) await deleteServerStorageObject(voicePath).catch(() => undefined);
        await patchServerDocument(message._path, {
            fromEmail: `deleted-${Buffer.from(email).toString("base64url").slice(0, 24)}`,
            author: "Silinmiş kullanıcı",
            authorAvatar: null,
            text: message.type === "voice" ? "Silinmiş sesli mesaj" : message.text,
            voicePath: null,
            voiceDuration: null,
        }, { updateFields: ["fromEmail", "author", "authorAvatar", "text", "voicePath", "voiceDuration"] });
    }

    for (const field of ["fromEmail", "toEmail"] as const) {
        const requests = await queryServerCollection<Record<string, unknown>>("friendRequests", field, "EQUAL", email);
        for (const friendRequest of requests) await deleteServerDocument(friendRequest._path);
    }
    for (const field of ["fromEmail", "toEmail"] as const) {
        const invites = await queryServerCollection<Record<string, unknown>>("group_invites", field, "EQUAL", email);
        for (const invite of invites) await deleteServerDocument(invite._path);
    }

    const friendOwners = await queryServerCollection<ArrayRecord>("users", "friends", "ARRAY_CONTAINS", email);
    for (const owner of friendOwners) {
        await patchServerDocument(owner._path, { friends: (owner.friends || []).filter((entry) => entry !== email) }, { updateFields: ["friends"] });
    }
    const blockers = await queryServerCollection<ArrayRecord>("users", "blockedUsers", "ARRAY_CONTAINS", email);
    for (const owner of blockers) {
        await patchServerDocument(owner._path, { blockedUsers: (owner.blockedUsers || []).filter((entry) => entry !== email) }, { updateFields: ["blockedUsers"] });
    }

    const authoredFeedback = await queryServerCollection<Record<string, unknown>>("feedback", "authorEmail", "EQUAL", email);
    for (const feedback of authoredFeedback) {
        await deleteServerDocument(feedback._path);
    }
    const remainingFeedback = await listServerCollection<ArrayRecord>("feedback");
    for (const feedback of remainingFeedback) {
        const likes = (feedback.likes || []).filter((entry) => entry !== email);
        const comments = (feedback.comments || []).filter((entry) => entry.authorEmail !== email);
        if (likes.length !== (feedback.likes || []).length || comments.length !== (feedback.comments || []).length) {
            await patchServerDocument(feedback._path, { likes, comments }, { updateFields: ["likes", "comments"] });
        }
    }

    const authoredComments = await queryServerCollection<Record<string, unknown>>("comments", "email", "EQUAL", email, { allDescendants: true });
    for (const comment of authoredComments) await deleteServerDocument(comment._path);
    await deleteCollection(`notifications/${email}/items`);

    await deleteServerDocument(`public_profiles/${email}`);
    await deleteServerDocument(`credentials/${email}`);
    await deleteServerDocument(`users/${email}`);
    await deleteFirebaseAuthUser(email);

    return NextResponse.json({ success: true }, { headers: jsonSecurityHeaders() });
}
