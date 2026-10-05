"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Crown, Info, LoaderCircle, Shield, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import OptimizedImage from "@/components/OptimizedImage";
import { useI18n, type Copy } from "@/lib/i18n";
import { GROUP_COLORS, GROUP_ROLE_COPY, type GroupColor, type GroupRole } from "@/lib/groups";

export function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

export const UI_COPY = {
    close: { TR: "Kapat", EN: "Close" },
    cancel: { TR: "Vazgeç", EN: "Cancel" },
    dismiss: { TR: "Bildirimi kapat", EN: "Dismiss notification" },
    you: { TR: "Sen", EN: "You" },
    today: { TR: "Bugün", EN: "Today" },
    yesterday: { TR: "Dün", EN: "Yesterday" },
} satisfies Record<string, Copy>;

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

function safeFormat(fn: () => string, fallback: string) {
    try {
        return fn();
    } catch {
        return fallback;
    }
}

/** "now", "5 minutes ago", "in 2 days"… in the active UI language. */
export function relativeTime(ms: number, now: number, locale: string) {
    if (!ms) return "";
    const diff = ms - now;
    const abs = Math.abs(diff);
    return safeFormat(() => {
        const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
        if (abs < 45_000) return rtf.format(0, "second");
        if (abs < 45 * 60_000) return rtf.format(Math.round(diff / 60_000), "minute");
        if (abs < 22 * 3_600_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
        if (abs < 7 * 86_400_000) return rtf.format(Math.round(diff / 86_400_000), "day");
        return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: new Date(ms).getFullYear() === new Date(now).getFullYear() ? undefined : "numeric" }).format(ms);
    }, new Date(ms).toLocaleDateString());
}

export function clockTime(ms: number, locale: string) {
    return safeFormat(() => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(ms), new Date(ms).toLocaleTimeString());
}

export function fullDateTime(ms: number, locale: string) {
    return safeFormat(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(ms), new Date(ms).toLocaleString());
}

export function dayKey(ms: number) {
    const date = new Date(ms);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/* -------------------------------------------------------------------------- */
/* Avatars and badges                                                         */
/* -------------------------------------------------------------------------- */

const TILE_SIZES = {
    xs: "h-7 w-7 rounded-lg text-sm",
    sm: "h-9 w-9 rounded-xl text-lg",
    md: "h-12 w-12 rounded-2xl text-2xl",
    lg: "h-16 w-16 rounded-2xl text-3xl",
    xl: "h-20 w-20 rounded-3xl text-4xl",
} as const;

export function GroupTile({ emoji, color, size = "md", className }: { emoji: string; color: GroupColor; size?: keyof typeof TILE_SIZES; className?: string }) {
    const palette = GROUP_COLORS[color] ?? GROUP_COLORS.indigo;
    return (
        <span className={cx("inline-flex shrink-0 select-none items-center justify-center bg-gradient-to-br shadow-lg", palette.gradient, palette.shadow, TILE_SIZES[size], className)} aria-hidden>
            <span className="drop-shadow-sm">{emoji}</span>
        </span>
    );
}

const AVATAR_SIZES = {
    xs: { box: "h-6 w-6 text-[10px]", dot: "h-2 w-2" },
    sm: { box: "h-8 w-8 text-xs", dot: "h-2.5 w-2.5" },
    md: { box: "h-10 w-10 text-sm", dot: "h-3 w-3" },
    lg: { box: "h-14 w-14 text-lg", dot: "h-3.5 w-3.5" },
} as const;

const AVATAR_GRADIENTS = [
    "from-indigo-500 to-violet-600",
    "from-fuchsia-500 to-pink-600",
    "from-sky-500 to-indigo-600",
    "from-emerald-500 to-teal-600",
    "from-amber-400 to-orange-500",
    "from-rose-500 to-fuchsia-600",
];

function gradientFor(name: string) {
    let hash = 0;
    for (let index = 0; index < name.length; index += 1) hash = (hash * 31 + name.charCodeAt(index)) | 0;
    return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

export function UserAvatar({ name, src, size = "md", online, className }: { name: string; src?: string | null; size?: keyof typeof AVATAR_SIZES; online?: boolean; className?: string }) {
    const style = AVATAR_SIZES[size];
    const initial = (name.trim()[0] || "?").toLocaleUpperCase();
    return (
        <span className={cx("relative inline-flex shrink-0", style.box, className)}>
            {src ? (
                <OptimizedImage src={src} alt="" width={56} height={56} className="h-full w-full rounded-full object-cover" referrerPolicy="no-referrer" />
            ) : (
                <span className={cx("flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br font-bold text-white", gradientFor(name))} aria-hidden>{initial}</span>
            )}
            {online !== undefined && (
                <span className={cx("absolute -bottom-0.5 -end-0.5 rounded-full border-2 border-white dark:border-zinc-900", style.dot, online ? "bg-emerald-500" : "bg-zinc-400 dark:bg-zinc-600")} aria-hidden />
            )}
        </span>
    );
}

export function AvatarStack({ people, total, max = 4 }: { people: Array<{ username: string; avatarUrl: string | null }>; total: number; max?: number }) {
    const shown = people.slice(0, max);
    const extra = Math.max(0, total - shown.length);
    return (
        <span className="flex items-center">
            {shown.map((person, index) => (
                <UserAvatar key={`${person.username}-${index}`} name={person.username} src={person.avatarUrl} size="sm" className={cx("rounded-full ring-2 ring-white dark:ring-zinc-900", index > 0 && "-ms-2")} />
            ))}
            {extra > 0 && <span className="-ms-2 flex h-8 min-w-8 items-center justify-center rounded-full bg-zinc-100 px-1.5 text-[11px] font-bold text-zinc-600 ring-2 ring-white dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-900">+{extra}</span>}
        </span>
    );
}

export function RoleBadge({ role, compact = false, showMember = false }: { role: GroupRole; compact?: boolean; showMember?: boolean }) {
    const { tx } = useI18n();
    if (role === "member" && !showMember) return null;
    const style = role === "owner"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        : role === "admin" ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400";
    const Icon = role === "owner" ? Crown : role === "admin" ? Shield : null;
    return (
        <span className={cx("inline-flex shrink-0 items-center gap-1 rounded-full font-bold", compact ? "p-1" : "px-2 py-0.5 text-[11px]", style)} title={tx(GROUP_ROLE_COPY[role])}>
            {Icon && <Icon className="h-3 w-3" aria-hidden />}
            {compact ? <span className="sr-only">{tx(GROUP_ROLE_COPY[role])}</span> : tx(GROUP_ROLE_COPY[role])}
        </span>
    );
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
    return <LoaderCircle className={cx("animate-spin", className)} aria-hidden />;
}

/* -------------------------------------------------------------------------- */
/* Dialogs                                                                    */
/* -------------------------------------------------------------------------- */

const MODAL_SIZES = { sm: "sm:max-w-md", md: "sm:max-w-xl", lg: "sm:max-w-3xl", xl: "sm:max-w-5xl" } as const;

/**
 * Accessible dialog: bottom sheet on phones, centered card from `sm` up.
 * Escape and a click on the backdrop close it; focus returns afterwards.
 */
export function Modal({ open, onClose, labelledBy, size = "md", dismissible = true, elevated = false, children }: { open: boolean; onClose: () => void; labelledBy: string; size?: keyof typeof MODAL_SIZES; dismissible?: boolean; /** Above the call screen and its bars. */ elevated?: boolean; children: ReactNode }) {
    const onCloseRef = useRef(onClose);
    const panelRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        onCloseRef.current = onClose;
    });
    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape" && dismissible) {
                event.stopPropagation();
                onCloseRef.current();
            }
        };
        window.addEventListener("keydown", onKey);
        const frame = window.requestAnimationFrame(() => {
            const target = panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panelRef.current;
            target?.focus();
        });
        const root = document.documentElement;
        const overflow = root.style.overflow;
        root.style.overflow = "hidden";
        return () => {
            window.removeEventListener("keydown", onKey);
            window.cancelAnimationFrame(frame);
            root.style.overflow = overflow;
            previous?.focus();
        };
    }, [open, dismissible]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className={cx("fixed inset-0 flex items-end justify-center bg-zinc-950/70 backdrop-blur-sm sm:items-center sm:p-4", elevated ? "z-[150]" : "z-[80]")}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onPointerDown={(event) => { if (dismissible && event.target === event.currentTarget) onCloseRef.current(); }}
                >
                    <motion.div
                        ref={panelRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={labelledBy}
                        tabIndex={-1}
                        initial={{ opacity: 0, y: 28 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        transition={{ type: "spring", stiffness: 380, damping: 34 }}
                        className={cx("flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-zinc-200 bg-white text-zinc-900 shadow-2xl outline-none dark:border-white/10 dark:bg-zinc-900 dark:text-white sm:rounded-3xl", MODAL_SIZES[size])}
                    >
                        {children}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export function ModalHeader({ id, title, description, icon, onClose }: { id: string; title: string; description?: string; icon?: ReactNode; onClose: () => void }) {
    const { tx } = useI18n();
    return (
        <div className="flex items-start gap-3 border-b border-zinc-200 px-5 py-4 dark:border-white/10 sm:px-6">
            {icon}
            <div className="min-w-0 flex-1">
                <h2 id={id} className="text-lg font-black tracking-tight sm:text-xl">{title}</h2>
                {description && <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>}
            </div>
            <button type="button" onClick={onClose} className="rounded-full p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-zinc-800 dark:hover:text-white" aria-label={tx(UI_COPY.close)}>
                <X className="h-5 w-5" aria-hidden />
            </button>
        </div>
    );
}

export type ConfirmOptions = { title: string; body?: string; confirmLabel: string; tone?: "danger" | "default" };

/** Promise-based confirmation dialog: `if (await confirm({...})) …`. */
export function useConfirm() {
    const { tx } = useI18n();
    const [state, setState] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null);
    const ask = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...options, resolve })), []);
    const settle = (value: boolean) => {
        state?.resolve(value);
        setState(null);
    };
    const element = (
        <Modal open={Boolean(state)} onClose={() => settle(false)} labelledBy="group-confirm-title" size="sm">
            {state && (
                <div className="p-6">
                    <div className="flex items-start gap-3">
                        <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", state.tone === "danger" ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300")}>
                            {state.tone === "danger" ? <AlertTriangle className="h-5 w-5" aria-hidden /> : <Info className="h-5 w-5" aria-hidden />}
                        </span>
                        <div className="min-w-0">
                            <h2 id="group-confirm-title" className="text-lg font-black">{state.title}</h2>
                            {state.body && <p className="mt-1.5 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{state.body}</p>}
                        </div>
                    </div>
                    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button type="button" onClick={() => settle(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">{tx(UI_COPY.cancel)}</button>
                        <button type="button" data-autofocus onClick={() => settle(true)} className={cx("rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900", state.tone === "danger" ? "bg-red-600 shadow-red-600/20 hover:bg-red-500 focus-visible:ring-red-500" : "bg-indigo-600 shadow-indigo-600/20 hover:bg-indigo-500 focus-visible:ring-indigo-500")}>{state.confirmLabel}</button>
                    </div>
                </div>
            )}
        </Modal>
    );
    return [element, ask] as const;
}

/* -------------------------------------------------------------------------- */
/* Toasts                                                                     */
/* -------------------------------------------------------------------------- */

export type ToastTone = "success" | "error" | "info";
export type Toast = { id: number; tone: ToastTone; text: string };

export function useToasts() {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const nextId = useRef(0);
    const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
    const push = useCallback((text: string, tone: ToastTone = "info") => {
        nextId.current += 1;
        const id = nextId.current;
        setToasts((current) => [...current.filter((toast) => toast.text !== text).slice(-2), { id, tone, text }]);
        window.setTimeout(() => dismiss(id), tone === "error" ? 6500 : 3500);
    }, [dismiss]);
    return { toasts, push, dismiss };
}

export function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
    const { tx } = useI18n();
    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[90] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite" aria-atomic="false">
            <AnimatePresence initial={false}>
                {toasts.map((toast) => (
                    <motion.div
                        key={toast.id}
                        layout
                        initial={{ opacity: 0, y: 16, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        className={cx(
                            "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-2xl backdrop-blur",
                            toast.tone === "error" ? "border-red-500/30 bg-red-50/95 text-red-900 dark:bg-red-950/90 dark:text-red-100"
                                : toast.tone === "success" ? "border-emerald-500/30 bg-emerald-50/95 text-emerald-900 dark:bg-emerald-950/90 dark:text-emerald-100"
                                    : "border-zinc-200 bg-white/95 text-zinc-800 dark:border-white/10 dark:bg-zinc-900/95 dark:text-zinc-100",
                        )}
                        role={toast.tone === "error" ? "alert" : "status"}
                    >
                        {toast.tone === "error" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : toast.tone === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
                        <span className="min-w-0 flex-1 leading-5">{toast.text}</span>
                        <button type="button" onClick={() => onDismiss(toast.id)} className="rounded-lg p-0.5 opacity-60 transition hover:opacity-100" aria-label={tx(UI_COPY.dismiss)}><X className="h-4 w-4" aria-hidden /></button>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Misc                                                                       */
/* -------------------------------------------------------------------------- */

/** Copies text; falls back to a hidden textarea where the async clipboard API is unavailable. */
export async function copyText(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        const copied = document.execCommand("copy");
        area.remove();
        return copied;
    }
}

export function storageGet(key: string) {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function storageSet(key: string, value: string) {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Storage can be blocked (private mode); the value then lasts for this visit only.
    }
}

export { groupReadKey as lastReadKey } from "@/lib/social/local-state";
