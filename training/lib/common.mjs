// Helpers shared by the dataset scripts (import-github.mjs, mix.mjs): one
// sample schema, seeded randomness, language detection, the filters that keep
// a sample out (personal data, another model's identity, refusals, length),
// exact and near-duplicate detection, and benchmark fingerprints.
//
// A sample, as every source writes it (JSON Lines):
//   { id, group, source, license, lang: "TR" | "EN", family, verified,
//     messages: [{ role: "system" | "user" | "assistant" | "tool", content,
//                  reasoning_content?, tool_calls?, tool_call_id?, name? }],
//     tools? }
// `group` ties the variants of one item together so a split never puts them
// on both sides; `verified` says how the answer was checked ("executed",
// "doctest", "upstream-ci", "knowledge" or "none").
import { createHash } from "node:crypto";

/** Turkish and English first; German, Azerbaijani and Russian since set v3. */
export const LANGS = ["TR", "EN", "DE", "AZ", "RU"];
export const FAMILIES = [
    "site",
    "agent",
    "code-solve",
    "code-explain",
    "code-algorithm",
    "math-reasoning",
    "chat",
    "chat-reasoning",
    "instruction",
    // Set v3: school and general subjects, defensive security, judging answers.
    "science",
    "knowledge",
    "security",
    "judge",
];
export const VERIFIED = ["executed", "doctest", "upstream-ci", "knowledge", "human", "none"];
const ROLES = new Set(["system", "user", "assistant", "tool"]);

/** A seeded random generator (mulberry32), so every build is reproducible. */
export function random(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** A number in [0, 1) that only depends on the text (stable choices per item, independent of order). */
export function unitHash(text) {
    return Number.parseInt(createHash("sha256").update(text).digest("hex").slice(0, 8), 16) / 0x100000000;
}

export const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/** Letters Turkish (and Azerbaijani) use but German and English don't; ö and ü are shared with German. */
const TR_CHARS = /[çğışÇĞİŞ]/g;
/** The schwa: everywhere in Azerbaijani, never in Turkish. */
const AZ_CHARS = /[əƏ]/g;
/** Letters German uses but Turkish and Azerbaijani don't. */
const DE_CHARS = /[äÄß]/g;
const words = (list) => new RegExp(`(?:^|[\\s"'(„“«])(?:${list.join("|")})(?=[\\s.,!?:;)"'“”»]|$)`, "gi");
const TR_WORDS = words(["ve", "bir", "bu", "şu", "ne", "nasıl", "neden", "nedir", "için", "ile", "ama", "çok", "daha", "gibi", "olan", "olarak", "sonra", "kadar", "değil", "mı", "mi", "mu", "mü", "var", "yok", "bana", "beni", "benim", "sen", "sana", "biz", "onun", "şey", "lütfen", "misin", "musun", "yap", "yaz", "göster"]);
const AZ_WORDS = words(["və", "üçün", "ilə", "necə", "niyə", "nədir", "deyil", "mən", "mənim", "sən", "sənin", "biz", "kimi", "olan", "olaraq", "sonra", "çox", "daha", "edir", "edən", "olur", "lazımdır", "zəhmət", "xahiş", "yazın", "göstər", "bəli", "xeyr"]);
const DE_WORDS = words(["der", "die", "das", "und", "ist", "nicht", "ein", "eine", "einen", "ich", "du", "sie", "wir", "mit", "auf", "für", "von", "zu", "den", "dem", "sich", "auch", "wie", "was", "warum", "bitte", "kann", "können", "werden", "wird", "sind", "haben", "hat", "oder", "aber", "wenn", "dass", "diese", "dieser", "noch", "nur", "schreibe", "erkläre"]);
const EN_WORDS = words(["the", "and", "of", "to", "is", "are", "was", "were", "be", "this", "that", "with", "for", "you", "your", "how", "what", "why", "which", "can", "could", "would", "should", "please", "write", "it", "in", "on", "an", "a", "i", "my", "me", "do", "does"]);

/** Letters Ukrainian uses and Russian doesn't. */
const UK_CHARS = /[іїєґІЇЄҐ]/g;

/**
 * "TR", "EN", "DE", "AZ", "RU" or null for natural-language text. Code and
 * markdown fences are ignored. Mostly Cyrillic text is Russian (unless it has
 * Ukrainian letters); the schwa (ə) marks Azerbaijani; ğ, ı, ş, ç and İ (or
 * mostly Turkish function words) mark Turkish; ä and ß (or mostly German
 * function words) mark German; a mostly-ASCII text with English function
 * words is English.
 */
export function detectLanguage(text) {
    const prose = String(text ?? "")
        .replace(/```[\s\S]*?(```|$)/g, " ")
        .replace(/`[^`\n]*`/g, " ")
        .replace(/https?:\/\/\S+/g, " ");
    const letters = (prose.match(/\p{L}/gu) ?? []).length;
    if (!letters) return null;
    const count = (pattern) => (prose.match(pattern) ?? []).length;
    const azChars = count(AZ_CHARS);
    const trChars = count(TR_CHARS);
    const deChars = count(DE_CHARS);
    const azWords = count(AZ_WORDS);
    const trWords = count(TR_WORDS);
    const deWords = count(DE_WORDS);
    const enWords = count(EN_WORDS);
    const ascii = count(/[A-Za-z]/g) / letters;
    const cyrillic = count(/\p{Script=Cyrillic}/gu) / letters;
    if (cyrillic > 0.5) return count(UK_CHARS) >= 2 ? null : "RU";
    if (azChars >= 2 || (azChars >= 1 && azWords >= trWords)) return "AZ";
    if (trChars >= 2 || (trWords > enWords && trWords >= deWords)) return trWords + trChars > 0 ? "TR" : null;
    if ((deChars >= 1 && deWords >= 1) || (deWords >= 2 && deWords > enWords)) return "DE";
    if (enWords >= 1 && ascii > 0.9) return "EN";
    return null;
}

// ---------------------------------------------------------------- filters

/** E-mail addresses other than documentation domains. */
const EMAIL = /[A-Za-z0-9._%+-]+@(?!example\.(?:com|org|net)\b|test\b|localhost\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const IBAN = /\bTR\d{2}[ ]?(?:\d{4}[ ]?){5}\d{2}\b/i;
const PHONE_TR = /(?:\+90|\b0)[ ]?5\d{2}[ ]?\d{3}[ ]?\d{2}[ ]?\d{2}\b/;

/** Turkish national id numbers pass a checksum; random 11-digit numbers rarely do. */
function isTcKimlik(digits) {
    if (!/^[1-9]\d{10}$/.test(digits)) return false;
    const d = [...digits].map(Number);
    const tenth = ((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - (d[1] + d[3] + d[5] + d[7])) % 10;
    const eleventh = d.slice(0, 10).reduce((sum, value) => sum + value, 0) % 10;
    return ((tenth + 10) % 10) === d[9] && eleventh === d[10];
}

/** Card numbers pass the Luhn check. */
function isCardNumber(digits) {
    if (digits.length < 13 || digits.length > 19) return false;
    let sum = 0;
    for (let index = 0; index < digits.length; index += 1) {
        let value = Number(digits[digits.length - 1 - index]);
        if (index % 2 === 1) {
            value *= 2;
            if (value > 9) value -= 9;
        }
        sum += value;
    }
    return sum % 10 === 0;
}

/**
 * The kind of personal data a text seems to contain, or null. `cards: false`
 * skips card numbers (programming exercises such as Luhn use well-known test
 * numbers).
 */
export function personalData(text, { cards = true } = {}) {
    const value = String(text ?? "");
    if (EMAIL.test(value)) return "email";
    if (IBAN.test(value)) return "iban";
    if (PHONE_TR.test(value)) return "phone";
    for (const match of value.matchAll(/\b\d{11}\b/g)) if (isTcKimlik(match[0])) return "national_id";
    if (!cards) return null;
    for (const match of value.matchAll(/\b(?:\d[ -]?){13,19}\b/g)) {
        const digits = match[0].replace(/\D/g, "");
        if (/^(?:4|5[1-5]|3[47]|6)/.test(digits) && isCardNumber(digits)) return "card";
    }
    return null;
}

const OTHER_MODELS = "(?:ChatGPT|GPT-?[345](?:\\.\\d)?(?:o|-turbo)?|OpenAI|Claude|Anthropic|Gemini|Bard|Google DeepMind|LLaMA|Llama|Meta AI|Qwen|Tongyi|Alibaba Cloud|DeepSeek|Mistral|Mixtral|Phi-\\d|Microsoft Copilot|Copilot|Grok|xAI|SmolLM|StarCoder|OLMo|Tülu|Tulu|Aya|Cohere|Command R|Falcon|Vicuna|Alpaca|Open ?Assistant)";
const IDENTITY_EN = new RegExp(`\\b(?:I am|I'm|I was|as)\\b[^.\\n]{0,60}\\b(?:${OTHER_MODELS})\\b|\\b(?:developed|created|trained|built|made)\\s+by\\s+(?:the\\s+)?${OTHER_MODELS}\\b|\\bmy name is\\s+${OTHER_MODELS}\\b`, "i");
const IDENTITY_TR = new RegExp(`\\b(?:ben|adım)\\b[^.\\n]{0,60}\\b${OTHER_MODELS}\\b|${OTHER_MODELS}\\s*(?:tarafından|şirketi tarafından)\\s+(?:geliştirilen|geliştirildim|eğitilen|eğitildim|oluşturulan|oluşturuldum)`, "i");

/** True when an assistant message claims to be (or to be made by) another model or company. */
export function claimsOtherIdentity(text) {
    const value = String(text ?? "");
    return IDENTITY_EN.test(value) || IDENTITY_TR.test(value);
}

const REFUSAL = /^(?:\s*(?:I'm sorry|I am sorry|Sorry|I apologi[sz]e)[^.\n]{0,40}(?:but )?I (?:can(?:'|no)t|am unable to|won't|will not)|\s*(?:As an AI(?: language model)?|As a language model)|\s*(?:Üzgünüm|Maalesef)[^.\n]{0,60}(?:yardımcı olamam|yapamam|veremem|yanıt veremem))/i;

/** True when an answer opens with a refusal or an "As an AI…" disclaimer (kept out of imported data: it teaches over-refusal). */
export function looksLikeRefusal(text) {
    return REFUSAL.test(String(text ?? ""));
}

/** Characters of everything a sample says (≈ 3.5 characters a token for this mix). */
export function sampleChars(sample) {
    return sample.messages.reduce((sum, message) => sum + String(message.content ?? "").length + String(message.reasoning_content ?? "").length + (message.tool_calls ? JSON.stringify(message.tool_calls).length : 0), 0);
}

export const approxTokens = (chars) => Math.round(chars / 3.5);

/** The schema check every sample must pass; returns a reason when it doesn't. */
export function invalidSample(sample) {
    if (!sample || typeof sample !== "object") return "not_object";
    for (const key of ["id", "group", "source", "license", "family", "verified"]) if (typeof sample[key] !== "string" || !sample[key]) return `missing_${key}`;
    if (!LANGS.includes(sample.lang)) return "lang";
    if (!FAMILIES.includes(sample.family)) return "family";
    if (!VERIFIED.includes(sample.verified)) return "verified";
    if (!Array.isArray(sample.messages) || sample.messages.length < 2) return "messages";
    for (const message of sample.messages) {
        if (!message || !ROLES.has(message.role)) return "role";
        if (typeof message.content !== "string") return "content";
        if (message.reasoning_content !== undefined && typeof message.reasoning_content !== "string") return "reasoning";
    }
    const last = sample.messages[sample.messages.length - 1];
    if (last.role !== "assistant" || (!last.content.trim() && !last.tool_calls)) return "no_answer";
    if (!sample.messages.some((message) => message.role === "user" && message.content.trim())) return "no_question";
    return null;
}

// ---------------------------------------------------------------- reasoning

const THINK_PAIRS = [
    ["<think>", "</think>"],
    ["<|begin_of_thought|>", "<|end_of_thought|>"],
    ["<thinking>", "</thinking>"],
];

/**
 * Moves a leading thinking block out of an answer: { reasoning, answer }.
 * Recognizes <think>, OpenThoughts' <|begin_of_thought|> and <thinking>; also
 * unwraps <|begin_of_solution|>…<|end_of_solution|>.
 */
export function splitReasoning(text) {
    let value = String(text ?? "");
    let reasoning = "";
    for (const [open, close] of THINK_PAIRS) {
        const start = value.indexOf(open);
        const end = value.indexOf(close);
        if (end !== -1 && (start === -1 || start < end) && value.slice(0, start === -1 ? 0 : start).trim() === "") {
            reasoning = value.slice(start === -1 ? 0 : start + open.length, end).trim();
            value = value.slice(end + close.length);
            break;
        }
    }
    const solution = value.match(/<\|begin_of_solution\|>([\s\S]*?)(?:<\|end_of_solution\|>|$)/);
    if (solution) value = solution[1];
    return { reasoning, answer: value.trim() };
}

// ---------------------------------------------------------------- duplicates

/** Lower-cased words with punctuation and digits folded, for duplicate checks. */
export function normalizeForDedup(text) {
    return String(text ?? "")
        .toLocaleLowerCase("tr")
        .replace(/\d+/g, "0")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
}

/** The exact-duplicate key of a sample: what the user asked and what the assistant answered, normalized. */
export function exactKey(sample) {
    const said = sample.messages.filter((message) => message.role === "user" || message.role === "assistant").map((message) => normalizeForDedup(message.content)).join("\u0001");
    return sha256(said);
}

/** 32-bit FNV-1a. */
function fnv1a(text) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

const PERMUTATIONS = 64;
const SEEDS = Array.from({ length: PERMUTATIONS }, (_, index) => {
    const value = fnv1a(`minhash-${index}`);
    return [value | 1, fnv1a(`shift-${index}`)];
});

/** MinHash signature (64 values) of a text's 5-word shingles; null for texts under 5 words. */
export function minhash(text, maxChars = 4000) {
    const words = normalizeForDedup(String(text ?? "").slice(0, maxChars)).split(" ").filter(Boolean);
    if (words.length < 5) return null;
    const signature = new Uint32Array(PERMUTATIONS).fill(0xffffffff);
    for (let index = 0; index + 5 <= words.length; index += 1) {
        const shingle = fnv1a(words.slice(index, index + 5).join(" "));
        for (let permutation = 0; permutation < PERMUTATIONS; permutation += 1) {
            const [multiplier, shift] = SEEDS[permutation];
            const value = (Math.imul(shingle ^ shift, multiplier) >>> 0);
            if (value < signature[permutation]) signature[permutation] = value;
        }
    }
    return signature;
}

export function minhashSimilarity(a, b) {
    let same = 0;
    for (let index = 0; index < PERMUTATIONS; index += 1) if (a[index] === b[index]) same += 1;
    return same / PERMUTATIONS;
}

/**
 * Near-duplicate finder (LSH: 16 bands of 4 rows). `seen(signature)` returns
 * true when an earlier signature is at least `threshold` similar; otherwise it
 * remembers this one.
 */
export function createNearDuplicateIndex(threshold = 0.8) {
    const BANDS = 16;
    const ROWS = PERMUTATIONS / BANDS;
    const buckets = new Map();
    const signatures = [];
    return {
        seen(signature) {
            if (!signature) return false;
            const keys = [];
            const candidates = new Set();
            for (let band = 0; band < BANDS; band += 1) {
                const key = `${band}:${Array.from(signature.subarray(band * ROWS, band * ROWS + ROWS)).join(",")}`;
                keys.push(key);
                for (const candidate of buckets.get(key) ?? []) candidates.add(candidate);
            }
            for (const candidate of candidates) if (minhashSimilarity(signatures[candidate], signature) >= threshold) return true;
            const id = signatures.push(signature) - 1;
            for (const key of keys) {
                const list = buckets.get(key);
                if (list) list.push(id);
                else buckets.set(key, [id]);
            }
            return false;
        },
        get size() {
            return signatures.length;
        },
    };
}

// ---------------------------------------------------------------- benchmarks

/** 8-word shingles of a text, for overlap checks against benchmark prompts. */
export function shingles(text, size = 8) {
    const words = String(text ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const result = [];
    for (let index = 0; index + size <= words.length; index += 1) result.push(words.slice(index, index + size).join(" "));
    return result;
}

/**
 * Fingerprints of evaluation sets nothing may train on: function names that
 * may not be defined or called, and 8-word runs of their prompts.
 */
export function createFingerprints() {
    const names = new Set();
    const runs = new Set();
    let pattern = null;
    return {
        addName(name) {
            if (/^[A-Za-z_$][\w$]{3,}$/.test(name)) {
                names.add(name);
                pattern = null;
            }
        },
        addText(text) {
            for (const run of shingles(text)) runs.add(run);
        },
        touches(text) {
            const value = String(text ?? "");
            if (names.size) {
                pattern ??= new RegExp(`(?:^|[^\\w$.])(?:${[...names].map((name) => name.replace(/[$]/g, "\\$")).join("|")})\\s*\\(`);
                if (pattern.test(value)) return true;
            }
            for (const run of shingles(value)) if (runs.has(run)) return true;
            return false;
        },
        get size() {
            return { names: names.size, runs: runs.size };
        },
    };
}

/** One JSON line per sample, keys in a stable order. */
export function sampleLine(sample) {
    const { id, group, source, license, lang, family, verified, messages, tools } = sample;
    return JSON.stringify({ id, group, source, license, lang, family, verified, messages, ...(tools ? { tools } : {}) });
}
