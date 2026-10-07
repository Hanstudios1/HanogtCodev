/**
 * The shared document of a live session: one Y.Doc whose "files" map holds
 * an entry per file (Y.Map with name, lang, order and a Y.Text). Used by the
 * browser (CollabSession), by the server (creating sessions, compaction) and
 * by the tests, so it only depends on yjs.
 */
import * as Y from "yjs";
import { COLLAB_LIMITS, cleanFileName, cleanLanguage, isCollabFileId, normalizeNewlines, type CollabFileMeta, type CollabInitialFile } from "./protocol";

export const FILES_KEY = "files";

type FileEntry = Y.Map<unknown>;

export type CollabDocFile = { id: string; name: string; lang: string; order: number; text: Y.Text };
export type CollabFileContent = { id: string; name: string; lang: string; order: number; code: string };

export function filesOf(doc: Y.Doc): Y.Map<FileEntry> {
    return doc.getMap<FileEntry>(FILES_KEY);
}

/** A file entry of the map, or null for anything malformed (another client's bug must not crash us). */
export function readFileEntry(id: string, entry: unknown): CollabDocFile | null {
    if (!isCollabFileId(id) || !(entry instanceof Y.Map)) return null;
    const text = entry.get("text");
    const name = entry.get("name");
    const lang = entry.get("lang");
    const order = entry.get("order");
    if (!(text instanceof Y.Text) || typeof name !== "string" || typeof lang !== "string") return null;
    return { id, name, lang, order: typeof order === "number" && Number.isFinite(order) ? order : 0, text };
}

/** The files in tab order (order, then id for ties). */
export function listDocFiles(doc: Y.Doc): CollabDocFile[] {
    const files: CollabDocFile[] = [];
    filesOf(doc).forEach((entry, id) => {
        const file = readFileEntry(id, entry);
        if (file) files.push(file);
    });
    return files.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function readDocFiles(doc: Y.Doc): CollabFileContent[] {
    return listDocFiles(doc).map(({ id, name, lang, order, text }) => ({ id, name, lang, order, code: text.toString() }));
}

export function docFileMeta(doc: Y.Doc): CollabFileMeta[] {
    return listDocFiles(doc).map(({ id, name, lang, text }) => ({ id, name, lang, chars: text.length }));
}

export function docTotalChars(doc: Y.Doc) {
    return listDocFiles(doc).reduce((total, file) => total + file.text.length, 0);
}

/** Adds a file; call inside a transaction. The entry is integrated before its text is filled. */
export function insertDocFile(doc: Y.Doc, file: { id: string; name: string; lang: string; code: string; order: number }) {
    const entry = new Y.Map<unknown>();
    filesOf(doc).set(file.id, entry);
    entry.set("name", file.name);
    entry.set("lang", file.lang);
    entry.set("order", file.order);
    const text = new Y.Text();
    entry.set("text", text);
    if (file.code) text.insert(0, file.code);
}

/** A new session's document (built by the server, so every browser starts from the same Yjs items). */
export function createSessionDoc(files: readonly CollabInitialFile[]): Y.Doc {
    const doc = new Y.Doc();
    doc.transact(() => {
        files.forEach((file, order) => insertDocFile(doc, { ...file, order }));
    });
    return doc;
}

/** True when the bytes parse as a Yjs (v1) update. */
export function isValidYjsUpdate(bytes: Uint8Array): boolean {
    if (bytes.length < 2) return false;
    try {
        Y.decodeUpdate(bytes);
        return true;
    } catch {
        return false;
    }
}

export type CompactionResult = { state: Uint8Array; files: CollabFileMeta[]; totalChars: number; skipped: number };

/**
 * Folds updates into a snapshot: the state of a fresh document after applying
 * the previous snapshot and the updates (deleted text is garbage-collected).
 * Updates that fail to apply are skipped and counted.
 */
export function compactUpdates(base: Uint8Array | null, updates: readonly Uint8Array[]): CompactionResult {
    const doc = new Y.Doc();
    try {
        if (base?.length) Y.applyUpdate(doc, base);
        let skipped = 0;
        for (const update of updates) {
            try {
                Y.applyUpdate(doc, update);
            } catch {
                skipped += 1;
            }
        }
        const files = docFileMeta(doc);
        return { state: Y.encodeStateAsUpdate(doc), files, totalChars: files.reduce((total, file) => total + file.chars, 0), skipped };
    } finally {
        doc.destroy();
    }
}

/** The files of an encoded state (final copies when a session ends). */
export function filesFromState(state: Uint8Array | null, updates: readonly Uint8Array[] = []): CollabFileContent[] {
    const doc = new Y.Doc();
    try {
        if (state?.length) Y.applyUpdate(doc, state);
        for (const update of updates) {
            try {
                Y.applyUpdate(doc, update);
            } catch {
                // A malformed update is left out of the copy.
            }
        }
        return readDocFiles(doc);
    } finally {
        doc.destroy();
    }
}

// ---------------------------------------------------------------------------
// Text changes
// ---------------------------------------------------------------------------

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/** The smallest single replacement turning `before` into `after` (never splits a surrogate pair). */
export function textChange(before: string, after: string): { index: number; remove: number; insert: string } | null {
    if (before === after) return null;
    let start = 0;
    const shortest = Math.min(before.length, after.length);
    while (start < shortest && before.charCodeAt(start) === after.charCodeAt(start)) start += 1;
    let endBefore = before.length;
    let endAfter = after.length;
    while (endBefore > start && endAfter > start && before.charCodeAt(endBefore - 1) === after.charCodeAt(endAfter - 1)) {
        endBefore -= 1;
        endAfter -= 1;
    }
    if (start > 0 && isHighSurrogate(before.charCodeAt(start - 1))) start -= 1;
    if (endBefore < before.length && isLowSurrogate(before.charCodeAt(endBefore))) {
        endBefore += 1;
        endAfter += 1;
    }
    return { index: start, remove: endBefore - start, insert: after.slice(start, endAfter) };
}

// ---------------------------------------------------------------------------
// Editor tabs ↔ document (the editor page changes files through its tab list)
// ---------------------------------------------------------------------------

export type TabLike = { id: string; name: string; lang: string; code: string };

export type TabOp =
    | { type: "add"; id: string; name: string; lang: string; code: string }
    | { type: "remove"; id: string }
    | { type: "rename"; id: string; name: string; lang: string }
    | { type: "order"; ids: string[] };

/**
 * What changed between the tab list the editor started from (`base`) and the
 * one it wants (`next`). Only the intended change is described, so applying
 * it to a document that others changed meanwhile keeps their work: a stale
 * list never removes a file someone else added, and code edits of existing
 * files are ignored (they reach the document through the Monaco binding).
 */
export function diffTabs(base: readonly TabLike[], next: readonly TabLike[]): TabOp[] {
    const before = new Map(base.map((tab) => [tab.id, tab]));
    const nextIds = new Set(next.map((tab) => tab.id));
    const ops: TabOp[] = [];
    for (const tab of base) if (!nextIds.has(tab.id)) ops.push({ type: "remove", id: tab.id });
    for (const tab of next) {
        const previous = before.get(tab.id);
        if (!previous) ops.push({ type: "add", id: tab.id, name: tab.name, lang: tab.lang, code: tab.code });
        else if (previous.name !== tab.name || previous.lang !== tab.lang) ops.push({ type: "rename", id: tab.id, name: tab.name, lang: tab.lang });
    }
    const keptBefore = base.filter((tab) => nextIds.has(tab.id)).map((tab) => tab.id);
    const keptAfter = next.filter((tab) => before.has(tab.id)).map((tab) => tab.id);
    const reordered = keptBefore.some((id, index) => keptAfter[index] !== id);
    const lastKept = next.reduce((last, tab, index) => (before.has(tab.id) ? index : last), -1);
    const insertedBetween = next.some((tab, index) => !before.has(tab.id) && index < lastKept);
    if (reordered || insertedBetween) ops.push({ type: "order", ids: next.map((tab) => tab.id) });
    return ops;
}

export type TabOpsResult = { applied: number; rejected: "too_many_files" | "file_too_large" | "content_too_large" | "invalid_file" | "last_file" | null };

/**
 * Applies tab operations to the document in one transaction. Limits are the
 * session's: at most `maxFiles` files (the owner's plan: 20, 40 or 100),
 * 500 000 characters per file, 1 000 000 in all; the last file can't be removed.
 */
export function applyTabOps(doc: Y.Doc, ops: readonly TabOp[], origin: unknown, maxFiles: number = COLLAB_LIMITS.legacyFiles): TabOpsResult {
    let applied = 0;
    let rejected: TabOpsResult["rejected"] = null;
    doc.transact(() => {
        const map = filesOf(doc);
        let files = listDocFiles(doc);
        let total = files.reduce((sum, file) => sum + file.text.length, 0);
        for (const op of ops) {
            if (op.type === "remove") {
                if (!map.has(op.id)) continue;
                if (files.length <= 1) {
                    rejected ??= "last_file";
                    continue;
                }
                const removed = files.find((file) => file.id === op.id);
                map.delete(op.id);
                total -= removed?.text.length ?? 0;
                files = files.filter((file) => file.id !== op.id);
                applied += 1;
            } else if (op.type === "add") {
                const name = cleanFileName(op.name);
                const code = normalizeNewlines(op.code);
                if (!isCollabFileId(op.id) || !name) {
                    rejected ??= "invalid_file";
                    continue;
                }
                if (map.has(op.id)) continue;
                if (files.length >= Math.min(maxFiles, COLLAB_LIMITS.maxFiles)) {
                    rejected ??= "too_many_files";
                    continue;
                }
                if (code.length > COLLAB_LIMITS.maxFileChars) {
                    rejected ??= "file_too_large";
                    continue;
                }
                if (total + code.length > COLLAB_LIMITS.maxTotalChars) {
                    rejected ??= "content_too_large";
                    continue;
                }
                const order = files.reduce((max, file) => Math.max(max, file.order), -1) + 1;
                insertDocFile(doc, { id: op.id, name, lang: cleanLanguage(op.lang), code, order });
                total += code.length;
                files = listDocFiles(doc);
                applied += 1;
            } else if (op.type === "rename") {
                const entry = map.get(op.id);
                const name = cleanFileName(op.name);
                if (!(entry instanceof Y.Map)) continue;
                if (!name) {
                    rejected ??= "invalid_file";
                    continue;
                }
                const lang = cleanLanguage(op.lang);
                if (entry.get("name") !== name) entry.set("name", name);
                if (entry.get("lang") !== lang) entry.set("lang", lang);
                applied += 1;
            } else {
                const known = op.ids.filter((id) => map.has(id));
                const rest = listDocFiles(doc).filter((file) => !known.includes(file.id)).map((file) => file.id);
                [...known, ...rest].forEach((id, index) => {
                    const entry = map.get(id);
                    if (entry instanceof Y.Map && entry.get("order") !== index) entry.set("order", index);
                });
                files = listDocFiles(doc);
                applied += 1;
            }
        }
    }, origin);
    return { applied, rejected };
}
