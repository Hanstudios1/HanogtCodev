/**
 * File helpers for the editor: unique tab names, safe download names, Hanogt
 * snippet files, uploads (text files and ZIP archives) and ZIP export.
 * The pure helpers are tested in scripts/tests/editor-files.test.mjs.
 */
import { ensureFileExtension, getLanguage, languageFromFileName, normalizeLanguageId } from "@/lib/runtimes/languages";

export const MAX_FILE_BYTES = 500 * 1024;
export const MAX_TABS = 50;
export const MAX_NAME_LENGTH = 120;
export const SNIPPET_KIND = "hanogt-snippet";
const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;

export interface LoadedFile {
    name: string;
    language: string;
    code: string;
}

export type UploadIssueReason = "too_large" | "binary" | "unreadable" | "limit" | "zip_failed";
export type UploadIssue = { name: string; reason: UploadIssueReason };

function clip(name: string) {
    if (name.length <= MAX_NAME_LENGTH) return name;
    const dot = name.lastIndexOf(".");
    const extension = dot > 0 && name.length - dot <= 16 ? name.slice(dot) : "";
    return `${name.slice(0, MAX_NAME_LENGTH - extension.length)}${extension}`;
}

/** A tab name without paths or control characters, at most 120 characters. */
export function sanitizeFileName(name: string, fallback = "untitled.txt"): string {
    const base = name.replace(/[\u0000-\u001f\u007f]/g, "").split(/[\\/]/).pop()?.replace(/\s+/g, " ").trim() ?? "";
    if (!base || base === "." || base === "..") return fallback;
    return clip(base);
}

/** "main.py" → "main-2.py" when the name is taken (case-insensitive). */
export function uniqueFileName(name: string, existing: readonly string[]): string {
    const taken = new Set(existing.map((item) => item.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : "";
    for (let index = 2; index < 1000; index += 1) {
        const candidate = clip(`${stem}-${index}${extension}`);
        if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return clip(`${stem}-${Date.now().toString(36)}${extension}`);
}

/** A file name that is valid on every operating system, with the language's extension. */
export function downloadName(name: string, language: string): string {
    const safe = sanitizeFileName(name, getLanguage(language)?.defaultFileName ?? "untitled.txt").replace(/[<>:"|?*]/g, "_");
    return ensureFileExtension(safe, language);
}

export function buildSnippetFile(file: { name: string; lang: string; code: string }): string {
    return `${JSON.stringify({ kind: SNIPPET_KIND, version: 1, app: "Hanogt Codev", name: file.name, language: file.lang, code: file.code, createdAt: new Date().toISOString() }, null, 2)}\n`;
}

/** Reads a .hanogt.json snippet; null when the text is something else. */
export function parseSnippetFile(text: string): LoadedFile | null {
    if (text.length > MAX_FILE_BYTES * 2) return null;
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        return null;
    }
    if (!data || typeof data !== "object") return null;
    const record = data as Record<string, unknown>;
    if (record.kind !== SNIPPET_KIND || typeof record.code !== "string") return null;
    const language = normalizeLanguageId(typeof record.language === "string" ? record.language : "") ?? languageFromFileName(typeof record.name === "string" ? record.name : "")?.id ?? "plaintext";
    const name = ensureFileExtension(sanitizeFileName(typeof record.name === "string" ? record.name : "", getLanguage(language)?.defaultFileName ?? "snippet.txt"), language);
    return { name, language, code: record.code };
}

/** Decodes UTF-8 text; null for binary data (NUL bytes near the start). */
export function decodeTextFile(bytes: Uint8Array): string | null {
    const sample = bytes.subarray(0, 8000);
    if (sample.includes(0)) return null;
    const text = new TextDecoder("utf-8").decode(bytes);
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function toLoadedFile(name: string, text: string): LoadedFile {
    const snippet = name.toLowerCase().endsWith(".json") ? parseSnippetFile(text) : null;
    if (snippet) return snippet;
    const cleanName = sanitizeFileName(name);
    return { name: cleanName, language: languageFromFileName(cleanName)?.id ?? "plaintext", code: text.replace(/\r\n/g, "\n") };
}

type ZipEntry = { name: string; dir: boolean; async: (type: "uint8array") => Promise<Uint8Array>; _data?: { uncompressedSize?: number } };

/** Reads text files and ZIP archives chosen or dropped by the user. */
export async function readUploadedFiles(files: File[], remainingSlots: number): Promise<{ files: LoadedFile[]; issues: UploadIssue[] }> {
    const loaded: LoadedFile[] = [];
    const issues: UploadIssue[] = [];
    let slots = Math.max(0, remainingSlots);
    for (const file of files) {
        if (slots <= 0) {
            issues.push({ name: file.name, reason: "limit" });
            continue;
        }
        if (/\.zip$/i.test(file.name)) {
            if (file.size > MAX_ARCHIVE_BYTES) {
                issues.push({ name: file.name, reason: "too_large" });
                continue;
            }
            try {
                const JSZip = (await import("jszip")).default;
                const archive = await JSZip.loadAsync(file);
                let total = 0;
                const entries = Object.values(archive.files as Record<string, ZipEntry>)
                    .filter((entry) => !entry.dir && !entry.name.startsWith("__MACOSX/") && !/(^|\/)\.DS_Store$/.test(entry.name))
                    .sort((a, b) => a.name.localeCompare(b.name));
                for (const entry of entries) {
                    if (slots <= 0) {
                        issues.push({ name: entry.name, reason: "limit" });
                        continue;
                    }
                    const size = entry._data?.uncompressedSize;
                    if (typeof size === "number" && size > MAX_FILE_BYTES) {
                        issues.push({ name: entry.name, reason: "too_large" });
                        continue;
                    }
                    const bytes = await entry.async("uint8array");
                    total += bytes.length;
                    if (bytes.length > MAX_FILE_BYTES || total > MAX_ARCHIVE_BYTES) {
                        issues.push({ name: entry.name, reason: "too_large" });
                        continue;
                    }
                    const text = decodeTextFile(bytes);
                    if (text === null) {
                        issues.push({ name: entry.name, reason: "binary" });
                        continue;
                    }
                    loaded.push(toLoadedFile(entry.name, text));
                    slots -= 1;
                }
            } catch {
                issues.push({ name: file.name, reason: "zip_failed" });
            }
            continue;
        }
        if (file.size > MAX_FILE_BYTES) {
            issues.push({ name: file.name, reason: "too_large" });
            continue;
        }
        try {
            const text = decodeTextFile(new Uint8Array(await file.arrayBuffer()));
            if (text === null) {
                issues.push({ name: file.name, reason: "binary" });
                continue;
            }
            loaded.push(toLoadedFile(file.name, text));
            slots -= 1;
        } catch {
            issues.push({ name: file.name, reason: "unreadable" });
        }
    }
    return { files: loaded, issues };
}

/** Starts a browser download of the blob. */
export function triggerDownload(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A ZIP of the open files with their real names (index.html stays index.html). */
export async function buildProjectZip(files: Array<{ name: string; lang: string; code: string }>): Promise<Blob> {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const used: string[] = [];
    for (const file of files) {
        const name = uniqueFileName(downloadName(file.name, file.lang), used);
        used.push(name);
        zip.file(name, file.code);
    }
    return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
