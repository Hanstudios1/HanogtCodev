"use client";

import { BarChart3, Table2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import { cx, FOCUS_RING } from "./ui";

/*
 * The admin panel's charts, drawn as plain SVG: thin columns with a rounded
 * data end, hairline grid, one hue per series (the default categorical slot
 * 1, stepped for the dark surface), a tooltip for the hovered or focused
 * column, and a table view with every value. Colors are custom properties so
 * the dark theme picks its own steps.
 */

const VIZ_COLORS = cx(
    "[--viz-series:#2a78d6] [--viz-series-soft:#86b6ef] [--viz-muted:#c3c2b7] [--viz-grid:#e1e0d9] [--viz-axis:#c3c2b7] [--viz-ink:#52514e]",
    "dark:[--viz-series:#3987e5] dark:[--viz-series-soft:#256abf] dark:[--viz-muted:#52514e] dark:[--viz-grid:#2c2c2a] dark:[--viz-axis:#383835] dark:[--viz-ink:#c3c2b7]",
);

const COPY = {
    table: { TR: "Tablo olarak göster", EN: "Show as a table" },
    chart: { TR: "Grafik olarak göster", EN: "Show as a chart" },
    unavailable: { TR: "Bu veri şu an okunamadı.", EN: "This data couldn't be read right now." },
    period: { TR: "Dönem", EN: "Period" },
    keys: { TR: "Sütunlar arasında ok tuşlarıyla gezinebilirsiniz.", EN: "Use the arrow keys to move between columns." },
} satisfies Record<string, Copy>;

export type ChartPoint = {
    /** The axis label (short, e.g. "6 Eki"). */
    label: string;
    /** The tooltip and table label (e.g. "6 Ekim 2026 Pazartesi"). */
    title: string;
    value: number | null;
};

function useElementWidth<T extends HTMLElement>() {
    const ref = useRef<T>(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const element = ref.current;
        if (!element || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver((entries) => {
            const next = Math.round(entries[0]?.contentRect.width ?? 0);
            setWidth((current) => (current === next ? current : next));
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    return [ref, width] as const;
}

/** A clean axis for counts: a 1-2-5 step and a top that is a whole number of steps. */
export function niceScale(max: number, ticks = 4) {
    if (!(max > 0)) return { top: 1, step: 1 };
    const raw = max / ticks;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const step = Math.max(1, [1, 2, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= raw) ?? 10 * magnitude);
    return { top: Math.ceil(max / step) * step, step };
}

export function formatCompact(value: number, locale: string) {
    return new Intl.NumberFormat(locale, { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

/** A column with a 4px rounded data end and a square foot on the baseline. */
function columnPath(x: number, width: number, base: number, top: number) {
    const height = base - top;
    const radius = Math.min(4, width / 2, height);
    return `M${x},${base}V${top + radius}A${radius},${radius} 0 0 1 ${x + radius},${top}H${x + width - radius}A${radius},${radius} 0 0 1 ${x + width},${top + radius}V${base}Z`;
}

const PLOT_HEIGHT = 180;
const AXIS_BAND = 26;
const LEFT = 44;
const RIGHT = 8;
const TOP = 18;

/**
 * Columns over time for one series. The hovered or focused column shows its
 * value; the highest one carries a direct label; the table view lists them all.
 */
export function ColumnChart({ points, seriesLabel, caption, busy = false, actions }: {
    points: ChartPoint[];
    /** What the values are ("Yeni kayıtlar"): the tooltip and the table header. */
    seriesLabel: string;
    caption?: ReactNode;
    /** A new range is loading: the previous chart stays, dimmed. */
    busy?: boolean;
    actions?: ReactNode;
}) {
    const { tx, locale } = useI18n();
    const [ref, width] = useElementWidth<HTMLDivElement>();
    const [active, setActive] = useState<number | null>(null);
    const [showTable, setShowTable] = useState(false);
    const describedBy = useId();
    const available = points.some((point) => point.value !== null);
    const values = points.map((point) => point.value ?? 0);
    const { top, step } = niceScale(Math.max(0, ...values));
    const plotWidth = Math.max(0, width - LEFT - RIGHT);
    const band = points.length ? plotWidth / points.length : 0;
    const columnWidth = Math.max(2, Math.min(24, band * 0.62));
    const base = TOP + PLOT_HEIGHT;
    const y = (value: number) => base - (value / top) * PLOT_HEIGHT;
    const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step);
    const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(plotWidth / 64))));
    const peak = values.reduce((best, value, index) => (value > values[best] ? index : best), 0);
    const shown = active !== null && points[active] ? active : null;

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (!points.length) return;
        const last = points.length - 1;
        const current = shown ?? last;
        const next = event.key === "ArrowLeft" ? Math.max(0, current - 1)
            : event.key === "ArrowRight" ? Math.min(last, current + 1)
                : event.key === "Home" ? 0
                    : event.key === "End" ? last
                        : null;
        if (next === null) return;
        event.preventDefault();
        setActive(next);
    };

    return (
        <figure className={cx("min-w-0", VIZ_COLORS)}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <figcaption className="min-w-0 text-[12px] text-zinc-500 dark:text-zinc-400">{caption}</figcaption>
                <div className="flex items-center gap-1.5">
                    {actions}
                    <button
                        type="button"
                        onClick={() => setShowTable((value) => !value)}
                        aria-pressed={showTable}
                        className={cx("inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 text-[12px] font-semibold text-zinc-600 transition hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/[0.05]", FOCUS_RING)}
                    >
                        {showTable ? <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" /> : <Table2 className="h-3.5 w-3.5" aria-hidden="true" />}
                        {tx(showTable ? COPY.chart : COPY.table)}
                    </button>
                </div>
            </div>
            {!available ? (
                <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-500 dark:border-white/10 dark:text-zinc-400">{tx(COPY.unavailable)}</p>
            ) : showTable ? (
                <div className="max-h-80 overflow-auto rounded-xl border border-zinc-200 dark:border-white/10">
                    <table className="w-full text-start text-[13px]">
                        <thead className="sticky top-0 bg-zinc-50 text-[12px] text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                            <tr>
                                <th scope="col" className="px-3 py-2 text-start font-semibold">{tx(COPY.period)}</th>
                                <th scope="col" className="px-3 py-2 text-end font-semibold">{seriesLabel}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
                            {[...points].reverse().map((point) => (
                                <tr key={point.title}>
                                    <td className="px-3 py-1.5 text-zinc-700 dark:text-zinc-300">{point.title}</td>
                                    <td className="px-3 py-1.5 text-end font-semibold tabular-nums text-zinc-900 dark:text-white">{point.value === null ? "—" : point.value.toLocaleString(locale)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div
                    ref={ref}
                    dir="ltr"
                    tabIndex={0}
                    role="group"
                    aria-label={`${seriesLabel}. ${tx(COPY.keys)}`}
                    aria-describedby={describedBy}
                    onKeyDown={onKeyDown}
                    onBlur={() => setActive(null)}
                    onPointerLeave={() => setActive(null)}
                    className={cx("relative rounded-xl transition-opacity", busy && "opacity-50", FOCUS_RING)}
                    style={{ height: TOP + PLOT_HEIGHT + AXIS_BAND }}
                >
                    {width > 0 ? (
                        <svg width={width} height={TOP + PLOT_HEIGHT + AXIS_BAND} className="block overflow-visible" aria-hidden="true">
                            {ticks.map((tick) => (
                                <g key={tick}>
                                    <line x1={LEFT} x2={width - RIGHT} y1={y(tick) + 0.5} y2={y(tick) + 0.5} stroke={tick === 0 ? "var(--viz-axis)" : "var(--viz-grid)"} strokeWidth={1} />
                                    <text x={LEFT - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-[var(--viz-ink)] text-[11px] tabular-nums">{formatCompact(tick, locale)}</text>
                                </g>
                            ))}
                            {points.map((point, index) => {
                                const value = point.value ?? 0;
                                const x = LEFT + index * band + (band - columnWidth) / 2;
                                const highlighted = shown === index;
                                return (
                                    <g key={point.title}>
                                        {value > 0 ? (
                                            <path d={columnPath(x, columnWidth, base, y(value))} fill={shown !== null && !highlighted ? "var(--viz-series-soft)" : "var(--viz-series)"} />
                                        ) : null}
                                        {index === peak && value > 0 && shown === null ? (
                                            <text x={x + columnWidth / 2} y={y(value) - 6} textAnchor="middle" className="fill-[var(--viz-ink)] text-[11px] font-semibold tabular-nums">{value.toLocaleString(locale)}</text>
                                        ) : null}
                                        {index % labelEvery === 0 || index === points.length - 1 ? (
                                            <text x={x + columnWidth / 2} y={base + 17} textAnchor="middle" className="fill-[var(--viz-ink)] text-[11px]">{point.label}</text>
                                        ) : null}
                                        {/* The whole band is the hit target, not just the painted column. */}
                                        <rect
                                            x={LEFT + index * band}
                                            y={TOP}
                                            width={band}
                                            height={PLOT_HEIGHT}
                                            fill="transparent"
                                            onPointerEnter={() => setActive(index)}
                                            onPointerMove={() => setActive(index)}
                                        />
                                    </g>
                                );
                            })}
                        </svg>
                    ) : null}
                    {shown !== null && width > 0 ? (
                        <ChartTooltip
                            left={Math.min(Math.max(LEFT + shown * band + band / 2, 70), width - 70)}
                            top={Math.max(0, y(points[shown].value ?? 0) - 12)}
                            value={points[shown].value === null ? "—" : (points[shown].value as number).toLocaleString(locale)}
                            label={`${seriesLabel} · ${points[shown].title}`}
                        />
                    ) : null}
                    <p id={describedBy} className="sr-only" aria-live="polite">
                        {shown !== null ? `${points[shown].title}: ${points[shown].value === null ? "—" : points[shown].value}` : ""}
                    </p>
                </div>
            )}
        </figure>
    );
}

function ChartTooltip({ left, top, value, label }: { left: number; top: number; value: string; label: string }) {
    return (
        <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-center shadow-lg dark:border-white/10 dark:bg-zinc-900"
            style={{ left, top }}
        >
            <p className="text-sm font-black tabular-nums text-zinc-900 dark:text-white">{value}</p>
            <p className="whitespace-nowrap text-[11px] text-zinc-500 dark:text-zinc-400">{label}</p>
        </div>
    );
}

/**
 * A small trend for a stat tile: the earlier periods in the de-emphasis gray,
 * the current one in the series hue. Decorative; the tile's number says it.
 */
export function Sparkline({ values, className }: { values: Array<number | null>; className?: string }) {
    const width = 120;
    const height = 32;
    const numbers = values.map((value) => value ?? 0);
    const max = Math.max(1, ...numbers);
    const band = numbers.length ? width / numbers.length : 0;
    const columnWidth = Math.max(1.5, Math.min(8, band * 0.6));
    return (
        <svg viewBox={`0 0 ${width} ${height}`} className={cx("h-8 w-full", VIZ_COLORS, className)} preserveAspectRatio="none" aria-hidden="true">
            <line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke="var(--viz-grid)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            {numbers.map((value, index) => {
                if (value <= 0) return null;
                const columnHeight = Math.max(1.5, (value / max) * (height - 2));
                return (
                    <rect
                        key={index}
                        x={index * band + (band - columnWidth) / 2}
                        y={height - columnHeight}
                        width={columnWidth}
                        height={columnHeight}
                        rx={Math.min(1.5, columnWidth / 2)}
                        fill={index === numbers.length - 1 ? "var(--viz-series)" : "var(--viz-muted)"}
                    />
                );
            })}
        </svg>
    );
}

export type BarItem = { key: string; label: string; value: number; hint?: string };

/** One series across categories: a bar per row, the value at its tip, the largest sets the scale. */
export function BarList({ items, emptyText, valueLabel }: { items: BarItem[]; emptyText: string; valueLabel?: (value: number) => string }) {
    const { locale } = useI18n();
    const max = Math.max(1, ...items.map((item) => item.value));
    if (!items.length || items.every((item) => item.value === 0)) {
        return <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">{emptyText}</p>;
    }
    return (
        <ul className={cx("space-y-2.5", VIZ_COLORS)}>
            {items.map((item) => (
                <li key={item.key} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-3 max-sm:grid-cols-[minmax(0,7rem)_minmax(0,1fr)]">
                    <span className="min-w-0 truncate text-[13px] text-zinc-700 dark:text-zinc-300" title={item.hint ?? item.label}>{item.label}</span>
                    <span className="flex min-w-0 items-center gap-2">
                        <span className="h-3 rounded-e-[4px] bg-[var(--viz-series)]" style={{ width: `${Math.max(item.value > 0 ? 2 : 0, (item.value / max) * 100) * 0.82}%` }} aria-hidden="true" />
                        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-zinc-900 dark:text-white">{valueLabel ? valueLabel(item.value) : item.value.toLocaleString(locale)}</span>
                    </span>
                </li>
            ))}
        </ul>
    );
}
