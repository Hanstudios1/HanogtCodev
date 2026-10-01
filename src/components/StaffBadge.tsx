"use client";

import { Crown, ShieldCheck, ShieldHalf, type LucideIcon } from "lucide-react";
import type { StaffRole } from "@/components/Admin/types";
import { useI18n, type Copy } from "@/lib/i18n";

const STAFF_ROLES: readonly StaffRole[] = ["owner", "admin", "moderator"];

/** Profile documents are readable by every signed-in user: anything unexpected counts as no role. */
export function parseStaffRole(value: unknown): StaffRole | null {
    return typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value) ? value as StaffRole : null;
}

const STAFF_BADGES: Record<StaffRole, { label: Copy; description: Copy; icon: LucideIcon; className: string }> = {
    owner: {
        label: { TR: "Yönetici · Kurucu", EN: "Admin · Founder" },
        description: { TR: "Hanogt Codev'in kurucusu ve yöneticisi", EN: "Founder and administrator of Hanogt Codev" },
        icon: Crown,
        className: "bg-amber-50 text-amber-800 ring-amber-300/70 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/30",
    },
    admin: {
        label: { TR: "Yönetici", EN: "Admin" },
        description: { TR: "Hanogt Codev ekibinde yönetici", EN: "Administrator on the Hanogt Codev team" },
        icon: ShieldCheck,
        className: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-400/30",
    },
    moderator: {
        label: { TR: "Moderatör", EN: "Moderator" },
        description: { TR: "Hanogt Codev ekibinde moderatör", EN: "Moderator on the Hanogt Codev team" },
        icon: ShieldHalf,
        className: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-400/30",
    },
};

/**
 * Hanogt team badge shown next to a person's name. Renders nothing for
 * regular users. `compactOnMobile` keeps only the icon on narrow screens
 * (the label stays available to screen readers).
 */
export default function StaffBadge({ role, size = "md", compactOnMobile = false, className = "" }: {
    role: StaffRole | null | undefined;
    size?: "sm" | "md";
    compactOnMobile?: boolean;
    className?: string;
}) {
    const { tx } = useI18n();
    if (!role) return null;
    const badge = STAFF_BADGES[role];
    const Icon = badge.icon;
    const label = tx(badge.label);
    return (
        <span
            title={tx(badge.description)}
            className={`inline-flex max-w-full shrink-0 items-center gap-1 rounded-full font-bold ring-1 ring-inset ${size === "sm" ? "px-1.5 py-0.5 text-[10.5px]" : "px-2 py-0.5 text-[11.5px]"} ${badge.className} ${className}`}
        >
            <Icon className={size === "sm" ? "h-3 w-3 shrink-0" : "h-3.5 w-3.5 shrink-0"} aria-hidden="true" />
            <span className={compactOnMobile ? "sr-only sm:not-sr-only" : "truncate"}>{label}</span>
        </span>
    );
}
