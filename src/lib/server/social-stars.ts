import "server-only";

import { createHash } from "node:crypto";
import { isGroupId } from "@/lib/groups";
import { dmChatId, dmHref, groupHref, previewText } from "@/lib/social/model";
import { deleteServerDocument, getServerDocument, patchServerDocument, queryServerCollection } from "./firebase-rest";
import { isDocId, normalizeEmail } from "./validate";

/*
 * Starred messages of Hanogt Social: a private bookmark list per person
 * (message_stars, server-only), with a short excerpt so the list shows
 * without opening every conversation. Starring checks that the person can
 * read the message (a participant of the conversation, a member of the group).
 */

export type StarScope = "dm" | "group";

export type StarredMessage = {
    id: string;
    scope: StarScope;
    /** The partner's address (direct messages) or the group id. */
    target: string;
    messageId: string;
    excerpt: string;
    author: string;
    href: string;
    starredAt: string | null;
    messageAt: string | null;
};

export const STARS_MAX = 200;

const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 24);
export const starDocumentId = (owner: string, scope: StarScope, target: string, messageId: string) => `${hash(owner)}_${hash(`${scope}:${target}:${messageId}`)}`;

type StoredMessage = { fromEmail?: unknown; author?: unknown; type?: unknown; text?: unknown; createdAt?: unknown; deleted?: unknown };
type StoredStar = { owner?: unknown; scope?: unknown; target?: unknown; messageId?: unknown; excerpt?: unknown; author?: unknown; createdAt?: unknown; messageAt?: unknown };

const iso = (value: unknown) => {
    const time = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : Number.NaN;
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
};

export class StarError extends Error {
    constructor(readonly status: number, readonly code: "invalid_request" | "not_found" | "conflict") {
        super(code);
    }
}

function excerptOf(message: StoredMessage) {
    if (message.type === "voice") return "🎤";
    if (message.type === "gif") return typeof message.text === "string" && message.text ? `GIF · ${previewText(message.text, 80)}` : "GIF";
    return previewText(message.text, 200);
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

export async function starMessage(email: string, scope: StarScope, target: string, messageId: string, starred: boolean) {
    const path = (to: string) => `message_stars/${starDocumentId(email, scope, to, messageId)}`;
    if (!starred) {
        const partner = scope === "dm" ? normalizeEmail(target) ?? target : target;
        await deleteServerDocument(path(partner));
        return { success: true, starred: false };
    }
    const existing = await queryServerCollection<StoredStar>("message_stars", "owner", "EQUAL", email, { limit: STARS_MAX + 1 });
    const { message, target: to } = await readableMessage(email, scope, target, messageId);
    if (existing.length >= STARS_MAX && !existing.some((star) => star._id === starDocumentId(email, scope, to, messageId))) throw new StarError(409, "conflict");
    const author = typeof message.author === "string" ? message.author : typeof message.fromEmail === "string" ? message.fromEmail.split("@")[0] : "";
    await patchServerDocument(path(to), {
        owner: email,
        scope,
        target: to,
        messageId,
        excerpt: excerptOf(message),
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
