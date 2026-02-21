"use client";

import { Globe } from "lucide-react";
import { useState } from "react";
import { useI18n, Language } from "@/lib/i18n";

export default function LangToggle() {
    const { language, setLanguage } = useI18n();
    const [open, setOpen] = useState(false);

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
    ];

    const handleSelect = (code: Language) => {
        setLanguage(code);
        setOpen(false);
    };

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-2 px-3 py-1 rounded-2xl border border-gray-300 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
            >
                <Globe className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{language}</span>
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-xl overflow-hidden z-[60]">
                    {languages.map((l) => (
                        <button
                            key={l.code}
                            onClick={() => handleSelect(l.code)}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                        >
                            {l.name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
