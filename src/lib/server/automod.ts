import "server-only";

import { normalizeDomain, type AutoModConfig, type AutoModRule } from "@/lib/social/automod-config";
import { findPersonalData, normalizeForMatching, PROFANITY } from "./moderation";

/*
 * AutoMod of Hanogt Social groups: checks a message against the group's
 * settings before it is stored (src/lib/social/automod-config.ts). Pure and
 * synchronous; the stateful spam checks (bursts, repeats) and what happens
 * afterwards (warnings, mutes) live with the message route.
 */

/**
 * Milder insults and slang, off unless a group turns them on. Words with an
 * everyday meaning too ("mal": goods, "ayı": bear, "lan": a network) are left
 * out on purpose.
 */
export const SLANG = [
    // Türkçe
    "salak", "aptal", "gerizekalı", "geri zekalı", "dangalak", "ahmak", "budala", "beyinsiz", "embesil", "hödük", "yavşak", "puşt",
    "ezik", "ulan", "keko", "dallama", "angut", "denyo", "zibidi", "lavuk", "hırbo", "salaksın", "aptalsın",
    // English
    "stupid", "idiot", "moron", "dumbass", "jackass", "loser", "jerk", "wtf", "stfu", "damn", "crap", "screw you",
];

const FOLD: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

/** Turkish letters as their plain look-alikes ("şerefsiz" → "serefsiz"), after normalizeForMatching. */
function fold(text: string) {
    return text.replace(/[çğıöşüâîû]/g, (char) => FOLD[char] ?? char);
}

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");

/** One pattern for a word list: whole words or phrases only. */
export function wordPattern(words: readonly string[], folded: boolean): RegExp | null {
    const prepared = [...new Set(words.map((word) => normalizeForMatching(word.trim())).map((word) => (folded ? fold(word) : word)).filter((word) => word.length >= 2))];
    if (!prepared.length) return null;
    prepared.sort((a, b) => b.length - a.length);
    return new RegExp(`(?<![\\p{L}\\p{N}])(?:${prepared.map(escape).join("|")})(?![\\p{L}\\p{N}])`, "u");
}

// The swear-word list keeps its own Turkish spellings (folding would make "göt" catch "got").
const PROFANITY_PATTERN = wordPattern(PROFANITY, false)!;
const SLANG_PATTERN = wordPattern(SLANG, true)!;

const customPatterns = new Map<string, RegExp | null>();

function customPattern(words: readonly string[]) {
    const key = words.join("\u0001");
    if (!customPatterns.has(key)) {
        if (customPatterns.size > 200) customPatterns.clear();
        customPatterns.set(key, wordPattern(words, true));
    }
    return customPatterns.get(key) ?? null;
}

const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
// Without the g flag: test() on a global pattern would carry its position over to the next call.
const HAS_LINK = /\b(?:https?:\/\/|www\.)\S/i;

/** The host names of the links in a text ("https://www.github.com/x" → "github.com"). */
export function linkHosts(text: string): string[] {
    return (text.match(LINK) ?? []).map((link) => normalizeDomain(link.startsWith("www.") ? `https://${link}` : link)).filter((host): host is string => Boolean(host));
}

const allowed = (host: string, allowlist: readonly string[]) => allowlist.some((domain) => host === domain || host.endsWith(`.${domain}`));

export type AutoModVerdict = { ok: true } | { ok: false; rule: AutoModRule };

/**
 * Whether a message may be sent under the group's AutoMod settings.
 * `mentions` is how many people it @mentions (@everyone counts as one).
 */
export function scanMessage(input: { text: string; mentions: number }, config: AutoModConfig, customWords: readonly string[] = []): AutoModVerdict {
    if (!config.enabled) return { ok: true };
    const text = input.text.normalize("NFC");
    const normalized = normalizeForMatching(text);
    const folded = fold(normalized);

    if (customWords.length) {
        const pattern = customPattern(customWords);
        if (pattern?.test(folded)) return { ok: false, rule: "custom" };
    }
    if (config.profanity && PROFANITY_PATTERN.test(normalized)) return { ok: false, rule: "profanity" };
    if (config.slang && SLANG_PATTERN.test(folded)) return { ok: false, rule: "slang" };
    if (config.personalData && findPersonalData(text)) return { ok: false, rule: "personal" };
    if (config.links !== "allow") {
        const hosts = linkHosts(text);
        const blocked = config.links === "block" ? hosts.length > 0 : hosts.some((host) => !allowed(host, config.linkAllowlist));
        // A link that couldn't be read is blocked too when links are off.
        if (blocked || (config.links === "block" && HAS_LINK.test(text))) return { ok: false, rule: "links" };
    }
    if (config.maxMentions > 0 && input.mentions > config.maxMentions) return { ok: false, rule: "mentions" };
    if (config.caps) {
        const letters = text.match(/\p{L}/gu) ?? [];
        const upper = text.match(/\p{Lu}/gu) ?? [];
        if (letters.length >= 12 && upper.length / letters.length > 0.7) return { ok: false, rule: "caps" };
    }
    return { ok: true };
}

/** The same text, however it was spaced, cased or punctuated, for the repeat check (symbols aren't read as letters here). */
export function repeatKey(text: string) {
    return fold(text.toLocaleLowerCase("tr")).replace(/(\p{L})\1{2,}/gu, "$1").replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 300);
}

export const SPAM_LIMITS = {
    /** At most this many messages… */
    burstMessages: 6,
    /** …in this many milliseconds. */
    burstWindowMs: 8_000,
    /** The same text at most this many times… */
    repeats: 3,
    /** …in this many milliseconds. */
    repeatWindowMs: 60_000,
} as const;
