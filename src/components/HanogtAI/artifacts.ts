import { getLanguage, languageDisplayName, normalizeLanguageId } from "@/lib/runtimes/languages";

/** Long code (or a whole web page) opens in the side panel instead of filling the conversation. */
export interface ChatArtifact {
    /** Stable for the same code, so reopening keeps the panel state. */
    id: string;
    /** Fence language as written by the answer ("python", "html"…). */
    language: string;
    code: string;
}

export const ARTIFACT_MIN_LINES = 24;

export function isWebPage(language: string, code: string) {
    return /^(?:html?|xhtml)$/i.test(language) || (!language && /^\s*<!doctype html|^\s*<html[\s>]/i.test(code));
}

export function isArtifactCode(language: string, code: string) {
    return code.split("\n").length >= ARTIFACT_MIN_LINES || (isWebPage(language, code) && /<(?:!doctype|html|body|canvas|script)\b/i.test(code));
}

export function artifactId(language: string, code: string) {
    let hash = 0;
    for (let index = 0; index < code.length; index += 1) hash = (hash * 31 + code.charCodeAt(index)) >>> 0;
    return `${language}-${code.length}-${hash.toString(36)}`;
}

/** Registry id for the editor, or null when the fence language isn't one the editor knows. */
export function artifactEditorLanguage(language: string) {
    return normalizeLanguageId(language) ?? null;
}

export function artifactLanguageName(language: string) {
    const id = normalizeLanguageId(language);
    return id ? languageDisplayName(id) : language ? language.toUpperCase() : "Text";
}

/** The page title of an HTML artifact, if it has one. */
export function webPageTitle(code: string) {
    const match = /<title>([^<]{1,80})<\/title>/i.exec(code);
    return match ? match[1].trim() : null;
}

/** A file name for the editor, e.g. "index.html" or "main.py". */
export function artifactFileName(language: string) {
    const id = normalizeLanguageId(language);
    return (id && getLanguage(id)?.defaultFileName) || "hanogt-ai.txt";
}
