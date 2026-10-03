"use client";

import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import PlanBadge from "@/components/PlanBadge";
import { useI18n, type Copy } from "@/lib/i18n";
import type { PlanBadgeState } from "@/lib/plan-badge";

const C = {
    label: { TR: "Profilimde {plan} rozetini göster", EN: "Show the {plan} badge on my profile" },
    hint: { TR: "Rozet; profilinde, kullanıcı kartında ve mesajlarda adının yanında görünür.", EN: "The badge appears next to your name on your profile, your user card and in messages." },
    notOpen: { TR: "Profil rozetleri kademeli olarak açılıyor; hesabında henüz açık değil.", EN: "Profile badges are opening gradually; they aren't on for your account yet." },
    shown: { TR: "Rozetin artık profilinde görünüyor.", EN: "Your badge now shows on your profile." },
    hidden: { TR: "Rozetin gizlendi.", EN: "Your badge is hidden." },
    failed: { TR: "Kaydedilemedi. Biraz sonra tekrar dene.", EN: "Couldn't save. Try again in a moment." },
} satisfies Record<string, Copy>;

const PLAN_NAMES = { plus: "Plus", pro: "Pro" } as const;

/**
 * The subscriber's switch for the Plus / Pro badge on their profile (Pricing
 * and Account Settings › Profile): POST /api/plans { action: "badge", hidden }.
 * Renders nothing on Free; says so while the team hasn't opened badges for
 * the account.
 */
export default function PlanBadgeSetting({ state, onChange, className = "" }: {
    state: PlanBadgeState;
    onChange: (next: PlanBadgeState) => void;
    className?: string;
}) {
    const { tx } = useI18n();
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ copy: Copy; error: boolean } | null>(null);
    if (!state.plan) return null;
    const label = tx(C.label, { plan: PLAN_NAMES[state.plan] });

    if (!state.allowed) {
        return (
            <p className={`flex items-center gap-2 text-[12.5px] text-zinc-500 dark:text-zinc-400 ${className}`} data-plan-badge-setting="closed">
                <PlanBadge plan={state.plan} size="sm" className="opacity-60" />{tx(C.notOpen)}
            </p>
        );
    }

    const save = async (hidden: boolean) => {
        if (busy) return;
        setBusy(true);
        setMessage(null);
        try {
            const response = await fetch("/api/plans", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "badge", hidden }),
            });
            const data = await response.json().catch(() => null) as { badge?: PlanBadgeState } | null;
            if (!response.ok || !data?.badge) throw new Error(`badge ${response.status}`);
            onChange(data.badge);
            setMessage({ copy: data.badge.hidden ? C.hidden : C.shown, error: false });
        } catch {
            setMessage({ copy: C.failed, error: true });
        } finally {
            setBusy(false);
        }
    };

    const visible = !state.hidden;
    return (
        <div className={`text-start ${className}`} data-plan-badge-setting="open">
            <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
                        <span>{label}</span>
                        <PlanBadge plan={state.plan} size="sm" className={visible ? "" : "opacity-50"} />
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-zinc-500 dark:text-zinc-400">{tx(C.hint)}</p>
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={visible}
                    aria-label={label}
                    aria-busy={busy || undefined}
                    data-plan-badge-switch
                    onClick={() => void save(visible)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ${visible ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-700"} ${busy ? "opacity-60" : ""}`}
                >
                    <span className={`absolute top-0.5 grid h-5 w-5 place-items-center rounded-full bg-white shadow transition-all ${visible ? "start-[1.375rem]" : "start-0.5"}`}>
                        {busy ? <LoaderCircle className="h-3 w-3 animate-spin text-zinc-400" aria-hidden="true" /> : null}
                    </span>
                </button>
            </div>
            {message ? (
                <p role={message.error ? "alert" : "status"} className={`mt-1.5 text-[12px] font-semibold ${message.error ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-300"}`} data-plan-badge-message>
                    {tx(message.copy)}
                </p>
            ) : null}
        </div>
    );
}
