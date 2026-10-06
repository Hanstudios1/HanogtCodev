import { NextRequest, NextResponse } from "next/server";
import { createEngineId, nowIso } from "@/lib/game-engine/ids";
import { getActiveSession } from "@/lib/server/active-session";
import { commitServerMutations, getServerDocument, runServerQuery } from "@/lib/server/firebase-rest";
import { moderateText } from "@/lib/server/moderation";
import { findNewsItem } from "@/lib/server/news";
import { enforceRateLimit, memoryRateLimit } from "@/lib/server/rate-limit";
import { getClientKey, isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";

export const runtime = "nodejs";

type CommentRecord = {
    newsId?: string;
    newsTitle?: string;
    newsLink?: string;
    authorEmail?: string;
    authorName?: string;
    authorImage?: string | null;
    text?: string;
    createdAt?: string;
    _id?: string;
    _path?: string;
};

function json(payload: unknown, status = 200) {
    return NextResponse.json(payload, { status, headers: jsonSecurityHeaders() });
}

function validId(value: unknown) {
    return typeof value === "string" && /^[a-f0-9]{20}$/.test(value) ? value : null;
}

function publicComment(record: CommentRecord, viewerEmail: string | null) {
    return {
        id: record._id,
        newsId: record.newsId,
        authorName: record.authorName || "Hanogt kullanıcısı",
        authorImage: typeof record.authorImage === "string" && record.authorImage.startsWith("https://") ? record.authorImage : null,
        text: record.text || "",
        createdAt: record.createdAt || null,
        mine: Boolean(viewerEmail && record.authorEmail === viewerEmail),
    };
}

export async function GET(request: NextRequest) {
    const newsId = validId(request.nextUrl.searchParams.get("newsId"));
    if (!newsId) return json({ error: "Geçersiz haber." }, 400);
    // Reading is limited in memory: a stored counter would cost a database write per read.
    const rate = memoryRateLimit(`news-comments:read:${getClientKey(request)}`, 120, 60_000);
    if (!rate.allowed) return json({ error: "Çok fazla istek." }, 429);
    try {
        const active = await getActiveSession();
        const records = await runServerQuery<CommentRecord>({
            collectionId: "news_comments",
            where: [{ field: "newsId", op: "EQUAL", value: newsId }],
            limit: 200,
        });
        const comments = records
            .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
            .slice(-150)
            .map((record) => publicComment(record, active?.email ?? null));
        return json({ comments });
    } catch {
        return json({ comments: [], error: "Yorumlar yüklenemedi." }, 503);
    }
}

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return json({ error: "Geçersiz istek kaynağı." }, 403);
    const active = await getActiveSession();
    if (!active) return json({ error: "Yorum yapmak için giriş yapın." }, 401);
    const rate = await enforceRateLimit(`news-comments:write:${active.email}`, 8, 60_000);
    if (!rate.allowed) return json({ error: "Çok hızlı yorum yapıyorsunuz. Bir dakika sonra tekrar deneyin." }, 429);
    const body = await request.json().catch(() => null) as { newsId?: unknown; text?: unknown } | null;
    const newsId = validId(body?.newsId);
    if (!newsId || typeof body?.text !== "string") return json({ error: "Geçersiz yorum." }, 400);
    const moderation = moderateText(body.text, { minLength: 2, maxLength: 1000, maxLinks: 2 });
    if (!moderation.ok) return json({ error: moderation.message ?? "Geçersiz yorum." }, 400);
    const text = moderation.text;
    const item = await findNewsItem(newsId).catch(() => null);
    if (!item) return json({ error: "Bu haber artık akışta değil; yorumlar kapandı." }, 404);
    const profile = active.user as { username?: string; nickname?: string; avatarUrl?: string };
    const id = createEngineId("comment").replace(/[^A-Za-z0-9_-]/g, "_");
    const now = nowIso();
    const record: CommentRecord = {
        newsId,
        newsTitle: item.title.slice(0, 200),
        newsLink: item.link,
        authorEmail: active.email,
        authorName: String(profile.nickname || profile.username || active.session?.user?.name || active.email.split("@")[0]).slice(0, 40),
        authorImage: typeof profile.avatarUrl === "string" && profile.avatarUrl.startsWith("https://") ? profile.avatarUrl : null,
        text,
        createdAt: now,
    };
    try {
        await commitServerMutations([
            { type: "create", path: `news_comments/${id}`, data: record as Record<string, unknown> },
            { type: "increment", path: `news_meta/${newsId}`, fields: { commentCount: 1 } },
        ]);
        return json({ comment: publicComment({ ...record, _id: id }, active.email) }, 201);
    } catch {
        return json({ error: "Yorum kaydedilemedi." }, 503);
    }
}

export async function DELETE(request: NextRequest) {
    if (!isSameOrigin(request)) return json({ error: "Geçersiz istek kaynağı." }, 403);
    const active = await getActiveSession();
    if (!active) return json({ error: "Giriş yapın." }, 401);
    const id = request.nextUrl.searchParams.get("id");
    if (!id || !/^[A-Za-z0-9_-]{8,100}$/.test(id)) return json({ error: "Geçersiz yorum." }, 400);
    try {
        const record = await getServerDocument<CommentRecord>(`news_comments/${id}`);
        if (!record) return json({ error: "Yorum bulunamadı." }, 404);
        if (record.authorEmail !== active.email) return json({ error: "Yalnızca kendi yorumunuzu silebilirsiniz." }, 403);
        await commitServerMutations([
            { type: "delete", path: `news_comments/${id}` },
            ...(record.newsId ? [{ type: "increment" as const, path: `news_meta/${record.newsId}`, fields: { commentCount: -1 } }] : []),
        ]);
        return json({ success: true });
    } catch {
        return json({ error: "Yorum silinemedi." }, 503);
    }
}
