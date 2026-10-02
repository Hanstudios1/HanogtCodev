"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowRight, ArrowUpRight, CheckCircle2, Info, OctagonAlert, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
    ANNOUNCEMENT_LEVELS,
    ANNOUNCEMENT_TEXT_MAX,
    isSafeAnnouncementLink,
    type AnnouncementLevel,
    type PublicAnnouncement,
} from "@/components/Admin/types";
import { useI18n } from "@/lib/i18n";

const STORAGE_KEY = "hanogt_dismissed_announcements";
const MAX_REMEMBERED = 50;
/** Full-screen workspaces where a floating bar would cover tools or a chat input. */
const DEFAULT_HIDDEN_ON: readonly string[] = ["/editor", "/game-engine", "/messages", "/groups/", "/social"];

const LEVEL_STYLES: Record<AnnouncementLevel, { icon: LucideIcon; bar: string; badge: string; action: string }> = {
    info: {
        icon: Info,
        bar: "border-indigo-200/80 bg-indigo-50/95 text-indigo-950 shadow-indigo-900/10 dark:border-indigo-400/25 dark:bg-indigo-950/90 dark:text-indigo-50",
        badge: "bg-indigo-600 text-white",
        action: "text-indigo-700 hover:bg-indigo-100 dark:text-indigo-200 dark:hover:bg-indigo-400/15",
    },
    success: {
        icon: CheckCircle2,
        bar: "border-emerald-200/80 bg-emerald-50/95 text-emerald-950 shadow-emerald-900/10 dark:border-emerald-400/25 dark:bg-emerald-950/90 dark:text-emerald-50",
        badge: "bg-emerald-600 text-white",
        action: "text-emerald-700 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-emerald-400/15",
    },
    warning: {
        icon: AlertTriangle,
        bar: "border-amber-200/80 bg-amber-50/95 text-amber-950 shadow-amber-900/10 dark:border-amber-400/25 dark:bg-amber-950/90 dark:text-amber-50",
        badge: "bg-amber-500 text-amber-950",
        action: "text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-400/15",
    },
    danger: {
        icon: OctagonAlert,
        bar: "border-red-200/80 bg-red-50/95 text-red-950 shadow-red-900/10 dark:border-red-400/25 dark:bg-red-950/90 dark:text-red-50",
        badge: "bg-red-600 text-white",
        action: "text-red-700 hover:bg-red-100 dark:text-red-200 dark:hover:bg-red-400/15",
    },
};

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-1 focus-visible:ring-offset-transparent";

type AnnouncementBarProps = {
    level: AnnouncementLevel;
    text: string;
    link: string | null;
    /** Shows a working close button. */
    onDismiss?: () => void;
    /** Admin preview: draws the close button without behaviour. */
    decorativeDismiss?: boolean;
    className?: string;
};

/** The bar itself; also used by the admin panel to preview announcements. */
export function AnnouncementBar({ level, text, link, onDismiss, decorativeDismiss = false, className = "" }: AnnouncementBarProps) {
    const { tx } = useI18n();
    const style = LEVEL_STYLES[level];
    const Icon = style.icon;
    const href = link && isSafeAnnouncementLink(link) ? link : null;
    const actionClass = `inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-bold transition sm:text-[13px] ${style.action} ${FOCUS}`;
    const details = tx({ TR: "Ayrıntılar", EN: "Details" });

    return (
        <div className={`flex items-center gap-2.5 rounded-2xl border px-2.5 py-2 shadow-lg backdrop-blur-md sm:gap-3 sm:px-3 ${style.bar} ${className}`}>
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${style.badge}`}>
                <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <p dir="auto" className="line-clamp-3 min-w-0 flex-1 text-start text-[13px] font-semibold leading-snug sm:text-sm">{text}</p>
            {href ? (
                href.startsWith("/") ? (
                    <Link href={href} className={actionClass}>
                        {details}
                        <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
                    </Link>
                ) : (
                    <a href={href} target="_blank" rel="noopener noreferrer" className={actionClass}>
                        {details}
                        <ArrowUpRight className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
                        <span className="sr-only">{tx({ TR: "(yeni sekmede açılır)", EN: "(opens in a new tab)" })}</span>
                    </a>
                )
            ) : null}
            {onDismiss ? (
                <button type="button" onClick={onDismiss} aria-label={tx({ TR: "Duyuruyu kapat", EN: "Dismiss announcement" })} className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg opacity-70 transition hover:opacity-100 ${style.action} ${FOCUS}`}>
                    <X className="h-4 w-4" aria-hidden="true" />
                </button>
            ) : decorativeDismiss ? (
                <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg opacity-70">
                    <X className="h-4 w-4" />
                </span>
            ) : null}
        </div>
    );
}

function readDismissed(): string[] {
    try {
        const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]") as unknown;
        return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string").slice(-MAX_REMEMBERED) : [];
    } catch {
        return [];
    }
}

function rememberDismissed(ids: readonly string[]) {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(-MAX_REMEMBERED)));
    } catch {
        // Storage can be blocked (private mode); the dismissal then lasts for this page view.
    }
}

/** Validates the public payload again before anything is rendered from it. */
function parseAnnouncements(payload: unknown): PublicAnnouncement[] {
    const list = payload && typeof payload === "object" ? (payload as { announcements?: unknown }).announcements : null;
    if (!Array.isArray(list)) return [];
    return list.flatMap((value): PublicAnnouncement[] => {
        if (!value || typeof value !== "object") return [];
        const item = value as Record<string, unknown>;
        const text = item.text && typeof item.text === "object" ? item.text as Record<string, unknown> : null;
        if (typeof item.id !== "string" || !text || typeof text.TR !== "string" || typeof text.EN !== "string") return [];
        if (!(ANNOUNCEMENT_LEVELS as readonly unknown[]).includes(item.level)) return [];
        const link = typeof item.link === "string" && isSafeAnnouncementLink(item.link) ? item.link : null;
        return [{
            id: item.id.slice(0, 64),
            text: { TR: text.TR.slice(0, ANNOUNCEMENT_TEXT_MAX), EN: text.EN.slice(0, ANNOUNCEMENT_TEXT_MAX) },
            level: item.level as AnnouncementLevel,
            link,
        }];
    });
}

type AnnouncementBannerProps = {
    /** "bottom" (default) floats above the bottom edge; "top" sits right under the fixed header. */
    placement?: "bottom" | "top";
    /** Path prefixes where the banner stays hidden ("/groups/" matches group pages but not /groups). */
    hiddenOn?: readonly string[];
};

/**
 * Site-wide announcement bar: loads /api/announcements once and shows the most
 * important announcement the visitor has not dismissed. Dismissals are kept per
 * announcement id in localStorage. Renders nothing while loading or when empty.
 */
export default function AnnouncementBanner({ placement = "bottom", hiddenOn = DEFAULT_HIDDEN_ON }: AnnouncementBannerProps) {
    const { tx, language } = useI18n();
    const pathname = usePathname() ?? "";
    const [announcements, setAnnouncements] = useState<PublicAnnouncement[] | null>(null);
    const [dismissed, setDismissed] = useState<readonly string[]>([]);

    useEffect(() => {
        const controller = new AbortController();
        fetch("/api/announcements", { signal: controller.signal, credentials: "omit", headers: { Accept: "application/json" } })
            .then((response) => (response.ok ? response.json() as Promise<unknown> : null))
            .then((payload) => {
                if (controller.signal.aborted) return;
                setDismissed(readDismissed());
                setAnnouncements(parseAnnouncements(payload));
            })
            .catch(() => {
                if (!controller.signal.aborted) setAnnouncements([]);
            });
        return () => controller.abort();
    }, []);

    const hidden = hiddenOn.some((prefix) => pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));
    if (!announcements?.length || hidden) return null;

    // The API already orders by importance (danger > warning > success > info, then newest).
    const current = announcements.find((item) => !dismissed.includes(item.id)) ?? null;
    const dismiss = (id: string) => {
        const next = [...dismissed.filter((value) => value !== id), id];
        setDismissed(next);
        rememberDismissed(next);
    };

    return (
        <div
            className={placement === "top"
                ? "pointer-events-none fixed inset-x-0 top-16 z-30 flex justify-center px-3 pt-2 sm:px-4"
                : "pointer-events-none fixed inset-x-0 bottom-0 z-[35] flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:pb-4"}
        >
            <AnimatePresence mode="wait">
                {current ? (
                    <motion.div
                        key={current.id}
                        role="region"
                        aria-label={tx({ TR: "Site duyurusu", EN: "Site announcement" })}
                        className="pointer-events-auto w-full max-w-3xl"
                        initial={{ opacity: 0, y: placement === "top" ? -12 : 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: placement === "top" ? -8 : 8 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                    >
                        <AnnouncementBar
                            level={current.level}
                            text={language === "TR" ? current.text.TR : current.text.EN}
                            link={current.link}
                            onDismiss={() => dismiss(current.id)}
                        />
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
    );
}
