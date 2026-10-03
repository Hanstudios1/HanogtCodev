import "server-only";

import { createHash } from "node:crypto";
import { voterHash } from "./ai-rankings";
import { likerHash } from "./arcade";
import {
    commitServerMutations,
    commitServerPatches,
    deleteFirebaseAuthUser,
    deleteServerDocument,
    getServerDocument,
    isWriteConflict,
    listServerCollection,
    queryServerCollection,
} from "./firebase-rest";
import { deleteVoiceRecording } from "./social-voice";
import { isOwnedStoragePath, normalizeEmail } from "./validate";

/*
 * Deletes a user's data. Shared by self-service account deletion
 * (DELETE /api/account/data) and the admin panel (POST /api/admin/users,
 * action "deleteData").
 *
 * scope "all" removes the account and everything it left behind: private
 * chats with their voice messages, calls, code and game projects, published
 * Arcade games, news comments, Arcade likes and arena votes, Media posts and
 * every like, comment, report and security-training contribution, groups it
 * owns (in other groups it leaves and its messages are anonymised), group
 * bans and invite links, friend requests, group invites, its place in other
 * people's friend and block lists, feedback items, likes and comments,
 * changelog comments, notifications and support tickets; finally the user
 * document, credentials, public profile and Firebase Auth record.
 *
 * scope "content" removes only what other people can see: Media posts with
 * everything attached and the user's comments on other posts, published
 * Arcade games with their likes, news and changelog comments, feedback items
 * the user wrote and their comments on other items; their group messages are
 * anonymised. The account and sign-in, friends, private chats and calls, code
 * and game projects, likes, votes, reports and support tickets stay.
 *
 * Every step and document is handled on its own: a failure is recorded in the
 * summary and the rest carries on, so one broken record (or a missing index)
 * can never make an account impossible to delete. A parent document (chat,
 * project, group…) is only removed once its children are gone, so a second
 * run finds whatever the first one left; the account documents go last.
 */

export type DeletionScope = "all" | "content";
export const DELETION_SCOPES: readonly DeletionScope[] = ["all", "content"];

export type AccountDeletionSummary = {
    /** Deleted (or anonymised) documents and files per kind; kinds with nothing to do are left out. */
    deleted: Record<string, number>;
    /** One line per kind of failure, "step: message (×n)"; never contains e-mail addresses. */
    errors: string[];
    /** users/{email}, credentials and the public profile are gone (always false for "content"). */
    accountDeleted: boolean;
};

/** Response of the admin panel's "deleteData" action (POST /api/admin/users). */
export type AccountDeletionResult = AccountDeletionSummary & { email: string; scope: DeletionScope };

type StoredDocument = Record<string, unknown> & { _id: string; _path: string; _updateTime?: string };

type Context = {
    email: string;
    scope: DeletionScope;
    tally: DeletionTally;
    accountDeleted: boolean;
};

const QUERY_LIMIT = 1_000;
/** Bounds the repeated queries of drain(): 25 000 matching documents per query. */
const MAX_PASSES = 25;
/** Firestore accepts 500 writes per commit. */
const COMMIT_SIZE = 400;
const CONCURRENCY = 6;
const MAX_ERROR_LINES = 40;
const DOC_ID = /^[A-Za-z0-9_-]{1,128}$/;
const NEWS_ID = /^[a-f0-9]{20}$/;
const GROUP_MESSAGE_PATH = /^groups\/[^/]+\/messages\/[^/]+$/;
const DELETED_AUTHOR = "Silinmiş kullanıcı";
const DELETED_VOICE_TEXT = "Silinmiş sesli mesaj";

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export type DeletionTally = ReturnType<typeof createDeletionTally>;

/** Counts and failures of one run; failures with the same message are merged. */
export function createDeletionTally() {
    const deleted: Record<string, number> = {};
    const failures = new Map<string, number>();
    let dropped = 0;
    return {
        count(kind: string, amount = 1) {
            if (amount > 0) deleted[kind] = (deleted[kind] ?? 0) + amount;
        },
        fail(step: string, error: unknown) {
            const message = error instanceof Error ? error.message : typeof error === "string" ? error : "unknown error";
            // Firestore messages carry no addresses, but document ids can be e-mails: never pass one on.
            const line = `${step}: ${message.replace(/[^\s"'/@]+@[^\s"'/]+/g, "…").slice(0, 200)}`;
            if (failures.has(line) || failures.size < MAX_ERROR_LINES) failures.set(line, (failures.get(line) ?? 0) + 1);
            else dropped += 1;
        },
        summary(): Omit<AccountDeletionSummary, "accountDeleted"> {
            const errors = [...failures].map(([line, times]) => (times > 1 ? `${line} (×${times})` : line));
            if (dropped) errors.push(`… (+${dropped})`);
            return { deleted: { ...deleted }, errors };
        },
    };
}

/** Total of all counts, e.g. for the audit log. */
export function deletionTotal(deleted: Record<string, number>) {
    return Object.values(deleted).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
}

/** The `limit` largest counts (ties by name), for audit entries with a bounded number of fields. */
export function largestCounts(deleted: Record<string, number>, limit: number) {
    return Object.fromEntries(
        Object.entries(deleted)
            .filter(([, value]) => value > 0)
            .sort(([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0))
            .slice(0, Math.max(0, limit)),
    );
}

/**
 * Pseudonymous sender that replaces the e-mail on anonymised group messages.
 * Salted and one-way, but stable, so one person's messages still read as one
 * conversation partner.
 */
export function anonymousSender(email: string) {
    const salt = process.env.RATE_LIMIT_SALT || process.env.NEXTAUTH_SECRET || "hanogt";
    return `deleted-${createHash("sha256").update(`${salt}:deleted-sender:${email}`).digest("hex").slice(0, 24)}`;
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function errorStatus(error: unknown) {
    return typeof error === "object" && error !== null && "status" in error ? Number((error as { status?: unknown }).status) || 0 : 0;
}

function list(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function query(collectionId: string, field: string, op: "EQUAL" | "ARRAY_CONTAINS", value: unknown, options: { parentPath?: string; allDescendants?: boolean } = {}) {
    return () => queryServerCollection<Record<string, unknown>>(collectionId, field, op, value, { ...options, limit: QUERY_LIMIT }) as Promise<StoredDocument[]>;
}

async function eachLimited<T>(items: readonly T[], worker: (item: T) => Promise<void>) {
    let next = 0;
    const run = async () => {
        while (next < items.length) {
            const item = items[next];
            next += 1;
            await worker(item);
        }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, run));
}

/**
 * Runs `handle` on everything a query matches. Handled documents leave the
 * result (deleted, or changed so they no longer match), so the query is
 * repeated while it comes back full, which gets past its 1000-document
 * limit. Documents seen before (failed or skipped) are not handled twice.
 * Resolves to false when something could not be handled.
 */
async function drain(ctx: Context, step: string, run: () => Promise<StoredDocument[]>, handle: (documents: StoredDocument[]) => Promise<boolean>) {
    const seen = new Set<string>();
    let complete = true;
    for (let pass = 0; pass < MAX_PASSES; pass += 1) {
        const batch = await run();
        const fresh = batch.filter((document) => !seen.has(document._path));
        if (!fresh.length) return complete;
        for (const document of fresh) seen.add(document._path);
        if (!(await handle(fresh))) complete = false;
        if (batch.length < QUERY_LIMIT) return complete;
    }
    ctx.tally.fail(step, `more than ${MAX_PASSES * QUERY_LIMIT} documents, run the deletion again`);
    return false;
}

/** Batch handler for drain(): runs `handle` on each document; false from it or an error marks the batch incomplete. */
function eachDocument(ctx: Context, step: string, handle: (document: StoredDocument) => Promise<boolean | void>) {
    return async (documents: StoredDocument[]) => {
        let complete = true;
        await eachLimited(documents, async (document) => {
            try {
                if ((await handle(document)) === false) complete = false;
            } catch (error) {
                complete = false;
                ctx.tally.fail(step, error);
            }
        });
        return complete;
    };
}

/** Deletes documents in commits of up to 400 (deleting a missing document is not an error). */
async function deletePaths(ctx: Context, step: string, kind: string, paths: readonly string[]) {
    let complete = true;
    for (let index = 0; index < paths.length; index += COMMIT_SIZE) {
        const chunk = paths.slice(index, index + COMMIT_SIZE);
        try {
            await commitServerMutations(chunk.map((path) => ({ type: "delete" as const, path })));
            ctx.tally.count(kind, chunk.length);
        } catch (error) {
            complete = false;
            ctx.tally.fail(step, error);
        }
    }
    return complete;
}

/** Batch handler for drain() that deletes every matched document. */
function deleting(ctx: Context, step: string, kind: string) {
    return (documents: StoredDocument[]) => deletePaths(ctx, step, kind, documents.map((document) => document._path));
}

/**
 * Deletes a whole subcollection. `beforeDelete` removes what a document
 * points to (voice recordings); when that fails the document is kept, so the
 * file stays findable for a later run. True when nothing is left.
 */
async function deleteSubcollection(ctx: Context, step: string, kind: string, collectionPath: string, beforeDelete?: (document: StoredDocument) => Promise<void>) {
    let documents: StoredDocument[];
    try {
        documents = await listServerCollection<Record<string, unknown>>(collectionPath);
    } catch (error) {
        ctx.tally.fail(step, error);
        return false;
    }
    const deletable: string[] = [];
    let complete = true;
    await eachLimited(documents, async (document) => {
        try {
            if (beforeDelete) await beforeDelete(document);
            deletable.push(document._path);
        } catch (error) {
            complete = false;
            ctx.tally.fail(step, error);
        }
    });
    return (await deletePaths(ctx, step, kind, deletable)) && complete;
}

/** Deletes the subcollections first and the document only once they are empty. */
async function deleteWithSubcollections(ctx: Context, step: string, kind: string, document: StoredDocument, subcollections: ReadonlyArray<readonly [name: string, kind: string]>) {
    let complete = true;
    for (const [name, childKind] of subcollections) {
        if (!(await deleteSubcollection(ctx, step, childKind, `${document._path}/${name}`))) complete = false;
    }
    if (!complete) return false;
    await deleteServerDocument(document._path);
    ctx.tally.count(kind);
    return true;
}

/**
 * Read-modify-write with an updateTime precondition, so a concurrent change
 * (a new like, friend or member) is never overwritten. `change` returns the
 * fields to write, or null when nothing needs to change. True when written.
 */
async function updateWithRetry(document: StoredDocument, change: (current: StoredDocument) => Record<string, unknown> | null) {
    let current: StoredDocument | null = document;
    for (let attempt = 1; current; attempt += 1) {
        const data = change(current);
        if (!data) return false;
        try {
            await commitServerPatches([{
                path: current._path,
                data,
                updateFields: Object.keys(data),
                ...(current._updateTime ? { updateTime: current._updateTime } : { exists: true }),
            }]);
            return true;
        } catch (error) {
            if (errorStatus(error) === 404) return false;
            if (!isWriteConflict(error) || attempt >= 4) throw error;
        }
        const fresh: Record<string, unknown> | null = await getServerDocument<Record<string, unknown>>(current._path);
        current = fresh ? { ...fresh, _id: current._id, _path: current._path } : null;
    }
    return false;
}

/** Updates fields of a document that must already exist; false when it is gone. */
async function patchExisting(path: string, data: Record<string, unknown>) {
    try {
        await commitServerPatches([{ path, data, updateFields: Object.keys(data), exists: true }]);
        return true;
    } catch (error) {
        if (errorStatus(error) === 404) return false;
        throw error;
    }
}

/**
 * Deletes a like or comment and lowers the counter of what it belonged to.
 * The counter is only touched while its document exists and is above zero
 * (an increment would otherwise create a stray document).
 */
async function deleteAndDecrement(record: StoredDocument, counterPath: string | null, field: string) {
    const counter = counterPath ? await getServerDocument<Record<string, unknown>>(counterPath) : null;
    if (counterPath && counter && Number(counter[field] || 0) > 0) {
        try {
            await commitServerMutations([
                { type: "delete", path: record._path, ...(record._updateTime ? { updateTime: record._updateTime } : {}) },
                { type: "increment", path: counterPath, fields: { [field]: -1 } },
            ]);
            return;
        } catch (error) {
            // The record changed or disappeared meanwhile (e.g. unliked): delete it without the counter.
            if (!isWriteConflict(error)) throw error;
        }
    }
    await deleteServerDocument(record._path);
}

async function deleteVoiceFile(ctx: Context, voicePath: unknown, prefix: string, containerId: string) {
    // voicePath is written by clients: only recordings inside the chat's or group's own folder are deleted.
    if (!isOwnedStoragePath(voicePath, prefix, containerId)) return;
    // A temporary Storage failure (older recordings) is thrown too, so the message stays for a later run.
    await deleteVoiceRecording(voicePath, { retryStorage: true });
    ctx.tally.count("voiceFiles");
}

/** Removes the author from a group message; text messages keep their text, voice messages lose the recording. */
async function anonymizeGroupMessage(ctx: Context, message: StoredDocument) {
    const groupId = message._path.split("/")[1] || "";
    try {
        await deleteVoiceFile(ctx, message.voicePath, "group-voice-messages", groupId);
    } catch (error) {
        // The message is anonymised anyway: keeping the name to retry the file is the worse trade.
        ctx.tally.fail("voiceFiles", error);
    }
    const anonymized = await patchExisting(message._path, {
        fromEmail: anonymousSender(ctx.email),
        author: DELETED_AUTHOR,
        authorAvatar: null,
        text: message.type === "voice" ? DELETED_VOICE_TEXT : message.text,
        voicePath: null,
        voiceDuration: null,
    });
    if (anonymized) ctx.tally.count("groupMessagesAnonymized");
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

async function deleteChats(ctx: Context) {
    await drain(ctx, "chats", query("chats", "participants", "ARRAY_CONTAINS", ctx.email), eachDocument(ctx, "chats", async (chat) => {
        const messagesGone = await deleteSubcollection(ctx, "chats", "chatMessages", `${chat._path}/messages`, (message) => deleteVoiceFile(ctx, message.voicePath, "voice-messages", chat._id));
        if (!messagesGone) return false;
        await deleteServerDocument(chat._path);
        ctx.tally.count("chats");
    }));
}

async function deleteCalls(ctx: Context) {
    await drain(ctx, "calls", query("calls", "participants", "ARRAY_CONTAINS", ctx.email), eachDocument(ctx, "calls", (call) => (
        deleteWithSubcollections(ctx, "calls", "calls", call, [["callerCandidates", "callCandidates"], ["calleeCandidates", "callCandidates"]])
    )));
}

async function deleteProjects(ctx: Context) {
    await drain(ctx, "projects", query("projects", "email", "EQUAL", ctx.email), eachDocument(ctx, "projects", (project) => (
        deleteWithSubcollections(ctx, "projects", "projects", project, [["files", "projectFiles"]])
    )));
}

async function deleteGameProjects(ctx: Context) {
    await drain(ctx, "gameProjects", query("game_projects", "ownerEmail", "EQUAL", ctx.email), eachDocument(ctx, "gameProjects", (project) => (
        deleteWithSubcollections(ctx, "gameProjects", "gameProjects", project, [["scripts", "gameScripts"]])
    )));
}

async function deleteArcadeGames(ctx: Context) {
    await drain(ctx, "arcadeGames", query("arcade_games", "ownerEmail", "EQUAL", ctx.email), eachDocument(ctx, "arcadeGames", async (game) => {
        const likesGone = await drain(ctx, "arcadeGames", query("arcade_likes", "gameId", "EQUAL", game._id), deleting(ctx, "arcadeGames", "arcadeLikes"));
        if (!likesGone) return false;
        await deleteServerDocument(game._path);
        ctx.tally.count("arcadeGames");
    }));
}

async function deleteNewsComments(ctx: Context) {
    await drain(ctx, "newsComments", query("news_comments", "authorEmail", "EQUAL", ctx.email), eachDocument(ctx, "newsComments", async (comment) => {
        const newsId = typeof comment.newsId === "string" && NEWS_ID.test(comment.newsId) ? comment.newsId : "";
        await deleteAndDecrement(comment, newsId ? `news_meta/${newsId}` : null, "commentCount");
        ctx.tally.count("newsComments");
    }));
}

/** Likes on other people's games (the like count goes down) and pseudonymous arena votes. */
async function deleteArcadeLikesAndVotes(ctx: Context) {
    await runStep(ctx, "arcadeLikes", () => drain(ctx, "arcadeLikes", query("arcade_likes", "liker", "EQUAL", likerHash(ctx.email)), eachDocument(ctx, "arcadeLikes", async (like) => {
        const gameId = typeof like.gameId === "string" && DOC_ID.test(like.gameId) ? like.gameId : "";
        await deleteAndDecrement(like, gameId ? `arcade_games/${gameId}` : null, "likes");
        ctx.tally.count("arcadeLikes");
    })));
    await runStep(ctx, "arenaVotes", () => drain(ctx, "arenaVotes", query("arena_votes", "voter", "EQUAL", voterHash(ctx.email)), deleting(ctx, "arenaVotes", "arenaVotes")));
}

const POST_RECORDS = [["media_likes", "mediaLikes"], ["media_comments", "mediaComments"], ["media_reports", "mediaReports"]] as const;

async function deleteMediaPosts(ctx: Context) {
    await drain(ctx, "mediaPosts", query("media_posts", "ownerEmail", "EQUAL", ctx.email), eachDocument(ctx, "mediaPosts", async (post) => {
        let complete = await deleteSubcollection(ctx, "mediaPosts", "mediaFiles", `${post._path}/files`);
        for (const [collectionId, kind] of POST_RECORDS) {
            if (!(await drain(ctx, "mediaPosts", query(collectionId, "postId", "EQUAL", post._id), deleting(ctx, "mediaPosts", kind)))) complete = false;
        }
        if (!complete) return false;
        await commitServerMutations([
            { type: "delete", path: `security_training_contributions/${post._id}` },
            { type: "delete", path: post._path },
        ]);
        ctx.tally.count("mediaPosts");
    }));
}

const MEDIA_ACTIVITY = [
    { collectionId: "media_likes", field: "userEmail", kind: "mediaLikes", counter: "likeCount", content: false },
    { collectionId: "media_comments", field: "authorEmail", kind: "mediaComments", counter: "commentCount", content: true },
    { collectionId: "media_reports", field: "reporterEmail", kind: "mediaReports", counter: null, content: false },
    { collectionId: "security_training_contributions", field: "ownerEmail", kind: "securityContributions", counter: null, content: false },
] as const;

/** The user's likes, comments and reports on other people's posts (counters go down) and training contributions. */
async function deleteMediaActivity(ctx: Context) {
    for (const record of MEDIA_ACTIVITY) {
        if (ctx.scope === "content" && !record.content) continue;
        const counter = record.counter;
        await runStep(ctx, record.kind, () => drain(ctx, record.kind, query(record.collectionId, record.field, "EQUAL", ctx.email), counter
            ? eachDocument(ctx, record.kind, async (document) => {
                const postId = typeof document.postId === "string" && DOC_ID.test(document.postId) ? document.postId : "";
                await deleteAndDecrement(document, postId ? `media_posts/${postId}` : null, counter);
                ctx.tally.count(record.kind);
            })
            : deleting(ctx, record.kind, record.kind)));
    }
}

/** Mirrors deleteGroupCascade in api/groups/_shared.ts (that module depends on the request layer). */
async function deleteOwnedGroup(ctx: Context, group: StoredDocument) {
    const voice = (message: StoredDocument) => deleteVoiceFile(ctx, message.voicePath, "group-voice-messages", group._id);
    let complete = await deleteSubcollection(ctx, "groups", "groupMessages", `${group._path}/messages`, voice);
    if (!(await deleteSubcollection(ctx, "groups", "groupFiles", `${group._path}/files`))) complete = false;
    for (const collectionId of ["group_invites", "group_invite_links", "group_bans"]) {
        if (!(await drain(ctx, "groups", query(collectionId, "groupId", "EQUAL", group._id), deleting(ctx, "groups", "groupRecords")))) complete = false;
    }
    // Kept until its content is gone, so a later run finds the group again.
    if (!complete) return false;
    await deleteServerDocument(group._path);
    ctx.tally.count("groups");
    // Members could still post until the group document disappeared (the rules check it).
    return deleteSubcollection(ctx, "groups", "groupMessages", `${group._path}/messages`, voice);
}

async function leaveGroup(ctx: Context, group: StoredDocument) {
    const left = await updateWithRetry(group, (current) => {
        const members = list(current.members);
        const admins = list(current.admins);
        if (!members.includes(ctx.email) && !admins.includes(ctx.email)) return null;
        return {
            members: members.filter((entry) => entry !== ctx.email),
            admins: admins.filter((entry) => entry !== ctx.email),
            updatedAt: new Date(),
        };
    });
    if (left) ctx.tally.count("groupMemberships");
}

/**
 * "all": groups the user owns are deleted; in the others they leave and
 * their messages are anonymised. "content": messages are anonymised in every
 * group, the memberships stay.
 */
async function handleGroups(ctx: Context) {
    await drain(ctx, "groups", query("groups", "members", "ARRAY_CONTAINS", ctx.email), eachDocument(ctx, "groups", async (group) => {
        if (ctx.scope === "all" && group.ownerEmail === ctx.email) return deleteOwnedGroup(ctx, group);
        const anonymized = await drain(ctx, "groupMessages",
            query("messages", "fromEmail", "EQUAL", ctx.email, { parentPath: group._path }),
            eachDocument(ctx, "groupMessages", (message) => anonymizeGroupMessage(ctx, message)));
        if (ctx.scope === "all") await leaveGroup(ctx, group);
        return anonymized;
    }));
}

/** Bans of this account and invite links it created elsewhere; bans it issued stay in force but no longer name it. */
async function cleanGroupRecords(ctx: Context) {
    await runStep(ctx, "groupRecords", () => drain(ctx, "groupRecords", query("group_bans", "email", "EQUAL", ctx.email), deleting(ctx, "groupRecords", "groupRecords")));
    await runStep(ctx, "groupRecords", () => drain(ctx, "groupRecords", query("group_invite_links", "createdBy", "EQUAL", ctx.email), deleting(ctx, "groupRecords", "groupRecords")));
    await runStep(ctx, "groupRecords", () => drain(ctx, "groupRecords", query("group_bans", "bannedBy", "EQUAL", ctx.email), eachDocument(ctx, "groupRecords", async (ban) => {
        if (await patchExisting(ban._path, { bannedBy: null })) ctx.tally.count("groupBansAnonymized");
    })));
}

/**
 * Group messages the steps above did not reach (groups the user left
 * earlier). This collection-group query needs a single-field index on
 * messages.fromEmail with collection-group scope; without it the step fails
 * on its own and is reported. Results are ordered by path and private chat
 * messages ("chats/…") come first, so with "content" (chats are kept) more
 * than 1000 of them can hide the rest.
 */
async function anonymizeRemainingGroupMessages(ctx: Context) {
    await drain(ctx, "groupMessages", query("messages", "fromEmail", "EQUAL", ctx.email, { allDescendants: true }), eachDocument(ctx, "groupMessages", async (message) => {
        if (GROUP_MESSAGE_PATH.test(message._path)) await anonymizeGroupMessage(ctx, message);
    }));
}

async function deleteRequestsAndInvites(ctx: Context) {
    for (const [collectionId, kind] of [["friendRequests", "friendRequests"], ["group_invites", "groupInvites"]] as const) {
        for (const field of ["fromEmail", "toEmail"]) {
            await runStep(ctx, kind, () => drain(ctx, kind, query(collectionId, field, "EQUAL", ctx.email), deleting(ctx, kind, kind)));
        }
    }
}

async function cleanFriendLists(ctx: Context) {
    for (const [field, kind] of [["friends", "friendLinks"], ["blockedUsers", "blockLinks"]] as const) {
        await runStep(ctx, kind, () => drain(ctx, kind, query("users", field, "ARRAY_CONTAINS", ctx.email), eachDocument(ctx, kind, async (owner) => {
            const removed = await updateWithRetry(owner, (current) => {
                const entries = list(current[field]);
                return entries.includes(ctx.email) ? { [field]: entries.filter((entry) => entry !== ctx.email) } : null;
            });
            if (removed) ctx.tally.count(kind);
        })));
    }
}

function writtenBy(comment: unknown, email: string) {
    return Boolean(comment) && typeof comment === "object" && (comment as { authorEmail?: unknown }).authorEmail === email;
}

/** Items the user wrote; their comments on other items ("all": also their likes). Comments live inside the items, so all are read. */
async function cleanFeedback(ctx: Context) {
    await runStep(ctx, "feedback", () => drain(ctx, "feedback", query("feedback", "authorEmail", "EQUAL", ctx.email), deleting(ctx, "feedback", "feedback")));
    const items = await listServerCollection<Record<string, unknown>>("feedback");
    await eachDocument(ctx, "feedback", async (item) => {
        let likes = 0;
        let comments = 0;
        const changed = await updateWithRetry(item, (current) => {
            const currentLikes = list(current.likes);
            const currentComments = list(current.comments);
            const keptLikes = ctx.scope === "all" ? currentLikes.filter((entry) => entry !== ctx.email) : currentLikes;
            const keptComments = currentComments.filter((comment) => !writtenBy(comment, ctx.email));
            likes = currentLikes.length - keptLikes.length;
            comments = currentComments.length - keptComments.length;
            if (!likes && !comments) return null;
            return likes ? { likes: keptLikes, comments: keptComments } : { comments: keptComments };
        });
        if (!changed) return;
        ctx.tally.count("feedbackLikes", likes);
        ctx.tally.count("feedbackComments", comments);
    })(items);
}

/** Comments on the release notes (changelog_comments/{version}/comments, a collection-group query). */
async function deleteChangelogComments(ctx: Context) {
    await drain(ctx, "changelogComments", query("comments", "email", "EQUAL", ctx.email, { allDescendants: true }), deleting(ctx, "changelogComments", "changelogComments"));
}

async function deleteNotifications(ctx: Context) {
    await deleteSubcollection(ctx, "notifications", "notifications", `notifications/${ctx.email}/items`);
}

/**
 * Support tickets keep their conversation inside the ticket document. The
 * "new ticket" notifications staff received show the ticket title, so they go
 * with the tickets.
 */
async function deleteSupportTickets(ctx: Context) {
    const ticketIds: string[] = [];
    const remove = deleting(ctx, "supportTickets", "supportTickets");
    await drain(ctx, "supportTickets", query("support_tickets", "authorEmail", "EQUAL", ctx.email), async (documents) => {
        ticketIds.push(...documents.map((document) => document._id));
        return remove(documents);
    });
    if (!ticketIds.length) return;
    // Loaded lazily: the support module pulls in the admin/Next.js helpers,
    // which the plain-Node deletion tests can't load.
    const support = await import("./support").catch(() => null);
    if (!support) return;
    await support.removeStaffTicketNotifications(ticketIds).catch((error: unknown) => {
        ctx.tally.fail("staffTicketNotifications", error instanceof Error ? error.message : "failed");
    });
}

/**
 * Live editing sessions the user owns, with their updates, chat and
 * signalling (sessions they only joined end within a day and are purged
 * with them). Loaded lazily like the support module: it needs Yjs and the
 * Next.js helpers, which the plain-Node deletion tests can't load.
 */
async function deleteCollabSessions(ctx: Context) {
    const collab = await import("../collab/server").catch(() => null);
    if (!collab) return;
    const purged = await collab.purgeOwnedSessions(ctx.email);
    if (purged) ctx.tally.count("collabSessions", purged);
}

/**
 * A plan staff assigned (with any Hanogt AI grant), "notify me" sign-ups on
 * the Plans page and the Paddle subscriptions: every one that isn't over yet
 * is cancelled at once (not only the stored one) and the Paddle customer is
 * kept only as a tombstone (no e-mail), so a renewal that slips through later
 * is cancelled by the webhook. If Paddle
 * can't be reached the failure is reported and staff find the subscription in
 * paddle_cleanup; the records are deleted either way.
 */
async function deletePlanRecords(ctx: Context) {
    const record = await getServerDocument<Record<string, unknown>>(`subscriptions/${ctx.email}`);
    if (record?.paddle || record?.paddleCustomerId) {
        const { releaseBillingForDeletion } = await import("./paddle");
        const billing = await releaseBillingForDeletion(record);
        if (billing.canceled) ctx.tally.count("paddleSubscriptionsCanceled", billing.canceled);
        if (billing.error) ctx.tally.fail("billing", billing.error);
    }
    await commitServerMutations([
        { type: "delete", path: `subscriptions/${ctx.email}` },
        { type: "delete", path: `plan_waitlist/${ctx.email}` },
    ]);
    ctx.tally.count("planRecords");
}

/** Hanogt AI connections with the person's own (encrypted) provider keys. */
async function deleteAiConnections(ctx: Context) {
    const { deleteAllConnections } = await import("./ai-connections");
    const removed = await deleteAllConnections(ctx.email);
    if (removed) ctx.tally.count("aiConnections", removed);
}

/**
 * The account itself, in one commit: without the user document every
 * session ends (getActiveSession requires it). Then the Firebase Auth record,
 * which stops client-side Firestore access once the current token expires.
 */
async function deleteAccount(ctx: Context) {
    await commitServerMutations([
        { type: "delete", path: `users/${ctx.email}` },
        { type: "delete", path: `credentials/${ctx.email}` },
        { type: "delete", path: `public_profiles/${ctx.email}` },
    ]);
    ctx.accountDeleted = true;
    ctx.tally.count("account");
    await deleteFirebaseAuthUser(ctx.email);
}

type Step = { id: string; scopes: readonly DeletionScope[]; run: (ctx: Context) => Promise<void> };

const BOTH: readonly DeletionScope[] = ["all", "content"];
const ALL: readonly DeletionScope[] = ["all"];

/** In order; the account goes last. */
const STEPS: readonly Step[] = [
    { id: "chats", scopes: ALL, run: deleteChats },
    { id: "calls", scopes: ALL, run: deleteCalls },
    { id: "projects", scopes: ALL, run: deleteProjects },
    { id: "gameProjects", scopes: ALL, run: deleteGameProjects },
    { id: "arcadeGames", scopes: BOTH, run: deleteArcadeGames },
    { id: "newsComments", scopes: BOTH, run: deleteNewsComments },
    { id: "arcadeLikes", scopes: ALL, run: deleteArcadeLikesAndVotes },
    { id: "mediaPosts", scopes: BOTH, run: deleteMediaPosts },
    { id: "mediaActivity", scopes: BOTH, run: deleteMediaActivity },
    { id: "groups", scopes: BOTH, run: handleGroups },
    { id: "groupRecords", scopes: ALL, run: cleanGroupRecords },
    { id: "groupMessages", scopes: BOTH, run: anonymizeRemainingGroupMessages },
    { id: "requests", scopes: ALL, run: deleteRequestsAndInvites },
    { id: "friendLists", scopes: ALL, run: cleanFriendLists },
    { id: "feedback", scopes: BOTH, run: cleanFeedback },
    { id: "changelogComments", scopes: BOTH, run: deleteChangelogComments },
    { id: "collabSessions", scopes: ALL, run: deleteCollabSessions },
    { id: "notifications", scopes: ALL, run: deleteNotifications },
    { id: "supportTickets", scopes: ALL, run: deleteSupportTickets },
    { id: "plans", scopes: ALL, run: deletePlanRecords },
    { id: "aiConnections", scopes: ALL, run: deleteAiConnections },
    { id: "account", scopes: ALL, run: deleteAccount },
];

/** Step ids a scope runs, in order (for tests and documentation). */
export function deletionSteps(scope: DeletionScope) {
    return STEPS.filter((step) => step.scopes.includes(scope)).map((step) => step.id);
}

async function runStep(ctx: Context, id: string, run: () => Promise<unknown>) {
    try {
        await run();
    } catch (error) {
        ctx.tally.fail(id, error);
    }
}

/**
 * Deletes the data of `email` (see the comment at the top for what each
 * scope covers). Never throws for a failed document or step; the summary
 * lists what was removed and what failed.
 */
export async function deleteAccountData(email: string, options: { scope: DeletionScope }): Promise<AccountDeletionSummary> {
    // The address ends up in document paths and queries: only canonical e-mails are accepted.
    if (!email || normalizeEmail(email) !== email) throw new Error("Geçersiz e-posta adresi.");
    if (!DELETION_SCOPES.includes(options.scope)) throw new Error("Geçersiz silme kapsamı.");
    const ctx: Context = { email, scope: options.scope, tally: createDeletionTally(), accountDeleted: false };
    for (const step of STEPS) {
        if (step.scopes.includes(ctx.scope)) await runStep(ctx, step.id, () => step.run(ctx));
    }
    return { ...ctx.tally.summary(), accountDeleted: ctx.accountDeleted };
}
