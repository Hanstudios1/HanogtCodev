"use client";

import { Globe } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useI18n, Language } from "@/lib/i18n";

export default function LangToggle() {
    const { language, setLanguage } = useI18n();
    const [open, setOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const languages: { code: Language; name: string }[] = [
        { code: "TR", name: "Türkçe" },
        { code: "EN", name: "English" },
        { code: "RU", name: "Русский" },
        { code: "AZ", name: "Azərbaycan" },
        { code: "ES", name: "Español" },
        { code: "KZ", name: "Қазақ" },
        { code: "JP", name: "日本語" },
        { code: "CN", name: "中文" },
        { code: "KR", name: "한국어" },
        { code: "HI", name: "हिन्दी" },
        { code: "DE", name: "Deutsch" },
        { code: "NG", name: "Naijá" },
        { code: "FR", name: "Français" },
        { code: "BE", name: "Vlaams" },
        { code: "NL", name: "Nederlands" },
        { code: "PL", name: "Polski" },
        { code: "NO", name: "Norsk" },
        { code: "FI", name: "Suomi" },
        { code: "SV", name: "Svenska" },
        { code: "EL", name: "Ελληνικά" },
    ];

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        if (open) document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [open]);

    const handleSelect = (code: Language) => {
        setLanguage(code);
        setOpen(false);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-2 px-3 py-1 rounded-2xl border border-gray-300 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
            >
                <Globe className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{language}</span>
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-44 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-xl overflow-hidden z-[60] max-h-80 overflow-y-auto">
                    {languages.map((l) => (
                        <button
                            key={l.code}
                            onClick={() => handleSelect(l.code)}
                            className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center justify-between ${
                                language === l.code
                                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold"
                                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800"
                            }`}
                        >
                            <span>{l.name}</span>
                            <span className="text-xs text-zinc-400">{l.code}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
