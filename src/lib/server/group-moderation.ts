import "server-only";

import { createHash } from "node:crypto";
import { getServerDocument } from "./firebase-rest";

/*
 * Records the Hanogt Security Bot keeps for a group (server-only collections;
 * the rules deny every client): mutes (group_mutes/{subject}), warnings
 * (group_warnings, by subject) and reports (group_reports). A subject is the
 * group id with a hash of the person's address, like group_bans.
 */

/** `{groupId}_{sha256(email)[:32]}`: one document per person and group. */
export function moderationSubject(groupId: string, email: string) {
    return `${groupId}_${createHash("sha256").update(email).digest("hex").slice(0, 32)}`;
}

export type MuteRecord = { groupId?: string; email?: string; until?: unknown; by?: string; reason?: string; createdAt?: unknown };

export const mutePath = (groupId: string, email: string) => `group_mutes/${moderationSubject(groupId, email)}`;

const millis = (value: unknown) => {
    const time = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : typeof value === "number" ? value : Number.NaN;
    return Number.isFinite(time) ? time : 0;
};

/** The person's mute in the group while it lasts; null otherwise. */
export async function activeMute(groupId: string, email: string, now = Date.now()) {
    const record = await getServerDocument<MuteRecord>(mutePath(groupId, email)).catch(() => null);
    const until = millis(record?.until);
    return record && until > now ? { until, by: record.by ?? "", reason: record.reason ?? "" } : null;
}

/** Minutes left (at least one) of a mute, for the message the person sees. */
export function minutesLeft(until: number, now = Date.now()) {
    return Math.max(1, Math.ceil((until - now) / 60_000));
}
