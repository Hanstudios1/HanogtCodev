import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/server/active-session";
import { commitServerPatches, getServerDocument, patchServerDocument } from "@/lib/server/firebase-rest";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";

type FriendAction = "accept" | "reject" | "remove" | "block" | "unblock";
type UserRecord = { friends?: string[]; blockedUsers?: string[] };
type RequestRecord = { fromEmail?: string; toEmail?: string; status?: string };

function normalizedTarget(value: unknown) {
    return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ? value.toLowerCase()
        : "";
}

function without(values: string[] = [], target: string) {
    return values.filter((value) => value !== target);
}

function withUnique(values: string[] = [], target: string) {
    return [...new Set([...values, target])];
}

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
    const activeSession = await getActiveSession();
    if (!activeSession) return NextResponse.json({ error: "Etkin oturum gerekli." }, { status: 401 });
    const { email } = activeSession;
    const rate = await enforceRateLimit(`friends:${email}`, 30, 60_000);
    if (!rate.allowed) return NextResponse.json({ error: "Çok fazla işlem. Biraz sonra tekrar deneyin." }, { status: 429 });

    const body = await request.json() as { action?: unknown; requestId?: unknown; targetEmail?: unknown };
    const action = body.action as FriendAction;
    if (!["accept", "reject", "remove", "block", "unblock"].includes(action)) {
        return NextResponse.json({ error: "Geçersiz işlem." }, { status: 400 });
    }

    try {
        if (action === "accept" || action === "reject") {
            const requestId = typeof body.requestId === "string" ? body.requestId : "";
            if (!requestId || requestId.length > 300) return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
            const friendRequest = await getServerDocument<RequestRecord>(`friendRequests/${requestId}`);
            if (!friendRequest || friendRequest.toEmail !== email || friendRequest.status !== "pending" || !friendRequest.fromEmail) {
                return NextResponse.json({ error: "Arkadaşlık isteği bulunamadı." }, { status: 404 });
            }
            if (action === "reject") {
                await patchServerDocument(`friendRequests/${requestId}`, { status: "rejected", resolvedAt: new Date() });
                return NextResponse.json({ success: true }, { headers: jsonSecurityHeaders() });
            }

            const otherEmail = friendRequest.fromEmail;
            const [me, other] = await Promise.all([
                getServerDocument<UserRecord>(`users/${email}`),
                getServerDocument<UserRecord>(`users/${otherEmail}`),
            ]);
            if (!me || !other || me.blockedUsers?.includes(otherEmail) || other.blockedUsers?.includes(email)) {
                return NextResponse.json({ error: "Bu kullanıcıyla arkadaşlık kurulamaz." }, { status: 409 });
            }
            await commitServerPatches([
                { path: `users/${email}`, data: { friends: withUnique(me.friends, otherEmail) }, updateFields: ["friends"], updateTime: me._updateTime },
                { path: `users/${otherEmail}`, data: { friends: withUnique(other.friends, email) }, updateFields: ["friends"], updateTime: other._updateTime },
            ]);
            await patchServerDocument(`friendRequests/${requestId}`, { status: "accepted", resolvedAt: new Date() });
            return NextResponse.json({ success: true }, { headers: jsonSecurityHeaders() });
        }

        const targetEmail = normalizedTarget(body.targetEmail);
        if (!targetEmail || targetEmail === email) return NextResponse.json({ error: "Geçersiz kullanıcı." }, { status: 400 });
        const [me, other] = await Promise.all([
            getServerDocument<UserRecord>(`users/${email}`),
            getServerDocument<UserRecord>(`users/${targetEmail}`),
        ]);
        if (!me) return NextResponse.json({ error: "Hesap verisi bulunamadı." }, { status: 404 });

        if (action === "unblock") {
            await patchServerDocument(`users/${email}`, { blockedUsers: without(me.blockedUsers, targetEmail) }, { updateTime: me._updateTime });
            return NextResponse.json({ success: true }, { headers: jsonSecurityHeaders() });
        }

        const myUpdate: UserRecord = { friends: without(me.friends, targetEmail) };
        if (action === "block") myUpdate.blockedUsers = withUnique(me.blockedUsers, targetEmail);
        if (other) {
            await commitServerPatches([
                { path: `users/${email}`, data: myUpdate, updateFields: Object.keys(myUpdate), updateTime: me._updateTime },
                { path: `users/${targetEmail}`, data: { friends: without(other.friends, email) }, updateFields: ["friends"], updateTime: other._updateTime },
            ]);
        } else {
            await patchServerDocument(`users/${email}`, myUpdate, { updateTime: me._updateTime });
        }
        return NextResponse.json({ success: true }, { headers: jsonSecurityHeaders() });
    } catch {
        return NextResponse.json({ error: "Arkadaşlık işlemi tamamlanamadı. Lütfen yenileyip tekrar deneyin." }, { status: 409 });
    }
}
