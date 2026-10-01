"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n, type Copy } from "@/lib/i18n";

type Quote = { id: string; value: number; change: number | null; currency: "TRY" | "USD" | null; decimals: number };
type Snapshot = { quotes: Quote[]; updatedAt: string; source: string };

const LABELS: Record<string, Copy> = {
    usdtry: { TR: "Dolar", EN: "USD/TRY" },
    eurtry: { TR: "Euro", EN: "EUR/TRY" },
    gbptry: { TR: "Sterlin", EN: "GBP/TRY" },
    "gold-gram": { TR: "Gram altın", EN: "Gold (gram)" },
    "gold-oz": { TR: "Ons altın", EN: "Gold (ounce)" },
    bist100: { TR: "BIST 100", EN: "BIST 100" },
    sp500: { TR: "S&P 500", EN: "S&P 500" },
    btc: { TR: "Bitcoin", EN: "Bitcoin" },
};

const REFRESH_MS = 5 * 60_000;

/** Exchange rates, gold and indices above the finance news; hidden when no source answers. */
export default function MarketStrip() {
    const { tx, locale } = useI18n();
    const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const response = await fetch("/api/news/markets", { cache: "no-store" });
                const data = await response.json() as Snapshot;
                if (active && Array.isArray(data.quotes)) setSnapshot(data);
            } catch {
                // Leave the previous strip (or none) in place.
            }
        };
        void load();
        const timer = window.setInterval(() => {
            if (document.visibilityState === "visible") void load();
        }, REFRESH_MS);
        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, []);

    if (!snapshot?.quotes.length) return null;

    const format = (quote: Quote) => {
        const options: Intl.NumberFormatOptions = { minimumFractionDigits: quote.decimals, maximumFractionDigits: quote.decimals };
        if (quote.currency) {
            options.style = "currency";
            options.currency = quote.currency;
        }
        try {
            return new Intl.NumberFormat(locale, options).format(quote.value);
        } catch {
            return quote.value.toFixed(quote.decimals);
        }
    };
    const percent = (change: number) => new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(change);

    return (
        <section aria-label={tx({ TR: "Piyasalar", EN: "Markets" })} className="mb-4">
            <div className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {snapshot.quotes.map((quote) => {
                    const up = quote.change !== null && quote.change > 0;
                    const down = quote.change !== null && quote.change < 0;
                    const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
                    return (
                        <div key={quote.id} className="min-w-[8.5rem] shrink-0 rounded-2xl border border-zinc-200/80 bg-white px-3.5 py-2.5 shadow-sm dark:border-white/[0.08] dark:bg-zinc-900/70">
                            <p className="text-[11.5px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{tx(LABELS[quote.id] ?? { TR: quote.id, EN: quote.id })}</p>
                            <p className="mt-0.5 text-[15px] font-black tabular-nums text-zinc-900 dark:text-white" dir="ltr">{format(quote)}</p>
                            <p className={`mt-0.5 inline-flex items-center gap-0.5 text-[12px] font-bold tabular-nums ${up ? "text-emerald-600 dark:text-emerald-400" : down ? "text-rose-600 dark:text-rose-400" : "text-zinc-400"}`} dir="ltr">
                                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                                {quote.change === null ? "—" : percent(quote.change)}
                            </p>
                        </div>
                    );
                })}
            </div>
            <p className="mt-1 text-[11px] text-zinc-400">
                {tx({ TR: "Kaynak: {source} · gecikmeli olabilir, yatırım tavsiyesi değildir.", EN: "Source: {source} · may be delayed, not investment advice." }, { source: snapshot.source })}
            </p>
        </section>
    );
}
