"use client";

import { Sparkles } from "lucide-react";
import { useI18n, type Copy } from "@/lib/i18n";
import type { TemplateInfo } from "@/lib/game-engine/templates";

export const DIFFICULTY_COPY: Record<TemplateInfo["difficulty"], Copy> = {
    starter: { TR: "Başlangıç: ilk oyunun için ideal", EN: "Starter: ideal for your first game" },
    easy: { TR: "Kolay: birkaç betik, net bir oyun döngüsü", EN: "Easy: a few scripts and a clear game loop" },
    medium: { TR: "Orta: birden çok sistem birlikte çalışır", EN: "Medium: several systems working together" },
};

export const DIFFICULTY_LABEL: Record<TemplateInfo["difficulty"], Copy> = {
    starter: { TR: "Başlangıç", EN: "Starter" },
    easy: { TR: "Kolay", EN: "Easy" },
    medium: { TR: "Orta", EN: "Medium" },
};

const NEW: Copy = { TR: "Yeni", EN: "New" };

/** "New", dimension, languages and difficulty of a template. */
export function TemplateBadges({ template, compact = false }: { template: TemplateInfo; locale: "tr" | "en"; compact?: boolean }) {
    const { tx } = useI18n();
    const level = template.difficulty === "starter" ? 1 : template.difficulty === "easy" ? 2 : 3;
    const chip = "inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-bold";
    return (
        <span className="flex flex-wrap items-center gap-1.5">
            {template.isNew ? <span className={`${chip} bg-zinc-900 text-white dark:bg-white dark:text-zinc-900`}><Sparkles className="h-3 w-3" aria-hidden />{tx(NEW)}</span> : null}
            {template.since ? <span className={`${chip} border border-violet-500/30 text-violet-700 dark:text-violet-300`}>V{template.since}</span> : null}
            <span className={`${chip} border border-zinc-200 uppercase text-zinc-600 dark:border-white/10 dark:text-zinc-300`}>{template.dimension}</span>
            {template.languages.map((language) => <span key={language} className={`${chip} border border-zinc-200 text-zinc-600 dark:border-white/10 dark:text-zinc-300`} dir="ltr">{language}</span>)}
            {compact ? null : (
                <span className={`${chip} text-zinc-500 dark:text-zinc-400`} title={tx(DIFFICULTY_COPY[template.difficulty])}>
                    <span className="flex gap-0.5" aria-hidden>{[1, 2, 3].map((dot) => <span key={dot} className={`h-1.5 w-1.5 rounded-full ${dot <= level ? "bg-gradient-to-r from-violet-500 to-pink-500" : "bg-zinc-300 dark:bg-white/15"}`} />)}</span>
                    {tx(DIFFICULTY_LABEL[template.difficulty])}
                </span>
            )}
        </span>
    );
}
