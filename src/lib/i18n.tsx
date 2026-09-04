"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import tr from "@/locales/TR.json";
import en from "@/locales/EN.json";

export type Language = "TR" | "EN" | "RU" | "AZ" | "ES" | "KZ" | "JP" | "CN" | "KR" | "HI" | "DE" | "NG" | "FR" | "BE" | "NL" | "PL" | "NO" | "FI" | "SV" | "EL";
type Translations = Record<string, string>;

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

function isLanguage(value: string | null): value is Language {
    return Boolean(value && value in loaders);
}

interface I18nContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
    const [language, setActiveLanguage] = useState<Language>("TR");
    const [translations, setTranslations] = useState<Translations>(fallbackTR);

    const loadLanguage = useCallback(async (next: Language, persist = true) => {
        const loaded = await loaders[next]();
        setTranslations(loaded as Translations);
        setActiveLanguage(next);
        document.documentElement.lang = next.toLowerCase();
        if (persist) localStorage.setItem("hanogt_lang", next);
    }, []);

    useEffect(() => {
        const stored = localStorage.getItem("hanogt_lang");
        if (!isLanguage(stored) || stored === "TR") return;
        let active = true;
        loaders[stored]().then((loaded) => {
            if (!active) return;
            setTranslations(loaded as Translations);
            setActiveLanguage(stored);
            document.documentElement.lang = stored.toLowerCase();
        });
        return () => { active = false; };
    }, []);

    const setLanguage = useCallback((next: Language) => { void loadLanguage(next); }, [loadLanguage]);
    const value = useMemo<I18nContextType>(() => ({
        language,
        setLanguage,
        t: (key: string) => translations[key] || fallbackEN[key] || fallbackTR[key] || "",
    }), [language, setLanguage, translations]);

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
    const context = useContext(I18nContext);
    if (!context) throw new Error("useI18n must be used within an I18nProvider");
    return context;
}
