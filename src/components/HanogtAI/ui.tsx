"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import ProductLogo from "@/components/ProductLogo";

export function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

/** Hanogt AI's logo at `size` CSS pixels. */
export function AiAvatar({ size = 28 }: { size?: number }) {
    return <ProductLogo product="ai" size={size} className="pointer-events-none select-none" />;
}

export const ICON_BUTTON = "inline-flex items-center justify-center rounded-lg p-1.5 text-ai-muted transition hover:bg-ai-ink/[0.06] hover:text-ai-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-ink/30 disabled:pointer-events-none disabled:opacity-40";

/** The primary action in Hanogt AI: ink on paper. */
export const INK_BUTTON = "inline-flex items-center justify-center gap-1.5 rounded-xl bg-ai-ink px-3.5 py-2 text-[13px] font-semibold text-ai-paper transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-ink/40 focus-visible:ring-offset-2 focus-visible:ring-offset-ai-paper disabled:opacity-40";

export interface MenuOption<T extends string> {
    id: T;
    label: string;
    description?: string;
    icon?: ReactNode;
    /** Listed but can't be chosen (e.g. a connection the plan doesn't cover). */
    disabled?: boolean;
}

/**
 * A small pill button with a popover of single-choice options (answer mode,
 * agent mode and model selectors in the composer). Closes on Escape, outside
 * clicks and choice.
 */
export function PillMenu<T extends string>({ label, icon, value, options, onChange, disabled, title, footer, align = "start", compact, maxWidth = "max-w-[11rem]" }: {
    label: string;
    icon?: ReactNode;
    value: T;
    options: Array<MenuOption<T>>;
    onChange: (value: T) => void;
    disabled?: boolean;
    title: string;
    /** Shown under the options; as a function it gets `close` for actions that leave the menu. */
    footer?: ReactNode | ((close: () => void) => ReactNode);
    align?: "start" | "end";
    /** Hide the text label on narrow screens. */
    compact?: boolean;
    /** Width limit of the pill. */
    maxWidth?: string;
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

    const close = () => setOpen(false);
    const footerContent = typeof footer === "function" ? footer(close) : footer;

    return (
        // min-w-0: in a tight composer row the pills shrink (their labels truncate) before anything is pushed out.
        <div ref={root} className="relative flex min-w-0">
            <button
                ref={button}
                type="button"
                disabled={disabled}
                onClick={() => setOpen((current) => !current)}
                aria-haspopup="true"
                aria-expanded={open}
                title={title}
                className={cx(
                    "inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full border border-ai-line px-2.5 text-[12.5px] font-semibold text-ai-ink/75 transition hover:bg-ai-ink/[0.04] hover:text-ai-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-ink/30 disabled:opacity-50",
                    maxWidth,
                )}
            >
                {icon}
                <span className={cx("truncate", compact && "hidden sm:inline")}>{label}</span>
            </button>
            {open ? (
                <div
                    role="dialog"
                    aria-label={title}
                    className={cx(
                        "absolute bottom-full z-30 mb-2 w-[19rem] overflow-hidden rounded-2xl border border-ai-line bg-ai-surface p-1.5 shadow-xl shadow-black/10",
                        // Phones: pinned across the screen so it never overflows the edges.
                        "max-sm:fixed max-sm:inset-x-3 max-sm:bottom-28 max-sm:z-[140] max-sm:mb-0 max-sm:w-auto",
                        align === "end" ? "sm:end-0" : "sm:start-0",
                    )}
                >
                    <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wider text-ai-muted">{title}</p>
                    <div role="radiogroup" aria-label={title} className="scrollbar-thin max-h-[min(22rem,50dvh)] overflow-y-auto">
                        {options.map((option) => {
                            const selected = option.id === value;
                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    disabled={option.disabled}
                                    onClick={() => {
                                        if (option.disabled) return;
                                        onChange(option.id);
                                        setOpen(false);
                                        button.current?.focus();
                                    }}
                                    className={cx(
                                        "flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-ink/30 disabled:cursor-not-allowed disabled:opacity-55",
                                        selected ? "bg-ai-ink/[0.06]" : "enabled:hover:bg-ai-ink/[0.04]",
                                    )}
                                >
                                    {option.icon ? <span className="mt-0.5 shrink-0 text-ai-ink/70">{option.icon}</span> : null}
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[13px] font-semibold text-ai-ink">{option.label}</span>
                                        {option.description ? <span className="mt-0.5 block text-[11.5px] leading-snug text-ai-muted">{option.description}</span> : null}
                                    </span>
                                    <span className={cx("mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2", selected ? "border-ai-ink bg-ai-ink shadow-[inset_0_0_0_2px_var(--ai-surface)]" : "border-ai-line")} aria-hidden />
                                </button>
                            );
                        })}
                    </div>
                    {footerContent ? <div className="mt-1 border-t border-ai-line px-2.5 pb-1 pt-2">{footerContent}</div> : null}
                </div>
            ) : null}
        </div>
    );
}
