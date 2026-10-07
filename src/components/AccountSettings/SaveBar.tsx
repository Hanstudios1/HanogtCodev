"use client";

import { AlertTriangle, CheckCircle2, Info, LoaderCircle, Save, Undo2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { C } from "./copy";
import { buttonClass } from "./ui";
import type { SaveNotice } from "./useAccountSettings";

/**
 * The one save bar, for form fields only: a solid bar at the bottom while
 * there are unsaved changes (Ctrl/⌘+S saves too), and for a few seconds
 * after a save or a reset to say how it went. Settings that save on their
 * own never bring it up.
 */
export default function SaveBar({ dirty, changedCount, saving, error, notice, onSave, onReset }: {
    dirty: boolean;
    changedCount: number;
    saving: boolean;
    error: string | null;
    notice: SaveNotice | null;
    onSave: () => void;
    onReset: () => void;
}) {
    const { tx } = useI18n();
    if (!dirty && !error && !notice) return null;
    return (
        <div
            role="region"
            aria-label={tx(C.saveBar)}
            className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white transition-[opacity,translate] duration-200 ease-out starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none dark:border-white/10 dark:bg-zinc-900"
            data-account-save-bar
        >
            <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6 lg:ps-[19rem]">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
                    <div className="min-w-0 flex-1 basis-52">
                        {dirty ? (
                            <p className="flex min-w-0 items-center gap-2 text-[14px] font-medium text-zinc-900 dark:text-white">
                                <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                                <span className="truncate">{tx(C.unsaved)}</span>
                                <span className="hidden shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[11.5px] font-medium text-zinc-600 sm:inline dark:bg-white/[0.08] dark:text-zinc-300">{tx(C.unsavedCount, { count: changedCount })}</span>
                            </p>
                        ) : notice && !error ? (
                            <p role="status" className={`flex min-w-0 items-center gap-2 text-[14px] font-medium ${notice.tone === "success" ? "text-emerald-700 dark:text-emerald-300" : "text-zinc-700 dark:text-zinc-200"}`} data-account-message={notice.tone}>
                                {notice.tone === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Info className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />}
                                <span className="min-w-0">{notice.text}</span>
                            </p>
                        ) : null}
                    </div>
                    {dirty ? (
                        <div className="ms-auto flex items-center gap-2">
                            <button type="button" onClick={onReset} disabled={saving} title={tx(C.discardHint)} className={buttonClass("ghost")} data-account-reset>
                                <Undo2 className="h-4 w-4" aria-hidden="true" />
                                {tx(C.discard)}
                            </button>
                            <button type="button" onClick={onSave} disabled={saving} title={tx(C.saveHint)} aria-keyshortcuts="Control+S Meta+S" className={buttonClass("primary")} data-account-save>
                                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                                {saving ? tx(C.saving) : tx(C.save)}
                            </button>
                        </div>
                    ) : null}
                </div>
                {error ? (
                    <p role="alert" className="mt-2.5 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:bg-red-500/10 dark:text-red-300" data-account-message="error">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0">{error}</span>
                    </p>
                ) : null}
            </div>
        </div>
    );
}
