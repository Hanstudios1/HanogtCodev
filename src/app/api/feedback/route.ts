import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/server/active-session";
import { createServerDocument, deleteServerDocument, getServerDocument, patchServerDocument } from "@/lib/server/firebase-rest";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";

type Comment = { id: string; author: string; authorEmail: string; authorPhoto?: string | null; content: string; replyTo?: string | null; replyToContent?: string | null; createdAt: string };
type Feedback = { type?: string; content?: string; description?: string | null; authorEmail?: string; likes?: string[]; comments?: Comment[] };

function text(value: unknown, max: number) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
    const activeSession = await getActiveSession();
    if (!activeSession) return NextResponse.json({ error: "Etkin oturum gerekli." }, { status: 401 });
    const { email, session } = activeSession;
    const sessionName = session?.user?.name || email.split("@")[0];
    const sessionImage = session?.user?.image || null;
    const rate = await enforceRateLimit(`feedback:${email}`, 30, 60_000);
    if (!rate.allowed) return NextResponse.json({ error: "Çok fazla işlem. Biraz sonra tekrar deneyin." }, { status: 429 });

    const body = await request.json() as Record<string, unknown>;
    const action = text(body.action, 30);
    const itemId = text(body.itemId, 200);
    const profile = await getServerDocument<{ username?: string; avatarUrl?: string }>(`public_profiles/${email}`);

    if (action === "create") {
        const content = text(body.content, 2_000);
        const description = text(body.description, 5_000);
        const type = body.type === "question" ? "question" : "feedback";
        if (!content) return NextResponse.json({ error: "İçerik boş olamaz." }, { status: 400 });
        await createServerDocument("feedback", {
            type,
            content,
            description: description || null,
            author: profile?.username || sessionName,
            authorEmail: email,
            authorPhoto: profile?.avatarUrl || sessionImage,
            createdAt: new Date(),
            likes: [],
            comments: [],
        });
        return NextResponse.json({ success: true }, { headers: jsonSecurityHeaders() });
    }

    if (!itemId) return NextResponse.json({ error: "Kayıt kimliği gerekli." }, { status: 400 });
    const item = await getServerDocument<Feedback>(`feedback/${itemId}`);
    if (!item) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });

    if (action === "like") {
        const likes = item.likes || [];
        await patchServerDocument(`feedback/${itemId}`, { likes: likes.includes(email) ? likes.filter((value) => value !== email) : [...likes, email] }, { updateTime: item._updateTime });
    } else if (action === "edit") {
        if (item.authorEmail !== email) return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });
        const content = text(body.content, 2_000);
        if (!content) return NextResponse.json({ error: "İçerik boş olamaz." }, { status: 400 });
        await patchServerDocument(`feedback/${itemId}`, { content, description: text(body.description, 5_000) || null, updatedAt: new Date() }, { updateTime: item._updateTime });
    } else if (action === "delete") {
        if (item.authorEmail !== email) return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });
        await deleteServerDocument(`feedback/${itemId}`);
    } else if (action === "comment") {
        const content = text(body.content, 1_000);
        if (!content) return NextResponse.json({ error: "Yorum boş olamaz." }, { status: 400 });
        const comments = item.comments || [];
        comments.push({
            id: randomUUID(),
            author: profile?.username || sessionName,
            authorEmail: email,
            authorPhoto: profile?.avatarUrl || sessionImage,
            content,
            replyTo: text(body.replyTo, 100) || null,
            replyToContent: text(body.replyToContent, 200) || null,
            createdAt: new Date().toISOString(),
        });
        await patchServerDocument(`feedback/${itemId}`, { comments }, { updateTime: item._updateTime });
    } else if (action === "edit-comment" || action === "delete-comment") {
        const commentId = text(body.commentId, 100);
        const comments = item.comments || [];
        const comment = comments.find((value) => value.id === commentId);
        if (!comment || comment.authorEmail !== email) return NextResponse.json({ error: "Yorum bulunamadı veya yetkiniz yok." }, { status: 403 });
        const updated = action === "delete-comment"
            ? comments.filter((value) => value.id !== commentId)
            : comments.map((value) => value.id === commentId ? { ...value, content: text(body.content, 1_000) } : value);
        await patchServerDocument(`feedback/${itemId}`, { comments: updated }, { updateTime: item._updateTime });
    } else {
        return NextResponse.json({ error: "Geçersiz işlem." }, { status: 400 });
    }

    return NextResponse.json({ success: true }, { headers: jsonSecurityHeaders() });
}
