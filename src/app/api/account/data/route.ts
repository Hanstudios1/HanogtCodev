import { NextRequest, NextResponse } from "next/server";
import { deleteAccountData } from "@/lib/server/account-deletion";
import { getActiveSession } from "@/lib/server/active-session";
import { getServerDocument, listServerCollection, queryServerCollection } from "@/lib/server/firebase-rest";
import { voterHash } from "@/lib/server/ai-rankings";
import { likerHash } from "@/lib/server/arcade";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";

// Deleting a large account takes many Firestore round trips.
export const maxDuration = 60;

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

    const summary = await deleteAccountData(email, { scope: "all" });
    // The lines name steps and Firestore errors, never addresses.
    if (summary.errors.length) console.error("[account:delete] some data could not be deleted:", summary.errors);
    if (!summary.accountDeleted) {
        // The account and this session still work, so the person can simply try again.
        return NextResponse.json({ error: "Hesap silinemedi. Lütfen biraz sonra tekrar deneyin." }, { status: 503, headers: jsonSecurityHeaders() });
    }
    return NextResponse.json({ success: true, complete: summary.errors.length === 0 }, { headers: jsonSecurityHeaders() });
}
