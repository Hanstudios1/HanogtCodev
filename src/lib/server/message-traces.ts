import "server-only";

import { commitServerPatches, queryServerCollection } from "./firebase-rest";
import { forgetMessageStars, refreshStarExcerpts, type StarScope } from "./social-stars";

/*
 * What a message leaves elsewhere in Hanogt Social: the quote in replies to
 * it (replyTo.text) and the excerpt in people's starred messages. Both follow
 * the message, so its words don't outlive a deletion or an edit. Best effort:
 * the change to the message itself has already been saved.
 */

type Place = {
    scope: StarScope;
    /** The chat id ("a_b") or the group id. */
    place: string;
    /** Where the messages live: chats/{chatId} or groups/{groupId}. */
    parentPath: string;
};

type Quoting = { _path: string; replyTo?: unknown };

const WRITES_PER_COMMIT = 400;
/** A /purge passes the messages it loaded; one deletion looks the replies up. */
const LOOKUPS_MAX = 10;

function quotedId(record: Quoting) {
    const reply = record.replyTo && typeof record.replyTo === "object" ? (record.replyTo as { id?: unknown }) : null;
    return typeof reply?.id === "string" ? reply.id : null;
}

async function repliesTo(parentPath: string, messageIds: readonly string[], loaded?: readonly Quoting[]) {
    const ids = new Set(messageIds);
    const found = loaded ?? (await Promise.all(messageIds.slice(0, LOOKUPS_MAX).map((id) => queryServerCollection<Quoting>("messages", "replyTo.id", "EQUAL", id, { parentPath, limit: 100 })))).flat();
    return found.filter((record) => {
        const id = quotedId(record);
        return id !== null && ids.has(id) && !ids.has(record._path.split("/").pop() ?? "");
    });
}

async function patchQuotes(replies: readonly Quoting[], data: Record<string, unknown>, updateFields: string[]) {
    for (let index = 0; index < replies.length; index += WRITES_PER_COMMIT) {
        await commitServerPatches(replies.slice(index, index + WRITES_PER_COMMIT).map((record) => ({ path: record._path, data, updateFields, exists: true })));
    }
}

const quiet = (task: Promise<unknown>) => task.catch((error: unknown) => console.warn("[social] message traces:", error instanceof Error ? error.message : "unknown error"));

/**
 * Deleted messages: replies show "deleted" instead of the quote, and the
 * stars on them are removed. `loaded` are messages already read (a /purge),
 * searched for replies instead of one query per message.
 */
export async function clearMessageTraces(where: Place, messageIds: readonly string[], loaded?: readonly Quoting[]) {
    if (!messageIds.length) return;
    await Promise.all([
        quiet(repliesTo(where.parentPath, messageIds, loaded).then((replies) => patchQuotes(replies, { replyTo: { text: "", deleted: true } }, ["replyTo.text", "replyTo.deleted"]))),
        quiet(forgetMessageStars(where.scope, where.place, messageIds)),
    ]);
}

/** An edited message: replies quote the new words and stars show them. */
export async function refreshMessageTraces(where: Place, messageId: string, message: { text: string; type?: unknown; author?: unknown; fromEmail?: unknown }, quote: string) {
    await Promise.all([
        quiet(repliesTo(where.parentPath, [messageId]).then((replies) => patchQuotes(replies, { replyTo: { text: quote } }, ["replyTo.text"]))),
        quiet(refreshStarExcerpts(where.scope, where.place, messageId, message)),
    ]);
}
