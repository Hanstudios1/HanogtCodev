"use client";

import { useState } from "react";
import { X, Sparkles, Shield, Globe, MessageSquare, Users, Palette, Bell, Mic, Phone, Info } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface ChangelogEntry {
    id: string;
    date: string; // ISO format
    icon: React.ReactNode;
    titleKey: string;
    descKey: string;
    category: "feature" | "fix" | "improvement" | "security";
}

const CHANGELOG_ENTRIES: Omit<ChangelogEntry, "icon">[] = [
    {
        id: "v1.8",
        date: "2026-03-08T23:30:00+03:00",
        titleKey: "changelog_v18_title",
        descKey: "changelog_v18_desc",
        category: "feature",
    },
    {
        id: "v1.7",
        date: "2026-03-08T22:00:00+03:00",
        titleKey: "changelog_v17_title",
        descKey: "changelog_v17_desc",
        category: "improvement",
    },
    {
        id: "v1.6",
        date: "2026-03-08T20:00:00+03:00",
        titleKey: "changelog_v16_title",
        descKey: "changelog_v16_desc",
        category: "feature",
    },
    {
        id: "v1.5",
        date: "2026-03-07T18:00:00+03:00",
        titleKey: "changelog_v15_title",
        descKey: "changelog_v15_desc",
        category: "feature",
    },
    {
        id: "v1.4",
        date: "2026-03-06T15:00:00+03:00",
        titleKey: "changelog_v14_title",
        descKey: "changelog_v14_desc",
        category: "fix",
    },
    {
        id: "v1.3",
        date: "2026-03-05T12:00:00+03:00",
        titleKey: "changelog_v13_title",
        descKey: "changelog_v13_desc",
        category: "security",
    },
];

const CATEGORY_CONFIG = {
    feature: { color: "bg-blue-500", label: "✨" },
    fix: { color: "bg-orange-500", label: "🔧" },
    improvement: { color: "bg-green-500", label: "📈" },
    security: { color: "bg-red-500", label: "🔒" },
};

const ICONS_MAP: Record<string, React.ReactNode> = {
    "v1.8": <Info className="w-5 h-5" />,
    "v1.7": <Globe className="w-5 h-5" />,
    "v1.6": <MessageSquare className="w-5 h-5" />,
    "v1.5": <Users className="w-5 h-5" />,
    "v1.4": <Palette className="w-5 h-5" />,
    "v1.3": <Shield className="w-5 h-5" />,
};

export default function ChangelogModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const { t } = useI18n();

    if (!isOpen) return null;

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const hours = date.getHours().toString().padStart(2, "0");
        const minutes = date.getMinutes().toString().padStart(2, "0");
        const day = date.getDate().toString().padStart(2, "0");
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        const year = date.getFullYear();
        return `${hours}:${minutes} — ${day}.${month}.${year}`;
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-end p-4" onClick={onClose}>
            <div
                className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-md h-[85vh] overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col mr-0 md:mr-4 animate-in slide-in-from-right duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-gradient-to-r from-blue-600 to-purple-600">
                    <div className="flex items-center gap-3">
                        <Sparkles className="w-5 h-5 text-white" />
                        <h2 className="text-lg font-bold text-white">{t("changelog_title") || "Yeni Değişiklikler"}</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Entries */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {CHANGELOG_ENTRIES.map((entry) => {
                        const catConfig = CATEGORY_CONFIG[entry.category];
                        return (
                            <div key={entry.id} className="group">
                                <div className="flex items-start gap-3">
                                    {/* Timeline dot */}
                                    <div className="flex flex-col items-center">
                                        <div className={`w-10 h-10 rounded-xl ${catConfig.color} flex items-center justify-center text-white shadow-lg`}>
                                            {ICONS_MAP[entry.id] || <Sparkles className="w-5 h-5" />}
                                        </div>
                                        <div className="w-0.5 h-full bg-zinc-200 dark:bg-zinc-700 mt-2" />
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 pb-4">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm font-bold text-zinc-900 dark:text-white">
                                                {entry.id.toUpperCase()}
                                            </span>
                                            <span className="text-[11px] text-zinc-400 font-mono bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                                                {formatDate(entry.date)}
                                            </span>
                                        </div>
                                        <h3 className="font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
                                            {t(entry.titleKey) || entry.titleKey}
                                        </h3>
                                        <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                            {t(entry.descKey) || entry.descKey}
                                        </p>
                                        <div className="flex items-center gap-2 mt-2">
                                            <span className="text-lg">{catConfig.label}</span>
                                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full text-white ${catConfig.color}`}>
                                                {t(`changelog_${entry.category}`) || entry.category}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
