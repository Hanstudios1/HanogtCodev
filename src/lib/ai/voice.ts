/**
 * Voice for Hanogt AI (the ai_voice feature, early access): dictation with
 * the browser's speech recognition and answers read aloud with its speech
 * synthesis. Nothing is sent to Hanogt's servers: the browser (or the speech
 * service it uses) does the work. Pure helpers, client-safe; the hooks are in
 * src/components/HanogtAI/voice.ts.
 */

/** The site's languages as speech tags (BCP 47); others fall back to the browser's own language. */
const SPEECH_LANGS: Record<string, string> = {
    TR: "tr-TR", EN: "en-US", DE: "de-DE", FR: "fr-FR", ES: "es-ES", PT: "pt-BR", IT: "it-IT", RU: "ru-RU", UK: "uk-UA",
    AR: "ar-SA", FA: "fa-IR", HE: "he-IL", UR: "ur-PK", AZ: "az-AZ", KZ: "kk-KZ", UZ: "uz-UZ", KA: "ka-GE",
    JP: "ja-JP", CN: "zh-CN", TW: "zh-TW", KR: "ko-KR", HI: "hi-IN", BN: "bn-IN", TA: "ta-IN", TH: "th-TH",
    ID: "id-ID", VI: "vi-VN", MS: "ms-MY", TL: "fil-PH", SW: "sw-KE", NL: "nl-NL", BE: "nl-BE", PL: "pl-PL",
    CS: "cs-CZ", SK: "sk-SK", RO: "ro-RO", HU: "hu-HU", BG: "bg-BG", SR: "sr-RS", HR: "hr-HR", SQ: "sq-AL", NO: "nb-NO",
    SV: "sv-SE", DA: "da-DK", FI: "fi-FI", EL: "el-GR", LT: "lt-LT",
};

/** The speech tag for a site language code ("TR" → "tr-TR"); `fallback` (the browser's language) otherwise. */
export function speechLangOf(language: string, fallback = "en-US") {
    return SPEECH_LANGS[language.toUpperCase()] ?? fallback;
}

/** Longest text read aloud at once (speech engines cut or stall on very long texts). */
export const SPEECH_TEXT_MAX = 4_000;

/**
 * What to read aloud from an answer written in Markdown: code blocks are
 * named rather than read character by character, links keep their text,
 * formatting marks go, and very long answers are cut at a sentence.
 */
export function speechTextOf(markdown: string, codeBlockLabel = "Kod bloğu.") {
    const text = markdown
        .replace(/```[\s\S]*?(?:```|$)/g, ` ${codeBlockLabel} `)
        .replace(/`([^`]+)`/g, "$1")
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/^\s{0,3}#{1,6}\s+/gm, "")
        .replace(/^\s{0,3}>\s?/gm, "")
        .replace(/^\s*[-*+•]\s+/gm, "")
        .replace(/^\s*\d+[.)]\s+/gm, "")
        .replace(/(\*\*|__|~~|\*|_)(?=\S)([\s\S]*?\S)\1/g, "$2")
        .replace(/<[^>]+>/g, "")
        .replace(/\|/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\s*\n\s*/g, "\n")
        .trim();
    if (text.length <= SPEECH_TEXT_MAX) return text;
    const cut = text.slice(0, SPEECH_TEXT_MAX);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "), cut.lastIndexOf("\n"));
    return `${(end > SPEECH_TEXT_MAX / 2 ? cut.slice(0, end + 1) : cut).trim()}…`;
}

/**
 * Longest piece handed to the speech engine at once. Some voices (Chrome's
 * online ones) stop after about 15 seconds of a single utterance, so a text is
 * read as a queue of short pieces.
 */
export const SPEECH_CHUNK_MAX = 160;

/** The sentences of one line: split after . ! ? or … followed by a space (no lookbehind: older Safari can't parse it). */
function sentencesOf(line: string) {
    const sentences: string[] = [];
    let start = 0;
    for (let index = 0; index < line.length; index++) {
        if (".!?…".includes(line[index]) && (index + 1 === line.length || /\s/.test(line[index + 1]))) {
            sentences.push(line.slice(start, index + 1).trim());
            start = index + 1;
        }
    }
    sentences.push(line.slice(start).trim());
    return sentences.filter(Boolean);
}

/** A sentence longer than a piece, split at a comma, semicolon or colon, else at a space, else anywhere. */
function piecesOf(sentence: string, max: number) {
    const pieces: string[] = [];
    let rest = sentence;
    while (rest.length > max) {
        const head = rest.slice(0, max + 1);
        const pause = Math.max(head.lastIndexOf(", "), head.lastIndexOf("; "), head.lastIndexOf(": "));
        const space = head.lastIndexOf(" ");
        const at = pause > max / 3 ? pause + 1 : space > max / 3 ? space : max;
        pieces.push(rest.slice(0, at).trim());
        rest = rest.slice(at).trim();
    }
    if (rest) pieces.push(rest);
    return pieces;
}

/**
 * The text to read (speechTextOf) as pieces of at most `max` characters:
 * every line starts a new piece (a pause after headings and list items),
 * sentences of a line are joined while they fit.
 */
export function speechChunksOf(text: string, max = SPEECH_CHUNK_MAX) {
    const chunks: string[] = [];
    for (const line of text.split(/\n+/)) {
        let current = "";
        for (const piece of sentencesOf(line).flatMap((sentence) => piecesOf(sentence, max))) {
            if (current && current.length + 1 + piece.length <= max) {
                current = `${current} ${piece}`;
            } else {
                if (current) chunks.push(current);
                current = piece;
            }
        }
        if (current) chunks.push(current);
    }
    return chunks;
}

/** The text a dictation result adds to what is already typed (a space between, nothing doubled). */
export function appendDictation(current: string, heard: string) {
    const addition = heard.replace(/\s+/g, " ").trim();
    if (!addition) return current;
    if (!current.trim()) return addition;
    return /\s$/.test(current) ? `${current}${addition}` : `${current} ${addition}`;
}
