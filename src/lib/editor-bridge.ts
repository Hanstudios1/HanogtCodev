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
 */
import { ensureFileExtension, fileExtensionFor, getLanguage, languageFromFileName, normalizeLanguageId } from "@/lib/runtimes/languages";

export const EDITOR_IMPORT_PREFIX = "hanogt:editor-import:";
export const EDITOR_IMPORT_PARAM = "import";
export const EDITOR_IMPORT_MAX_BYTES = 500 * 1024;
export const EDITOR_IMPORT_MAX_AGE_MS = 10 * 60 * 1000;
/** Ids only name a sessionStorage key; short ids from older callers ("lx2k9a-3f9x1z") are fine. */
const ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;
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

function byteLength(text: string) {
    return new TextEncoder().encode(text).length;
}

/** Makes a safe tab name: no path, no control characters, ≤ 120 characters, with an extension. */
function cleanName(raw: unknown, language: string): string {
    const fallback = getLanguage(language)?.defaultFileName ?? "untitled.txt";
    if (typeof raw !== "string") return fallback;
    let base = raw.replace(/[\u0000-\u001f\u007f]/g, "").split(/[\\/]/).pop()?.replace(/\s+/g, " ").trim() ?? "";
    if (!base || base === "." || base === "..") return fallback;
    // "answer.python" or "snippet.c++" (a language name instead of an extension) becomes "answer.py".
    const dot = base.lastIndexOf(".");
    if (dot > 0 && !languageFromFileName(base) && normalizeLanguageId(base.slice(dot + 1)) === language) {
        base = `${base.slice(0, dot)}.${fileExtensionFor(language)}`;
    }
    let name = ensureFileExtension(base, language);
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
    const store = storage();
    if (!store) return { ok: false, error: "storage_unavailable" };
    purgeStaleEditorImports();
    const id = randomId();
    try {
        store.setItem(`${EDITOR_IMPORT_PREFIX}${id}`, JSON.stringify({ v: 1, createdAt: Date.now(), ...validated.file }));
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

/** Reads and deletes an import entry (called by the editor). */
export function consumeEditorImport(id: string | null | undefined, now = Date.now()): EditorImportResult {
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
    return validateEditorImport(entry);
}
