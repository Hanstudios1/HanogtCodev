"use client";

import { Gem, Sparkles, type LucideIcon } from "lucide-react";
import { useI18n, type Copy } from "@/lib/i18n";
import type { PlanBadge as PlanBadgeId } from "@/lib/plan-badge";

const BADGES: Record<PlanBadgeId, { label: string; description: Copy; icon: LucideIcon; className: string }> = {
    plus: {
        label: "Plus",
        description: { TR: "Hanogt Codev Plus abonesi", EN: "Hanogt Codev Plus subscriber" },
        icon: Sparkles,
        className: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-200 dark:ring-indigo-400/30",
    },
    pro: {
        label: "Pro",
        description: { TR: "Hanogt Codev Pro abonesi", EN: "Hanogt Codev Pro subscriber" },
        icon: Gem,
        className: "bg-gradient-to-r from-fuchsia-50 to-violet-50 text-fuchsia-700 ring-fuchsia-200 dark:from-fuchsia-500/15 dark:to-violet-500/15 dark:text-fuchsia-200 dark:ring-fuchsia-400/30",
    },
};

/**
 * The Plus or Pro badge next to a subscriber's name (src/lib/plan-badge.ts).
 * Renders nothing without a badge. `compactOnMobile` keeps only the icon on
 * narrow screens (the label stays available to screen readers).
 */
export default function PlanBadge({ plan, size = "md", compactOnMobile = false, className = "" }: {
    plan: PlanBadgeId | null | undefined;
    size?: "sm" | "md";
    compactOnMobile?: boolean;
    className?: string;
}) {
    const { tx } = useI18n();
    if (plan !== "plus" && plan !== "pro") return null;
    const badge = BADGES[plan];
    const Icon = badge.icon;
    return (
        <span
            title={tx(badge.description)}
            data-plan-badge={plan}
            className={`inline-flex max-w-full shrink-0 items-center gap-1 rounded-full font-bold ring-1 ring-inset ${size === "sm" ? "px-1.5 py-0.5 text-[10.5px]" : "px-2 py-0.5 text-[11.5px]"} ${badge.className} ${className}`}
        >
            <Icon className={size === "sm" ? "h-3 w-3 shrink-0" : "h-3.5 w-3.5 shrink-0"} aria-hidden="true" />
            <span className={compactOnMobile ? "sr-only sm:not-sr-only" : "truncate"}>{badge.label}</span>
        </span>
    );
}
