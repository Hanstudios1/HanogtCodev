/**
 * Offline password strength estimate (runs in the browser; the password is never sent anywhere).
 * Guesses are estimated from the character pool and common human patterns, similar in spirit to zxcvbn.
 */

import type { Copy } from "@/lib/i18n";

const COMMON = new Set([
    "123456", "123456789", "12345678", "12345", "1234567", "1234567890", "111111", "000000", "123123", "654321", "666666", "121212",
    "password", "password1", "passw0rd", "qwerty", "qwerty123", "qwertyuiop", "abc123", "iloveyou", "admin", "welcome", "monkey", "dragon",
    "letmein", "football", "baseball", "master", "sunshine", "princess", "shadow", "superman", "trustno1", "starwars", "whatever", "login",
    "sifre", "şifre", "sifre123", "parola", "parola123", "galatasaray", "fenerbahce", "fenerbahçe", "besiktas", "beşiktaş", "trabzonspor",
    "istanbul", "ankara", "izmir", "turkiye", "türkiye", "asdasd", "qweqwe", "asd123", "qwe123", "aaaaaa", "1q2w3e", "1q2w3e4r", "zxcvbnm",
    "asdfgh", "asdfghjkl", "mustafa", "mehmet", "ahmet", "ayse", "fatma", "kemal", "ataturk", "atatürk", "hanogt", "minecraft", "roblox",
]);

const SEQUENCES = ["abcdefghijklmnopqrstuvwxyz", "qwertyuiopasdfghjklzxcvbnm", "qwertyuıopğüasdfghjklşizxcvbnmöç", "01234567890", "1qaz2wsx3edc"];

export interface PasswordReport {
    score: 0 | 1 | 2 | 3 | 4;
    guessesLog10: number;
    entropyBits: number;
    crackTimes: { online: string; offlineSlow: string; offlineFast: string };
    warnings: Copy[];
    suggestions: Copy[];
}

function poolSize(password: string) {
    let size = 0;
    if (/[a-z]/.test(password)) size += 26;
    if (/[A-Z]/.test(password)) size += 26;
    if (/\d/.test(password)) size += 10;
    if (/[^A-Za-z0-9]/.test(password)) size += 33;
    if (/[^\x00-\x7F]/.test(password)) size += 40;
    return Math.max(size, 1);
}

function hasSequence(value: string) {
    const lower = value.toLocaleLowerCase("tr");
    for (const sequence of SEQUENCES) {
        for (let length = 4; length <= Math.min(8, lower.length); length += 1) {
            for (let start = 0; start + length <= sequence.length; start += 1) {
                const chunk = sequence.slice(start, start + length);
                if (lower.includes(chunk) || lower.includes([...chunk].reverse().join(""))) return true;
            }
        }
    }
    return false;
}

export function formatDuration(seconds: number, locale: "tr" | "en") {
    const tr = locale === "tr";
    if (!Number.isFinite(seconds) || seconds > 1e18) return tr ? "yüzyıllar" : "centuries";
    if (seconds < 1) return tr ? "anında" : "instantly";
    const units: Array<[number, string, string]> = [[31_536_000 * 100, "yüzyıl", "centuries"], [31_536_000, "yıl", "years"], [2_592_000, "ay", "months"], [86_400, "gün", "days"], [3600, "saat", "hours"], [60, "dakika", "minutes"], [1, "saniye", "seconds"]];
    for (const [size, trLabel, enLabel] of units) {
        if (seconds >= size) {
            const value = Math.round(seconds / size);
            if (size === 31_536_000 * 100) return tr ? "yüzyıllar" : "centuries";
            return tr ? `${value} ${trLabel}` : `${value} ${enLabel}`;
        }
    }
    return tr ? "anında" : "instantly";
}

export function checkPassword(password: string, locale: "tr" | "en" = "tr", context: string[] = []): PasswordReport {
    const warnings: Copy[] = [];
    const suggestions: Copy[] = [];
    const lower = password.toLocaleLowerCase("tr");
    const length = [...password].length;
    let guessesLog10 = length * Math.log10(poolSize(password));

    if (!password) {
        return { score: 0, guessesLog10: 0, entropyBits: 0, crackTimes: { online: formatDuration(0, locale), offlineSlow: formatDuration(0, locale), offlineFast: formatDuration(0, locale) }, warnings, suggestions };
    }
    const stripped = lower.replace(/[^a-zçğıöşü0-9]/g, "").replace(/[0-9!@#$%^&*._-]+$/, "");
    if (COMMON.has(lower) || COMMON.has(stripped)) {
        guessesLog10 = Math.min(guessesLog10, 2.5);
        warnings.push({ TR: "Bu, en çok kullanılan parolalardan biri (veya ona çok yakın).", EN: "This is one of the most common passwords (or very close to it)." });
    }
    if (/^(.)\1+$/.test(password) || /(.)\1{3,}/.test(password)) {
        guessesLog10 -= 3;
        warnings.push({ TR: "Tekrarlanan karakterler (aaaa, 1111) kolay tahmin edilir.", EN: "Repeated characters (aaaa, 1111) are easy to guess." });
    }
    if (hasSequence(password)) {
        guessesLog10 -= 3;
        warnings.push({ TR: "Klavye veya alfabe dizileri (qwerty, 1234, abcd) içeriyor.", EN: "Contains keyboard or alphabet sequences (qwerty, 1234, abcd)." });
    }
    if (/(19|20)\d{2}/.test(password)) {
        guessesLog10 -= 1.5;
        warnings.push({ TR: "Yıl gibi görünen sayılar (1998, 2024) sık tahmin edilir.", EN: "Year-like numbers (1998, 2024) are commonly guessed." });
    }
    if (/^[A-ZÇĞİÖŞÜ][a-zçğıöşü]+\d{1,4}[!.?]?$/.test(password)) {
        guessesLog10 -= 2;
        warnings.push({ TR: "\"Kelime + sayı\" kalıbı saldırganların ilk denediği biçimdir.", EN: "The \"Word + digits\" pattern is the first one attackers try." });
    }
    for (const word of context.map((item) => item.toLocaleLowerCase("tr")).filter((item) => item.length >= 3)) {
        if (lower.includes(word)) {
            guessesLog10 -= 3;
            warnings.push({ TR: "Adın, e-postan veya kullanıcı adın parolada geçiyor.", EN: "Your name, e-mail or username appears in the password." });
            break;
        }
    }
    guessesLog10 = Math.max(0, guessesLog10);

    if (length < 12) suggestions.push({ TR: "En az 12–16 karakter kullan; uzunluk en büyük güçtür.", EN: "Use at least 12–16 characters; length is the biggest win." });
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password)) suggestions.push({ TR: "Büyük ve küçük harfleri karıştır.", EN: "Mix upper- and lowercase letters." });
    if (!/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) suggestions.push({ TR: "Rakam ve sembol ekle, ama sadece sona değil.", EN: "Add digits and symbols, not only at the end." });
    suggestions.push({ TR: "Birbiriyle ilgisiz 4-5 kelimeden oluşan bir parola cümlesi dene (ör. mavi-kedi-roket-limon).", EN: "Try a passphrase of 4–5 unrelated words (e.g. blue-cat-rocket-lemon)." });
    suggestions.push({ TR: "Her site için farklı parola kullan ve bir parola yöneticisine güven.", EN: "Use a different password for every site and trust a password manager." });

    const guesses = 10 ** guessesLog10;
    const score = guessesLog10 < 3 ? 0 : guessesLog10 < 6 ? 1 : guessesLog10 < 8 ? 2 : guessesLog10 < 10 ? 3 : 4;
    return {
        score,
        guessesLog10: Math.round(guessesLog10 * 10) / 10,
        entropyBits: Math.round(guessesLog10 * Math.log2(10)),
        crackTimes: {
            online: formatDuration(guesses / 10, locale),
            offlineSlow: formatDuration(guesses / 1e4, locale),
            offlineFast: formatDuration(guesses / 1e10, locale),
        },
        warnings,
        suggestions: score >= 4 ? suggestions.slice(-1) : suggestions,
    };
}

/** SHA-1 (hex, upper-case) used for the k-anonymity breach check. */
export async function sha1Hex(text: string) {
    const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}
