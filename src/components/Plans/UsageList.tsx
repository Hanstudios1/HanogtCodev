"use client";

import { Code2, FolderCode, Gamepad2, KeyRound, Music, Sparkles, Star, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { currentWindow, formatResetTime, usageLevel, type CountedLimit, type PlanUsage, type UsageWindow } from "@/lib/ai/usage";
import { useI18n, type Copy } from "@/lib/i18n";

const C = {
    title: { TR: "Planının kullanımı", EN: "Your plan's usage" },
    aiWindow: { TR: "Hanogt AI mesajı ({days} gün)", EN: "Hanogt AI messages ({days} days)" },
    codeProjects: { TR: "Kod projesi", EN: "Code projects" },
    gameProjects: { TR: "Oyun projesi", EN: "Game projects" },
    groups: { TR: "Sahibi olduğun Hanogt Social grubu", EN: "Hanogt Social groups you own" },
    stars: { TR: "Yıldızlı mesaj", EN: "Starred messages" },
    gameAudio: { TR: "Oyun ses depolaması", EN: "Game audio storage" },
    gameAudioFiles: { TR: "{count} / {limit} dosya", EN: "{count} / {limit} files" },
    connections: { TR: "Yapay zekâ bağlantısı (kendi anahtarın)", EN: "AI connections (your own key)" },
    apiKeys: { TR: "Hanogt AI API anahtarı", EN: "Hanogt AI API keys" },
    unlimited: { TR: "sınırsız", EN: "unlimited" },
    notInPlan: { TR: "planında yok", EN: "not in your plan" },
    unknown: { TR: "okunamadı", EN: "couldn't be read" },
    resets: { TR: "Yenilenme: {time}", EN: "Renews: {time}" },
    window: { TR: "İlk mesajından itibaren {days} gün sayılır; sohbet, kendi bağlantıların ve geliştirici API'si birlikte.", EN: "Counted for {days} days from your first message; the chat, your own connections and the developer API together." },
    bonus: { TR: "+{count} ek mesaj dahil", EN: "includes +{count} extra messages" },
} satisfies Record<string, Copy>;

const BAR = { ok: "bg-brand-green", high: "bg-amber-500", full: "bg-rose-500" } as const;

function Row({ icon, label, value, children }: { icon: ReactNode; label: string; value: string; children?: ReactNode }) {
    return (
        <li className="py-2">
            <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-zinc-600 dark:text-zinc-300">{icon}<span className="truncate">{label}</span></span>
                <span className="shrink-0 font-bold tabular-nums text-zinc-900 dark:text-white">{value}</span>
            </div>
            {children}
        </li>
    );
}

function WindowBar({ window, label }: { window: UsageWindow; label: string }) {
    const level = usageLevel(window);
    return (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={window.limit} aria-valuenow={Math.min(window.used, window.limit)}>
            <div className={`h-full rounded-full ${BAR[level]}`} style={{ width: `${window.limit > 0 ? Math.min(100, (window.used / window.limit) * 100) : 100}%` }} />
        </div>
    );
}

/**
 * Every benefit of the plan with a number, as "used / limit": Hanogt AI
 * messages in the plan's window (when they renew; own connections count in
 * it too), code and game projects, groups, starred messages, game audio
 * storage and AI connections. In the Plans page's usage panel
 * (#usage, linked from the Hanogt AI usage meter).
 */
export default function UsageList({ usage }: { usage: PlanUsage }) {
    const { tx, locale } = useI18n();
    const number = (value: number) => value.toLocaleString(locale);
    const megabytes = (bytes: number) => (bytes / 1024 / 1024).toLocaleString(locale, { maximumFractionDigits: 1 });
    const counted = (item: CountedLimit) => {
        if (item.limit === 0) return tx(C.notInPlan);
        const used = item.used === null ? tx(C.unknown) : number(item.used);
        return item.limit === null ? `${used} · ${tx(C.unlimited)}` : `${used} / ${number(item.limit)}`;
    };
    const day = currentWindow(usage.hanogt.window);
    const days = usage.hanogt.windowDays;
    const icon = "h-3.5 w-3.5 shrink-0";

    return (
        <div className="w-full max-w-sm text-start" data-usage-list>
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{tx(C.title)}</p>
            <ul className="mt-1 divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
                <Row icon={<Sparkles className={`${icon} text-violet-500`} aria-hidden />} label={tx(C.aiWindow, { days })} value={`${number(day.used)} / ${number(day.limit)}`}>
                    <WindowBar window={day} label={tx(C.aiWindow, { days })} />
                    <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                        {day.resetsAt ? tx(C.resets, { time: formatResetTime(day.resetsAt, locale) }) : tx(C.window, { days })}
                        {usage.hanogt.bonus > 0 ? ` · ${tx(C.bonus, { count: number(usage.hanogt.bonus) })}` : ""}
                    </p>
                </Row>
                <Row icon={<FolderCode className={`${icon} text-emerald-500`} aria-hidden />} label={tx(C.codeProjects)} value={counted(usage.counts.codeProjects)} />
                <Row icon={<Gamepad2 className={`${icon} text-indigo-500`} aria-hidden />} label={tx(C.gameProjects)} value={counted(usage.counts.gameProjects)} />
                <Row icon={<UsersRound className={`${icon} text-amber-500`} aria-hidden />} label={tx(C.groups)} value={counted(usage.counts.groups)} />
                {usage.counts.stars ? <Row icon={<Star className={`${icon} text-amber-400`} aria-hidden />} label={tx(C.stars)} value={counted(usage.counts.stars)} /> : null}
                {usage.counts.gameAudio ? (
                    <Row icon={<Music className={`${icon} text-teal-500`} aria-hidden />} label={tx(C.gameAudio)} value={usage.counts.gameAudio.used === null ? tx(C.unknown) : `${megabytes(usage.counts.gameAudio.used)} / ${megabytes(usage.counts.gameAudio.limit)} MB`}>
                        {usage.counts.gameAudio.files !== null ? <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{tx(C.gameAudioFiles, { count: number(usage.counts.gameAudio.files), limit: number(usage.counts.gameAudio.fileLimit) })}</p> : null}
                    </Row>
                ) : null}
                <Row icon={<KeyRound className={`${icon} text-zinc-400`} aria-hidden />} label={tx(C.connections)} value={counted(usage.counts.connections)} />
                {usage.counts.apiKeys ? <Row icon={<Code2 className={`${icon} text-zinc-400`} aria-hidden />} label={tx(C.apiKeys)} value={counted(usage.counts.apiKeys)} /> : null}
            </ul>
        </div>
    );
}
