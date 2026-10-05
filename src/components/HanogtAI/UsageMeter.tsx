"use client";

import { ArrowUpRight, Gauge, KeyRound, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { currentWindow, formatResetTime, usageLevel, type UsageWindow } from "@/lib/ai/usage";
import { useI18n, type Copy } from "@/lib/i18n";
import { PLAN_AI_LIMITS, PLAN_COPY, aiWindowCopy, nextPlanUp } from "@/lib/plans";
import type { AiUsageHandle } from "./usage-store";
import { cx } from "./ui";

const C = {
    title: { TR: "Hanogt AI kullanımın", EN: "Your Hanogt AI usage" },
    pill: { TR: "{period} {used} / {limit}", EN: "{period} {used} / {limit}" },
    pillLabel: { TR: "{period} {limit} mesajın {used} tanesini kullandın. Ayrıntılar için aç.", EN: "{period}: you've used {used} of {limit} messages. Open for details." },
    week: { TR: "Bu hafta", EN: "This week" },
    twoWeeks: { TR: "Bu 2 hafta", EN: "These 2 weeks" },
    days: { TR: "{days} gün", EN: "{days} days" },
    messages: { TR: "Mesajların ({period})", EN: "Your messages ({period})" },
    left: { TR: "{count} mesaj kaldı", EN: "{count} messages left" },
    none: { TR: "Bu dönemin hakkı doldu", EN: "This period's messages are used up" },
    resets: { TR: "Yenilenme: {time}", EN: "Renews: {time}" },
    window: { TR: "Sayaç ilk mesajınla başlar ve {days} gün sürer. Sohbet, geliştirici API'si ve gruplardaki Hanogt AI aynı haktan düşer.", EN: "The count starts with your first message and lasts {days} days. The chat, the developer API and Hanogt AI in groups share it." },
    perMinute: { TR: "Dakikada en fazla {count} mesaj", EN: "Up to {count} messages a minute" },
    bonus: { TR: "Hanogt ekibinden +{count} ek mesaj dahil", EN: "Includes +{count} extra messages from the Hanogt team" },
    own: { TR: "Kendi bağlantıların (bugün)", EN: "Your own connections (today)" },
    ownHint: { TR: "Kendi API anahtarınla gönderdiklerin Hanogt AI hakkından düşmez.", EN: "Messages sent with your own API key don't use your Hanogt AI messages." },
    upgrade: { TR: "Planını yükselt", EN: "Upgrade your plan" },
    upgradeHint: { TR: "{plan} ile {period} {count} mesaj", EN: "{count} messages {period} with {plan}" },
    details: { TR: "Tüm plan hakların", EN: "All your plan benefits" },
    loading: { TR: "Kullanım yükleniyor…", EN: "Loading usage…" },
    failed: { TR: "Kullanım şu anda okunamadı.", EN: "Usage can't be read right now." },
    retry: { TR: "Tekrar dene", EN: "Try again" },
} satisfies Record<string, Copy>;

const LEVEL_PILL = {
    ok: "border-ai-line text-ai-ink/75",
    high: "border-amber-400/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    full: "border-rose-400/50 bg-rose-500/10 text-rose-700 dark:text-rose-300",
} as const;
const LEVEL_BAR = { ok: "bg-brand-green", high: "bg-amber-500", full: "bg-rose-500" } as const;

/** Re-renders every minute, so a window that ended shows as fresh. */
function useMinuteClock() {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 60_000);
        return () => window.clearInterval(timer);
    }, []);
    return now;
}

function Bar({ window: shown, label }: { window: UsageWindow; label: string }) {
    const level = usageLevel(shown);
    const percent = shown.limit > 0 ? Math.min(100, (shown.used / shown.limit) * 100) : 100;
    return (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={shown.limit} aria-valuenow={Math.min(shown.used, shown.limit)}>
            <div className={cx("h-full rounded-full transition-[width]", LEVEL_BAR[level])} style={{ width: `${percent}%` }} />
        </div>
    );
}

/**
 * "This week 12 / 50": Hanogt AI messages used in the plan's window, in the
 * /ai top bar and the floating panel's header. Amber from 80 %, red when
 * nothing is left; opens a card with when the count renews, the minute limit,
 * a staff grant, the person's own connections and a way to a bigger plan.
 */
export default function UsageMeter({ handle, variant, onNavigate }: { handle: AiUsageHandle; variant: "panel" | "page"; onNavigate?: () => void }) {
    const { tx, locale } = useI18n();
    const now = useMinuteClock();
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const button = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!open) return;
        const onPointer = (event: PointerEvent) => {
            if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpen(false);
                button.current?.focus();
            }
        };
        window.addEventListener("pointerdown", onPointer);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("pointerdown", onPointer);
            window.removeEventListener("keydown", onKey);
        };
    }, [open]);

    if (!handle.available) return null;
    const usage = handle.usage;
    if (!usage) {
        // Nothing to show yet; a failed first load offers a retry in the same place.
        return handle.failed ? (
            <button type="button" onClick={handle.refresh} className="inline-flex h-7 items-center gap-1 rounded-full border border-ai-line px-2 text-[11.5px] font-semibold text-ai-muted hover:text-ai-ink" title={tx(C.failed)}>
                <Gauge className="h-3.5 w-3.5" aria-hidden />{tx(C.retry)}
            </button>
        ) : null;
    }

    const day = currentWindow(usage.hanogt.window, now);
    const level = usageLevel(day);
    const ownDay = usage.own ? currentWindow(usage.own.day, now) : null;
    const nextPlan = nextPlanUp(usage.plan);
    const days = usage.hanogt.windowDays;
    const period = tx(days === 7 ? C.week : days === 14 ? C.twoWeeks : C.days, { days });
    const pillText = tx(C.pill, { period, used: day.used.toLocaleString(locale), limit: day.limit.toLocaleString(locale) });

    return (
        <div ref={root} className="relative flex shrink-0">
            <button
                ref={button}
                type="button"
                onClick={() => setOpen((current) => !current)}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={tx(C.pillLabel, { period, used: day.used, limit: day.limit })}
                data-usage-meter={level}
                className={cx(
                    "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-semibold tabular-nums transition hover:bg-ai-ink/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-ink/30",
                    LEVEL_PILL[level],
                )}
            >
                <Gauge className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className={cx(variant === "panel" && "max-[380px]:hidden")}>{pillText}</span>
            </button>
            {open ? (
                <div
                    role="dialog"
                    aria-label={tx(C.title)}
                    className="absolute end-0 top-full z-40 mt-2 w-[18.5rem] rounded-2xl border border-ai-line bg-ai-surface p-3.5 text-start shadow-xl shadow-zinc-900/10 max-sm:fixed max-sm:inset-x-3 max-sm:top-16 max-sm:mt-0 max-sm:w-auto"
                >
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-black text-ai-ink">{tx(C.title)}</p>
                        <span className="rounded-full bg-brand-green/10 px-2 py-0.5 text-[11px] font-bold text-brand-green">{tx(PLAN_COPY[usage.plan].name)}</span>
                    </div>

                    <div className="mt-3">
                        <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                            <span className="inline-flex items-center gap-1.5 font-semibold text-ai-ink/85"><Sparkles className="h-3.5 w-3.5 text-brand-green" aria-hidden />{tx(C.messages, { period: period.toLocaleLowerCase(locale) })}</span>
                            <span className="font-bold tabular-nums text-ai-ink">{day.used.toLocaleString(locale)} / {day.limit.toLocaleString(locale)}</span>
                        </div>
                        <Bar window={day} label={tx(C.messages, { period: period.toLocaleLowerCase(locale) })} />
                        <p className={cx("mt-1.5 text-[11.5px]", level === "full" ? "font-semibold text-rose-600 dark:text-rose-300" : "text-ai-muted")}>
                            {day.remaining > 0 ? tx(C.left, { count: day.remaining.toLocaleString(locale) }) : tx(C.none)}
                            {day.resetsAt ? ` · ${tx(C.resets, { time: formatResetTime(day.resetsAt, locale, now) })}` : ""}
                        </p>
                        <p className="mt-1 text-[11px] leading-snug text-ai-muted">{tx(C.window, { days })} {tx(C.perMinute, { count: usage.hanogt.minute.limit })}.</p>
                        {usage.hanogt.bonus > 0 ? <p className="mt-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">{tx(C.bonus, { count: usage.hanogt.bonus.toLocaleString(locale) })}</p> : null}
                    </div>

                    {ownDay ? (
                        <div className="mt-3 border-t border-ai-line pt-3">
                            <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                                <span className="inline-flex items-center gap-1.5 font-semibold text-ai-ink/85"><KeyRound className="h-3.5 w-3.5 text-sky-500" aria-hidden />{tx(C.own)}</span>
                                <span className="font-bold tabular-nums text-ai-ink">{ownDay.used.toLocaleString(locale)} / {ownDay.limit.toLocaleString(locale)}</span>
                            </div>
                            <Bar window={ownDay} label={tx(C.own)} />
                            <p className="mt-1.5 text-[11px] leading-snug text-ai-muted">{tx(C.ownHint)}</p>
                        </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-ai-line pt-3 text-[12px] font-semibold">
                        {nextPlan ? (
                            <Link href="/plans" onClick={() => { setOpen(false); onNavigate?.(); }} className="inline-flex items-center gap-1 text-brand-green hover:underline" title={tx(C.upgradeHint, { plan: tx(PLAN_COPY[nextPlan].name), period: tx(aiWindowCopy(PLAN_AI_LIMITS[nextPlan].windowDays)), count: PLAN_AI_LIMITS[nextPlan].perWindow.toLocaleString(locale) })} data-usage-upgrade>
                                {tx(C.upgrade)}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                            </Link>
                        ) : null}
                        <Link href="/plans#usage" onClick={() => { setOpen(false); onNavigate?.(); }} className="text-ai-muted hover:text-ai-ink hover:underline">{tx(C.details)}</Link>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
