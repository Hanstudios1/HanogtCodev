/**
 * Hanogt Media publishing rules shared by the editor's publish dialog
 * (PublishDialog.tsx) and /api/media ("publish", "publishFiles", "update"), so
 * the in-browser pre-check and the server agree on limits, file names,
 * languages, tags and the exact text the security guard scans.
 *
 * Pure and isomorphic (no React, no storage, no network). The browser-only
 * parts live in useMediaPublication.ts and media-api.ts. Tested in
 * scripts/tests/editor-media-publish.test.mjs.
 */
import { sanitizeFileName, uniqueFileName } from "@/components/Editor/editor-files";
import { ensureFileExtension, languageFromFileName, normalizeLanguageId } from "@/lib/runtimes/languages";
import type { CodeLanguage } from "@/lib/security/advisor";

export const MEDIA_LIMITS = {
    /** Files in one post. */
    files: 50,
    /** Characters per file. */
    fileChars: 500_000,
    /** Characters in the whole post. */
    totalChars: 1_000_000,
    /** UTF-8 bytes per file: a Firestore document holds at most 1 MiB. */
    fileBytes: 1_000_000,
    title: 100,
    description: 1200,
    tags: 6,
    tagLength: 24,
} as const;

export const MEDIA_LICENSES = ["all-rights-reserved", "MIT", "Apache-2.0", "GPL-3.0"] as const;
export type MediaLicense = (typeof MEDIA_LICENSES)[number];

export function normalizeMediaLicense(value: unknown): MediaLicense {
    return (MEDIA_LICENSES as readonly unknown[]).includes(value) ? value as MediaLicense : "all-rights-reserved";
}

/** One line of text: control characters become spaces, runs of white space collapse, ≤ 100 characters. */
export function cleanMediaTitle(value: unknown): string {
    if (typeof value !== "string") return "";
    return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MEDIA_LIMITS.title).trim();
}

/** Free text that keeps line breaks and tabs, without other control characters, ≤ 1200 characters. */
export function cleanMediaDescription(value: unknown): string {
    if (typeof value !== "string") return "";
    return value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, MEDIA_LIMITS.description).trim();
}

/** Latin, Arabic/Persian (،), CJK (、，) commas and semicolons separate tags typed as text. */
export function splitMediaTags(text: string): string[] {
    return text.split(/[,،、，;؛]/).map((tag) => tag.trim()).filter(Boolean);
}

/** "Web, #Araç, web" → ["web", "araç"]: lower case, no "#", spaces as "-", unique, ≤ 6 tags of ≤ 24 characters. */
export function cleanMediaTags(value: unknown): string[] {
    const list: unknown[] = typeof value === "string" ? splitMediaTags(value) : Array.isArray(value) ? value : [];
    const tags: string[] = [];
    for (const item of list) {
        if (tags.length >= MEDIA_LIMITS.tags) break;
        if (typeof item !== "string") continue;
        const tag = item
            .replace(/[\u0000-\u001f\u007f]/g, "")
            // "İ".toLowerCase() is "i" plus a combining dot.
            .replace(/İ/g, "i")
            .toLowerCase()
            .replace(/^[\s#]+/, "")
            .trim()
            .replace(/\s+/g, "-")
            .slice(0, MEDIA_LIMITS.tagLength)
            .replace(/-+$/, "");
        if (tag && !tags.includes(tag)) tags.push(tag);
    }
    return tags;
}

export interface MediaFile {
    name: string;
    /** A language registry id ("plaintext" when unknown). */
    lang: string;
    code: string;
}

export type MediaFilesError = "invalid_files" | "no_files" | "too_many_files" | "file_too_large" | "total_too_large";

export type MediaFilesResult =
    | { ok: true; files: MediaFile[]; totalChars: number }
    | { ok: false; error: MediaFilesError; name?: string };

/** True when the code fits in one Media file (characters and UTF-8 bytes). */
export function fitsMediaFile(code: string): boolean {
    if (code.length > MEDIA_LIMITS.fileChars) return false;
    // A UTF-16 unit is at most 3 UTF-8 bytes, so short files need no counting.
    return code.length * 3 <= MEDIA_LIMITS.fileBytes || new TextEncoder().encode(code).length <= MEDIA_LIMITS.fileBytes;
}

/**
 * Validates files sent for publishing: 1–50 files of ≤ 500 000 characters,
 * ≤ 1 000 000 characters in total. Names lose paths and control characters,
 * are ≤ 120 characters and unique ignoring case; languages become registry
 * ids (guessed from the file name when the id is unknown, else plaintext).
 */
export function normalizeMediaFiles(input: unknown): MediaFilesResult {
    if (!Array.isArray(input)) return { ok: false, error: "invalid_files" };
    if (!input.length) return { ok: false, error: "no_files" };
    if (input.length > MEDIA_LIMITS.files) return { ok: false, error: "too_many_files" };
    const files: MediaFile[] = [];
    let totalChars = 0;
    for (const [index, item] of input.entries()) {
        if (!item || typeof item !== "object" || Array.isArray(item)) return { ok: false, error: "invalid_files" };
        const { name, lang, code } = item as Record<string, unknown>;
        if (typeof code !== "string" || (name != null && typeof name !== "string") || (lang != null && typeof lang !== "string")) {
            return { ok: false, error: "invalid_files" };
        }
        const rawName = typeof name === "string" ? name : "";
        const language = normalizeLanguageId(typeof lang === "string" ? lang : null) ?? languageFromFileName(rawName)?.id ?? "plaintext";
        const fileName = uniqueFileName(sanitizeFileName(rawName, ensureFileExtension(`file-${index + 1}`, language)), files.map((file) => file.name));
        if (!fitsMediaFile(code)) return { ok: false, error: "file_too_large", name: fileName };
        totalChars += code.length;
        if (totalChars > MEDIA_LIMITS.totalChars) return { ok: false, error: "total_too_large" };
        files.push({ name: fileName, lang: language, code });
    }
    return { ok: true, files, totalChars };
}

/** The languages of a post: unique registry ids in file order, at most 12. */
export function mediaLanguages(files: ReadonlyArray<{ lang: string }>): string[] {
    return [...new Set(files.map((file) => file.lang).filter(Boolean))].slice(0, 12);
}

/** The text the server's guard scans: each file under a "// name" line (as the original "publish" action did). */
export function mediaScanText(files: ReadonlyArray<{ name?: string; code?: string }>): string {
    return files.map((file) => `// ${file.name || "file"}\n${file.code || ""}`).join("\n");
}

/** Maps a line of {@link mediaScanText} to its file and the line inside it (0 is the "// name" header). */
export function locateScanLine(files: ReadonlyArray<{ code?: string }>, line: number): { index: number; line: number } | null {
    if (!Number.isInteger(line) || line < 1) return null;
    let header = 1;
    for (let index = 0; index < files.length; index += 1) {
        const lines = (files[index].code || "").split("\n").length;
        if (line <= header + lines) return { index, line: line - header };
        header += lines + 1;
    }
    return null;
}

const ADVISOR_LANGUAGES: Readonly<Record<string, CodeLanguage>> = {
    python: "python", javascript: "javascript", typescript: "typescript", csharp: "csharp", cpp: "cpp", c: "c", java: "java",
    php: "php", go: "go", rust: "rust", kotlin: "kotlin", swift: "swift", ruby: "ruby", lua: "lua", sql: "sql", mysql: "sql",
    pgsql: "sql", html: "html", bash: "shell",
};

/** The Security Advisor's language for a registry id; undefined lets the advisor detect it. */
export function advisorLanguageFor(id: string): CodeLanguage | undefined {
    return ADVISOR_LANGUAGES[id];
}

// ------------------------------------------------------------------ remembered publications

/** A Media post published from an editor workspace. */
export interface MediaPublication {
    postId: string;
    title: string;
    /** ISO time of the last publish or update from this browser. */
    at: string;
}

export interface StoredMediaPublication extends MediaPublication {
    /** {@link ownerTag} of the account that published it. */
    owner: string;
    /** The workspace: "project:<id>" or "game:<project>:<script>". */
    key: string;
}

export const MEDIA_PUBLICATIONS_KEY = "hanogt_media_publications";
export const MAX_REMEMBERED_PUBLICATIONS = 100;

export function isMediaPostId(value: unknown): value is string {
    return typeof value === "string" && /^[A-Za-z0-9_-]{6,100}$/.test(value);
}

/** The Media page URL that opens the post. */
export function mediaPostPath(postId: string): string {
    return `/media?post=${encodeURIComponent(postId)}`;
}

/**
 * Short, stable tag of an e-mail address, so records in this browser are
 * scoped to an account without storing the address (cyrb53).
 */
export function ownerTag(email: string): string {
    const text = email.trim().toLowerCase();
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        h1 = Math.imul(h1 ^ code, 2654435761);
        h2 = Math.imul(h2 ^ code, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function parseMediaPublication(value: unknown): MediaPublication | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (!isMediaPostId(record.postId)) return null;
    return {
        postId: record.postId,
        title: cleanMediaTitle(record.title),
        at: typeof record.at === "string" && !Number.isNaN(Date.parse(record.at)) ? record.at : new Date(0).toISOString(),
    };
}

export function parseStoredPublications(raw: string | null): StoredMediaPublication[] {
    if (!raw) return [];
    let data: unknown;
    try {
        data = JSON.parse(raw);
    } catch {
        return [];
    }
    if (!Array.isArray(data)) return [];
    const list: StoredMediaPublication[] = [];
    for (const item of data) {
        const publication = parseMediaPublication(item);
        const { owner, key } = (item ?? {}) as { owner?: unknown; key?: unknown };
        if (publication && typeof owner === "string" && owner && typeof key === "string" && key && key.length <= 300) list.push({ ...publication, owner, key });
        if (list.length >= MAX_REMEMBERED_PUBLICATIONS) break;
    }
    return list;
}

export function findStoredPublication(list: readonly StoredMediaPublication[], owner: string, key: string): MediaPublication | null {
    const entry = list.find((item) => item.owner === owner && item.key === key);
    return entry ? { postId: entry.postId, title: entry.title, at: entry.at } : null;
}

/** Records (or, with `null`, forgets) the publication of a workspace. A post belongs to one workspace. */
export function withStoredPublication(list: readonly StoredMediaPublication[], owner: string, key: string, publication: MediaPublication | null): StoredMediaPublication[] {
    const rest = list.filter((item) => !(item.owner === owner && (item.key === key || item.postId === publication?.postId)));
    return publication ? [{ ...publication, owner, key }, ...rest].slice(0, MAX_REMEMBERED_PUBLICATIONS) : rest;
}

/** Forgets a post in every workspace (it was unpublished or no longer exists). */
export function withoutStoredPost(list: readonly StoredMediaPublication[], owner: string, postId: string): StoredMediaPublication[] {
    return list.filter((item) => !(item.owner === owner && item.postId === postId));
}
