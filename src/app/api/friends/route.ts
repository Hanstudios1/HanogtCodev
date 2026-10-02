import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/server/active-session";
import { commitServerPatches, deleteServerDocument, getServerDocument, patchServerDocument, runServerQuery } from "@/lib/server/firebase-rest";
import { enforceRateLimit, enforceRateLimitWithFallback } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { isFriendRequestId, normalizeEmail, readJsonBody } from "@/lib/server/validate";
import { parseFriendTag } from "@/lib/social/model";

type FriendAction = "accept" | "reject" | "remove" | "block" | "unblock" | "request" | "cancel";
type UserRecord = {
    friends?: string[];
    blockedUsers?: string[];
    banned?: boolean;
    suspended?: boolean;
    whoCanAdd?: unknown;
    friendReqNotifications?: unknown;
};
type RequestRecord = { fromEmail?: string; toEmail?: string; status?: string };
type ProfileRecord = { username?: unknown; avatarUrl?: unknown };

const ACTIONS: readonly FriendAction[] = ["accept", "reject", "remove", "block", "unblock", "request", "cancel"];

function failure(status: number, code: string, error: string, headers: Record<string, string> = {}) {
    return NextResponse.json({ error, code }, { status, headers: jsonSecurityHeaders(headers) });
}

function ok(data: Record<string, unknown> = {}) {
    return NextResponse.json({ success: true, ...data }, { headers: jsonSecurityHeaders() });
}

function without(values: string[] = [], target: string) {
    return values.filter((value) => value !== target);
}

function withUnique(values: string[] = [], target: string) {
    return [...new Set([...values, target])];
}

/** One notification per sender: a new request refreshes it instead of stacking up. */
function notificationId(fromEmail: string) {
    return `friend_${createHash("sha256").update(fromEmail).digest("hex").slice(0, 24)}`;
}

async function displayName(email: string) {
    const profile = await getServerDocument<ProfileRecord>(`public_profiles/${email}`).catch(() => null);
    const name = typeof profile?.username === "string" ? profile.username.trim().slice(0, 60) : "";
    const avatar = typeof profile?.avatarUrl === "string" && /^https:\/\/[^\s"'<>`]+$/.test(profile.avatarUrl) ? profile.avatarUrl : null;
    // Without a username the address isn't shown either: the recipient may be a stranger.
    return { name: name || "Bir Hanogt kullanıcısı", avatar };
}

/** In-app notification (the header bell); best effort, never fails the action. */
async function notify(target: UserRecord | null, targetEmail: string, fromEmail: string, title: string, body: string) {
    if (!target || target.friendReqNotifications === false) return;
    const sender = await displayName(fromEmail);
    await patchServerDocument(`notifications/${targetEmail}/items/${notificationId(fromEmail)}`, {
        type: "friend_request",
        title,
        body: body.replace("{name}", sender.name).slice(0, 300),
        actionUrl: "/social?tab=pending",
        fromAvatar: sender.avatar,
        read: false,
        createdAt: new Date(),
    }).catch(() => undefined);
}

/** Makes two people friends (both lists, version-checked) and closes the request. */
async function befriend(email: string, me: UserRecord & { _updateTime?: string }, otherEmail: string, other: UserRecord & { _updateTime?: string }, requestId: string) {
    await commitServerPatches([
        { path: `users/${email}`, data: { friends: withUnique(me.friends, otherEmail) }, updateFields: ["friends"], updateTime: me._updateTime },
        { path: `users/${otherEmail}`, data: { friends: withUnique(other.friends, email) }, updateFields: ["friends"], updateTime: other._updateTime },
    ]);
    await patchServerDocument(`friendRequests/${requestId}`, { status: "accepted", resolvedAt: new Date() });
    await notify(other, otherEmail, email, "Arkadaşlık isteğin kabul edildi", "{name} artık arkadaşın. Hanogt Social'da ona mesaj gönderebilirsin.");
}

async function pendingRequest(fromEmail: string, toEmail: string) {
    const [existing] = await runServerQuery<RequestRecord>({
        collectionId: "friendRequests",
        where: [
            { field: "fromEmail", op: "EQUAL", value: fromEmail },
            { field: "toEmail", op: "EQUAL", value: toEmail },
            { field: "status", op: "EQUAL", value: "pending" },
        ],
        limit: 1,
    });
    return existing ?? null;
}

/**
 * A friend request by `nickname#tag`. The target's "who can add me" setting
 * applies, and blocks or privacy refusals all answer the same way, so the
 * response never tells why. A pending request in the other direction is
 * accepted instead (both want to be friends).
 */
async function sendRequest(email: string, tagInput: unknown) {
    const parsed = parseFriendTag(tagInput);
    if (!parsed) return failure(400, "invalid_tag", "Geçersiz biçim. Örnek: Oyuncu#1234");
    const rate = await enforceRateLimitWithFallback(`friends:request:${email}`, 30, 60 * 60_000);
    if (!rate.allowed) return failure(429, "rate_limited", "Çok fazla arkadaşlık isteği. Biraz sonra tekrar deneyin.", { "Retry-After": String(rate.retryAfterSeconds) });
    const [match] = await runServerQuery<Record<string, unknown>>({
        collectionId: "public_profiles",
        where: [{ field: "nickname", op: "EQUAL", value: parsed.nickname }, { field: "nicknameTag", op: "EQUAL", value: parsed.tag }],
        select: ["nicknameTag"],
        limit: 1,
    });
    const targetEmail = normalizeEmail(match?._id);
    if (!targetEmail) return failure(404, "user_not_found", "Kullanıcı bulunamadı.");
    if (targetEmail === email) return failure(400, "self_action", "Kendinizi arkadaş olarak ekleyemezsiniz.");
    const [me, other] = await Promise.all([
        getServerDocument<UserRecord>(`users/${email}`),
        getServerDocument<UserRecord>(`users/${targetEmail}`),
    ]);
    if (!me) return failure(404, "not_found", "Hesap verisi bulunamadı.");
    if (!other || other.banned || other.suspended) return failure(404, "user_not_found", "Kullanıcı bulunamadı.");
    if (me.friends?.includes(targetEmail)) return failure(409, "already_friends", "Bu kullanıcı zaten arkadaşınız.");
    if (me.blockedUsers?.includes(targetEmail)) return failure(409, "blocked", "Bu kullanıcıyı engellediniz; istek göndermek için önce engeli kaldırın.");
    const refused = failure(403, "cannot_add", "Bu kullanıcıya arkadaşlık isteği gönderilemiyor.");
    if (other.blockedUsers?.includes(email) || other.whoCanAdd === "nobody") return refused;
    if (other.whoCanAdd === "friends_of_friends" && !(me.friends ?? []).some((friend) => other.friends?.includes(friend))) return refused;

    const reverse = await pendingRequest(targetEmail, email);
    if (reverse) {
        await befriend(email, me, targetEmail, other, reverse._id);
        return ok({ accepted: true });
    }
    if (await pendingRequest(email, targetEmail)) return failure(409, "request_exists", "Bu kullanıcıya zaten bir istek gönderdiniz.");
    await patchServerDocument(`friendRequests/${email}_${targetEmail}_${Date.now()}`, {
        fromEmail: email,
        toEmail: targetEmail,
        status: "pending",
        createdAt: new Date(),
    }, { exists: false });
    await notify(other, targetEmail, email, "Yeni arkadaşlık isteği", "{name} sana arkadaşlık isteği gönderdi.");
    return ok({ sent: true });
}

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return failure(403, "forbidden_origin", "Geçersiz istek kaynağı.");
    const activeSession = await getActiveSession();
    if (!activeSession) return failure(401, "unauthorized", "Etkin oturum gerekli.");
    const { email } = activeSession;
    let rate;
    try {
        rate = await enforceRateLimit(`friends:${email}`, 30, 60_000);
    } catch {
        return failure(503, "server_error", "İşlem şu anda tamamlanamıyor. Biraz sonra tekrar deneyin.");
    }
    if (!rate.allowed) return failure(429, "rate_limited", "Çok fazla işlem. Biraz sonra tekrar deneyin.", { "Retry-After": String(rate.retryAfterSeconds) });

    const body = await readJsonBody<{ action?: unknown; requestId?: unknown; targetEmail?: unknown; tag?: unknown }>(request, 8_000);
    if (!body) return failure(400, "invalid_request", "Geçersiz istek gövdesi.");
    const action = ACTIONS.find((entry) => entry === body.action);
    if (!action) return failure(400, "invalid_request", "Geçersiz işlem.");

    try {
        if (action === "request") return await sendRequest(email, body.tag);

        if (action === "accept" || action === "reject" || action === "cancel") {
            const requestId = typeof body.requestId === "string" ? body.requestId : "";
            if (!isFriendRequestId(requestId)) return failure(400, "invalid_id", "Geçersiz istek.");
            const friendRequest = await getServerDocument<RequestRecord>(`friendRequests/${requestId}`);
            if (action === "cancel") {
                if (!friendRequest || friendRequest.fromEmail !== email || friendRequest.status !== "pending") return failure(404, "not_found", "Arkadaşlık isteği bulunamadı.");
                await deleteServerDocument(`friendRequests/${requestId}`);
                if (friendRequest.toEmail) await deleteServerDocument(`notifications/${friendRequest.toEmail}/items/${notificationId(email)}`).catch(() => undefined);
                return ok();
            }
            if (!friendRequest || friendRequest.toEmail !== email || friendRequest.status !== "pending" || !friendRequest.fromEmail) {
                return failure(404, "not_found", "Arkadaşlık isteği bulunamadı.");
            }
            if (action === "reject") {
                await patchServerDocument(`friendRequests/${requestId}`, { status: "rejected", resolvedAt: new Date() });
                return ok();
            }

            const otherEmail = friendRequest.fromEmail;
            const [me, other] = await Promise.all([
                getServerDocument<UserRecord>(`users/${email}`),
                getServerDocument<UserRecord>(`users/${otherEmail}`),
            ]);
            if (!me || !other || me.blockedUsers?.includes(otherEmail) || other.blockedUsers?.includes(email)) {
                return failure(409, "cannot_add", "Bu kullanıcıyla arkadaşlık kurulamaz.");
            }
            await befriend(email, me, otherEmail, other, requestId);
            return ok();
        }

        const targetEmail = normalizeEmail(body.targetEmail);
        if (!targetEmail || targetEmail === email) return failure(400, "invalid_email", "Geçersiz kullanıcı.");
        const [me, other] = await Promise.all([
            getServerDocument<UserRecord>(`users/${email}`),
            getServerDocument<UserRecord>(`users/${targetEmail}`),
        ]);
        if (!me) return failure(404, "not_found", "Hesap verisi bulunamadı.");

        if (action === "unblock") {
            await patchServerDocument(`users/${email}`, { blockedUsers: without(me.blockedUsers, targetEmail) }, { updateTime: me._updateTime });
            return ok();
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
        return ok();
    } catch {
        return failure(409, "conflict", "Arkadaşlık işlemi tamamlanamadı. Lütfen yenileyip tekrar deneyin.");
    }
}
