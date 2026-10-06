"use client";

import { ChevronDown, ChevronRight, X } from "lucide-react";
import {
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
    type ComponentType,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export function cx(...values: Array<string | false | null | undefined>) {
    return values.filter(Boolean).join(" ");
}

export const inputClass = "h-7 w-full min-w-0 rounded-md border border-white/10 bg-zinc-950/70 px-2 text-[12px] text-zinc-100 outline-none transition placeholder:text-zinc-600 hover:border-white/20 focus:border-indigo-400/70 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50";

export function IconButton({ icon: Icon, label, onClick, active, disabled, className, size = "md", tone = "default" }: {
    icon: ComponentType<{ className?: string }>;
    label: string;
    onClick?: () => void;
    active?: boolean;
    disabled?: boolean;
    className?: string;
    size?: "sm" | "md";
    tone?: "default" | "danger" | "accent";
}) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={active}
            disabled={disabled}
            onClick={onClick}
            className={cx(
                "grid shrink-0 place-items-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-35",
                size === "sm" ? "h-6 w-6" : "h-8 w-8",
                active
                    ? "bg-indigo-500/20 text-indigo-200 ring-1 ring-inset ring-indigo-400/40"
                    : tone === "danger"
                        ? "text-zinc-400 hover:bg-red-500/15 hover:text-red-300"
                        : tone === "accent"
                            ? "text-indigo-300 hover:bg-indigo-500/15"
                            : "text-zinc-400 hover:bg-white/8 hover:text-zinc-100",
                className,
            )}
        >
            <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </button>
    );
}

export function Button({ children, onClick, variant = "secondary", disabled, className, type = "button", title }: {
    children: ReactNode;
    onClick?: () => void;
    variant?: "primary" | "secondary" | "danger" | "ghost";
    disabled?: boolean;
    className?: string;
    type?: "button" | "submit";
    title?: string;
}) {
    return (
        <button
            type={type}
            title={title}
            disabled={disabled}
            onClick={onClick}
            className={cx(
                "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
                variant === "primary" && "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-400",
                variant === "secondary" && "border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10",
                variant === "danger" && "border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20",
                variant === "ghost" && "text-zinc-300 hover:bg-white/8",
                className,
            )}
        >
            {children}
        </button>
    );
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

export function FieldRow({ label, children, title, wide }: { label: ReactNode; children: ReactNode; title?: string; wide?: boolean }) {
    return (
        <div className={cx("group/field grid items-center gap-2 py-[3px]", wide ? "grid-cols-1" : "grid-cols-[minmax(84px,38%)_1fr]")}>
            <span className="truncate text-[11.5px] text-zinc-400" title={title ?? (typeof label === "string" ? label : undefined)}>{label}</span>
            <div className="min-w-0">{children}</div>
        </div>
    );
}

/** Tiny arithmetic evaluator for number fields ("2*3", "-(1+4)/2"); no eval. */
export function evalArithmetic(source: string): number {
    const text = source.replace(/\s+/g, "");
    let index = 0;
    const peek = () => text[index];
    const number = (): number => {
        const match = /^\d*\.?\d+(?:e[+-]?\d+)?/i.exec(text.slice(index));
        if (!match) throw new Error("number");
        index += match[0].length;
        return Number(match[0]);
    };
    const factor = (): number => {
        if (peek() === "-") {
            index += 1;
            return -factor();
        }
        if (peek() === "+") {
            index += 1;
            return factor();
        }
        if (peek() === "(") {
            index += 1;
            const value = expression();
            if (peek() !== ")") throw new Error("paren");
            index += 1;
            return value;
        }
        return number();
    };
    const term = (): number => {
        let value = factor();
        while (peek() === "*" || peek() === "/") {
            const op = text[index++];
            const right = factor();
            value = op === "*" ? value * right : value / right;
        }
        return value;
    };
    const expression = (): number => {
        let value = term();
        while (peek() === "+" || peek() === "-") {
            const op = text[index++];
            const right = term();
            value = op === "+" ? value + right : value - right;
        }
        return value;
    };
    const result = expression();
    if (index !== text.length) throw new Error("trailing");
    return result;
}

function formatNumber(value: number, precision: number) {
    if (!Number.isFinite(value)) return "0";
    const fixed = value.toFixed(precision);
    return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

/**
 * Number input with a draggable label (like Unity): drag horizontally on the
 * label to scrub the value, type to set it exactly. Expressions like "2*3" work.
 */
export function NumberInput({ value, onChange, step = 0.1, min, max, precision = 3, label, labelClassName, disabled, integer, mixed }: {
    value: number;
    onChange: (value: number) => void;
    step?: number;
    min?: number;
    max?: number;
    precision?: number;
    label?: string;
    labelClassName?: string;
    disabled?: boolean;
    integer?: boolean;
    /** Several selected objects hold different values: shows "—" until edited. */
    mixed?: boolean;
}) {
    // `draft` holds the text while the field is focused; otherwise the prop is shown.
    const [draft, setDraft] = useState<string | null>(null);
    const drag = useRef<{ x: number; start: number; moved: boolean } | null>(null);
    const text = draft ?? (mixed ? "" : formatNumber(value, precision));

    const clampValue = useCallback((next: number) => {
        let result = next;
        if (integer) result = Math.round(result);
        if (min !== undefined) result = Math.max(min, result);
        if (max !== undefined) result = Math.min(max, result);
        return result;
    }, [integer, min, max]);

    const commit = () => {
        if (draft === null) return;
        const expression = draft.replace(",", ".").trim();
        setDraft(null);
        let parsed = Number(expression);
        if (!Number.isFinite(parsed) && /^[\d\s+\-*/().eE]+$/.test(expression)) {
            try {
                parsed = evalArithmetic(expression);
            } catch {
                parsed = NaN;
            }
        }
        if (Number.isFinite(parsed) && expression !== "") onChange(clampValue(parsed));
    };

    const onPointerDown = (event: React.PointerEvent<HTMLSpanElement>) => {
        if (disabled) return;
        event.preventDefault();
        (event.target as HTMLElement).setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, start: value, moved: false };
    };
    const onPointerMove = (event: React.PointerEvent<HTMLSpanElement>) => {
        const state = drag.current;
        if (!state) return;
        const dx = event.clientX - state.x;
        if (Math.abs(dx) > 2) state.moved = true;
        if (!state.moved) return;
        const factor = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
        const next = state.start + dx * step * factor;
        onChange(clampValue(Number(next.toFixed(integer ? 0 : Math.max(precision, 2)))));
    };
    const onPointerUp = () => {
        drag.current = null;
    };

    return (
        <div className={cx("flex h-7 min-w-0 items-stretch overflow-hidden rounded-md border border-white/10 bg-zinc-950/70 transition focus-within:border-indigo-400/70 hover:border-white/20", disabled && "opacity-50")}>
            {label ? (
                <span
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    className={cx("grid w-5 shrink-0 cursor-ew-resize select-none place-items-center text-[10px] font-bold", labelClassName ?? "text-zinc-400")}
                >
                    {label}
                </span>
            ) : null}
            <input
                value={text}
                disabled={disabled}
                inputMode="decimal"
                placeholder={mixed ? "—" : undefined}
                onFocus={(event) => {
                    setDraft(mixed ? "" : formatNumber(value, precision));
                    event.target.select();
                }}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                    if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                    if (event.key === "Escape") {
                        setDraft(null);
                        (event.target as HTMLInputElement).blur();
                    }
                    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                        event.preventDefault();
                        const delta = (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? step * 10 : step);
                        const next = clampValue(value + delta);
                        onChange(next);
                        setDraft(formatNumber(next, precision));
                    }
                }}
                className="min-w-0 flex-1 bg-transparent px-1.5 font-mono text-[11.5px] text-zinc-100 outline-none"
            />
        </div>
    );
}

export function VectorInput({ value, onChange, step = 0.1, hideZ, disabled, precision = 3, mixed }: {
    value: { x: number; y: number; z?: number };
    onChange: (value: { x: number; y: number; z: number }) => void;
    step?: number;
    hideZ?: boolean;
    disabled?: boolean;
    precision?: number;
    /** Axes that differ between selected objects. */
    mixed?: { x?: boolean; y?: boolean; z?: boolean };
}) {
    const z = value.z ?? 0;
    return (
        <div className={cx("grid gap-1", hideZ ? "grid-cols-2" : "grid-cols-3")}>
            <NumberInput label="X" labelClassName="text-red-400" value={value.x} step={step} precision={precision} disabled={disabled} mixed={mixed?.x} onChange={(x) => onChange({ x, y: value.y, z })} />
            <NumberInput label="Y" labelClassName="text-emerald-400" value={value.y} step={step} precision={precision} disabled={disabled} mixed={mixed?.y} onChange={(y) => onChange({ x: value.x, y, z })} />
            {!hideZ ? <NumberInput label="Z" labelClassName="text-sky-400" value={z} step={step} precision={precision} disabled={disabled} mixed={mixed?.z} onChange={(nextZ) => onChange({ x: value.x, y: value.y, z: nextZ })} /> : null}
        </div>
    );
}

export function SliderInput({ value, onChange, min, max, step = 0.01, disabled, integer }: {
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    step?: number;
    disabled?: boolean;
    integer?: boolean;
}) {
    return (
        <div className="flex items-center gap-2">
            <input
                type="range"
                min={min}
                max={max}
                step={integer ? 1 : step}
                value={value}
                disabled={disabled}
                onChange={(event) => onChange(Number(event.target.value))}
                className="h-1 min-w-0 flex-1 cursor-pointer accent-indigo-400"
            />
            <div className="w-16 shrink-0">
                <NumberInput value={value} onChange={onChange} min={min} max={max} step={step} integer={integer} disabled={disabled} precision={integer ? 0 : 3} />
            </div>
        </div>
    );
}

export function ColorInput({ value, onChange, disabled, allowAlpha, alpha, onAlphaChange }: {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    allowAlpha?: boolean;
    alpha?: number;
    onAlphaChange?: (value: number) => void;
}) {
    const [draft, setDraft] = useState<string | null>(null);
    const text = draft ?? value;
    return (
        <div className="flex min-w-0 items-center gap-1.5">
            <label className="relative h-7 w-9 shrink-0 cursor-pointer overflow-hidden rounded-md border border-white/15" style={{ background: value }}>
                <input type="color" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            </label>
            <input
                value={text}
                disabled={disabled}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => {
                    const normalized = text.trim().startsWith("#") ? text.trim() : `#${text.trim()}`;
                    setDraft(null);
                    if (/^#[0-9a-f]{6}$/i.test(normalized) && normalized.toLowerCase() !== value.toLowerCase()) onChange(normalized.toLowerCase());
                }}
                onKeyDown={(event) => {
                    if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                }}
                className={cx(inputClass, "font-mono uppercase")}
            />
            {allowAlpha && onAlphaChange ? (
                <div className="w-14 shrink-0" title="Alpha">
                    <NumberInput value={alpha ?? 1} min={0} max={1} step={0.01} precision={2} onChange={onAlphaChange} disabled={disabled} />
                </div>
            ) : null}
        </div>
    );
}

export function SelectInput<T extends string>({ value, onChange, options, disabled }: {
    value: T;
    onChange: (value: T) => void;
    /** Options with a group are listed under that heading (in the order the groups first appear). */
    options: Array<{ value: T; label: string; group?: string }>;
    disabled?: boolean;
}) {
    const item = (option: { value: T; label: string }) => <option key={option.value} value={option.value} className="bg-zinc-900">{option.label}</option>;
    const groups = [...new Set(options.map((option) => option.group))];
    return (
        <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as T)} className={cx(inputClass, "cursor-pointer pr-6")}>
            {groups.length === 1 && groups[0] === undefined
                ? options.map(item)
                : groups.map((group) => group === undefined
                    ? options.filter((option) => option.group === undefined).map(item)
                    : <optgroup key={group} label={group} className="bg-zinc-900">{options.filter((option) => option.group === group).map(item)}</optgroup>)}
        </select>
    );
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; label?: string }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cx(
                "relative h-[18px] w-8 shrink-0 rounded-full transition disabled:opacity-40",
                checked ? "bg-indigo-500" : "bg-zinc-700",
            )}
        >
            <span className={cx("absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-all", checked ? "left-[16px]" : "left-[2px]")} />
        </button>
    );
}

export function Checkbox({ checked, onChange, disabled, label }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; label?: string }) {
    return (
        <input
            type="checkbox"
            aria-label={label}
            checked={checked}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
            className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-indigo-400"
        />
    );
}

export function TextInput({ value, onChange, placeholder, disabled, commitOnBlur = true, className, multiline, maxLength, list }: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    commitOnBlur?: boolean;
    className?: string;
    multiline?: boolean;
    maxLength?: number;
    /** Id of a <datalist> with suggestions (single-line inputs). */
    list?: string;
}) {
    const [draft, setDraft] = useState<string | null>(null);
    const text = draft ?? value;
    const shared = {
        value: text,
        placeholder,
        disabled,
        maxLength,
        onBlur: () => {
            if (draft === null) return;
            setDraft(null);
            if (commitOnBlur && draft !== value) onChange(draft);
        },
    };
    if (multiline) {
        return (
            <textarea
                {...shared}
                rows={3}
                onChange={(event) => {
                    setDraft(event.target.value);
                    if (!commitOnBlur) onChange(event.target.value);
                }}
                className={cx(inputClass, "h-auto resize-y py-1.5 leading-relaxed", className)}
            />
        );
    }
    return (
        <input
            {...shared}
            list={list}
            onChange={(event) => {
                setDraft(event.target.value);
                if (!commitOnBlur) onChange(event.target.value);
            }}
            onKeyDown={(event) => {
                if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                if (event.key === "Escape") {
                    setDraft(null);
                    (event.target as HTMLInputElement).blur();
                }
            }}
            className={cx(inputClass, className)}
        />
    );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function PanelHeader({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
    return (
        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-white/[0.06] px-2">
            <div className="flex min-w-0 flex-1 items-center gap-1">{children}</div>
            {actions ? <div className="flex shrink-0 items-center gap-0.5">{actions}</div> : null}
        </div>
    );
}

export function TabButton({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: ReactNode; count?: number }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cx(
                "relative inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold transition",
                active ? "bg-white/[0.08] text-white" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200",
            )}
        >
            {children}
            {count ? <span className="rounded-full bg-red-500/80 px-1.5 text-[10px] font-bold leading-4 text-white">{count > 99 ? "99+" : count}</span> : null}
        </button>
    );
}

export function Section({ title, icon: Icon, iconClassName, enabled, onEnabledChange, actions, children, defaultOpen = true, subtitle }: {
    title: string;
    icon: ComponentType<{ className?: string }>;
    iconClassName?: string;
    enabled?: boolean;
    onEnabledChange?: (value: boolean) => void;
    actions?: ReactNode;
    children: ReactNode;
    defaultOpen?: boolean;
    subtitle?: ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    const id = useId();
    return (
        <section className="border-b border-white/[0.06]">
            <div className="group flex h-9 items-center gap-1.5 px-2">
                <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id} className="grid h-5 w-5 place-items-center rounded text-zinc-500 hover:text-zinc-200">
                    {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
                <Icon className={cx("h-4 w-4 shrink-0", iconClassName ?? "text-zinc-400")} />
                {onEnabledChange ? <Checkbox checked={enabled ?? true} onChange={onEnabledChange} label={`${title} enabled`} /> : null}
                <button type="button" onClick={() => setOpen(!open)} className="min-w-0 flex-1 truncate text-left text-[12.5px] font-semibold text-zinc-100">
                    {title}
                    {subtitle ? <span className="ml-1.5 font-normal text-zinc-500">{subtitle}</span> : null}
                </button>
                <div className="flex items-center gap-0.5 opacity-70 transition group-hover:opacity-100">{actions}</div>
            </div>
            {open ? <div id={id} className={cx("px-3 pb-3 pt-0.5", enabled === false && "opacity-60")}>{children}</div> : null}
        </section>
    );
}

// ---------------------------------------------------------------------------
// Menus & dialogs
// ---------------------------------------------------------------------------

export interface MenuItem {
    label: string;
    icon?: ComponentType<{ className?: string }>;
    onSelect?: () => void;
    disabled?: boolean;
    danger?: boolean;
    shortcut?: string;
    items?: MenuItem[];
    separator?: boolean;
}

function MenuList({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
    const [openSub, setOpenSub] = useState<number | null>(null);
    return (
        <div role="menu" className="min-w-[200px] rounded-xl border border-white/10 bg-zinc-900/95 p-1 text-[12.5px] shadow-2xl shadow-black/50 backdrop-blur-xl">
            {items.map((item, index) => {
                if (item.separator) return <div key={`sep-${index}`} className="my-1 h-px bg-white/[0.07]" />;
                const Icon = item.icon;
                return (
                    <div key={`${item.label}-${index}`} className="relative" onMouseEnter={() => setOpenSub(item.items ? index : null)}>
                        <button
                            type="button"
                            role="menuitem"
                            disabled={item.disabled}
                            onClick={() => {
                                if (item.items) {
                                    setOpenSub(openSub === index ? null : index);
                                    return;
                                }
                                item.onSelect?.();
                                onClose();
                            }}
                            className={cx(
                                "flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40",
                                item.danger ? "text-red-300 hover:bg-red-500/15" : "text-zinc-200 hover:bg-white/[0.07]",
                            )}
                        >
                            {Icon ? <Icon className="h-4 w-4 shrink-0 text-zinc-400" /> : <span className="w-4" />}
                            <span className="flex-1 truncate">{item.label}</span>
                            {item.shortcut ? <kbd className="text-[10px] text-zinc-500">{item.shortcut}</kbd> : null}
                            {item.items ? <ChevronRight className="h-3.5 w-3.5 text-zinc-500" /> : null}
                        </button>
                        {item.items && openSub === index ? (
                            <div className="absolute left-full top-0 z-10 pl-1">
                                <MenuList items={item.items} onClose={onClose} />
                            </div>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}

/** Dropdown anchored to a trigger element. */
export function Dropdown({ trigger, items, align = "left" }: { trigger: (props: { open: boolean; toggle: () => void }) => ReactNode; items: MenuItem[]; align?: "left" | "right" }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (!open) return;
        const onDown = (event: PointerEvent) => {
            if (!ref.current?.contains(event.target as Node)) setOpen(false);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        window.addEventListener("pointerdown", onDown);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("pointerdown", onDown);
            window.removeEventListener("keydown", onKey);
        };
    }, [open]);
    return (
        <div ref={ref} className="relative">
            {trigger({ open, toggle: () => setOpen(!open) })}
            {open ? (
                <div className={cx("absolute top-full z-50 mt-1", align === "right" ? "right-0" : "left-0")}>
                    <MenuList items={items} onClose={() => setOpen(false)} />
                </div>
            ) : null}
        </div>
    );
}

/** Context menu at a screen position. */
export function ContextMenu({ position, items, onClose }: { position: { x: number; y: number } | null; items: MenuItem[]; onClose: () => void }) {
    const ref = useRef<HTMLDivElement | null>(null);
    useLayoutEffect(() => {
        const element = ref.current;
        if (!position || !element) return;
        // Keep the menu inside the viewport (measured after layout, applied directly to the DOM).
        const rect = element.getBoundingClientRect();
        element.style.left = `${Math.max(8, Math.min(position.x, window.innerWidth - rect.width - 8))}px`;
        element.style.top = `${Math.max(8, Math.min(position.y, window.innerHeight - rect.height - 8))}px`;
    }, [position]);
    useEffect(() => {
        if (!position) return;
        const onDown = (event: PointerEvent) => {
            if (!ref.current?.contains(event.target as Node)) onClose();
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("pointerdown", onDown);
        window.addEventListener("keydown", onKey);
        window.addEventListener("blur", onClose);
        return () => {
            window.removeEventListener("pointerdown", onDown);
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("blur", onClose);
        };
    }, [position, onClose]);
    if (!position || typeof document === "undefined") return null;
    return createPortal(
        <div ref={ref} className="fixed z-[200]" style={{ left: position.x, top: position.y }}>
            <MenuList items={items} onClose={onClose} />
        </div>,
        document.body,
    );
}

export function Modal({ open, title, onClose, children, footer, width = "max-w-lg", icon: Icon }: {
    open: boolean;
    title: string;
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
    width?: string;
    icon?: ComponentType<{ className?: string }>;
}) {
    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);
    if (!open || typeof document === "undefined") return null;
    return createPortal(
        <div className="fixed inset-0 z-[150] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
            <div role="dialog" aria-modal="true" aria-label={title} className={cx("flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 text-zinc-100 shadow-2xl shadow-black/60 animate-fade-up", width)}>
                <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3">
                    {Icon ? <Icon className="h-4 w-4 text-indigo-300" /> : null}
                    <h2 className="flex-1 text-sm font-bold">{title}</h2>
                    <IconButton icon={X} label="Kapat" onClick={onClose} size="sm" />
                </div>
                <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
                {footer ? <div className="flex items-center justify-end gap-2 border-t border-white/[0.07] px-4 py-3">{footer}</div> : null}
            </div>
        </div>,
        document.body,
    );
}

/** Minimal toast queue for the editor. */
export interface ToastMessage {
    id: number;
    tone: "info" | "success" | "error";
    text: string;
}

export function Toasts({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: number) => void }) {
    return (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-[300] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2" aria-live="polite">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={cx(
                        "pointer-events-auto flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[12.5px] shadow-2xl backdrop-blur-xl animate-fade-up",
                        toast.tone === "error" && "border-red-500/30 bg-red-950/90 text-red-100",
                        toast.tone === "success" && "border-emerald-500/30 bg-emerald-950/90 text-emerald-100",
                        toast.tone === "info" && "border-white/10 bg-zinc-900/95 text-zinc-100",
                    )}
                >
                    <span className="flex-1 whitespace-pre-line">{toast.text}</span>
                    <button type="button" onClick={() => onDismiss(toast.id)} className="text-white/50 hover:text-white" aria-label="Kapat"><X className="h-3.5 w-3.5" /></button>
                </div>
            ))}
        </div>
    );
}

export function useToasts() {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const counter = useRef(0);
    const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
    const push = useCallback((text: string, tone: ToastMessage["tone"] = "info") => {
        counter.current += 1;
        const id = counter.current;
        setToasts((current) => [...current.slice(-3), { id, tone, text }]);
        window.setTimeout(() => dismiss(id), tone === "error" ? 6000 : 3200);
    }, [dismiss]);
    return { toasts, push, dismiss };
}
