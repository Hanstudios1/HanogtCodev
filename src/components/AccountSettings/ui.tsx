"use client";

import { Zap } from "lucide-react";
import { useId, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { C } from "./copy";

export const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900";

export const INPUT = "w-full min-w-0 rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/25 aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-red-500/25 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:placeholder:text-zinc-500";

export const READONLY_INPUT = "w-full min-w-0 cursor-default rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-500 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/25 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-400";

export const SELECT = "w-full min-w-0 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/25 @lg:w-56 dark:border-white/10 dark:bg-zinc-950 dark:text-white";

const BUTTON_TONES = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-500",
    secondary: "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-white/[0.06]",
    danger: "bg-red-600 text-white hover:bg-red-700",
    dangerOutline: "border border-red-300 bg-white text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-500/10",
    ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-white/[0.06] dark:hover:text-white",
} as const;

const BUTTON_SIZES = {
    md: "min-h-10 px-4 py-2 text-sm",
    sm: "min-h-8 px-3 py-1.5 text-[13px]",
    icon: "h-10 w-10",
} as const;

/** Button classes: one tone and one size, so no two classes fight over the same property. */
export function buttonClass(tone: keyof typeof BUTTON_TONES = "secondary", size: keyof typeof BUTTON_SIZES = "md") {
    return `inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS} ${BUTTON_TONES[tone]} ${BUTTON_SIZES[size]}`;
}

/** The small muted note on cards whose controls save (or apply) on their own, without the save bar. */
export function InstantNote({ device = false }: { device?: boolean }) {
    const { tx } = useI18n();
    return (
        <span className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-[12px] font-medium text-zinc-500 dark:text-zinc-400" data-account-instant={device ? "device" : "account"}>
            <Zap className="h-3.5 w-3.5" aria-hidden="true" />
            {tx(device ? C.deviceInstant : C.instant)}
        </span>
    );
}

/**
 * A settings card: title, one-line description and an optional "saved
 * instantly" note, then rows separated by dividers (SettingRow, CardBody).
 * Rows lay themselves out by the card's width (a size container), so a card
 * next to the profile preview stacks them while a full-width one doesn't.
 */
export function SettingsCard({ id, title, description, instant, tone = "default", footer, children }: {
    id?: string;
    title: string;
    description?: ReactNode;
    instant?: "account" | "device";
    tone?: "default" | "danger";
    footer?: ReactNode;
    children: ReactNode;
}) {
    const titleId = useId();
    const danger = tone === "danger";
    return (
        <section id={id} aria-labelledby={titleId} className={`@container scroll-mt-24 rounded-2xl border bg-white dark:bg-zinc-900 ${danger ? "border-red-200 dark:border-red-500/30" : "border-zinc-200 dark:border-white/[0.08]"}`}>
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-5 pb-3.5 pt-4 sm:px-6">
                <div className="min-w-0 flex-1">
                    <h3 id={titleId} className={`text-[15px] font-semibold tracking-tight ${danger ? "text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-white"}`}>{title}</h3>
                    {description ? <p className="mt-0.5 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">{description}</p> : null}
                </div>
                {instant ? <InstantNote device={instant === "device"} /> : null}
            </div>
            <div className={`divide-y border-t ${danger ? "divide-red-100 border-red-100 dark:divide-red-500/15 dark:border-red-500/15" : "divide-zinc-100 border-zinc-100 dark:divide-white/[0.06] dark:border-white/[0.06]"}`}>{children}</div>
            {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-100 px-5 py-3 sm:px-6 dark:border-white/[0.06]">{footer}</div> : null}
        </section>
    );
}

/** Free content inside a card, padded like the rows. */
export function CardBody({ className = "", children }: { className?: string; children: ReactNode }) {
    return <div className={`px-5 py-4 sm:px-6 ${className}`}>{children}</div>;
}

const ROW_LAYOUTS = {
    // Switches and buttons: always on one line.
    inline: "flex items-center justify-between gap-4",
    // Menus and wide buttons: stacked in narrow cards, side by side in cards from 32rem.
    wide: "flex flex-col gap-2.5 @lg:flex-row @lg:items-center @lg:justify-between @lg:gap-6",
    // Text fields and pickers: a label column and a control column in cards from 36rem.
    field: "flex flex-col gap-2.5 @xl:grid @xl:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] @xl:items-start @xl:gap-6",
} as const;

/**
 * One setting: label and hint on the start side, the control on the end
 * side. `htmlFor` makes the label a <label>; `anchor` is the id search
 * results scroll to when the control has no id of its own.
 */
export function SettingRow({ label, hint, htmlFor, labelId, hintId, layout = "inline", anchor, children }: {
    label: ReactNode;
    hint?: ReactNode;
    htmlFor?: string;
    labelId?: string;
    hintId?: string;
    layout?: keyof typeof ROW_LAYOUTS;
    anchor?: string;
    children: ReactNode;
}) {
    const labelClass = "block text-[14px] font-medium text-zinc-900 dark:text-zinc-100";
    return (
        <div id={anchor} data-setting-row className={`scroll-mt-24 px-5 py-4 sm:px-6 ${ROW_LAYOUTS[layout]}`}>
            <div className={`min-w-0 ${layout === "field" ? "@xl:pt-2" : layout === "wide" ? "@lg:flex-1" : "flex-1"}`}>
                {htmlFor ? <label id={labelId} htmlFor={htmlFor} className={labelClass}>{label}</label> : <p id={labelId} className={labelClass}>{label}</p>}
                {hint ? <div id={hintId} className="mt-0.5 text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">{hint}</div> : null}
            </div>
            <div className={layout === "inline" ? "shrink-0" : "min-w-0"}>{children}</div>
        </div>
    );
}

export function ToggleSwitch({ id, checked, onChange, label, labelledBy, describedBy, busy = false }: {
    id?: string;
    checked: boolean;
    onChange: (value: boolean) => void;
    label?: string;
    labelledBy?: string;
    describedBy?: string;
    busy?: boolean;
}) {
    return (
        <button
            id={id}
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={labelledBy ? undefined : label}
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            aria-busy={busy || undefined}
            onClick={() => { if (!busy) onChange(!checked); }}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${FOCUS} ${checked ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-700"} ${busy ? "opacity-60" : ""}`}
        >
            <span className={`absolute top-0.5 block h-5 w-5 rounded-full bg-white shadow-sm transition-all ${checked ? "start-[1.375rem]" : "start-0.5"}`} />
        </button>
    );
}

/** A switch row; `id` (e.g. field-publicProfile) goes on the switch, so errors and search can focus it. */
export function ToggleRow({ id, label, hint, checked, onChange, busy }: { id: string; label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void; busy?: boolean }) {
    const labelId = useId();
    const hintId = useId();
    return (
        <SettingRow label={label} hint={hint} htmlFor={id} labelId={labelId} hintId={hint ? hintId : undefined}>
            <ToggleSwitch id={id} checked={checked} onChange={onChange} labelledBy={labelId} describedBy={hint ? hintId : undefined} busy={busy} />
        </SettingRow>
    );
}

export function SelectRow<T extends string>({ id, label, hint, value, options, onChange }: { id: string; label: string; hint?: string; value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (value: T) => void }) {
    const hintId = useId();
    return (
        <SettingRow label={label} hint={hint} htmlFor={id} hintId={hint ? hintId : undefined} layout="wide">
            <select id={id} value={value} onChange={(event) => onChange(event.target.value as T)} aria-describedby={hint ? hintId : undefined} className={SELECT}>
                {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
        </SettingRow>
    );
}

export function Skeleton({ rows = 2 }: { rows?: number }) {
    const { tx } = useI18n();
    return (
        <div className="space-y-4" role="status" aria-live="polite">
            <span className="sr-only">{tx(C.loading)}</span>
            {Array.from({ length: rows }, (_, index) => (
                <div key={index} className="rounded-2xl border border-zinc-200 bg-white dark:border-white/[0.08] dark:bg-zinc-900" aria-hidden="true">
                    <div className="space-y-2 px-5 pb-4 pt-4 sm:px-6">
                        <div className="h-4 w-1/3 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
                        <div className="h-3 w-2/3 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800/70" />
                    </div>
                    <div className="space-y-3 border-t border-zinc-100 px-5 py-4 sm:px-6 dark:border-white/[0.06]">
                        <div className="h-9 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/70" />
                        <div className="h-9 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/70" />
                    </div>
                </div>
            ))}
        </div>
    );
}
