"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

export function AiAvatar({ size = "h-8 w-8" }: { size?: string }) {
    return (
        <span className={`${size} relative grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-md shadow-violet-500/20`} aria-hidden>
            <Sparkles className="h-[55%] w-[55%]" />
        </span>
    );
}

export const ICON_BUTTON = "inline-flex items-center justify-center rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-900/[0.06] hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 disabled:pointer-events-none disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white";

export interface MenuOption<T extends string> {
    id: T;
    label: string;
    description?: string;
    icon?: ReactNode;
}

/**
 * A small pill button with a popover of single-choice options (mode and agent
 * mode selectors in the composer). Closes on Escape, outside clicks and choice.
 */
export function PillMenu<T extends string>({ label, icon, value, options, onChange, disabled, title, footer, align = "start", compact }: {
    label: string;
    icon?: ReactNode;
    value: T;
    options: Array<MenuOption<T>>;
    onChange: (value: T) => void;
    disabled?: boolean;
    title: string;
    footer?: ReactNode;
    align?: "start" | "end";
    /** Hide the text label on narrow screens. */
    compact?: boolean;
}) {
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

    return (
        <div ref={root} className="relative">
            <button
                ref={button}
                type="button"
                disabled={disabled}
                onClick={() => setOpen((current) => !current)}
                aria-haspopup="true"
                aria-expanded={open}
                title={title}
                className="inline-flex h-8 max-w-[11rem] items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 text-[12.5px] font-semibold text-zinc-600 transition hover:bg-zinc-900/[0.04] hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 disabled:opacity-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
            >
                {icon}
                <span className={cx("truncate", compact && "hidden sm:inline")}>{label}</span>
            </button>
            {open ? (
                <div
                    role="dialog"
                    aria-label={title}
                    className={cx(
                        "absolute bottom-full z-30 mb-2 w-[19rem] overflow-hidden rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-xl shadow-zinc-900/10 dark:border-white/10 dark:bg-zinc-900",
                        // Phones: pinned across the screen so it never overflows the edges.
                        "max-sm:fixed max-sm:inset-x-3 max-sm:bottom-28 max-sm:z-[140] max-sm:mb-0 max-sm:w-auto",
                        align === "end" ? "sm:end-0" : "sm:start-0",
                    )}
                >
                    <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-400">{title}</p>
                    <div role="radiogroup" aria-label={title}>
                        {options.map((option) => {
                            const selected = option.id === value;
                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    onClick={() => {
                                        onChange(option.id);
                                        setOpen(false);
                                        button.current?.focus();
                                    }}
                                    className={cx(
                                        "flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60",
                                        selected ? "bg-violet-500/10" : "hover:bg-zinc-900/[0.04] dark:hover:bg-white/[0.05]",
                                    )}
                                >
                                    {option.icon ? <span className="mt-0.5 shrink-0 text-violet-500">{option.icon}</span> : null}
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[13px] font-semibold text-zinc-900 dark:text-white">{option.label}</span>
                                        {option.description ? <span className="mt-0.5 block text-[11.5px] leading-snug text-zinc-500 dark:text-zinc-400">{option.description}</span> : null}
                                    </span>
                                    <span className={cx("mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2", selected ? "border-violet-500 bg-violet-500 shadow-[inset_0_0_0_2px_white] dark:shadow-[inset_0_0_0_2px_rgb(24,24,27)]" : "border-zinc-300 dark:border-zinc-600")} aria-hidden />
                                </button>
                            );
                        })}
                    </div>
                    {footer ? <div className="mt-1 border-t border-zinc-100 px-2.5 pb-1 pt-2 dark:border-white/[0.06]">{footer}</div> : null}
                </div>
            ) : null}
        </div>
    );
}
