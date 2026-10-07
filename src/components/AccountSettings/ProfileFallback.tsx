"use client";

import { AlertTriangle, LogOut, RefreshCw } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { C, LOAD_ERRORS } from "./copy";
import { Skeleton, buttonClass } from "./ui";
import type { AccountSettingsModel } from "./useAccountSettings";

/** Shown instead of the parts that need the profile: a skeleton while it loads, the error and a retry when it can't be loaded. */
export default function ProfileFallback({ model, rows = 2 }: { model: AccountSettingsModel; rows?: number }) {
    const { tx } = useI18n();
    const error = model.loadError;
    if (!error) return <Skeleton rows={rows} />;
    return (
        <section role="alert" className="rounded-2xl border border-red-200 bg-white px-5 py-4 sm:px-6 dark:border-red-500/30 dark:bg-zinc-900">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-red-600 dark:text-red-400">
                <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
                {tx(C.loadErrorTitle)}
            </h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{model.errorMessage(error, LOAD_ERRORS)}</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{tx(C.otherSettingsStillWork)}</p>
            <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={model.retryLoad} className={buttonClass("primary")}>
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    {tx(C.retry)}
                </button>
                {error.code === "unauthorized" ? (
                    <button type="button" onClick={model.signInAgain} className={buttonClass("secondary")}>
                        <LogOut className="h-4 w-4" aria-hidden="true" />
                        {tx(C.signInAgain)}
                    </button>
                ) : null}
            </div>
        </section>
    );
}
