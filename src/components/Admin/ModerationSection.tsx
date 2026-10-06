"use client";

import { motion } from "framer-motion";
import { Flag, Gamepad2, MessagesSquare, type LucideIcon } from "lucide-react";
import { useId, useRef, type KeyboardEvent } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import ArcadePanel from "./ArcadePanel";
import { setAdminParams } from "./navigation";
import NewsCommentsPanel from "./NewsCommentsPanel";
import ReportsPanel from "./ReportsPanel";
import { FOCUS_RING, SectionHeader, cx } from "./ui";

type Tab = "reports" | "comments" | "arcade";

const TABS: Array<{ id: Tab; icon: LucideIcon; label: Copy }> = [
    { id: "reports", icon: Flag, label: { TR: "Media bildirimleri", EN: "Media reports" } },
    { id: "comments", icon: MessagesSquare, label: { TR: "Haber yorumları", EN: "News comments" } },
    { id: "arcade", icon: Gamepad2, label: { TR: "Arcade oyunları", EN: "Arcade games" } },
];

const isTab = (value: string | null): value is Tab => value === "reports" || value === "comments" || value === "arcade";

/** The tab and the report status live in the address (#moderation?tab=reports&status=closed). */
export default function ModerationSection({ params }: { params: URLSearchParams }) {
    const { tx } = useI18n();
    const requested = params.get("tab");
    const tab: Tab = isTab(requested) ? requested : "reports";
    const reportView = params.get("status") === "closed" ? "closed" : "open";
    const setTab = (next: Tab) => setAdminParams({ tab: next === "reports" ? null : next, status: null });
    const baseId = useId();
    const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

    // Arrow keys move between tabs (WAI-ARIA tabs pattern with automatic activation).
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
        if (!keys.includes(event.key)) return;
        event.preventDefault();
        const index = TABS.findIndex((item) => item.id === tab);
        const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
        const forward = event.key === (rtl ? "ArrowLeft" : "ArrowRight");
        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : (index + (forward ? 1 : -1) + TABS.length) % TABS.length;
        const next = TABS[nextIndex].id;
        setTab(next);
        tabRefs.current[next]?.focus();
    };

    return (
        <div>
            <SectionHeader
                title={tx({ TR: "Moderasyon", EN: "Moderation" })}
                description={tx({ TR: "Bildirilen Media gönderileri, haber yorumları ve Arcade yayınları.", EN: "Reported Media posts, news comments and Arcade releases." })}
            />
            <div role="tablist" aria-label={tx({ TR: "Moderasyon alanları", EN: "Moderation areas" })} onKeyDown={onKeyDown} className="mb-5 flex gap-1 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-1 scrollbar-none dark:border-white/10 dark:bg-zinc-900/70">
                {TABS.map((item) => {
                    const active = item.id === tab;
                    const Icon = item.icon;
                    return (
                        <button
                            key={item.id}
                            ref={(node) => { tabRefs.current[item.id] = node; }}
                            id={`${baseId}-tab-${item.id}`}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            aria-controls={`${baseId}-panel`}
                            tabIndex={active ? 0 : -1}
                            onClick={() => setTab(item.id)}
                            className={cx(
                                "relative flex min-w-max flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-[13px] font-bold transition",
                                active ? "text-white dark:text-zinc-900" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]",
                                FOCUS_RING,
                            )}
                        >
                            {active ? <motion.span layoutId="admin-moderation-tab" className="absolute inset-0 rounded-xl bg-zinc-900 shadow-sm dark:bg-white" transition={{ type: "spring", stiffness: 420, damping: 36 }} /> : null}
                            <Icon className="relative h-4 w-4" aria-hidden="true" />
                            <span className="relative">{tx(item.label)}</span>
                        </button>
                    );
                })}
            </div>
            <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${tab}`}>
                {tab === "reports" ? (
                    <ReportsPanel view={reportView} onViewChange={(view) => setAdminParams({ status: view === "closed" ? "closed" : null })} />
                ) : tab === "comments" ? <NewsCommentsPanel /> : <ArcadePanel />}
            </div>
        </div>
    );
}
