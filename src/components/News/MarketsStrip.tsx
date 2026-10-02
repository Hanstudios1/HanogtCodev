"use client";

import { ArrowDownRight, ArrowUpRight, CircleAlert, ExternalLink, Info, Minus, RefreshCw, TrendingUp } from "lucide-react";
import { useId, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { MarketItem } from "@/lib/news/markets";
import {
    formatChangeAmount, formatChangePercent, formatCurrency, formatMarketNumber, formatMarketTime, formatMarketValue, marketDirection,
    type MarketDirection,
} from "./market-format";
import type { MarketsState } from "./useMarkets";

type Tx = ReturnType<typeof useI18n>["tx"];

/**
 * After this long without a successful refresh the strip says so instead of looking current. A
 * healthy snapshot can already be ~15 minutes old (five in the server cache, ten more on the CDN).
 */
const STALE_AFTER_MS = 25 * 60_000;

const TONE: Record<MarketDirection | "none", string> = {
    up: "text-emerald-700 dark:text-emerald-400",
    down: "text-rose-600 dark:text-rose-400",
    flat: "text-zinc-500 dark:text-zinc-400",
    none: "text-zinc-400 dark:text-zinc-500",
};

const PROVIDERS = [
    { match: "TCMB", name: "TCMB", url: "https://www.tcmb.gov.tr/" },
    { match: "gold-api.com", name: "gold-api.com", url: "https://gold-api.com/" },
    { match: "Yahoo Finance", name: "Yahoo Finance", url: "https://finance.yahoo.com/" },
    { match: "CoinGecko", name: "CoinGecko", url: "https://www.coingecko.com/" },
];

function shortLabel(item: MarketItem, tx: Tx) {
    if (item.id === "gram-gold") return tx({ TR: "Gram altın", EN: "Gold / gram" });
    if (item.id === "ounce-gold") return tx({ TR: "Ons altın", EN: "Gold / oz" });
    return item.label;
}

function longName(item: MarketItem, tx: Tx) {
    switch (item.id) {
        case "usd-try": return tx({ TR: "ABD Doları", EN: "US dollar" });
        case "eur-try": return tx({ TR: "Euro", EN: "Euro" });
        case "gbp-try": return tx({ TR: "İngiliz Sterlini", EN: "British pound" });
        case "gram-gold": return tx({ TR: "Gram altın (24 ayar, hesaplanan)", EN: "Gold per gram (24k, calculated)" });
        case "ounce-gold": return tx({ TR: "Ons altın (ABD doları)", EN: "Gold per troy ounce (US dollars)" });
        case "bist-100": return tx({ TR: "Borsa İstanbul", EN: "Borsa Istanbul" });
        case "sp-500": return tx({ TR: "S&P 500 endeksi (ABD)", EN: "S&P 500 index (US)" });
        default: return item.label;
    }
}

function basisText(item: MarketItem, tx: Tx) {
    switch (item.changeBasis) {
        case "previous-business-day": return tx({ TR: "Önceki iş gününe göre", EN: "Versus the previous business day" });
        case "previous-close": return tx({ TR: "Önceki kapanışa göre", EN: "Versus the previous close" });
        case "24h": return tx({ TR: "Son 24 saat", EN: "Last 24 hours" });
        default: return tx({ TR: "Karşılaştırma verisi yok", EN: "No comparison data" });
    }
}

function directionWord(direction: MarketDirection | null, tx: Tx) {
    switch (direction) {
        case "up": return tx({ TR: "yükseldi", EN: "rose" });
        case "down": return tx({ TR: "düştü", EN: "fell" });
        case "flat": return tx({ TR: "değişmedi", EN: "unchanged" });
        default: return tx({ TR: "değişim verisi yok", EN: "no change data" });
    }
}

/** Source, time and working of one quote: the tooltip and the line under the strip. */
function detailLines(item: MarketItem, tx: Tx, locale: string): string[] {
    const lines = [`${longName(item, tx)}: ${formatMarketValue(item, locale)}`];
    lines.push(tx({ TR: "Kaynak: {source}", EN: "Source: {source}" }, { source: item.source }));
    const { details } = item;
    if (details?.buying !== undefined && details.selling !== undefined) {
        lines.push(tx({ TR: "Döviz alış {buying} · satış {selling}", EN: "Buying {buying} · selling {selling}" }, {
            buying: formatMarketNumber(item, details.buying, locale),
            selling: formatMarketNumber(item, details.selling, locale),
        }));
    }
    if (details?.ounceUsd !== undefined && details.usdTry !== undefined) {
        lines.push(tx({ TR: "Hesap: ons altın {ounce} ÷ 31,1035 × USD/TRY {rate}", EN: "Formula: gold ounce {ounce} ÷ 31.1035 × USD/TRY {rate}" }, {
            ounce: formatCurrency(details.ounceUsd, "USD", 2, locale),
            rate: formatCurrency(details.usdTry, "TRY", 4, locale),
        }));
    }
    if (details?.valueTry !== undefined) {
        lines.push(tx({ TR: "Türk lirası karşılığı: {value}", EN: "In Turkish lira: {value}" }, { value: formatCurrency(details.valueTry, "TRY", 0, locale) }));
    }
    lines.push(tx({ TR: "Veri zamanı: {time}", EN: "Quote time: {time}" }, { time: formatMarketTime(item.updatedAt, locale) }));
    if (item.change !== null) lines.push(`${basisText(item, tx)}: ${formatChangeAmount(item, locale)} (${formatChangePercent(item, locale)})`);
    return lines;
}

function Arrow({ direction, className }: { direction: MarketDirection | null; className: string }) {
    if (direction === "up") return <ArrowUpRight aria-hidden="true" className={className} />;
    if (direction === "down") return <ArrowDownRight aria-hidden="true" className={className} />;
    return <Minus aria-hidden="true" className={className} />;
}

interface StripProps {
    /** "compact" sits above every feed; "prominent" is the Finance view. */
    variant: "compact" | "prominent";
    markets: MarketsState;
    /** Current time in ms from the page clock, used to flag stale data without reading the clock while rendering. */
    now: number;
    /** Compact strip only: switches the page to the Finance filter. */
    onOpenFinance?: () => void;
}

export default function MarketsStrip({ variant, markets, now, onOpenFinance }: StripProps) {
    const { tx, locale } = useI18n();
    const detailId = useId();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const { items, status, generatedAt, refreshing, reload } = markets;
    const stale = generatedAt !== null && now - Date.parse(generatedAt) > STALE_AFTER_MS;
    const selected = items.find((item) => item.id === selectedId) ?? null;
    const heading = tx({ TR: "Piyasalar", EN: "Markets" });
    const disclaimer = tx({ TR: "Gecikmeli veriler, yatırım tavsiyesi değildir.", EN: "Delayed data; not investment advice." });
    const staleNote = tx({ TR: "Veriler güncellenemedi; son alınan değerler gösteriliyor.", EN: "Could not refresh; showing the last values received." });
    const providers = PROVIDERS.filter((provider) => items.some((item) => item.source.includes(provider.match)));

    const unavailable = (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-dashed border-zinc-300 bg-white/60 px-3.5 py-2.5 text-[12.5px] text-zinc-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-400">
            <span className="inline-flex items-center gap-1.5"><CircleAlert className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />{tx({ TR: "Piyasa verileri şu anda alınamıyor.", EN: "Market data is unavailable right now." })}</span>
            <button type="button" onClick={reload} disabled={refreshing} className="font-semibold text-indigo-600 hover:underline disabled:opacity-60 dark:text-indigo-300">{tx({ TR: "Tekrar dene", EN: "Try again" })}</button>
        </div>
    );

    if (variant === "prominent") {
        return (
            <section aria-labelledby={`${detailId}-title`} aria-busy={status === "loading"} className="mb-5 overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.07] via-white to-teal-500/[0.07] p-4 shadow-sm animate-fade-up dark:via-zinc-900/60 sm:p-5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h2 id={`${detailId}-title`} className="flex items-center gap-2 text-[16px] font-black text-zinc-900 dark:text-white"><TrendingUp className="h-5 w-5 text-emerald-500" aria-hidden="true" />{heading}</h2>
                    {generatedAt ? <span className="text-[12px] text-zinc-500 dark:text-zinc-400">{tx({ TR: "Son kontrol: {time}", EN: "Last checked: {time}" }, { time: formatMarketTime(generatedAt, locale) })}</span> : null}
                    <button type="button" onClick={reload} disabled={refreshing} className="ms-auto grid h-9 w-9 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-600 transition hover:text-indigo-600 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300" aria-label={tx({ TR: "Piyasa verilerini yenile", EN: "Refresh market data" })}>
                        <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
                    </button>
                </div>

                <div className="mt-3">
                    {status === "loading" ? (
                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                            {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-[132px] animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-white/[0.05]" />)}
                        </div>
                    ) : items.length ? (
                        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                            {items.map((item) => {
                                const direction = marketDirection(item);
                                return (
                                    <li key={item.id} title={detailLines(item, tx, locale).join("\n")} className="flex min-w-0 flex-col rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-sm dark:border-white/[0.08] dark:bg-zinc-900/70">
                                        <span className="truncate text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{shortLabel(item, tx)}</span>
                                        <span className="mt-1 text-[21px] font-black leading-tight tabular-nums text-zinc-900 dark:text-white sm:text-[23px]">{formatMarketValue(item, locale)}</span>
                                        <span className={`mt-1 inline-flex flex-wrap items-center gap-x-1 text-[13px] font-bold tabular-nums ${TONE[direction ?? "none"]}`}>
                                            {direction ? <><Arrow direction={direction} className="h-4 w-4" />{formatChangePercent(item, locale)}<span className="font-semibold opacity-80">({formatChangeAmount(item, locale)})</span></> : <span aria-hidden="true">—</span>}
                                            <span className="sr-only">{directionWord(direction, tx)}</span>
                                        </span>
                                        <span className="mt-2 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{basisText(item, tx)}</span>
                                        <span className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{item.source} · <time dateTime={item.updatedAt}>{formatMarketTime(item.updatedAt, locale)}</time></span>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : unavailable}
                </div>

                <div className="mt-3 space-y-1 text-[11.5px] leading-snug text-zinc-500 dark:text-zinc-400">
                    <p className="flex items-start gap-1.5 font-semibold"><Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />{disclaimer}</p>
                    {stale ? <p className="ps-5 font-semibold text-amber-600 dark:text-amber-400">{staleNote}</p> : null}
                    <p className="ps-5">{tx({ TR: "Döviz kurları TCMB'nin iş günlerinde 15:30'da ilan ettiği gösterge niteliğindeki kurlardır. Gram altın, ons altın fiyatı × USD/TRY ÷ 31,1035 ile hesaplanır; kuyumcu ve banka fiyatlarından farklı olabilir.", EN: "Exchange rates are the indicative rates the Central Bank of Türkiye (TCMB) announces at 15:30 on business days. Gold per gram is calculated as the ounce price × USD/TRY ÷ 31.1035 and can differ from jeweller and bank prices." })}</p>
                    {providers.length ? (
                        <p className="flex flex-wrap items-center gap-x-1.5 ps-5">
                            <span>{tx({ TR: "Veri sağlayıcıları:", EN: "Data providers:" })}</span>
                            {providers.map((provider) => (
                                <a key={provider.name} href={provider.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-0.5 font-semibold text-indigo-600 hover:underline dark:text-indigo-300">{provider.name}<ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" /></a>
                            ))}
                        </p>
                    ) : null}
                </div>
            </section>
        );
    }

    return (
        <section aria-labelledby={`${detailId}-title`} aria-busy={status === "loading"} className="mb-5 animate-fade-up">
            <div className="mb-2 flex items-center gap-2">
                <h2 id={`${detailId}-title`} className="flex items-center gap-1.5 text-[12px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400"><TrendingUp className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />{heading}</h2>
                {onOpenFinance ? (
                    <button type="button" onClick={onOpenFinance} className="ms-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-bold text-indigo-600 transition hover:bg-indigo-500/10 dark:text-indigo-300">
                        {tx({ TR: "Finans haberleri", EN: "Finance news" })}<span aria-hidden="true" className="rtl:rotate-180">→</span>
                    </button>
                ) : null}
            </div>

            {status === "loading" ? (
                <div className="scrollbar-none -mx-4 flex gap-2 overflow-hidden ps-4 sm:mx-0 sm:ps-0">
                    {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-[66px] w-[7.75rem] shrink-0 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-white/[0.05]" />)}
                </div>
            ) : items.length ? (
                <ul className="scrollbar-none relative -mx-4 flex snap-x scroll-ps-4 gap-2 overflow-x-auto pb-1 ps-4 pe-8 [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] sm:mx-0 sm:scroll-ps-0 sm:ps-0">
                    {items.map((item) => {
                        const direction = marketDirection(item);
                        const open = selectedId === item.id;
                        return (
                            <li key={item.id} className="shrink-0 snap-start">
                                <button
                                    type="button"
                                    onClick={() => setSelectedId(open ? null : item.id)}
                                    aria-expanded={open}
                                    aria-controls={detailId}
                                    title={detailLines(item, tx, locale).join("\n")}
                                    className={`flex min-w-[7.75rem] flex-col rounded-2xl border bg-white px-3 py-2 text-start shadow-sm outline-none transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-indigo-500/60 dark:bg-zinc-900/70 ${open ? "border-indigo-400/70 ring-2 ring-indigo-500/30 dark:border-indigo-400/50" : "border-zinc-200/80 dark:border-white/[0.08]"}`}
                                >
                                    <span className="text-[10.5px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{shortLabel(item, tx)}</span>
                                    <span className="mt-0.5 whitespace-nowrap text-[15px] font-black tabular-nums text-zinc-900 dark:text-white">{formatMarketValue(item, locale)}</span>
                                    <span className={`mt-0.5 inline-flex items-center gap-0.5 whitespace-nowrap text-[11.5px] font-bold tabular-nums ${TONE[direction ?? "none"]}`}>
                                        {direction ? <><Arrow direction={direction} className="h-3.5 w-3.5" />{formatChangePercent(item, locale)}</> : <span aria-hidden="true">—</span>}
                                        <span className="sr-only">{directionWord(direction, tx)}</span>
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            ) : unavailable}

            {/* Tap/keyboard counterpart of the tooltips; kept in the tree (empty and visually hidden) so changes are announced. */}
            <p id={detailId} role="status" className={selected ? "mt-1.5 text-[11px] leading-snug text-zinc-600 dark:text-zinc-300" : "sr-only"}>
                {selected ? detailLines(selected, tx, locale).join(" · ") : null}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[10.5px] leading-snug text-zinc-500 dark:text-zinc-400">
                <span>{disclaimer}</span>
                {stale ? <span className="font-semibold text-amber-600 dark:text-amber-400">{staleNote}</span> : null}
            </p>
        </section>
    );
}
