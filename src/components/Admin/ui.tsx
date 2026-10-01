"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, LoaderCircle, RefreshCw, Search, X, type LucideIcon } from "lucide-react";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useId,
    useRef,
    useState,
    type ButtonHTMLAttributes,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import OptimizedImage from "@/components/OptimizedImage";
import { useI18n } from "@/lib/i18n";
import type { ApiFailure } from "./api";
import { COMMON, ERROR_COPY, RATE_LIMIT_WAIT } from "./copy";
import { formatDateTime, formatRelativeTime, useNow } from "./hooks";
import type { Tone } from "./tones";

export function cx(...values: Array<string | false | null | undefined>) {
    return values.filter(Boolean).join(" ");
}

export const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950";
export const INPUT_CLASS = "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950/60 dark:text-zinc-100";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Translated message for an API failure, based on its `code`. */
export function useErrorText() {
    const { tx } = useI18n();
    return useCallback((error: ApiFailure) => {
        if (error.code === "rate_limited" && error.retryAfter) return tx(RATE_LIMIT_WAIT, { seconds: error.retryAfter });
        return tx(ERROR_COPY[error.code] ?? ERROR_COPY.unknown);
    }, [tx]);
}

// ---------------------------------------------------------------------------
// Buttons, badges, inputs
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
    primary: "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/20 hover:from-indigo-500 hover:to-violet-500",
    secondary: "border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100 dark:hover:bg-white/[0.08]",
    ghost: "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]",
    danger: "bg-red-600 text-white shadow-lg shadow-red-600/20 hover:bg-red-500",
    success: "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500",
};

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
    variant?: ButtonVariant;
    size?: "sm" | "md";
    icon?: LucideIcon;
    busy?: boolean;
    type?: "button" | "submit";
};

export function Button({ variant = "secondary", size = "md", icon: Icon, busy = false, type = "button", className, disabled, children, ...props }: ButtonProps) {
    return (
        <button
            {...props}
            type={type === "submit" ? "submit" : "button"}
            disabled={disabled || busy}
            aria-busy={busy || undefined}
            className={cx(
                "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
                BUTTON_VARIANTS[variant],
                FOCUS_RING,
                className,
            )}
        >
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
            {children}
        </button>
    );
}

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "children"> & {
    label: string;
    icon: LucideIcon;
    tone?: "default" | "danger" | "success" | "warning";
    busy?: boolean;
    active?: boolean;
};

const ICON_TONES = {
    default: "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-white/[0.08] dark:hover:text-white",
    danger: "text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400",
    success: "text-zinc-500 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400",
    warning: "text-zinc-500 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10 dark:hover:text-amber-400",
} as const;

export function IconButton({ label, icon: Icon, tone = "default", busy = false, active = false, className, disabled, ...props }: IconButtonProps) {
    return (
        <button
            {...props}
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={active || undefined}
            disabled={disabled || busy}
            className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-40", ICON_TONES[tone], FOCUS_RING, className)}
        >
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
        </button>
    );
}

export type { Tone } from "./tones";

const BADGE_TONES: Record<Tone, string> = {
    zinc: "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-white/[0.06] dark:text-zinc-300 dark:ring-white/10",
    indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/25",
    violet: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/25",
    fuchsia: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:ring-fuchsia-500/25",
    sky: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/25",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25",
    amber: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25",
    red: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25",
};

export function Badge({ tone = "zinc", icon: Icon, className, children }: { tone?: Tone; icon?: LucideIcon; className?: string; children: ReactNode }) {
    return (
        <span className={cx("inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset", BADGE_TONES[tone], className)}>
            {Icon ? <Icon className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
            <span className="truncate">{children}</span>
        </span>
    );
}

export function SearchInput({ value, onChange, label, placeholder, className }: { value: string; onChange: (value: string) => void; label: string; placeholder?: string; className?: string }) {
    return (
        <label className={cx("relative block", className)}>
            <span className="sr-only">{label}</span>
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
            <input
                type="search"
                value={value}
                maxLength={120}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                className={cx(INPUT_CLASS, "h-10 ps-9")}
            />
        </label>
    );
}

export type ChipOption<T extends string> = { value: T; label: string; count?: number };

/** A row of toggle chips that acts as a single-choice filter. */
export function FilterChips<T extends string>({ options, value, onChange, label }: { options: Array<ChipOption<T>>; value: T; onChange: (value: T) => void; label: string }) {
    return (
        <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onChange(option.value)}
                        className={cx(
                            "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-bold transition",
                            active
                                ? "bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900"
                                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/[0.06] dark:text-zinc-300 dark:hover:bg-white/[0.1]",
                            FOCUS_RING,
                        )}
                    >
                        {option.label}
                        {option.count !== undefined ? (
                            <span className={cx("rounded-full px-1.5 text-[10px] tabular-nums", active ? "bg-white/20 dark:bg-zinc-900/15" : "bg-zinc-200 dark:bg-white/10")}>{option.count}</span>
                        ) : null}
                    </button>
                );
            })}
        </div>
    );
}

export function Switch({ checked, onChange, label, disabled = false, busy = false }: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean; busy?: boolean }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            title={label}
            disabled={disabled || busy}
            onClick={() => onChange(!checked)}
            className={cx(
                "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50",
                checked ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700",
                FOCUS_RING,
            )}
        >
            <span className={cx(
                "inline-grid h-5 w-5 place-items-center rounded-full bg-white shadow transition-transform",
                checked ? "translate-x-5.5 rtl:-translate-x-5.5" : "translate-x-0.5 rtl:-translate-x-0.5",
            )}>
                {busy ? <LoaderCircle className="h-3 w-3 animate-spin text-zinc-500" aria-hidden="true" /> : null}
            </span>
        </button>
    );
}

// ---------------------------------------------------------------------------
// Layout pieces
// ---------------------------------------------------------------------------

export function Panel({ title, description, icon: Icon, actions, className, bodyClassName, children }: {
    title?: ReactNode;
    description?: ReactNode;
    icon?: LucideIcon;
    actions?: ReactNode;
    className?: string;
    bodyClassName?: string;
    children: ReactNode;
}) {
    return (
        <section className={cx("rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-900/70", className)}>
            {title || actions ? (
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-white/[0.06]">
                    <div className="flex min-w-0 items-center gap-3">
                        {Icon ? (
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
                                <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                            </span>
                        ) : null}
                        <div className="min-w-0">
                            {title ? <h2 className="truncate text-[15px] font-black text-zinc-900 dark:text-white">{title}</h2> : null}
                            {description ? <p className="truncate text-[12px] text-zinc-500 dark:text-zinc-400">{description}</p> : null}
                        </div>
                    </div>
                    {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
                </header>
            ) : null}
            <div className={bodyClassName ?? "p-5"}>{children}</div>
        </section>
    );
}

export function SectionHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
    return (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
                <h2 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">{title}</h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
    );
}

const NOTICE_TONES = {
    error: { box: "border-red-200 bg-red-50 text-red-900 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-100", icon: AlertTriangle, iconClass: "text-red-500" },
    warning: { box: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100", icon: AlertTriangle, iconClass: "text-amber-500" },
    info: { box: "border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-500/25 dark:bg-indigo-500/10 dark:text-indigo-100", icon: Info, iconClass: "text-indigo-500" },
    success: { box: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-100", icon: CheckCircle2, iconClass: "text-emerald-500" },
} as const;

export function Notice({ tone = "info", action, className, children }: { tone?: keyof typeof NOTICE_TONES; action?: ReactNode; className?: string; children: ReactNode }) {
    const style = NOTICE_TONES[tone];
    const Icon = style.icon;
    return (
        <div role={tone === "error" ? "alert" : "status"} className={cx("flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm", style.box, className)}>
            <Icon className={cx("h-4.5 w-4.5 shrink-0", style.iconClass)} aria-hidden="true" />
            <div className="min-w-0 flex-1">{children}</div>
            {action}
        </div>
    );
}

export function ErrorNotice({ error, onRetry, className }: { error: ApiFailure; onRetry?: () => void; className?: string }) {
    const { tx } = useI18n();
    const errorText = useErrorText();
    return (
        <Notice tone="error" className={className} action={onRetry ? <Button size="sm" icon={RefreshCw} onClick={onRetry}>{tx(COMMON.retry)}</Button> : undefined}>
            {errorText(error)}
        </Notice>
    );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: ReactNode }) {
    return (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/60 px-6 py-12 text-center dark:border-white/10 dark:bg-white/[0.02]">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-zinc-100 text-zinc-400 dark:bg-white/[0.06] dark:text-zinc-500">
                <Icon className="h-6 w-6" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-[15px] font-black text-zinc-900 dark:text-white">{title}</h3>
            {description ? <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">{description}</p> : null}
            {action ? <div className="mt-5">{action}</div> : null}
        </div>
    );
}

/** Skeleton rows shown while a list loads. */
export function LoadingRows({ rows = 4, className }: { rows?: number; className?: string }) {
    const { tx } = useI18n();
    return (
        <div className={cx("space-y-3", className)} role="status" aria-live="polite">
            <span className="sr-only">{tx(COMMON.loading)}</span>
            {Array.from({ length: rows }, (_, index) => (
                <div key={index} className="flex animate-pulse items-center gap-3 rounded-2xl border border-zinc-100 p-4 dark:border-white/[0.06]">
                    <span className="h-9 w-9 shrink-0 rounded-full bg-zinc-200 dark:bg-white/10" />
                    <span className="flex-1 space-y-2">
                        <span className="block h-3 w-2/5 rounded-full bg-zinc-200 dark:bg-white/10" />
                        <span className="block h-3 w-3/4 rounded-full bg-zinc-100 dark:bg-white/[0.06]" />
                    </span>
                </div>
            ))}
        </div>
    );
}

export function Spinner({ label, className }: { label: string; className?: string }) {
    return (
        <span role="status" className={cx("inline-flex items-center gap-2 text-sm text-zinc-500", className)}>
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>{label}</span>
        </span>
    );
}

export function Avatar({ src, name, size = 36 }: { src: string | null; name: string; size?: number }) {
    const [failed, setFailed] = useState(false);
    const initial = (name.trim().charAt(0) || "?").toLocaleUpperCase();
    if (src && !failed) {
        return (
            <OptimizedImage
                src={src}
                alt=""
                width={size}
                height={size}
                referrerPolicy="no-referrer"
                onError={() => setFailed(true)}
                className="shrink-0 rounded-full object-cover ring-1 ring-zinc-200 dark:ring-white/10"
                style={{ width: size, height: size }}
            />
        );
    }
    return (
        <span
            aria-hidden="true"
            className="grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 font-bold text-white"
            style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
        >
            {initial}
        </span>
    );
}

export function RelativeTime({ iso, className }: { iso: string | null | undefined; className?: string }) {
    const { locale } = useI18n();
    const now = useNow();
    if (!iso) return <span className={className}>—</span>;
    const absolute = formatDateTime(iso, locale);
    return (
        <time dateTime={iso} title={absolute} className={className}>
            {formatRelativeTime(iso, now, locale) || absolute}
        </time>
    );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

const FOCUSABLE = "a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

/**
 * Accessible modal rendered into document.body: Escape and the backdrop close
 * it (unless busy), focus is trapped inside and restored afterwards.
 */
export function Dialog({ open, onClose, title, description, icon: Icon, tone = "default", busy = false, size = "md", footer, children }: {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    icon?: LucideIcon;
    tone?: "default" | "danger" | "success";
    busy?: boolean;
    size?: "md" | "lg";
    footer?: ReactNode;
    children?: ReactNode;
}) {
    const { tx } = useI18n();
    const titleId = useId();
    const descriptionId = useId();
    const panelRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    const busyRef = useRef(busy);

    useEffect(() => {
        onCloseRef.current = onClose;
        busyRef.current = busy;
    });

    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const focusTimer = window.setTimeout(() => {
            const panel = panelRef.current;
            const target = panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
            target?.focus();
        }, 0);
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !busyRef.current) {
                event.stopPropagation();
                onCloseRef.current();
                return;
            }
            if (event.key !== "Tab" || !panelRef.current) return;
            const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener("keydown", onKey);
        return () => {
            window.clearTimeout(focusTimer);
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = previousOverflow;
            previous?.focus();
        };
    }, [open]);

    if (typeof document === "undefined") return null;
    const iconTone = tone === "danger"
        ? "bg-red-500/10 text-red-600 dark:text-red-400"
        : tone === "success" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300";

    return createPortal(
        <AnimatePresence>
            {open ? (
                <motion.div
                    key="dialog"
                    className="fixed inset-0 z-[80] flex items-end justify-center bg-zinc-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget && !busy) onClose();
                    }}
                >
                    <motion.div
                        ref={panelRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={titleId}
                        aria-describedby={description ? descriptionId : undefined}
                        tabIndex={-1}
                        initial={{ opacity: 0, y: 24, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 16, scale: 0.98 }}
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        className={cx(
                            "flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-zinc-200 bg-white text-zinc-900 shadow-2xl outline-none sm:rounded-3xl dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100",
                            size === "lg" ? "sm:max-w-3xl" : "sm:max-w-lg",
                        )}
                    >
                        <div className="flex items-start gap-3 border-b border-zinc-100 px-5 py-4 dark:border-white/[0.06]">
                            {Icon ? (
                                <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-xl", iconTone)}>
                                    <Icon className="h-5 w-5" aria-hidden="true" />
                                </span>
                            ) : null}
                            <div className="min-w-0 flex-1">
                                <h2 id={titleId} className="text-lg font-black leading-tight">{title}</h2>
                                {description ? <p id={descriptionId} className="mt-1 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">{description}</p> : null}
                            </div>
                            <IconButton label={tx(COMMON.close)} icon={X} onClick={onClose} disabled={busy} />
                        </div>
                        {children ? <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div> : null}
                        {footer ? (
                            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/70 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-white/[0.06] dark:bg-white/[0.02]">
                                {footer}
                            </div>
                        ) : null}
                    </motion.div>
                </motion.div>
            ) : null}
        </AnimatePresence>,
        document.body,
    );
}

/** Confirmation for consequential actions, with optional extra fields and an inline error. */
export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel, icon, tone = "danger", busy = false, error = null, confirmDisabled = false, children }: {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description?: string;
    confirmLabel: string;
    icon?: LucideIcon;
    tone?: "default" | "danger" | "success";
    busy?: boolean;
    error?: ApiFailure | null;
    confirmDisabled?: boolean;
    children?: ReactNode;
}) {
    const { tx } = useI18n();
    return (
        <Dialog
            open={open}
            onClose={onClose}
            title={title}
            description={description}
            icon={icon}
            tone={tone}
            busy={busy}
            footer={(
                <>
                    {/* Destructive confirmations start on "Cancel" unless a field asks for focus first. */}
                    <Button variant="ghost" onClick={onClose} disabled={busy} data-autofocus>{tx(COMMON.cancel)}</Button>
                    <Button variant={tone === "danger" ? "danger" : tone === "success" ? "success" : "primary"} busy={busy} disabled={confirmDisabled} onClick={onConfirm}>
                        {confirmLabel}
                    </Button>
                </>
            )}
        >
            {children || error ? (
                <div className="space-y-4">
                    {children}
                    {error ? <ErrorNotice error={error} /> : null}
                </div>
            ) : null}
        </Dialog>
    );
}

export function TextArea({ label, value, onChange, max, rows = 3, placeholder, hint, autoFocus = false, disabled = false, optional = false }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    max: number;
    rows?: number;
    placeholder?: string;
    hint?: string;
    autoFocus?: boolean;
    disabled?: boolean;
    optional?: boolean;
}) {
    const { tx } = useI18n();
    const id = useId();
    const over = value.length > max;
    return (
        <div>
            <label htmlFor={id} className="mb-1.5 block text-[13px] font-bold text-zinc-700 dark:text-zinc-200">
                {label}
                {optional ? <span className="ms-1 font-normal text-zinc-400">{tx(COMMON.optional)}</span> : null}
            </label>
            <textarea
                id={id}
                value={value}
                rows={rows}
                placeholder={placeholder}
                disabled={disabled}
                data-autofocus={autoFocus || undefined}
                onChange={(event) => onChange(event.target.value)}
                aria-invalid={over || undefined}
                className={cx(INPUT_CLASS, "resize-y leading-relaxed", over && "border-red-400 focus:border-red-500 focus:ring-red-500/20")}
            />
            <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-zinc-500">
                <span className="min-w-0">{hint}</span>
                <span className={cx("shrink-0 tabular-nums", over && "font-bold text-red-500")}>{tx(COMMON.characters, { count: value.length, max })}</span>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

type ToastTone = "success" | "error" | "info";
type ToastItem = { id: number; tone: ToastTone; message: string };

const ToastContext = createContext<(tone: ToastTone, message: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const counter = useRef(0);
    const push = useCallback((tone: ToastTone, message: string) => {
        counter.current += 1;
        const id = counter.current;
        setToasts((current) => [...current.slice(-3), { id, tone, message }]);
        window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4_500);
    }, []);
    const dismiss = (id: number) => setToasts((current) => current.filter((toast) => toast.id !== id));
    const { tx } = useI18n();

    return (
        <ToastContext.Provider value={push}>
            {children}
            <div aria-live="polite" className="pointer-events-none fixed inset-x-3 bottom-3 z-[90] flex flex-col items-center gap-2 sm:inset-x-auto sm:end-4 sm:bottom-4 sm:w-[360px]">
                <AnimatePresence initial={false}>
                    {toasts.map((toast) => {
                        const Icon = toast.tone === "success" ? CheckCircle2 : toast.tone === "error" ? AlertTriangle : Info;
                        return (
                            <motion.div
                                key={toast.id}
                                layout
                                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                                role={toast.tone === "error" ? "alert" : "status"}
                                className="pointer-events-auto flex w-full items-start gap-3 rounded-2xl border border-zinc-200 bg-white/95 px-4 py-3 text-sm text-zinc-800 shadow-xl backdrop-blur dark:border-white/10 dark:bg-zinc-900/95 dark:text-zinc-100"
                            >
                                <Icon className={cx("mt-0.5 h-4.5 w-4.5 shrink-0", toast.tone === "success" ? "text-emerald-500" : toast.tone === "error" ? "text-red-500" : "text-indigo-500")} aria-hidden="true" />
                                <p className="min-w-0 flex-1 leading-snug">{toast.message}</p>
                                <button type="button" onClick={() => dismiss(toast.id)} aria-label={tx(COMMON.close)} className={cx("rounded-md p-0.5 text-zinc-400 transition hover:text-zinc-700 dark:hover:text-zinc-200", FOCUS_RING)}>
                                    <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    return useContext(ToastContext);
}
