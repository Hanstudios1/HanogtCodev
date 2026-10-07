import "server-only";

import { isGroupId } from "@/lib/groups";
import {
    VOICE_LIMITS,
    isSignalFor,
    isVoicePeerId,
    isVoiceSignalKind,
    isVoiceTabId,
    readParticipants,
    readVoiceSignal,
    staleParticipantIds,
    voicePeerId,
    voiceSignalId,
    type VoiceParticipant,
    type VoiceRoomView,
    type VoiceSignal,
} from "@/lib/social/voice";
import {
    commitServerMutations,
    deleteServerDocument,
    getServerDocument,
    isWriteConflict,
    listServerCollection,
    queryServerCollection,
} from "./firebase-rest";
import { memberKey } from "./group-keys";
import { activeMute } from "./group-moderation";
import { rulesBlock, type RulesGateGroup } from "./group-rules";
import { normalizeEmail } from "./validate";

/*
 * Group voice channels (/api/groups/voice). The server keeps who is in a
 * group's channel (group_voice/{groupId}) and passes WebRTC offers, answers
 * and candidates between them (group_voice/{groupId}/signals); the audio
 * flows between the browsers. Only members take part, at most five at a
 * time; members on a time-out, and members who still have to accept the
 * group's rules, can't join. Every write is made here with
 * the service account; members' browsers may read the channel and the
 * signals addressed to them (firestore.rules).
 */

export type VoiceErrorCode = "invalid_request" | "not_found" | "voice_full" | "muted" | "rules_not_accepted" | "not_in_voice" | "moved" | "payload_too_large";

/** Expected failures: the message is Turkish (primary language), the interface translates the code. */
export class VoiceApiError extends Error {
    readonly status: number;
    readonly code: VoiceErrorCode;
    readonly extra: Record<string, unknown>;

    constructor(status: number, code: VoiceErrorCode, message: string, extra: Record<string, unknown> = {}) {
        super(message);
        this.name = "VoiceApiError";
        this.status = status;
        this.code = code;
        this.extra = extra;
    }
}

type StoredGroup = RulesGateGroup & { members?: unknown };
/** `moved`: tabs that left because their person joined from another tab or device (kept a few minutes). */
type StoredRoom = { participants?: Record<string, unknown>; moved?: Record<string, unknown>; _updateTime?: string };
type StoredProfile = { username?: unknown; nickname?: unknown; avatarUrl?: unknown };

export const voiceRoomPath = (groupId: string) => `group_voice/${groupId}`;
const signalPath = (groupId: string, id: string) => `group_voice/${groupId}/signals/${id}`;

async function requireMember(groupId: unknown, email: string) {
    if (!isGroupId(groupId)) throw new VoiceApiError(404, "not_found", "Grup bulunamadı.");
    const group = await getServerDocument<StoredGroup>(`groups/${groupId}`);
    const members = Array.isArray(group?.members) ? group.members.map(normalizeEmail) : [];
    if (!group || !members.includes(email)) throw new VoiceApiError(404, "not_found", "Grup bulunamadı.");
    return { id: groupId, group };
}

function readTab(value: unknown) {
    if (!isVoiceTabId(value)) throw new VoiceApiError(400, "invalid_request", "Geçersiz istek.");
    return value;
}

async function retryOnConflict<T>(operation: () => Promise<T>, attempts = 4): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            if (attempt >= attempts || !isWriteConflict(error)) throw error;
        }
    }
}

/** Signals addressed to one tab, oldest first. */
async function signalsFor(groupId: string, peerId: string): Promise<VoiceSignal[]> {
    const stored = await queryServerCollection<Record<string, unknown>>("signals", "to", "EQUAL", peerId, { parentPath: voiceRoomPath(groupId), limit: 60 });
    return stored
        .flatMap((entry) => {
            const signal = readVoiceSignal(entry._id, entry);
            return signal && isSignalFor(signal.id, peerId) ? [signal] : [];
        })
        .sort((a, b) => a.id.localeCompare(b.id));
}

/** Who is in the channel; a tab that is in it also gets its waiting signals. */
export async function readVoiceRoom(groupId: unknown, email: string, tab: unknown, now = Date.now()): Promise<VoiceRoomView> {
    const { id } = await requireMember(groupId, email);
    const room = await getServerDocument<StoredRoom>(voiceRoomPath(id));
    const participants = readParticipants(room?.participants, now);
    let signals: VoiceSignal[] = [];
    if (isVoiceTabId(tab)) {
        const self = voicePeerId(memberKey(id, email), tab);
        if (participants.some((entry) => entry.id === self)) signals = await signalsFor(id, self);
    }
    return { participants, signals, now };
}

function text(value: unknown, max: number) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
}

/** The name card the channel shows: the public profile's name and avatar. */
async function nameCard(email: string) {
    const profile = await getServerDocument<StoredProfile>(`public_profiles/${email}`).catch(() => null);
    const avatar = typeof profile?.avatarUrl === "string" && /^https:\/\/[^\s"'<>`]+$/.test(profile.avatarUrl) && profile.avatarUrl.length <= 2048 ? profile.avatarUrl : null;
    return { name: text(profile?.nickname, VOICE_LIMITS.nameLength) || text(profile?.username, VOICE_LIMITS.nameLength) || email.split("@")[0], avatarUrl: avatar };
}

/** How long a tab that was replaced by its person's other tab or device is told so. */
const MOVED_MS = 3 * 60_000;

function movedAt(room: StoredRoom | null, id: string) {
    const value = room?.moved?.[id];
    const at = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : typeof value === "number" ? value : NaN;
    return Number.isFinite(at) ? at : 0;
}

/**
 * Writes this tab into the channel (joining, or checking in). Participants
 * who stopped checking in are removed on the way. `requirePresent`: a check-in
 * from a tab the channel no longer lists fails with not_in_voice (it rejoins),
 * or with moved when its person joined from another tab or device since.
 *
 * One person is in the channel once: joining from another tab or device
 * takes the earlier one out (like Discord). A tab rejoining by itself after
 * losing its place (`resume`) never takes the seat of a tab that is in use.
 */
async function upsertParticipant(groupId: string, email: string, input: Record<string, unknown>, now: number, requirePresent: boolean) {
    const tab = readTab(input.tab);
    const key = memberKey(groupId, email);
    const self = voicePeerId(key, tab);
    const card = requirePresent ? null : await nameCard(email);
    return retryOnConflict(async () => {
        const room = await getServerDocument<StoredRoom>(voiceRoomPath(groupId));
        const stored = room?.participants ?? {};
        const current = readParticipants(stored, now);
        const existing = current.find((entry) => entry.id === self) ?? null;
        if (requirePresent && !existing) {
            if (now - movedAt(room, self) < MOVED_MS) throw new VoiceApiError(409, "moved", "Sesli kanala başka bir sekmeden veya cihazdan katıldınız.");
            throw new VoiceApiError(409, "not_in_voice", "Sesli kanalda değilsiniz.");
        }
        const own = existing ? [] : current.filter((entry) => entry.id !== self && entry.id.startsWith(`${key}_`));
        if (own.length && input.resume === true) throw new VoiceApiError(409, "moved", "Sesli kanala başka bir sekmeden veya cihazdan katıldınız.");
        if (!existing && current.length - own.length >= VOICE_LIMITS.people) {
            throw new VoiceApiError(409, "voice_full", `Sesli kanal dolu (en fazla ${VOICE_LIMITS.people} kişi).`, { limit: VOICE_LIMITS.people });
        }
        const entry = {
            email,
            name: existing?.name ?? card?.name ?? email.split("@")[0],
            avatarUrl: existing?.avatarUrl ?? card?.avatarUrl ?? null,
            joinedAt: new Date(existing?.joinedAt || now),
            seenAt: new Date(now),
            muted: input.muted === true,
            deafened: input.deafened === true,
        };
        const replaced = own.map((item) => item.id);
        const stale = staleParticipantIds(stored, now).filter((id) => id !== self && !replaced.includes(id));
        // Old "moved" notes go on the way.
        const expired = Object.keys(room?.moved ?? {}).filter((id) => now - movedAt(room, id) >= MOVED_MS);
        const moved = Object.fromEntries(replaced.map((id) => [id, new Date(now)]));
        const data = { participants: { [self]: entry }, moved, updatedAt: new Date(now) };
        const fields = [`participants.${self}`, ...[...replaced, ...stale].map((id) => `participants.${id}`), ...[...replaced, ...expired].map((id) => `moved.${id}`), "updatedAt"];
        await commitServerMutations([room
            ? { type: "update", path: voiceRoomPath(groupId), data, updateFields: fields, ...(room._updateTime ? { updateTime: room._updateTime } : {}) }
            : { type: "create", path: voiceRoomPath(groupId), data: { groupId, ...data } }]);
        const participants = [...current.filter((item) => item.id !== self && !replaced.includes(item.id)), { id: self, ...entry, joinedAt: entry.joinedAt.getTime(), seenAt: now }];
        return { self, replaced, participants: participants.sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id)) as VoiceParticipant[] };
    });
}

/** Joins the group's voice channel from one tab. */
export async function joinVoice(groupId: unknown, email: string, input: Record<string, unknown>, now = Date.now()) {
    const { id, group } = await requireMember(groupId, email);
    const mute = await activeMute(id, email, now);
    if (mute) throw new VoiceApiError(403, "muted", "Bu grupta susturuldunuz; süre dolana kadar sesli kanala katılamazsınız.", { until: mute.until });
    if (rulesBlock(id, group, email)) throw new VoiceApiError(409, "rules_not_accepted", "Sesli kanala katılmadan önce grubun kurallarını kabul etmelisiniz.");
    const { self, participants, replaced } = await upsertParticipant(id, email, input, now, false);
    // The replaced tab's waiting signals go now; the tab learns it moved at its next check-in.
    if (replaced.length) await deleteSignalsFor(id, replaced);
    return { self, participants, now };
}

/** A tab in the channel checks in (and reports its microphone and sound switches). */
export async function heartbeatVoice(groupId: unknown, email: string, input: Record<string, unknown>, now = Date.now()) {
    const { id, group } = await requireMember(groupId, email);
    if (await activeMute(id, email, now)) {
        await leaveVoice(id, email, input).catch(() => undefined);
        throw new VoiceApiError(403, "muted", "Bu grupta susturuldunuz; sesli kanaldan çıkarıldınız.");
    }
    // The group asked everyone to accept its (changed) rules: out of the channel until they do.
    if (rulesBlock(id, group, email)) {
        await leaveVoice(id, email, input).catch(() => undefined);
        throw new VoiceApiError(409, "rules_not_accepted", "Grubun kurallarını kabul etmeden sesli kanalda kalamazsınız.");
    }
    const { self, participants } = await upsertParticipant(id, email, input, now, true);
    return { self, participants, now };
}

/** Removes participant entries (and the signals waiting for them); the room goes when nobody is left. */
async function removeParticipants(groupId: string, ids: string[], now = Date.now()) {
    if (!ids.length) return;
    await retryOnConflict(async () => {
        const room = await getServerDocument<StoredRoom>(voiceRoomPath(groupId));
        if (!room) return;
        const stored = room.participants ?? {};
        const gone = new Set([...ids, ...staleParticipantIds(stored, now)]);
        const left = readParticipants(stored, now).filter((entry) => !gone.has(entry.id));
        if (!left.length) {
            await commitServerMutations([{ type: "delete", path: voiceRoomPath(groupId), ...(room._updateTime ? { updateTime: room._updateTime } : {}) }]);
            return;
        }
        const fields = [...gone].filter((id) => Object.prototype.hasOwnProperty.call(stored, id)).map((id) => `participants.${id}`);
        if (!fields.length) return;
        await commitServerMutations([{ type: "update", path: voiceRoomPath(groupId), data: { participants: {}, updatedAt: new Date(now) }, updateFields: [...fields, "updatedAt"], ...(room._updateTime ? { updateTime: room._updateTime } : {}) }]);
    });
    await deleteSignalsFor(groupId, ids);
}

/** Deletes the signals waiting for tabs that left. */
async function deleteSignalsFor(groupId: string, ids: string[]) {
    const waiting = (await Promise.all(ids.map((peerId) => queryServerCollection<Record<string, unknown>>("signals", "to", "EQUAL", peerId, { parentPath: voiceRoomPath(groupId), limit: 200 }).catch(() => [])))).flat();
    if (waiting.length) await commitServerMutations(waiting.map((entry) => ({ type: "delete" as const, path: entry._path }))).catch(() => undefined);
}

/** Leaves the channel from one tab. */
export async function leaveVoice(groupId: unknown, email: string, input: Record<string, unknown>) {
    const { id } = await requireMember(groupId, email);
    const tab = readTab(input.tab);
    await removeParticipants(id, [voicePeerId(memberKey(id, email), tab)]);
    return { success: true };
}

/**
 * Passes signals to other participants and deletes the ones this tab has
 * read. The sender comes from the session; a signal may only go to someone
 * who is in the channel right now.
 */
export async function exchangeVoiceSignals(groupId: unknown, email: string, input: Record<string, unknown>, now = Date.now()) {
    const { id } = await requireMember(groupId, email);
    const tab = readTab(input.tab);
    const self = voicePeerId(memberKey(id, email), tab);
    const outgoing = input.signals === undefined ? [] : input.signals;
    const acks = input.ack === undefined ? [] : input.ack;
    if (!Array.isArray(outgoing) || outgoing.length > VOICE_LIMITS.signalsPerRequest) throw new VoiceApiError(400, "invalid_request", "Geçersiz istek.");
    if (!Array.isArray(acks) || acks.length > VOICE_LIMITS.acksPerRequest || acks.some((value) => typeof value !== "string" || !isSignalFor(value, self))) {
        throw new VoiceApiError(400, "invalid_request", "Geçersiz istek.");
    }
    const writes: Array<{ type: "create"; path: string; data: Record<string, unknown> }> = [];
    if (outgoing.length) {
        const room = await getServerDocument<StoredRoom>(voiceRoomPath(id));
        const present = new Set(readParticipants(room?.participants, now).map((entry) => entry.id));
        if (!present.has(self)) throw new VoiceApiError(409, "not_in_voice", "Sesli kanalda değilsiniz.");
        for (const raw of outgoing) {
            const signal = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
            if (!isVoicePeerId(signal.to) || signal.to === self || !isVoiceSignalKind(signal.kind)) throw new VoiceApiError(400, "invalid_request", "Geçersiz istek.");
            if (typeof signal.data !== "string" || signal.data.length > VOICE_LIMITS.signalChars) throw new VoiceApiError(413, "payload_too_large", "Sinyal çok büyük.");
            // Someone who just left: the signal is dropped quietly (their "bye" may cross ours).
            if (!present.has(signal.to)) continue;
            const recipient = room?.participants?.[signal.to] as { email?: unknown } | undefined;
            const signalId = voiceSignalId(signal.to, now + writes.length);
            writes.push({
                type: "create",
                path: signalPath(id, signalId),
                data: {
                    to: signal.to,
                    // For the security rules: browsers read only the signals addressed to their own account.
                    toEmail: normalizeEmail(recipient?.email),
                    from: self,
                    kind: signal.kind,
                    data: signal.data,
                    at: new Date(now),
                    expiresAt: new Date(now + VOICE_LIMITS.signalTtlMs),
                },
            });
        }
    }
    const deletes = (acks as string[]).map((signalId) => ({ type: "delete" as const, path: signalPath(id, signalId) }));
    if (writes.length || deletes.length) await commitServerMutations([...writes, ...deletes]);
    return { success: true, sent: writes.length };
}

/** Takes a person out of a group's channel (left or removed from the group, timed out, account deleted). */
export async function removeFromVoice(groupId: string, email: string, now = Date.now()) {
    const room = await getServerDocument<StoredRoom>(voiceRoomPath(groupId)).catch(() => null);
    if (!room?.participants) return;
    const key = memberKey(groupId, email);
    const ids = Object.keys(room.participants).filter((id) => isVoicePeerId(id) && id.startsWith(`${key}_`));
    await removeParticipants(groupId, ids, now);
}

/** Deletes a group's channel with every signal in it (the group is being deleted). */
export async function deleteGroupVoice(groupId: string) {
    const signals = await listServerCollection(`${voiceRoomPath(groupId)}/signals`, 500).catch(() => []);
    for (let index = 0; index < signals.length; index += 400) {
        await commitServerMutations(signals.slice(index, index + 400).map((entry) => ({ type: "delete" as const, path: entry._path })));
    }
    await deleteServerDocument(voiceRoomPath(groupId)).catch(() => undefined);
}
