"use client";

import { Code2, FolderCode, Gamepad2, KeyRound, Sparkles, UsersRound } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { currentWindow, formatResetTime, usageLevel, type CountedLimit, type PlanUsage, type UsageWindow } from "@/lib/ai/usage";
import { useI18n, type Copy } from "@/lib/i18n";

const C = {
    title: { TR: "Planının kullanımı", EN: "Your plan's usage" },
    aiWindow: { TR: "Hanogt AI mesajı ({days} gün)", EN: "Hanogt AI messages ({days} days)" },
    ownToday: { TR: "Kendi bağlantılarınla mesaj (bugün)", EN: "Messages through your own connections (today)" },
    codeProjects: { TR: "Kod projesi", EN: "Code projects" },
    gameProjects: { TR: "Oyun projesi", EN: "Game projects" },
    groups: { TR: "Sahibi olduğun Hanogt Social grubu", EN: "Hanogt Social groups you own" },
    connections: { TR: "Yapay zekâ bağlantısı (kendi anahtarın)", EN: "AI connections (your own key)" },
    apiKeys: { TR: "Hanogt AI API anahtarı", EN: "Hanogt AI API keys" },
    unlimited: { TR: "sınırsız", EN: "unlimited" },
    notInPlan: { TR: "planında yok", EN: "not in your plan" },
    unknown: { TR: "okunamadı", EN: "couldn't be read" },
    resets: { TR: "Yenilenme: {time}", EN: "Renews: {time}" },
    window: { TR: "İlk mesajından itibaren {days} gün sayılır; sohbet ve geliştirici API'si birlikte.", EN: "Counted for {days} days from your first message; the chat and the developer API together." },
    bonus: { TR: "+{count} ek mesaj dahil", EN: "includes +{count} extra messages" },
} satisfies Record<string, Copy>;

const BAR = { ok: "from-indigo-500 to-fuchsia-500", high: "from-amber-400 to-amber-500", full: "from-rose-500 to-rose-600" } as const;

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
            <div className={`h-full rounded-full bg-gradient-to-r ${BAR[level]}`} style={{ width: `${window.limit > 0 ? Math.min(100, (window.used / window.limit) * 100) : 100}%` }} />
        </div>
    );
}

/**
 * Every benefit of the plan with a number, as "used / limit": Hanogt AI
 * messages in the plan's window (when they renew), own-connection messages, code and game
 * projects, groups and AI connections. On the Plans page's account box
 * (#usage, linked from the Hanogt AI usage meter).
 */
export default function UsageList({ usage }: { usage: PlanUsage }) {
    const { tx, locale } = useI18n();
    // Linked as /plans#usage: the list appears after the page loads, so it is scrolled to once it's there.
    useEffect(() => {
        if (window.location.hash === "#usage") document.getElementById("usage")?.scrollIntoView({ block: "center" });
    }, []);
    const number = (value: number) => value.toLocaleString(locale);
    const counted = (item: CountedLimit) => {
        if (item.limit === 0) return tx(C.notInPlan);
        const used = item.used === null ? tx(C.unknown) : number(item.used);
        return item.limit === null ? `${used} · ${tx(C.unlimited)}` : `${used} / ${number(item.limit)}`;
    };
    const day = currentWindow(usage.hanogt.window);
    const days = usage.hanogt.windowDays;
    const ownDay = usage.own ? currentWindow(usage.own.day) : null;
    const icon = "h-3.5 w-3.5 shrink-0";

    return (
        <div id="usage" className="w-full max-w-sm scroll-mt-24 text-start">
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{tx(C.title)}</p>
            <ul className="mt-1 divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
                <Row icon={<Sparkles className={`${icon} text-violet-500`} aria-hidden />} label={tx(C.aiWindow, { days })} value={`${number(day.used)} / ${number(day.limit)}`}>
                    <WindowBar window={day} label={tx(C.aiWindow, { days })} />
                    <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                        {day.resetsAt ? tx(C.resets, { time: formatResetTime(day.resetsAt, locale) }) : tx(C.window, { days })}
                        {usage.hanogt.bonus > 0 ? ` · ${tx(C.bonus, { count: number(usage.hanogt.bonus) })}` : ""}
                    </p>
                </Row>
                {ownDay ? (
                    <Row icon={<KeyRound className={`${icon} text-sky-500`} aria-hidden />} label={tx(C.ownToday)} value={`${number(ownDay.used)} / ${number(ownDay.limit)}`}>
                        <WindowBar window={ownDay} label={tx(C.ownToday)} />
                    </Row>
                ) : null}
                <Row icon={<FolderCode className={`${icon} text-emerald-500`} aria-hidden />} label={tx(C.codeProjects)} value={counted(usage.counts.codeProjects)} />
                <Row icon={<Gamepad2 className={`${icon} text-indigo-500`} aria-hidden />} label={tx(C.gameProjects)} value={counted(usage.counts.gameProjects)} />
                <Row icon={<UsersRound className={`${icon} text-amber-500`} aria-hidden />} label={tx(C.groups)} value={counted(usage.counts.groups)} />
                <Row icon={<KeyRound className={`${icon} text-zinc-400`} aria-hidden />} label={tx(C.connections)} value={counted(usage.counts.connections)} />
                {usage.counts.apiKeys ? <Row icon={<Code2 className={`${icon} text-zinc-400`} aria-hidden />} label={tx(C.apiKeys)} value={counted(usage.counts.apiKeys)} /> : null}
            </ul>
        </div>
    );
}
