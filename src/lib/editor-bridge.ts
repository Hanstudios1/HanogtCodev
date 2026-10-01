/**
 * Opens code in the editor from anywhere in the app (Hanogt AI, Groups…).
 *
 * The caller stores `{ name, language, code }` in sessionStorage under
 * `hanogt:editor-import:<random id>` and navigates to `/editor?import=<id>`.
 * The editor consumes (reads and deletes) the entry and opens it as a new,
 * unsaved tab next to any recovered tabs. Nothing is sent to a server.
 *
 * Usage from a client component:
 *
 *     const result = openInEditor({ name: "main.py", language: "python", code }, { navigate: router.push });
 *     if (!result.ok) showError(result.error); // "too_large", "unsupported_language"…
 *
 * Limits: code ≤ 500 KB (UTF-8), a language the editor knows (id, alias,
 * extension or a file name with a known extension), entries written by
 * prepareEditorImport expire after 10 minutes. Entries written by hand (just
 * `{ name, language, code }` without `createdAt`) are accepted too.
 *
 * Several files at once (a Hanogt Media project) go through openFilesInEditor:
 *
 *     openFilesInEditor({ files: [{ name: "index.html", language: "html", code }, …], title: "My site" }, { navigate: router.push });
 *
 * A bundle holds ≤ 50 files of ≤ 500 KB each (1.5 million characters in all).
 * Unlike a single file, its files may be empty; an unknown language opens as
 * plain text, and files that do not fit are skipped (counted in `skipped`).
 * The editor reads every kind of entry with consumeEditorImportBundle.
 */
import { ensureFileExtension, fileExtensionFor, getLanguage, languageFromFileName, normalizeLanguageId } from "@/lib/runtimes/languages";

export const EDITOR_IMPORT_PREFIX = "hanogt:editor-import:";
export const EDITOR_IMPORT_PARAM = "import";
export const EDITOR_IMPORT_MAX_BYTES = 500 * 1024;
export const EDITOR_IMPORT_MAX_AGE_MS = 10 * 60 * 1000;
export const EDITOR_IMPORT_MAX_FILES = 50;
/** All files of one bundle together; sessionStorage holds about 5 MB per site. */
export const EDITOR_IMPORT_MAX_TOTAL_CHARS = 1_500_000;
/** Ids only name a sessionStorage key; short ids from older callers ("lx2k9a-3f9x1z") are fine. */
const ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;
const MEDIA_POST_PATTERN = /^[A-Za-z0-9_-]{6,100}$/;
const MAX_NAME_LENGTH = 120;

export interface EditorImportFile {
    /** File name shown on the tab, e.g. "main.py". Optional: a default name is used. */
    name?: string;
    /** Registry id ("python"), alias ("py", "c++") or display name. */
    language: string;
    code: string;
}

export interface ValidatedEditorImport {
    name: string;
    language: string;
    code: string;
}

export type EditorImportError =
    | "invalid_payload" | "empty_code" | "too_large" | "unsupported_language"
    | "storage_unavailable" | "not_found" | "expired";

export type EditorImportResult = { ok: true; file: ValidatedEditorImport } | { ok: false; error: EditorImportError };

/** Several files opened together, e.g. a Hanogt Media project. */
export interface EditorImportBundle {
    files: readonly EditorImportFile[];
    /** A name for the files, such as the Media post's title. */
    title?: string;
    /** The Media post the files come from, when the viewer owns it (the editor offers "Update post"). */
    mediaPostId?: string;
}

export interface ValidatedEditorBundle {
    files: ValidatedEditorImport[];
    title: string | null;
    mediaPostId: string | null;
    /** Files left out because they were too large, unreadable or over the file limit. */
    skipped: number;
}

export type EditorBundleResult = { ok: true; bundle: ValidatedEditorBundle } | { ok: false; error: EditorImportError };

function byteLength(text: string) {
    return new TextEncoder().encode(text).length;
}

/** "main.py" → "main-2.py" when the name is already used in the bundle (ignoring case). */
function uniqueName(name: string, taken: Set<string>) {
    let candidate = name;
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : "";
    for (let index = 2; taken.has(candidate.toLowerCase()) && index < 1000; index += 1) {
        candidate = `${stem.slice(0, MAX_NAME_LENGTH - extension.length - String(index).length - 1)}-${index}${extension}`;
    }
    taken.add(candidate.toLowerCase());
    return candidate;
}

/**
 * Makes a safe tab name: no path, no control characters, ≤ 120 characters,
 * with an extension. Project files in a bundle keep their own names
 * (".env", "LICENSE"): their language travels with them.
 */
function cleanName(raw: unknown, language: string, addExtension = true): string {
    const fallback = getLanguage(language)?.defaultFileName ?? "untitled.txt";
    if (typeof raw !== "string") return fallback;
    let base = raw.replace(/[\u0000-\u001f\u007f]/g, "").split(/[\\/]/).pop()?.replace(/\s+/g, " ").trim() ?? "";
    if (!base || base === "." || base === "..") return fallback;
    // "answer.python" or "snippet.c++" (a language name instead of an extension) becomes "answer.py".
    const dot = base.lastIndexOf(".");
    if (dot > 0 && !languageFromFileName(base) && normalizeLanguageId(base.slice(dot + 1)) === language) {
        base = `${base.slice(0, dot)}.${fileExtensionFor(language)}`;
    }
    let name = addExtension ? ensureFileExtension(base, language) : base;
    if (name.length > MAX_NAME_LENGTH) {
        const extensionDot = name.lastIndexOf(".");
        const extension = extensionDot > 0 && name.length - extensionDot <= 16 ? name.slice(extensionDot) : "";
        name = `${name.slice(0, MAX_NAME_LENGTH - extension.length)}${extension}`;
    }
    return name;
}

/** Validates a payload from another feature or from sessionStorage. */
export function validateEditorImport(input: unknown): EditorImportResult {
    if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "invalid_payload" };
    const value = input as Record<string, unknown>;
    if (typeof value.code !== "string") return { ok: false, error: "invalid_payload" };
    if (value.name !== undefined && typeof value.name !== "string") return { ok: false, error: "invalid_payload" };
    if (value.language !== undefined && typeof value.language !== "string") return { ok: false, error: "invalid_payload" };
    if (!value.code.trim()) return { ok: false, error: "empty_code" };
    if (value.code.length > EDITOR_IMPORT_MAX_BYTES || byteLength(value.code) > EDITOR_IMPORT_MAX_BYTES) return { ok: false, error: "too_large" };
    const language = normalizeLanguageId(value.language as string | undefined) ?? languageFromFileName(value.name as string | undefined)?.id ?? null;
    if (!language) return { ok: false, error: "unsupported_language" };
    return { ok: true, file: { name: cleanName(value.name, language), language, code: value.code } };
}

function isBundleEntry(input: unknown): input is { files: unknown } {
    return Boolean(input) && typeof input === "object" && !Array.isArray(input) && "files" in (input as object);
}

/**
 * Validates a bundle (`{ files, title?, mediaPostId? }`) or a single-file
 * payload, which becomes a bundle of one file with the single-file rules.
 */
export function validateEditorImportBundle(input: unknown): EditorBundleResult {
    if (!isBundleEntry(input)) {
        const single = validateEditorImport(input);
        return single.ok ? { ok: true, bundle: { files: [single.file], title: null, mediaPostId: null, skipped: 0 } } : single;
    }
    const value = input as { files: unknown; title?: unknown; mediaPostId?: unknown };
    if (!Array.isArray(value.files)) return { ok: false, error: "invalid_payload" };
    if (!value.files.length) return { ok: false, error: "empty_code" };
    const files: ValidatedEditorImport[] = [];
    const taken = new Set<string>();
    let skipped = 0;
    let tooLarge = false;
    let total = 0;
    for (const item of value.files) {
        const file = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : null;
        if (!file || typeof file.code !== "string" || files.length >= EDITOR_IMPORT_MAX_FILES) {
            skipped += 1;
            continue;
        }
        const code = file.code;
        if (code.length > EDITOR_IMPORT_MAX_BYTES || byteLength(code) > EDITOR_IMPORT_MAX_BYTES || total + code.length > EDITOR_IMPORT_MAX_TOTAL_CHARS) {
            skipped += 1;
            tooLarge = true;
            continue;
        }
        const rawName = typeof file.name === "string" ? file.name : undefined;
        const language = normalizeLanguageId(typeof file.language === "string" ? file.language : undefined) ?? languageFromFileName(rawName)?.id ?? "plaintext";
        total += code.length;
        files.push({ name: uniqueName(cleanName(rawName, language, false), taken), language, code });
    }
    if (!files.length) return { ok: false, error: tooLarge ? "too_large" : "invalid_payload" };
    const title = typeof value.title === "string" ? value.title.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH) : "";
    const mediaPostId = typeof value.mediaPostId === "string" && MEDIA_POST_PATTERN.test(value.mediaPostId) ? value.mediaPostId : null;
    return { ok: true, bundle: { files, title: title || null, mediaPostId, skipped } };
}

function storage(): Storage | null {
    try {
        return typeof window === "undefined" ? null : window.sessionStorage;
    } catch {
        return null;
    }
}

function randomId() {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Removes expired or unreadable import entries (they are normally consumed at once). */
export function purgeStaleEditorImports(now = Date.now()) {
    const store = storage();
    if (!store) return;
    try {
        const keys: string[] = [];
        for (let index = 0; index < store.length; index += 1) {
            const key = store.key(index);
            if (key?.startsWith(EDITOR_IMPORT_PREFIX)) keys.push(key);
        }
        for (const key of keys) {
            try {
                const entry = JSON.parse(store.getItem(key) ?? "null") as { createdAt?: unknown } | null;
                const createdAt = typeof entry?.createdAt === "number" ? entry.createdAt : 0;
                if (now - createdAt > EDITOR_IMPORT_MAX_AGE_MS) store.removeItem(key);
            } catch {
                store.removeItem(key);
            }
        }
    } catch {
        // Storage became unavailable; nothing to clean.
    }
}

/**
 * Stores the file for the editor and returns the URL that opens it, without navigating.
 * Useful for links (`<Link href={result.href}>`) or opening the editor later.
 */
export function prepareEditorImport(file: EditorImportFile): { ok: true; id: string; href: string } | { ok: false; error: EditorImportError } {
    const validated = validateEditorImport(file);
    if (!validated.ok) return validated;
    return storeEntry({ v: 1, ...validated.file });
}

/** Like prepareEditorImport for several files (see {@link EditorImportBundle}). */
export function prepareEditorFilesImport(bundle: EditorImportBundle): { ok: true; id: string; href: string; skipped: number } | { ok: false; error: EditorImportError } {
    const validated = validateEditorImportBundle({ files: bundle.files, title: bundle.title, mediaPostId: bundle.mediaPostId });
    if (!validated.ok) return validated;
    const { files, title, mediaPostId, skipped } = validated.bundle;
    const stored = storeEntry({ v: 2, files, ...(title ? { title } : {}), ...(mediaPostId ? { mediaPostId } : {}) });
    return stored.ok ? { ...stored, skipped } : stored;
}

function storeEntry(entry: Record<string, unknown>): { ok: true; id: string; href: string } | { ok: false; error: EditorImportError } {
    const store = storage();
    if (!store) return { ok: false, error: "storage_unavailable" };
    purgeStaleEditorImports();
    const id = randomId();
    try {
        store.setItem(`${EDITOR_IMPORT_PREFIX}${id}`, JSON.stringify({ ...entry, createdAt: Date.now() }));
    } catch {
        // Quota exceeded or storage blocked.
        return { ok: false, error: "storage_unavailable" };
    }
    return { ok: true, id, href: `/editor?${EDITOR_IMPORT_PARAM}=${id}` };
}

/**
 * Opens the code in the editor as a new unsaved tab. Pass `navigate` (for
 * example `router.push`) for client-side navigation; otherwise the browser
 * navigates to the editor.
 */
export function openInEditor(file: EditorImportFile, options: { navigate?: (href: string) => void } = {}) {
    const prepared = prepareEditorImport(file);
    if (!prepared.ok) return prepared;
    if (options.navigate) options.navigate(prepared.href);
    else window.location.assign(prepared.href);
    return prepared;
}

/**
 * Opens several files in the editor. In an empty editor they become a new,
 * unsaved workspace named after `title`; otherwise they open as new tabs.
 */
export function openFilesInEditor(bundle: EditorImportBundle, options: { navigate?: (href: string) => void } = {}) {
    const prepared = prepareEditorFilesImport(bundle);
    if (!prepared.ok) return prepared;
    if (options.navigate) options.navigate(prepared.href);
    else window.location.assign(prepared.href);
    return prepared;
}

/** Reads and deletes a stored entry; checks its age when it has a timestamp. */
function takeEntry(id: string | null | undefined, now: number): { ok: true; entry: unknown } | { ok: false; error: EditorImportError } {
    if (!id || !ID_PATTERN.test(id)) return { ok: false, error: "not_found" };
    const store = storage();
    if (!store) return { ok: false, error: "storage_unavailable" };
    const key = `${EDITOR_IMPORT_PREFIX}${id}`;
    let raw: string | null;
    try {
        raw = store.getItem(key);
        store.removeItem(key);
    } catch {
        return { ok: false, error: "storage_unavailable" };
    }
    if (!raw) return { ok: false, error: "not_found" };
    let entry: unknown;
    try {
        entry = JSON.parse(raw);
    } catch {
        return { ok: false, error: "invalid_payload" };
    }
    const createdAt = entry && typeof entry === "object" ? (entry as { createdAt?: unknown }).createdAt : undefined;
    if (createdAt !== undefined && (typeof createdAt !== "number" || now - createdAt > EDITOR_IMPORT_MAX_AGE_MS || createdAt - now > 60_000)) return { ok: false, error: "expired" };
    return { ok: true, entry };
}

/**
 * Reads and deletes an import entry (single-file callers). For a bundle it
 * returns the first file; the editor itself uses consumeEditorImportBundle.
 */
export function consumeEditorImport(id: string | null | undefined, now = Date.now()): EditorImportResult {
    const taken = takeEntry(id, now);
    if (!taken.ok) return taken;
    if (!isBundleEntry(taken.entry)) return validateEditorImport(taken.entry);
    const bundle = validateEditorImportBundle(taken.entry);
    return bundle.ok ? { ok: true, file: bundle.bundle.files[0] } : bundle;
}

/** Reads and deletes any import entry, single file or bundle (called by the editor). */
export function consumeEditorImportBundle(id: string | null | undefined, now = Date.now()): EditorBundleResult {
    const taken = takeEntry(id, now);
    return taken.ok ? validateEditorImportBundle(taken.entry) : taken;
}
