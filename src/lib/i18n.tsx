"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { detectLanguage } from "@/lib/language-detect";
import tr from "@/locales/TR.json";
import en from "@/locales/EN.json";

export type Language =
    | "TR" | "EN" | "RU" | "AZ" | "ES" | "KZ" | "JP" | "CN" | "KR" | "HI" | "DE" | "NG" | "FR" | "BE" | "NL" | "PL" | "NO" | "FI" | "SV" | "EL"
    | "AR" | "PT" | "IT" | "UK" | "ID" | "VI" | "CS" | "RO" | "HU" | "UZ"
    | "FA" | "HE" | "UR" | "BN" | "TH" | "MS" | "TL" | "SW" | "DA" | "BG" | "SR" | "HR" | "SK" | "KA" | "TK" | "KY" | "TW" | "TA" | "SQ" | "LT";
type Translations = Record<string, string>;

export interface LanguageInfo {
    code: Language;
    /** Native name shown in the picker. */
    name: string;
    /** English name (search + accessibility). */
    english: string;
    /** BCP 47 tag used for <html lang> and Intl formatting. */
    locale: string;
    dir: "ltr" | "rtl";
    flag: string;
}

export const LANGUAGES: LanguageInfo[] = [
    { code: "TR", name: "Türkçe", english: "Turkish", locale: "tr-TR", dir: "ltr", flag: "🇹🇷" },
    { code: "EN", name: "English", english: "English", locale: "en-US", dir: "ltr", flag: "🇬🇧" },
    { code: "DE", name: "Deutsch", english: "German", locale: "de-DE", dir: "ltr", flag: "🇩🇪" },
    { code: "FR", name: "Français", english: "French", locale: "fr-FR", dir: "ltr", flag: "🇫🇷" },
    { code: "ES", name: "Español", english: "Spanish", locale: "es-ES", dir: "ltr", flag: "🇪🇸" },
    { code: "PT", name: "Português", english: "Portuguese", locale: "pt-BR", dir: "ltr", flag: "🇧🇷" },
    { code: "IT", name: "Italiano", english: "Italian", locale: "it-IT", dir: "ltr", flag: "🇮🇹" },
    { code: "RU", name: "Русский", english: "Russian", locale: "ru-RU", dir: "ltr", flag: "🇷🇺" },
    { code: "UK", name: "Українська", english: "Ukrainian", locale: "uk-UA", dir: "ltr", flag: "🇺🇦" },
    { code: "AR", name: "العربية", english: "Arabic", locale: "ar", dir: "rtl", flag: "🇸🇦" },
    { code: "FA", name: "فارسی", english: "Persian", locale: "fa-IR", dir: "rtl", flag: "🇮🇷" },
    { code: "HE", name: "עברית", english: "Hebrew", locale: "he-IL", dir: "rtl", flag: "🇮🇱" },
    { code: "UR", name: "اردو", english: "Urdu", locale: "ur-PK", dir: "rtl", flag: "🇵🇰" },
    { code: "AZ", name: "Azərbaycan", english: "Azerbaijani", locale: "az-AZ", dir: "ltr", flag: "🇦🇿" },
    { code: "KZ", name: "Қазақ", english: "Kazakh", locale: "kk-KZ", dir: "ltr", flag: "🇰🇿" },
    { code: "UZ", name: "Oʻzbekcha", english: "Uzbek", locale: "uz-UZ", dir: "ltr", flag: "🇺🇿" },
    { code: "TK", name: "Türkmençe", english: "Turkmen", locale: "tk-TM", dir: "ltr", flag: "🇹🇲" },
    { code: "KY", name: "Кыргызча", english: "Kyrgyz", locale: "ky-KG", dir: "ltr", flag: "🇰🇬" },
    { code: "KA", name: "ქართული", english: "Georgian", locale: "ka-GE", dir: "ltr", flag: "🇬🇪" },
    { code: "JP", name: "日本語", english: "Japanese", locale: "ja-JP", dir: "ltr", flag: "🇯🇵" },
    { code: "CN", name: "简体中文", english: "Chinese (Simplified)", locale: "zh-CN", dir: "ltr", flag: "🇨🇳" },
    { code: "TW", name: "繁體中文", english: "Chinese (Traditional)", locale: "zh-TW", dir: "ltr", flag: "🇹🇼" },
    { code: "KR", name: "한국어", english: "Korean", locale: "ko-KR", dir: "ltr", flag: "🇰🇷" },
    { code: "HI", name: "हिन्दी", english: "Hindi", locale: "hi-IN", dir: "ltr", flag: "🇮🇳" },
    { code: "BN", name: "বাংলা", english: "Bengali", locale: "bn-BD", dir: "ltr", flag: "🇧🇩" },
    { code: "TA", name: "தமிழ்", english: "Tamil", locale: "ta-IN", dir: "ltr", flag: "🇮🇳" },
    { code: "TH", name: "ไทย", english: "Thai", locale: "th-TH", dir: "ltr", flag: "🇹🇭" },
    { code: "ID", name: "Bahasa Indonesia", english: "Indonesian", locale: "id-ID", dir: "ltr", flag: "🇮🇩" },
    { code: "VI", name: "Tiếng Việt", english: "Vietnamese", locale: "vi-VN", dir: "ltr", flag: "🇻🇳" },
    { code: "MS", name: "Bahasa Melayu", english: "Malay", locale: "ms-MY", dir: "ltr", flag: "🇲🇾" },
    { code: "TL", name: "Filipino", english: "Filipino", locale: "fil-PH", dir: "ltr", flag: "🇵🇭" },
    { code: "SW", name: "Kiswahili", english: "Swahili", locale: "sw-KE", dir: "ltr", flag: "🇰🇪" },
    { code: "NG", name: "Naijá", english: "Nigerian Pidgin", locale: "pcm-NG", dir: "ltr", flag: "🇳🇬" },
    { code: "NL", name: "Nederlands", english: "Dutch", locale: "nl-NL", dir: "ltr", flag: "🇳🇱" },
    { code: "BE", name: "Vlaams", english: "Flemish", locale: "nl-BE", dir: "ltr", flag: "🇧🇪" },
    { code: "PL", name: "Polski", english: "Polish", locale: "pl-PL", dir: "ltr", flag: "🇵🇱" },
    { code: "CS", name: "Čeština", english: "Czech", locale: "cs-CZ", dir: "ltr", flag: "🇨🇿" },
    { code: "SK", name: "Slovenčina", english: "Slovak", locale: "sk-SK", dir: "ltr", flag: "🇸🇰" },
    { code: "RO", name: "Română", english: "Romanian", locale: "ro-RO", dir: "ltr", flag: "🇷🇴" },
    { code: "HU", name: "Magyar", english: "Hungarian", locale: "hu-HU", dir: "ltr", flag: "🇭🇺" },
    { code: "BG", name: "Български", english: "Bulgarian", locale: "bg-BG", dir: "ltr", flag: "🇧🇬" },
    { code: "SR", name: "Српски", english: "Serbian", locale: "sr-RS", dir: "ltr", flag: "🇷🇸" },
    { code: "HR", name: "Hrvatski", english: "Croatian", locale: "hr-HR", dir: "ltr", flag: "🇭🇷" },
    { code: "SQ", name: "Shqip", english: "Albanian", locale: "sq-AL", dir: "ltr", flag: "🇦🇱" },
    { code: "NO", name: "Norsk", english: "Norwegian", locale: "nb-NO", dir: "ltr", flag: "🇳🇴" },
    { code: "SV", name: "Svenska", english: "Swedish", locale: "sv-SE", dir: "ltr", flag: "🇸🇪" },
    { code: "DA", name: "Dansk", english: "Danish", locale: "da-DK", dir: "ltr", flag: "🇩🇰" },
    { code: "FI", name: "Suomi", english: "Finnish", locale: "fi-FI", dir: "ltr", flag: "🇫🇮" },
    { code: "EL", name: "Ελληνικά", english: "Greek", locale: "el-GR", dir: "ltr", flag: "🇬🇷" },
    { code: "LT", name: "Lietuvių", english: "Lithuanian", locale: "lt-LT", dir: "ltr", flag: "🇱🇹" },
];

const fallbackTR = tr as Translations;
const fallbackEN = en as Translations;
const loaders: Record<Language, () => Promise<Translations>> = {
    TR: async () => fallbackTR,
    EN: async () => fallbackEN,
    RU: async () => (await import("@/locales/RU.json")).default,
    AZ: async () => (await import("@/locales/AZ.json")).default,
    ES: async () => (await import("@/locales/ES.json")).default,
    KZ: async () => (await import("@/locales/KZ.json")).default,
    JP: async () => (await import("@/locales/JP.json")).default,
    CN: async () => (await import("@/locales/CN.json")).default,
    KR: async () => (await import("@/locales/KR.json")).default,
    HI: async () => (await import("@/locales/HI.json")).default,
    DE: async () => (await import("@/locales/DE.json")).default,
    NG: async () => (await import("@/locales/NG.json")).default,
    FR: async () => (await import("@/locales/FR.json")).default,
    BE: async () => (await import("@/locales/BE.json")).default,
    NL: async () => (await import("@/locales/NL.json")).default,
    PL: async () => (await import("@/locales/PL.json")).default,
    NO: async () => (await import("@/locales/NO.json")).default,
    FI: async () => (await import("@/locales/FI.json")).default,
    SV: async () => (await import("@/locales/SV.json")).default,
    EL: async () => (await import("@/locales/EL.json")).default,
    AR: async () => (await import("@/locales/AR.json")).default,
    PT: async () => (await import("@/locales/PT.json")).default,
    IT: async () => (await import("@/locales/IT.json")).default,
    UK: async () => (await import("@/locales/UK.json")).default,
    ID: async () => (await import("@/locales/ID.json")).default,
    VI: async () => (await import("@/locales/VI.json")).default,
    CS: async () => (await import("@/locales/CS.json")).default,
    RO: async () => (await import("@/locales/RO.json")).default,
    HU: async () => (await import("@/locales/HU.json")).default,
    UZ: async () => (await import("@/locales/UZ.json")).default,
    FA: async () => (await import("@/locales/FA.json")).default,
    HE: async () => (await import("@/locales/HE.json")).default,
    UR: async () => (await import("@/locales/UR.json")).default,
    BN: async () => (await import("@/locales/BN.json")).default,
    TH: async () => (await import("@/locales/TH.json")).default,
    MS: async () => (await import("@/locales/MS.json")).default,
    TL: async () => (await import("@/locales/TL.json")).default,
    SW: async () => (await import("@/locales/SW.json")).default,
    DA: async () => (await import("@/locales/DA.json")).default,
    BG: async () => (await import("@/locales/BG.json")).default,
    SR: async () => (await import("@/locales/SR.json")).default,
    HR: async () => (await import("@/locales/HR.json")).default,
    SK: async () => (await import("@/locales/SK.json")).default,
    KA: async () => (await import("@/locales/KA.json")).default,
    TK: async () => (await import("@/locales/TK.json")).default,
    KY: async () => (await import("@/locales/KY.json")).default,
    TW: async () => (await import("@/locales/TW.json")).default,
    TA: async () => (await import("@/locales/TA.json")).default,
    SQ: async () => (await import("@/locales/SQ.json")).default,
    LT: async () => (await import("@/locales/LT.json")).default,
};

/**
 * Copy packs translate the inline {@link Copy} objects (and engine strings) for
 * languages other than Turkish and English. Entries are keyed by {@link copyKey}
 * of the English text, so an edited English source falls back to English until
 * it is translated again. `npm run i18n:extract` regenerates the source list.
 */
const packLoaders: Partial<Record<Language, () => Promise<Translations>>> = {
    RU: async () => (await import("@/locales/copy/RU.json")).default,
    AZ: async () => (await import("@/locales/copy/AZ.json")).default,
    ES: async () => (await import("@/locales/copy/ES.json")).default,
    KZ: async () => (await import("@/locales/copy/KZ.json")).default,
    JP: async () => (await import("@/locales/copy/JP.json")).default,
    CN: async () => (await import("@/locales/copy/CN.json")).default,
    KR: async () => (await import("@/locales/copy/KR.json")).default,
    HI: async () => (await import("@/locales/copy/HI.json")).default,
    DE: async () => (await import("@/locales/copy/DE.json")).default,
    NG: async () => (await import("@/locales/copy/NG.json")).default,
    FR: async () => (await import("@/locales/copy/FR.json")).default,
    BE: async () => (await import("@/locales/copy/BE.json")).default,
    NL: async () => (await import("@/locales/copy/NL.json")).default,
    PL: async () => (await import("@/locales/copy/PL.json")).default,
    NO: async () => (await import("@/locales/copy/NO.json")).default,
    FI: async () => (await import("@/locales/copy/FI.json")).default,
    SV: async () => (await import("@/locales/copy/SV.json")).default,
    EL: async () => (await import("@/locales/copy/EL.json")).default,
    AR: async () => (await import("@/locales/copy/AR.json")).default,
    PT: async () => (await import("@/locales/copy/PT.json")).default,
    IT: async () => (await import("@/locales/copy/IT.json")).default,
    UK: async () => (await import("@/locales/copy/UK.json")).default,
    ID: async () => (await import("@/locales/copy/ID.json")).default,
    VI: async () => (await import("@/locales/copy/VI.json")).default,
    CS: async () => (await import("@/locales/copy/CS.json")).default,
    RO: async () => (await import("@/locales/copy/RO.json")).default,
    HU: async () => (await import("@/locales/copy/HU.json")).default,
    UZ: async () => (await import("@/locales/copy/UZ.json")).default,
    FA: async () => (await import("@/locales/copy/FA.json")).default,
    HE: async () => (await import("@/locales/copy/HE.json")).default,
    UR: async () => (await import("@/locales/copy/UR.json")).default,
    BN: async () => (await import("@/locales/copy/BN.json")).default,
    TH: async () => (await import("@/locales/copy/TH.json")).default,
    MS: async () => (await import("@/locales/copy/MS.json")).default,
    TL: async () => (await import("@/locales/copy/TL.json")).default,
    SW: async () => (await import("@/locales/copy/SW.json")).default,
    DA: async () => (await import("@/locales/copy/DA.json")).default,
    BG: async () => (await import("@/locales/copy/BG.json")).default,
    SR: async () => (await import("@/locales/copy/SR.json")).default,
    HR: async () => (await import("@/locales/copy/HR.json")).default,
    SK: async () => (await import("@/locales/copy/SK.json")).default,
    KA: async () => (await import("@/locales/copy/KA.json")).default,
    TK: async () => (await import("@/locales/copy/TK.json")).default,
    KY: async () => (await import("@/locales/copy/KY.json")).default,
    TW: async () => (await import("@/locales/copy/TW.json")).default,
    TA: async () => (await import("@/locales/copy/TA.json")).default,
    SQ: async () => (await import("@/locales/copy/SQ.json")).default,
    LT: async () => (await import("@/locales/copy/LT.json")).default,
};

const EMPTY_PACK: Translations = {};

/** cyrb53: a fast 53-bit string hash; must match scripts/i18n-lib.mjs. */
function cyrb53(text: string) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        h1 = Math.imul(h1 ^ code, 2654435761);
        h2 = Math.imul(h2 ^ code, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

const keyCache = new Map<string, string>();

/** Stable key of an English source string inside the copy packs. */
export function copyKey(english: string) {
    let key = keyCache.get(english);
    if (key === undefined) {
        key = cyrb53(english).toString(36);
        if (keyCache.size > 20_000) keyCache.clear();
        keyCache.set(english, key);
    }
    return key;
}

/** Replaces {name} placeholders; unknown names are left as they are. */
export function formatCopy(text: string, vars?: Record<string, string | number>) {
    if (!vars) return text;
    return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

export function isLanguage(value: string | null | undefined): value is Language {
    return Boolean(value && value in loaders);
}

export function languageInfo(code: Language): LanguageInfo {
    return LANGUAGES.find((entry) => entry.code === code) ?? LANGUAGES[0];
}

function applyDocumentLanguage(code: Language) {
    const info = languageInfo(code);
    document.documentElement.lang = info.locale;
    document.documentElement.dir = info.dir;
}

/**
 * Component-local copy: every entry needs TR and EN. Other languages come from
 * an inline value when present, otherwise from the language's copy pack, and
 * finally fall back to English. Use {name} placeholders with tx(copy, vars)
 * instead of template literals so the text can be translated.
 */
export type Copy = { TR: string; EN: string; vars?: Record<string, string | number> } & Partial<Record<Language, string>>;

interface I18nContextType {
    language: Language;
    /** BCP 47 locale of the active language (for Intl APIs). */
    locale: string;
    dir: "ltr" | "rtl";
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
    /** Picks the active language from an inline {@link Copy} object and fills {placeholders}. */
    tx: (copy: Copy, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
    const [language, setActiveLanguage] = useState<Language>("TR");
    const [translations, setTranslations] = useState<Translations>(fallbackTR);
    const [pack, setPack] = useState<Translations>(EMPTY_PACK);

    const fetchLanguage = useCallback(async (next: Language) => {
        const [loaded, loadedPack] = await Promise.all([
            loaders[next](),
            packLoaders[next]?.().catch(() => EMPTY_PACK) ?? Promise.resolve(EMPTY_PACK),
        ]);
        return { loaded: loaded as Translations, loadedPack: loadedPack as Translations };
    }, []);

    const loadLanguage = useCallback(async (next: Language, persist = true) => {
        const { loaded, loadedPack } = await fetchLanguage(next);
        setTranslations(loaded);
        setPack(loadedPack);
        setActiveLanguage(next);
        applyDocumentLanguage(next);
        if (persist) {
            try {
                localStorage.setItem("hanogt_lang", next);
            } catch {
                // Storage can be blocked; the choice then lasts for this visit.
            }
        }
    }, [fetchLanguage]);

    useEffect(() => {
        let stored: string | null = null;
        try {
            stored = localStorage.getItem("hanogt_lang");
        } catch {
            stored = null;
        }
        let active = true;
        const apply = async (next: Language, persist: boolean) => {
            if (next !== "TR") {
                const { loaded, loadedPack } = await fetchLanguage(next);
                if (!active) return;
                setTranslations(loaded);
                setPack(loadedPack);
                setActiveLanguage(next);
                applyDocumentLanguage(next);
            }
            if (persist) {
                try {
                    localStorage.setItem("hanogt_lang", next);
                } catch {
                    // Storage can be blocked; the language is detected again next time.
                }
            }
        };
        if (isLanguage(stored)) {
            void apply(stored, false);
        } else {
            // First visit: the visitor's country, then the browser's languages.
            const browserTags = typeof navigator !== "undefined" ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : [];
            const timeout = typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(2_000) : undefined;
            fetch("/api/geo", { cache: "no-store", signal: timeout })
                .then((response) => (response.ok ? response.json() : null))
                .catch(() => null)
                .then((geo: { country?: string | null } | null) => {
                    if (active) void apply(detectLanguage(geo?.country, browserTags), true);
                });
        }
        return () => { active = false; };
    }, [fetchLanguage]);

    const setLanguage = useCallback((next: Language) => { void loadLanguage(next); }, [loadLanguage]);
    const value = useMemo<I18nContextType>(() => {
        const info = languageInfo(language);
        return {
            language,
            locale: info.locale,
            dir: info.dir,
            setLanguage,
            t: (key: string) => translations[key] || fallbackEN[key] || fallbackTR[key] || "",
            tx: (copy: Copy, extra?: Record<string, string | number>) => {
                const vars = extra ?? copy.vars;
                const own = copy[language] ?? (language === "TR" || language === "EN" ? undefined : pack[copyKey(copy.EN)]);
                if (own !== undefined) return formatCopy(own, vars);
                // Untranslated copy falls back to English. Inside right-to-left pages it is
                // wrapped in a left-to-right isolate so its punctuation stays at the end.
                const english = formatCopy(copy.EN, vars);
                return info.dir === "rtl" ? `\u2066${english}\u2069` : english;
            },
        };
    }, [language, setLanguage, translations, pack]);

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
    const context = useContext(I18nContext);
    if (!context) throw new Error("useI18n must be used within an I18nProvider");
    return context;
}
