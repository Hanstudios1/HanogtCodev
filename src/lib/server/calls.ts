import "server-only";

import { randomUUID } from "node:crypto";
import {
    CALL_LIMITS,
    DECLINE_REASONS,
    callFromData,
    callRoleOf,
    callWire,
    isCallId,
    isCallStale,
    readCandidates,
    readDescription,
    ringingCalls,
    type CallRecord,
    type CallRole,
    type CallWire,
    type DeclineReason,
    type IncomingCall,
} from "@/lib/calls/model";
import {
    commitServerMutations,
    commitServerPatches,
    deleteServerDocument,
    getServerDocument,
    isWriteConflict,
    listServerCollection,
    queryServerCollection,
} from "./firebase-rest";
import { normalizeEmail } from "./validate";

/*
 * Server side of 1:1 voice calls (/api/calls/**). Every write to calls/{id}
 * goes through here with the service account, so calls work whether or not
 * the browser's Firebase bridge is up: the friendship is checked like the
 * security rules (and the direct-message API) do, and only participants can
 * read or change a call. Browsers with the bridge still read the document
 * with a realtime listener (firestore.rules lets participants read it).
 */

export type CallErrorCode =
    | "invalid_request" | "invalid_id" | "self_action" | "not_found" | "not_friend" | "blocked" | "forbidden" | "call_inactive";

/** Expected failures: the message is Turkish (primary language), the interface translates the code. */
export class CallApiError extends Error {
    readonly status: number;
    readonly code: CallErrorCode;

    constructor(status: number, code: CallErrorCode, message: string) {
        super(message);
        this.name = "CallApiError";
        this.status = status;
        this.code = code;
    }
}

/** The signed-in caller as the Social guards load it (users/{email}). */
export type CallUser = { email: string; friends: readonly string[]; blockedUsers: readonly string[] };

type StoredUser = { friends?: unknown; blockedUsers?: unknown; banned?: unknown; suspended?: unknown };
type StoredProfile = { username?: unknown; avatarUrl?: unknown; staffRole?: unknown };

const callPath = (id: string) => `calls/${id}`;

function emails(value: unknown) {
    return Array.isArray(value) ? value.map(normalizeEmail).filter(Boolean) : [];
}

/** Calls are between friends only (both directions, no block on either side, an active account). */
async function requireCallable(user: CallUser, callee: string) {
    if (callee === user.email) throw new CallApiError(400, "self_action", "Kendinizi arayamazsınız.");
    if (user.blockedUsers.includes(callee)) throw new CallApiError(403, "blocked", "Bu kullanıcıyı engellediniz.");
    if (!user.friends.includes(callee)) throw new CallApiError(403, "not_friend", "Yalnızca arkadaşlarınızı arayabilirsiniz.");
    const record = await getServerDocument<StoredUser>(`users/${callee}`);
    if (!record || record.banned === true || record.suspended === true || !emails(record.friends).includes(user.email) || emails(record.blockedUsers).includes(user.email)) {
        throw new CallApiError(403, "not_friend", "Bu kullanıcı aranamıyor.");
    }
}

/** A call the user takes part in; missing calls and other people's calls look the same. */
async function loadCall(id: unknown, email: string): Promise<{ record: CallRecord; role: CallRole; updateTime?: string }> {
    if (!isCallId(id)) throw new CallApiError(400, "invalid_id", "Geçersiz arama kimliği.");
    const stored = await getServerDocument<Record<string, unknown>>(callPath(id));
    const record = stored ? callFromData(id, stored) : null;
    const role = record ? callRoleOf(record, email) : null;
    if (!record || !role) throw new CallApiError(404, "not_found", "Arama bulunamadı veya sona erdi.");
    return { record, role, updateTime: stored?._updateTime };
}

/** Retries a version-checked write that lost a race with a concurrent change (e.g. ICE candidates). */
async function retryOnConflict<T>(operation: () => Promise<T>, attempts = 4): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            if (attempt >= attempts || !isWriteConflict(error)) throw error;
        }
    }
}

/**
 * Deletes calls of this person that were left behind (finished calls nobody
 * cleaned up, tabs that crashed while ringing). Best effort, a few at a time.
 */
export async function sweepCalls(email: string, now = Date.now(), records?: CallRecord[]) {
    const list = records ?? (await queryServerCollection<Record<string, unknown>>("calls", "participants", "ARRAY_CONTAINS", email, { limit: 50 }))
        .flatMap((stored) => {
            const record = callFromData(stored._id, stored);
            return record ? [record] : [];
        });
    const stale = list.filter((record) => isCallStale(record, now)).slice(0, 20);
    await Promise.all(stale.map((record) => deleteServerDocument(callPath(record.id)).catch(() => undefined)));
    return stale.length;
}

/** Starts a call: the caller's offer, ringing at once (the callee polls or listens). */
export async function startCall(user: CallUser, input: Record<string, unknown>, now = Date.now()): Promise<{ callId: string; call: CallWire }> {
    const callee = normalizeEmail(input.callee);
    if (!callee) throw new CallApiError(400, "invalid_request", "Geçersiz kullanıcı.");
    const offer = readDescription(input.offer, "offer");
    if (!offer) throw new CallApiError(400, "invalid_request", "Geçersiz arama teklifi.");
    await requireCallable(user, callee);
    await sweepCalls(user.email, now).catch(() => 0);
    const id = randomUUID();
    const data = {
        caller: user.email,
        callee,
        participants: [user.email, callee],
        status: "ringing",
        offer,
        callerCandidates: [],
        calleeCandidates: [],
        createdAt: new Date(now),
        expiresAt: new Date(now + CALL_LIMITS.ringingTtlMs),
    };
    await commitServerMutations([{ type: "create", path: callPath(id), data }]);
    const record = callFromData(id, data);
    if (!record) throw new Error("Arama kaydı oluşturulamadı.");
    return { callId: id, call: callWire(record, "caller") };
}

/** The callee takes the call: the answer is stored once (a second tab or device gets call_inactive). */
export async function answerCall(user: CallUser, input: Record<string, unknown>, now = Date.now()) {
    const answer = readDescription(input.answer, "answer");
    if (!answer) throw new CallApiError(400, "invalid_request", "Geçersiz arama yanıtı.");
    await retryOnConflict(async () => {
        const { record, role, updateTime } = await loadCall(input.callId, user.email);
        if (role !== "callee") throw new CallApiError(403, "forbidden", "Bu aramayı yalnızca aranan kişi yanıtlayabilir.");
        if (record.status !== "ringing" || !record.offer) throw new CallApiError(409, "call_inactive", "Arama artık etkin değil.");
        await commitServerMutations([{
            type: "update",
            path: callPath(record.id),
            data: { status: "active", answer, answeredAt: new Date(now), expiresAt: new Date(now + CALL_LIMITS.activeTtlMs) },
            updateFields: ["status", "answer", "answeredAt", "expiresAt"],
            ...(updateTime ? { updateTime } : {}),
        }]);
    });
    return { success: true };
}

/** Appends the caller's own ICE candidates (the side is taken from the session, never from the request). */
export async function addCandidates(user: CallUser, input: Record<string, unknown>) {
    const { record, role } = await loadCall(input.callId, user.email);
    if (!Array.isArray(input.candidates) || input.candidates.length > CALL_LIMITS.candidatesPerRequest) throw new CallApiError(400, "invalid_request", "Geçersiz bağlantı adayları.");
    const candidates = readCandidates(input.candidates, CALL_LIMITS.candidatesPerRequest);
    if (record.status === "declined" || record.status === "ended" || !candidates.length) return { success: true, added: 0 };
    const current = role === "caller" ? record.callerCandidates : record.calleeCandidates;
    const room = Math.max(0, CALL_LIMITS.candidatesPerSide - current.length);
    if (!room) return { success: true, added: 0 };
    const added = candidates.slice(0, room);
    try {
        await commitServerMutations([{ type: "append", path: callPath(record.id), fields: { [`${role}Candidates`]: added } }]);
    } catch (error) {
        // The call ended meanwhile (the document is gone).
        if ((error as { status?: number }).status === 404) throw new CallApiError(404, "not_found", "Arama bulunamadı veya sona erdi.");
        throw error;
    }
    return { success: true, added: added.length };
}

/**
 * The callee doesn't take the call: declined, busy in another call or
 * unavailable (Do Not Disturb). The document stays for a short while so the
 * caller sees why; the caller (or a later sweep) removes it.
 */
export async function declineCall(user: CallUser, input: Record<string, unknown>, now = Date.now()) {
    const { record, role } = await loadCall(input.callId, user.email);
    if (role !== "callee") throw new CallApiError(403, "forbidden", "Bu aramayı yalnızca aranan kişi reddedebilir.");
    if (record.status === "declined" || record.status === "ended") return { success: true };
    if (record.status === "active") throw new CallApiError(409, "call_inactive", "Arama zaten yanıtlandı.");
    const reason: DeclineReason = DECLINE_REASONS.find((entry) => entry === input.reason) ?? "declined";
    try {
        // `exists`: a call the caller deleted meanwhile must not come back as a stub.
        await commitServerPatches([{
            path: callPath(record.id),
            data: { status: "declined", endReason: reason, endedAt: new Date(now), expiresAt: new Date(now + CALL_LIMITS.declinedTtlMs) },
            updateFields: ["status", "endReason", "endedAt", "expiresAt"],
            exists: true,
        }]);
    } catch (error) {
        if ((error as { status?: number }).status === 404) return { success: true };
        throw error;
    }
    return { success: true };
}

/**
 * Hangs up (or cancels, or cleans up after a finished call): the call
 * document and the candidate subcollections older clients wrote are deleted.
 * The other side sees the call disappear and ends it too.
 */
export async function deleteCall(email: string, callId: unknown) {
    if (!isCallId(callId)) throw new CallApiError(400, "invalid_id", "Geçersiz arama kimliği.");
    const stored = await getServerDocument<{ participants?: unknown; caller?: unknown; callee?: unknown }>(callPath(callId));
    if (!stored) return { success: true };
    const participants = emails(stored.participants);
    if (!participants.includes(email) && normalizeEmail(stored.caller) !== email && normalizeEmail(stored.callee) !== email) {
        throw new CallApiError(404, "not_found", "Arama bulunamadı veya sona erdi.");
    }
    for (const collection of ["callerCandidates", "calleeCandidates"]) {
        const candidates = await listServerCollection<Record<string, unknown>>(`${callPath(callId)}/${collection}`).catch(() => []);
        await Promise.all(candidates.map((candidate) => deleteServerDocument(candidate._path).catch(() => undefined)));
    }
    await deleteServerDocument(callPath(callId));
    return { success: true };
}

/** One call as its participant sees it, with the remote candidates from `have` on. */
export async function readCall(user: CallUser, callId: unknown, have = 0): Promise<{ call: CallWire; now: number }> {
    const { record, role } = await loadCall(callId, user.email);
    return { call: callWire(record, role, have), now: Date.now() };
}

function text(value: unknown, max: number) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
}

/**
 * Calls ringing for the user now, with the caller's name card (browsers
 * without the Firebase bridge poll this). Calls the user left behind are
 * swept on the way.
 */
export async function listIncomingCalls(user: CallUser, now = Date.now()): Promise<{ calls: IncomingCall[]; now: number }> {
    const stored = await queryServerCollection<Record<string, unknown>>("calls", "callee", "EQUAL", user.email, { limit: 30 });
    const records = stored.flatMap((entry) => {
        const record = callFromData(entry._id, entry);
        return record ? [record] : [];
    });
    if (records.some((record) => isCallStale(record, now))) await sweepCalls(user.email, now, records).catch(() => 0);
    const ringing = ringingCalls(records, user.email, now).filter((record) => !user.blockedUsers.includes(record.caller)).slice(0, 5);
    const calls = await Promise.all(ringing.map(async (record): Promise<IncomingCall> => {
        const profile = await getServerDocument<StoredProfile>(`public_profiles/${record.caller}`).catch(() => null);
        const avatar = typeof profile?.avatarUrl === "string" && /^https:\/\/[^\s"'<>`]+$/.test(profile.avatarUrl) && profile.avatarUrl.length <= 2048 ? profile.avatarUrl : null;
        return {
            id: record.id,
            caller: record.caller,
            createdAt: record.createdAt,
            person: {
                username: text(profile?.username, 60) || record.caller.split("@")[0],
                avatarUrl: avatar,
                staffRole: profile?.staffRole === "owner" || profile?.staffRole === "admin" || profile?.staffRole === "moderator" ? profile.staffRole : null,
            },
        };
    }));
    return { calls, now };
}
