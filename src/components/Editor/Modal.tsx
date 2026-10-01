"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { useI18n } from "@/lib/i18n";

const SIZES = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" } as const;

interface ModalProps {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    description?: ReactNode;
    icon?: ReactNode;
    size?: keyof typeof SIZES;
    children: ReactNode;
    footer?: ReactNode;
    /** Element focused when the dialog opens (defaults to the first focusable element). */
    initialFocus?: RefObject<HTMLElement | null>;
    /** Places the dialog near the top (command palettes). */
    align?: "center" | "top";
    /** Hides the title visually while keeping it for screen readers. */
    hideHeader?: boolean;
    bodyClassName?: string;
}

const FOCUSABLE = "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

/** An accessible dialog: focus trap, Escape to close, focus restored on close. */
export default function Modal({ open, onClose, title, description, icon, size = "md", children, footer, initialFocus, align = "center", hideHeader = false, bodyClassName = "" }: ModalProps) {
    const { tx } = useI18n();
    const panelRef = useRef<HTMLDivElement>(null);
    const titleId = useId();
    const descriptionId = useId();
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const frame = window.requestAnimationFrame(() => {
            const target = initialFocus?.current ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? panelRef.current;
            target?.focus();
        });
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                onCloseRef.current();
                return;
            }
            if (event.key !== "Tab" || !panelRef.current) return;
            const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.offsetParent !== null || element === document.activeElement);
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
        document.addEventListener("keydown", onKeyDown, true);
        return () => {
            window.cancelAnimationFrame(frame);
            document.removeEventListener("keydown", onKeyDown, true);
            if (previous?.isConnected) previous.focus();
        };
    }, [open, initialFocus]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className={`fixed inset-0 z-[80] flex justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-4 ${align === "top" ? "items-start pt-[10vh]" : "items-center"}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) onClose();
                    }}
                >
                    <motion.div
                        ref={panelRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={titleId}
                        aria-describedby={description ? descriptionId : undefined}
                        tabIndex={-1}
                        initial={{ opacity: 0, y: 12, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.98 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className={`flex max-h-[min(88dvh,900px)] w-full ${SIZES[size]} flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white text-zinc-900 shadow-2xl outline-none dark:border-white/10 dark:bg-zinc-900 dark:text-white`}
                    >
                        <div className={hideHeader ? "sr-only" : "flex items-start gap-3 border-b border-zinc-100 px-5 py-4 dark:border-white/5"}>
                            {icon && <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">{icon}</span>}
                            <div className="min-w-0 flex-1">
                                <h2 id={titleId} className="text-lg font-bold leading-tight">{title}</h2>
                                {description && <p id={descriptionId} className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>}
                            </div>
                            {!hideHeader && (
                                <button type="button" onClick={onClose} className="rounded-full p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-white/10 dark:hover:text-zinc-200" aria-label={tx({ TR: "Kapat", EN: "Close" })}>
                                    <X className="h-5 w-5" aria-hidden />
                                </button>
                            )}
                        </div>
                        <div className={`min-h-0 flex-1 overflow-y-auto ${bodyClassName || "px-5 py-4"}`}>{children}</div>
                        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-100 px-5 py-3 dark:border-white/5">{footer}</div>}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export const buttonClasses = {
    primary: "inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-zinc-900",
    secondary: "inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10",
    danger: "inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900",
    ghost: "inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100",
} as const;

export interface ConfirmOptions {
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel?: string;
    destructive?: boolean;
}

/** A promise-based confirmation dialog: `if (await confirm({...})) …`. */
export function useConfirm(): [ReactNode, (options: ConfirmOptions) => Promise<boolean>] {
    const { tx } = useI18n();
    const [state, setState] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null);
    const confirmRef = useRef<HTMLButtonElement>(null);
    const ask = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
        setState((previous) => {
            previous?.resolve(false);
            return { ...options, resolve };
        });
    }), []);
    const settle = (value: boolean) => {
        state?.resolve(value);
        setState(null);
    };
    const element = (
        <Modal
            open={Boolean(state)}
            onClose={() => settle(false)}
            size="sm"
            title={state?.title ?? ""}
            icon={<AlertTriangle className="h-5 w-5" aria-hidden />}
            initialFocus={confirmRef}
            footer={(
                <>
                    <button type="button" className={buttonClasses.secondary} onClick={() => settle(false)}>{state?.cancelLabel ?? tx({ TR: "Vazgeç", EN: "Cancel" })}</button>
                    <button ref={confirmRef} type="button" className={state?.destructive ? buttonClasses.danger : buttonClasses.primary} onClick={() => settle(true)}>{state?.confirmLabel}</button>
                </>
            )}
        >
            <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{state?.message}</p>
        </Modal>
    );
    return [element, ask];
}
