"use client";

import { AlertTriangle, LoaderCircle } from "lucide-react";
import { useEffect, useEffectEvent, useRef } from "react";
import { buttonClass } from "./ui";

const FOCUSABLE = "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

/**
 * A confirmation for something that can't be undone. It starts on "Cancel";
 * Escape, a click outside or Cancel close it (not while the action runs),
 * Tab stays inside, and the focus goes back where it was.
 */
export default function ConfirmDialog({ name, open, titleId, textId, title, text, cancelLabel, confirmLabel, busy = false, onCancel, onConfirm }: {
    /** data-account-confirm value (test hook). */
    name: string;
    open: boolean;
    titleId: string;
    textId: string;
    title: string;
    text: string;
    cancelLabel: string;
    confirmLabel: string;
    busy?: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    const cancelRef = useRef<HTMLButtonElement>(null);
    const dismiss = () => {
        if (!busy) onCancel();
    };
    const onEscape = useEffectEvent(() => dismiss());

    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        cancelRef.current?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onEscape();
                return;
            }
            if (event.key !== "Tab" || !panelRef.current) return;
            const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
            if (!items.length) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            if (previous?.isConnected) previous.focus();
        };
    }, [open]);

    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
            <div ref={panelRef} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={textId} className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-zinc-900" data-account-confirm={name}>
                <div className="flex items-start gap-3.5">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
                        <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 pt-1">
                        <h2 id={titleId} className="text-[17px] font-semibold leading-snug text-zinc-900 dark:text-white">{title}</h2>
                        <p id={textId} className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{text}</p>
                    </div>
                </div>
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy} className={buttonClass("secondary")}>{cancelLabel}</button>
                    <button type="button" onClick={onConfirm} disabled={busy} className={buttonClass("danger")} data-account-confirm-action>
                        {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
