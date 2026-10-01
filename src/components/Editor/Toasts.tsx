"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";

export type ToastTone = "success" | "error" | "warning" | "info";

export interface Toast {
    id: number;
    tone: ToastTone;
    message: string;
    action?: { label: string; href?: string; onClick?: () => void };
    /** Milliseconds before it disappears; 0 keeps it until dismissed. */
    duration: number;
}

export type ToastInput = Omit<Toast, "id" | "duration"> & { duration?: number };

/** Small notification queue for the editor (replaces alert()). */
export function useToasts() {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const nextId = useRef(1);
    const timers = useRef(new Map<number, number>());
    const dismiss = useCallback((id: number) => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
        const timer = timers.current.get(id);
        if (timer) window.clearTimeout(timer);
        timers.current.delete(id);
    }, []);
    const push = useCallback((input: ToastInput) => {
        const id = nextId.current++;
        const duration = input.duration ?? (input.tone === "error" ? 8000 : 4500);
        setToasts((current) => [...current.slice(-3), { ...input, id, duration }]);
        if (duration > 0) timers.current.set(id, window.setTimeout(() => dismiss(id), duration));
        return id;
    }, [dismiss]);
    useEffect(() => {
        const pending = timers.current;
        return () => pending.forEach((timer) => window.clearTimeout(timer));
    }, []);
    return { toasts, push, dismiss };
}

const TONES: Record<ToastTone, { icon: typeof Info; className: string }> = {
    success: { icon: CheckCircle2, className: "text-emerald-500" },
    error: { icon: XCircle, className: "text-red-500" },
    warning: { icon: AlertTriangle, className: "text-amber-500" },
    info: { icon: Info, className: "text-indigo-500" },
};

export function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
    const { tx } = useI18n();
    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-10 z-[90] flex flex-col items-center gap-2 px-3 sm:bottom-12 sm:items-end sm:pe-6" aria-live="polite" role="status">
            <AnimatePresence initial={false}>
                {toasts.map((toast) => {
                    const tone = TONES[toast.tone];
                    const Icon = tone.icon;
                    return (
                        <motion.div
                            key={toast.id}
                            layout
                            initial={{ opacity: 0, y: 12, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8, scale: 0.97 }}
                            transition={{ duration: 0.18 }}
                            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-zinc-200 bg-white/95 p-3 text-sm text-zinc-800 shadow-xl backdrop-blur dark:border-white/10 dark:bg-zinc-900/95 dark:text-zinc-100"
                        >
                            <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone.className}`} aria-hidden />
                            <div className="min-w-0 flex-1">
                                <p className="whitespace-pre-line break-words leading-5">{toast.message}</p>
                                {toast.action && (toast.action.href ? (
                                    <Link href={toast.action.href} className="mt-1 inline-block font-semibold text-indigo-600 hover:underline dark:text-indigo-300">{toast.action.label}</Link>
                                ) : (
                                    <button type="button" onClick={() => { toast.action?.onClick?.(); onDismiss(toast.id); }} className="mt-1 font-semibold text-indigo-600 hover:underline dark:text-indigo-300">{toast.action.label}</button>
                                ))}
                            </div>
                            <button type="button" onClick={() => onDismiss(toast.id)} className="rounded-full p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200" aria-label={tx({ TR: "Bildirimi kapat", EN: "Dismiss notification" })}>
                                <X className="h-4 w-4" aria-hidden />
                            </button>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}
