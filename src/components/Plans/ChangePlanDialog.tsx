"use client";

import { ArrowRight, LoaderCircle, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import { formatMoney, type BillingInterval, type PlanChangePreview } from "@/lib/paddle";

const C = {
    title: { TR: "Planını değiştir", EN: "Change your plan" },
    from: { TR: "Şu anki plan", EN: "Current plan" },
    to: { TR: "Yeni plan", EN: "New plan" },
    month: { TR: "Aylık", EN: "Monthly" },
    year: { TR: "Yıllık", EN: "Yearly" },
    loading: { TR: "Tutar hesaplanıyor…", EN: "Working out the amount…" },
    charge: { TR: "Bugün {amount} tahsil edilecek. Bu, mevcut dönemin kalan günleri için iki plan arasındaki farktır.", EN: "{amount} will be charged today: the difference between the two plans for the rest of the current period." },
    chargePeriod: { TR: "Bugün {amount} tahsil edilecek: yeni ödeme dönemi bugün başlar ve mevcut dönemin kullanılmamış kısmı bu tutardan düşülür.", EN: "{amount} will be charged today: the new billing period starts today and the unused part of your current period is taken off." },
    trial: { TR: "Deneme süren devam ediyor; şimdi ücret alınmaz. İlk ödeme yeni plan üzerinden alınır.", EN: "Your free trial continues and nothing is charged now. The first payment is for the new plan." },
    scheduledEnd: { TR: "Planlanmış iptalin geçerli kalır: aboneliğin {date} tarihinde sona erer. Devam etmesini istersen önce \"Vazgeç, aboneliğim devam etsin\"e bas.", EN: "Your scheduled cancellation stays: your subscription ends on {date}. To keep it going, first press \"Undo, keep my subscription\"." },
    credit: { TR: "Hesabına {amount} alacak eklenecek ve sonraki ödemelerinden düşülecek.", EN: "{amount} will be credited to your account and taken off your next payments." },
    none: { TR: "Şimdi ek bir ödeme yok.", EN: "There's nothing to pay now." },
    next: { TR: "Sonraki ödeme: {date} · {amount}", EN: "Next payment: {date} · {amount}" },
    immediate: { TR: "Yeni planın avantajları hemen geçerli olur.", EN: "Your new plan's benefits apply right away." },
    confirm: { TR: "Onayla ve değiştir", EN: "Confirm and change" },
    cancel: { TR: "Vazgeç", EN: "Cancel" },
    close: { TR: "Kapat", EN: "Close" },
} satisfies Record<string, Copy>;

export type PlanChoice = { name: string; interval: BillingInterval };

/** Shows what switching plans costs now (Paddle's prorated preview) before the person confirms. */
export default function ChangePlanDialog({ from, to, preview, error, busy, endsAt = null, onConfirm, onClose }: {
    from: PlanChoice;
    to: PlanChoice;
    preview: PlanChangePreview | null;
    error: string;
    busy: boolean;
    /** A cancellation the person scheduled: it stays in place after the change. */
    endsAt?: string | null;
    onConfirm: () => void;
    onClose: () => void;
}) {
    const { tx, locale } = useI18n();
    const titleId = useId();
    const confirmRef = useRef<HTMLButtonElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    // The page passes a new onClose on every render; reading it through a ref keeps focus where it is.
    const latest = useRef({ busy, onClose });
    useEffect(() => {
        latest.current = { busy, onClose };
    });

    useEffect(() => {
        closeRef.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !latest.current.busy) latest.current.onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    useEffect(() => {
        if (preview) confirmRef.current?.focus();
    }, [preview]);

    const money = (amount: string, currency: string) => formatMoney(amount, currency, locale);
    const date = (iso: string) => {
        try {
            return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
        } catch {
            return iso.slice(0, 10);
        }
    };
    const label = (choice: PlanChoice) => `${choice.name} · ${tx(choice.interval === "year" ? C.year : C.month)}`;

    return (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
            <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-900">
                <div className="flex items-start justify-between gap-4">
                    <h2 id={titleId} className="text-xl font-black">{tx(C.title)}</h2>
                    <button ref={closeRef} type="button" onClick={onClose} disabled={busy} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-white/10" aria-label={tx(C.close)}>
                        <X className="h-4 w-4" aria-hidden />
                    </button>
                </div>
                <div className="mt-4 flex items-center gap-3 rounded-2xl bg-zinc-50 p-4 text-[14px] dark:bg-white/[0.04]">
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">{tx(C.from)}</p>
                        <p className="mt-0.5 truncate font-bold">{label(from)}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-zinc-400 rtl:rotate-180" aria-hidden />
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">{tx(C.to)}</p>
                        <p className="mt-0.5 truncate font-bold text-indigo-600 dark:text-indigo-300">{label(to)}</p>
                    </div>
                </div>
                <div className="mt-4 min-h-[4.5rem] text-[14px] leading-relaxed text-zinc-700 dark:text-zinc-300" aria-live="polite">
                    {preview ? (
                        <>
                            <p>
                                {preview.trialing
                                    ? tx(C.trial)
                                    : preview.result === "charge"
                                        ? tx(from.interval === to.interval ? C.charge : C.chargePeriod, { amount: money(preview.amount, preview.currency) })
                                        : preview.result === "credit"
                                            ? tx(C.credit, { amount: money(preview.amount, preview.currency) })
                                            : tx(C.none)}
                            </p>
                            {preview.nextBilledAt && preview.nextAmount ? <p className="mt-2 text-[13px] text-zinc-500">{tx(C.next, { date: date(preview.nextBilledAt), amount: money(preview.nextAmount, preview.currency) })}</p> : null}
                            <p className="mt-2 text-[13px] text-zinc-500">{tx(C.immediate)}</p>
                            {endsAt ? <p className="mt-2 text-[13px] font-semibold text-amber-700 dark:text-amber-300">{tx(C.scheduledEnd, { date: date(endsAt) })}</p> : null}
                        </>
                    ) : error ? null : (
                        <p className="flex items-center gap-2 text-zinc-500"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />{tx(C.loading)}</p>
                    )}
                    {error ? <p role="alert" className="mt-2 font-semibold text-rose-600 dark:text-rose-400">{error}</p> : null}
                </div>
                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" onClick={onClose} disabled={busy} className="h-11 rounded-xl border border-zinc-200 px-5 text-[14px] font-bold transition hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5">{tx(C.cancel)}</button>
                    <button ref={confirmRef} type="button" onClick={onConfirm} disabled={busy || !preview} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 text-[14px] font-bold text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
                        {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : null}
                        {tx(C.confirm)}
                    </button>
                </div>
            </div>
        </div>
    );
}
