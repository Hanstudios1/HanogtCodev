/**
 * Lightweight, deterministic moderation for short public texts (news comments etc.).
 * It blocks profanity/slurs (TR + EN, with common obfuscations), obvious spam and
 * personal data that should never be posted publicly (e-mail, phone, T.C. kimlik, card numbers).
 */

export type ModerationReason = "empty" | "too-long" | "profanity" | "personal-data" | "links" | "spam";

export interface ModerationResult {
    ok: boolean;
    text: string;
    reason?: ModerationReason;
    message?: string;
}

const PROFANITY = [
    // Türkçe
    "amk", "amq", "aq", "amına", "amina", "amcık", "amcik", "orospu", "orspu", "piç", "oç", "siktir", "sikik", "sikerim", "sikeyim", "sikim",
    "yarrak", "yarak", "göt", "götveren", "ibne", "kahpe", "pezevenk", "gavat", "şerefsiz", "serefsiz", "ananı", "anani", "avradını", "kaltak",
    // English
    "fuck", "fucking", "fucker", "motherfucker", "shit", "bullshit", "bitch", "cunt", "asshole", "dickhead", "whore", "slut", "bastard",
    // Slurs
    "nigger", "nigga", "faggot", "retard",
];

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" };

function normalizeForMatching(text: string) {
    return text
        .toLocaleLowerCase("tr")
        .replace(/[013457@$!]/g, (char) => LEET[char] ?? char)
        // "siiiiktir" → "siktir"
        .replace(/(\p{L})\1{2,}/gu, "$1");
}

const PROFANITY_PATTERN = new RegExp(`(?<![\\p{L}\\p{N}])(?:${PROFANITY.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}\\p{N}])`, "u");

function luhn(digits: string) {
    let sum = 0;
    let double = false;
    for (let index = digits.length - 1; index >= 0; index -= 1) {
        let value = digits.charCodeAt(index) - 48;
        if (double) {
            value *= 2;
            if (value > 9) value -= 9;
        }
        sum += value;
        double = !double;
    }
    return sum % 10 === 0;
}

/** Turkish national ID (T.C. Kimlik No) checksum. */
export function isTurkishNationalId(value: string) {
    if (!/^[1-9]\d{10}$/.test(value)) return false;
    const d = value.split("").map(Number);
    const odd = d[0] + d[2] + d[4] + d[6] + d[8];
    const even = d[1] + d[3] + d[5] + d[7];
    const tenth = (((odd * 7 - even) % 10) + 10) % 10;
    const eleventh = d.slice(0, 10).reduce((sum, digit) => sum + digit, 0) % 10;
    return d[9] === tenth && d[10] === eleventh;
}

/** Returns a short Turkish label for the first kind of personal data found, or null. */
export function findPersonalData(text: string): string | null {
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) return "e-posta adresi";
    if (/(?<!\d)(?:\+?90[\s.-]?)?\(?0?5\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}(?!\d)/.test(text)) return "telefon numarası";
    for (const match of text.match(/(?<!\d)\d{11}(?!\d)/g) ?? []) if (isTurkishNationalId(match)) return "T.C. kimlik numarası";
    for (const match of text.match(/(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g) ?? []) {
        const digits = match.replace(/\D/g, "");
        if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return "kart numarası";
    }
    if (/\bTR\d{2}\s?(?:\d{4}\s?){5}\d{2}\b/i.test(text)) return "IBAN";
    return null;
}

export function moderateText(input: string, options: { minLength?: number; maxLength?: number; maxLinks?: number } = {}): ModerationResult {
    const minLength = options.minLength ?? 2;
    const maxLength = options.maxLength ?? 1000;
    const maxLinks = options.maxLinks ?? 2;
    const text = input
        .normalize("NFC")
        // Control characters and invisible direction overrides used to disguise text.
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    if (text.length < minLength) return { ok: false, text, reason: "empty", message: "Yorum çok kısa." };
    if (text.length > maxLength) return { ok: false, text, reason: "too-long", message: `Yorum en fazla ${maxLength} karakter olabilir.` };
    if ((text.match(/(?:https?:\/\/|www\.)/gi) ?? []).length > maxLinks) return { ok: false, text, reason: "links", message: `Bir yorumda en fazla ${maxLinks} bağlantı olabilir.` };
    if (PROFANITY_PATTERN.test(normalizeForMatching(text))) return { ok: false, text, reason: "profanity", message: "Yorum, topluluk kurallarına aykırı ifadeler içeriyor." };
    const personal = findPersonalData(text);
    if (personal) return { ok: false, text, reason: "personal-data", message: `Güvenliğin için herkese açık yorumlarda ${personal} paylaşma.` };
    if (/(.)\1{14,}/u.test(text)) return { ok: false, text, reason: "spam", message: "Yorum spam gibi görünüyor." };
    const letters = text.match(/\p{L}/gu) ?? [];
    const upper = text.match(/\p{Lu}/gu) ?? [];
    if (letters.length >= 30 && upper.length / letters.length > 0.85) return { ok: false, text, reason: "spam", message: "Lütfen tamamı büyük harfle yazmayın." };
    return { ok: true, text };
}
