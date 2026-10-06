import "server-only";

import { createHash } from "node:crypto";
import { isGroupId } from "@/lib/groups";
import { FREE_SUBSCRIPTION, PLAN_STAR_LIMITS, effectivePlan, type PlanId } from "@/lib/plans";
import { dmChatId, dmHref, groupHref, messagePreview, previewText } from "@/lib/social/model";
import { STARS_MAX, type StarScope, type StarredMessage } from "@/lib/social/stars";
import { planQuota, type HealOptions } from "./entitlements";
import { commitServerMutations, commitServerPatches, countServerQuery, deleteServerDocument, getServerDocument, patchServerDocument, queryServerCollection } from "./firebase-rest";
import { getSubscription } from "./plans";
import { isDocId, normalizeEmail } from "./validate";

/*
 * Starred messages of Hanogt Social: a private bookmark list per person
 * (message_stars, server-only), with a short excerpt so the list shows
 * without opening every conversation. Starring checks that the person can
 * read the message (a participant of the conversation, a member of the group).
 * The excerpt is a copy of someone's words, so it follows the message: it is
 * updated when the message is edited and removed when the message, its
 * conversation or group, or the account that wrote it is deleted, and when
 * the person leaves the group. How many a person keeps is their plan's
 * (PLAN_STAR_LIMITS: Free 200, Plus 500, Pro 1,000); stars above it stay.
 */

export type { StarScope, StarredMessage };
export { STARS_MAX };

const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 24);
export const starDocumentId = (owner: string, scope: StarScope, target: string, messageId: string) => `${hash(owner)}_${hash(`${scope}:${target}:${messageId}`)}`;
/** The same for every star of one message, whoever starred it: "dm:<chatId>:<messageId>" or "group:<groupId>:<messageId>". */
export const starMessageRef = (scope: StarScope, place: string, messageId: string) => `${scope}:${place}:${messageId}`;
/** Every star in one conversation or group: "dm:<chatId>" or "group:<groupId>". */
export const starPlaceRef = (scope: StarScope, place: string) => `${scope}:${place}`;

type StoredMessage = { fromEmail?: unknown; author?: unknown; type?: unknown; text?: unknown; createdAt?: unknown; deleted?: unknown };
type StoredStar = { owner?: unknown; scope?: unknown; target?: unknown; messageId?: unknown; messageRef?: unknown; placeRef?: unknown; excerpt?: unknown; author?: unknown; createdAt?: unknown; messageAt?: unknown };

const iso = (value: unknown) => {
    const time = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : Number.NaN;
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
};

export class StarError extends Error {
    readonly status: number;
    readonly code: "invalid_request" | "not_found" | "limit";
    /** The plan's limit, for "limit". */
    readonly limit: number | null;
    readonly plan: PlanId | null;
    constructor(status: number, code: "invalid_request" | "not_found" | "limit", limit: { limit: number; plan: PlanId } | null = null) {
        super(code);
        this.name = "StarError";
        this.status = status;
        this.code = code;
        this.limit = limit?.limit ?? null;
        this.plan = limit?.plan ?? null;
    }
}

/** How many stars the account's plan keeps. */
export async function starLimitFor(email: string): Promise<{ plan: PlanId; limit: number }> {
    const subscription = await getSubscription(email).catch(() => FREE_SUBSCRIPTION);
    const plan = effectivePlan(subscription);
    return { plan, limit: PLAN_STAR_LIMITS[plan] };
}

export function starExcerpt(message: StoredMessage) {
    if (message.type === "voice") return "🎤";
    if (message.type === "gif") return typeof message.text === "string" && message.text ? `GIF · ${previewText(message.text, 80)}` : "GIF";
    return messagePreview(message.text, 200);
}

/** The message, if `email` may read it; throws not_found otherwise. */
async function readableMessage(email: string, scope: StarScope, target: string, messageId: string) {
    if (!isDocId(messageId)) throw new StarError(400, "invalid_request");
    if (scope === "dm") {
        const partner = normalizeEmail(target);
        if (!partner || partner === email) throw new StarError(400, "invalid_request");
        const chatId = dmChatId(email, partner);
        const chat = await getServerDocument<{ participants?: unknown }>(`chats/${chatId}`);
        const participants = Array.isArray(chat?.participants) ? chat.participants : [];
        if (!participants.includes(email) || !participants.includes(partner)) throw new StarError(404, "not_found");
        const message = await getServerDocument<StoredMessage>(`chats/${chatId}/messages/${messageId}`);
        if (!message || message.deleted === true) throw new StarError(404, "not_found");
        return { message, target: partner };
    }
    if (!isGroupId(target)) throw new StarError(400, "invalid_request");
    const group = await getServerDocument<{ members?: unknown }>(`groups/${target}`);
    if (!Array.isArray(group?.members) || !group.members.includes(email)) throw new StarError(404, "not_found");
    const message = await getServerDocument<StoredMessage>(`groups/${target}/messages/${messageId}`);
    if (!message) throw new StarError(404, "not_found");
    return { message, target };
}

export async function starMessage(email: string, scope: StarScope, target: string, messageId: string, starred: boolean, options: HealOptions = {}) {
    const path = (to: string) => `message_stars/${starDocumentId(email, scope, to, messageId)}`;
    if (!starred) {
        const partner = scope === "dm" ? normalizeEmail(target) ?? target : target;
        await deleteServerDocument(path(partner));
        return { success: true, starred: false };
    }
    const { message, target: to } = await readableMessage(email, scope, target, messageId);
    // A message starred again doesn't add one; a new star must fit the plan (a purchase Paddle hasn't reported is looked up first).
    if (!(await getServerDocument(path(to)))) {
        const quota = await planQuota(email, "stars", (upTo) => countServerQuery({ collectionId: "message_stars", where: [{ field: "owner", op: "EQUAL", value: email }], upTo }), options);
        if (!quota.allowed) throw new StarError(409, "limit", { limit: quota.limit ?? STARS_MAX, plan: quota.plan });
    }
    const author = typeof message.author === "string" ? message.author : typeof message.fromEmail === "string" ? message.fromEmail.split("@")[0] : "";
    const place = scope === "dm" ? dmChatId(email, to) : to;
    await patchServerDocument(path(to), {
        owner: email,
        scope,
        target: to,
        messageId,
        messageRef: starMessageRef(scope, place, messageId),
        placeRef: starPlaceRef(scope, place),
        // Whose words the excerpt holds: these stars go when that account is deleted.
        authorEmail: typeof message.fromEmail === "string" ? message.fromEmail.slice(0, 254) : null,
        excerpt: starExcerpt(message),
        author: author.slice(0, 80),
        messageAt: message.createdAt ?? null,
        createdAt: new Date(),
    });
    return { success: true, starred: true };
}

export async function listStars(email: string): Promise<StarredMessage[]> {
    const records = await queryServerCollection<StoredStar>("message_stars", "owner", "EQUAL", email, { limit: STARS_MAX });
    return records.flatMap((record): StarredMessage[] => {
        const scope = record.scope === "dm" || record.scope === "group" ? record.scope : null;
        const target = typeof record.target === "string" ? record.target : "";
        const messageId = typeof record.messageId === "string" ? record.messageId : "";
        if (!scope || !target || !messageId) return [];
        return [{
            id: record._id,
            scope,
            target,
            messageId,
            excerpt: typeof record.excerpt === "string" ? record.excerpt : "",
            author: typeof record.author === "string" ? record.author : "",
            href: scope === "dm" ? dmHref(target) : groupHref(target),
            starredAt: iso(record.createdAt),
            messageAt: iso(record.messageAt),
        }];
    }).sort((a, b) => String(b.starredAt).localeCompare(String(a.starredAt)));
}

/* -------------------------------------------------------------------------- */
/* Following the message                                                      */
/* -------------------------------------------------------------------------- */

const PAGE = 300;
const WRITES_PER_COMMIT = 400;

async function deleteStars(records: ReadonlyArray<{ _path: string }>) {
    for (let index = 0; index < records.length; index += WRITES_PER_COMMIT) {
        await commitServerMutations(records.slice(index, index + WRITES_PER_COMMIT).map((record) => ({ type: "delete" as const, path: record._path })));
    }
}

async function deleteMatching(field: "messageRef" | "placeRef" | "authorEmail", value: string) {
    // Each page is deleted before the next query, so the same page never comes back.
    for (let round = 0; round < 50; round += 1) {
        const records = await queryServerCollection<StoredStar>("message_stars", field, "EQUAL", value, { limit: PAGE });
        await deleteStars(records);
        if (records.length < PAGE) return;
    }
}

/** Removes the stars on deleted messages of one conversation or group (one message, or many after /purge). */
export async function forgetMessageStars(scope: StarScope, place: string, messageIds: readonly string[]) {
    if (messageIds.length === 1) return deleteMatching("messageRef", starMessageRef(scope, place, messageIds[0]));
    if (!messageIds.length) return;
    const ids = new Set(messageIds);
    const records = await queryServerCollection<StoredStar>("message_stars", "placeRef", "EQUAL", starPlaceRef(scope, place), { limit: 1000 });
    await deleteStars(records.filter((record) => typeof record.messageId === "string" && ids.has(record.messageId)));
}

/** Removes every star in a conversation or group that is being deleted. */
export function forgetPlaceStars(scope: StarScope, place: string) {
    return deleteMatching("placeRef", starPlaceRef(scope, place));
}

/** Removes everyone's stars on messages this account wrote (the account is being deleted). */
export function forgetAuthorStars(email: string) {
    return deleteMatching("authorEmail", email);
}

/** Removes a person's stars in a group they left or were removed from. */
export async function forgetMemberStars(owner: string, groupId: string) {
    const place = starPlaceRef("group", groupId);
    const records = await queryServerCollection<StoredStar>("message_stars", "owner", "EQUAL", owner, { limit: STARS_MAX + 50 });
    await deleteStars(records.filter((record) => record.placeRef === place));
}

/** An edited message: every star on it shows the new words. */
export async function refreshStarExcerpts(scope: StarScope, place: string, messageId: string, message: StoredMessage) {
    const records = await queryServerCollection<StoredStar>("message_stars", "messageRef", "EQUAL", starMessageRef(scope, place, messageId), { limit: PAGE });
    const excerpt = starExcerpt(message);
    for (let index = 0; index < records.length; index += WRITES_PER_COMMIT) {
        await commitServerPatches(records.slice(index, index + WRITES_PER_COMMIT).map((record) => ({ path: record._path, data: { excerpt }, updateFields: ["excerpt"], exists: true })));
    }
}
