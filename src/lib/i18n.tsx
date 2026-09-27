"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import tr from "@/locales/TR.json";
import en from "@/locales/EN.json";

export type Language =
    | "TR" | "EN" | "RU" | "AZ" | "ES" | "KZ" | "JP" | "CN" | "KR" | "HI" | "DE" | "NG" | "FR" | "BE" | "NL" | "PL" | "NO" | "FI" | "SV" | "EL";
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
    { code: "RU", name: "Русский", english: "Russian", locale: "ru-RU", dir: "ltr", flag: "🇷🇺" },
    { code: "AZ", name: "Azərbaycan", english: "Azerbaijani", locale: "az-AZ", dir: "ltr", flag: "🇦🇿" },
    { code: "KZ", name: "Қазақ", english: "Kazakh", locale: "kk-KZ", dir: "ltr", flag: "🇰🇿" },
    { code: "JP", name: "日本語", english: "Japanese", locale: "ja-JP", dir: "ltr", flag: "🇯🇵" },
    { code: "CN", name: "中文", english: "Chinese", locale: "zh-CN", dir: "ltr", flag: "🇨🇳" },
    { code: "KR", name: "한국어", english: "Korean", locale: "ko-KR", dir: "ltr", flag: "🇰🇷" },
    { code: "HI", name: "हिन्दी", english: "Hindi", locale: "hi-IN", dir: "ltr", flag: "🇮🇳" },
    { code: "NG", name: "Naijá", english: "Nigerian Pidgin", locale: "pcm-NG", dir: "ltr", flag: "🇳🇬" },
    { code: "NL", name: "Nederlands", english: "Dutch", locale: "nl-NL", dir: "ltr", flag: "🇳🇱" },
    { code: "BE", name: "Vlaams", english: "Flemish", locale: "nl-BE", dir: "ltr", flag: "🇧🇪" },
    { code: "PL", name: "Polski", english: "Polish", locale: "pl-PL", dir: "ltr", flag: "🇵🇱" },
    { code: "NO", name: "Norsk", english: "Norwegian", locale: "nb-NO", dir: "ltr", flag: "🇳🇴" },
    { code: "SV", name: "Svenska", english: "Swedish", locale: "sv-SE", dir: "ltr", flag: "🇸🇪" },
    { code: "FI", name: "Suomi", english: "Finnish", locale: "fi-FI", dir: "ltr", flag: "🇫🇮" },
    { code: "EL", name: "Ελληνικά", english: "Greek", locale: "el-GR", dir: "ltr", flag: "🇬🇷" },
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
};

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

/** Component-local copy: every entry needs TR and EN; other languages fall back to EN. */
export type Copy = { TR: string; EN: string } & Partial<Record<Language, string>>;

interface I18nContextType {
    language: Language;
    /** BCP 47 locale of the active language (for Intl APIs). */
    locale: string;
    dir: "ltr" | "rtl";
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
    /** Picks the active language from an inline {@link Copy} object. */
    tx: (copy: Copy) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
    const [language, setActiveLanguage] = useState<Language>("TR");
    const [translations, setTranslations] = useState<Translations>(fallbackTR);

    const loadLanguage = useCallback(async (next: Language, persist = true) => {
        const loaded = await loaders[next]();
        setTranslations(loaded as Translations);
        setActiveLanguage(next);
        applyDocumentLanguage(next);
        if (persist) {
            try {
                localStorage.setItem("hanogt_lang", next);
            } catch {
                // Storage can be blocked; the choice then lasts for this visit.
            }
        }
    }, []);

    useEffect(() => {
        let stored: string | null = null;
        try {
            stored = localStorage.getItem("hanogt_lang");
        } catch {
            stored = null;
        }
        if (!isLanguage(stored) || stored === "TR") return;
        let active = true;
        loaders[stored]().then((loaded) => {
            if (!active) return;
            setTranslations(loaded as Translations);
            setActiveLanguage(stored);
            applyDocumentLanguage(stored);
        });
        return () => { active = false; };
    }, []);

    const setLanguage = useCallback((next: Language) => { void loadLanguage(next); }, [loadLanguage]);
    const value = useMemo<I18nContextType>(() => {
        const info = languageInfo(language);
        return {
            language,
            locale: info.locale,
            dir: info.dir,
            setLanguage,
            t: (key: string) => translations[key] || fallbackEN[key] || fallbackTR[key] || "",
            tx: (copy: Copy) => copy[language] ?? copy.EN,
        };
    }, [language, setLanguage, translations]);

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
    const context = useContext(I18nContext);
    if (!context) throw new Error("useI18n must be used within an I18nProvider");
    return context;
}
