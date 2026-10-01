"use client";

import { motion } from "framer-motion";
import { Cloud, LayoutDashboard, LifeBuoy, Megaphone, MessageSquareText, ScrollText, ShieldAlert, ShieldCheck, Siren, Users, type LucideIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import Header from "@/components/Header";
import { useI18n, type Copy } from "@/lib/i18n";
import AnnouncementsSection from "./AnnouncementsSection";
import AuditLogSection from "./AuditLogSection";
import CloudHealthSection from "./CloudHealthSection";
import { ROLE_DESCRIPTION_COPY } from "./copy";
import FeedbackSection from "./FeedbackSection";
import { formatNumber, useAdminResource } from "./hooks";
import ModerationSection from "./ModerationSection";
import OverviewSection from "./OverviewSection";
import SecurityEventsSection from "./SecurityEventsSection";
import TicketsSection from "./TicketsSection";
import type { AdminIdentity, AdminPermissions, AdminSectionId, AdminStatsResponse, StatKey } from "./types";
import { FOCUS_RING, ToastProvider, cx } from "./ui";
import UsersSection, { RoleBadge } from "./UsersSection";

type SectionDefinition = {
    id: AdminSectionId;
    icon: LucideIcon;
    label: Copy;
    hint: Copy;
    permission: keyof AdminPermissions;
    /** Stat shown as a count badge (work waiting in that section). */
    badge?: StatKey;
};

const SECTIONS: SectionDefinition[] = [
    { id: "overview", icon: LayoutDashboard, label: { TR: "Genel Bakış", EN: "Overview" }, hint: { TR: "Sayılar ve son hareketler", EN: "Numbers and recent activity" }, permission: "viewStats" },
    { id: "users", icon: Users, label: { TR: "Kullanıcılar", EN: "Users" }, hint: { TR: "Arama, askıya alma, roller", EN: "Search, suspensions, roles" }, permission: "manageUsers" },
    { id: "moderation", icon: ShieldAlert, label: { TR: "Moderasyon", EN: "Moderation" }, hint: { TR: "Bildirimler, yorumlar, Arcade", EN: "Reports, comments, Arcade" }, permission: "moderate", badge: "reportsOpen" },
    { id: "tickets", icon: LifeBuoy, label: { TR: "Destek Talepleri", EN: "Support Tickets" }, hint: { TR: "Sorular, hata ve güvenlik bildirimleri", EN: "Questions, bug and security reports" }, permission: "tickets", badge: "ticketsOpen" },
    { id: "feedback", icon: MessageSquareText, label: { TR: "Geri Bildirim", EN: "Feedback" }, hint: { TR: "Gelen kutusu ve yanıtlar", EN: "Inbox and replies" }, permission: "feedback", badge: "feedbackOpen" },
    { id: "announcements", icon: Megaphone, label: { TR: "Duyurular", EN: "Announcements" }, hint: { TR: "Site geneli bildirim çubuğu", EN: "Site-wide notice bar" }, permission: "manageAnnouncements" },
    { id: "security", icon: Siren, label: { TR: "Güvenlik Olayları", EN: "Security Events" }, hint: { TR: "Engellenen riskli istekler", EN: "Blocked risky requests" }, permission: "viewSecurityEvents" },
    { id: "cloud", icon: Cloud, label: { TR: "Bulut Sağlığı", EN: "Cloud Health" }, hint: { TR: "Firebase bağlantısı ve kurallar", EN: "Firebase connection and rules" }, permission: "cloudHealth" },
    { id: "audit", icon: ScrollText, label: { TR: "Denetim Kaydı", EN: "Audit Log" }, hint: { TR: "Ekip işlemlerinin kaydı", EN: "Record of staff actions" }, permission: "viewAuditLog" },
];

// The active section lives in the URL hash (#users), so reloads and the back button keep it.
function subscribeHash(callback: () => void) {
    window.addEventListener("hashchange", callback);
    return () => window.removeEventListener("hashchange", callback);
}

function hashSnapshot() {
    return window.location.hash.slice(1);
}

function serverHash() {
    return "";
}

/**
 * The section id and its parameters: "users?q=a%40b.com" opens Users with
 * that search (the ticket sender card links there).
 */
function parseHash(hash: string) {
    const index = hash.indexOf("?");
    if (index === -1) return { id: hash, params: new URLSearchParams() };
    return { id: hash.slice(0, index), params: new URLSearchParams(hash.slice(index + 1)) };
}

/** Assigning the hash adds a history entry and notifies the subscription above. */
function navigate(id: AdminSectionId) {
    if (window.location.hash.slice(1) !== id) window.location.hash = id;
    window.scrollTo({ top: 0, behavior: "smooth" });
}

export default function AdminPanel({ me }: { me: AdminIdentity }) {
    const { tx, locale } = useI18n();
    const hash = useSyncExternalStore(subscribeHash, hashSnapshot, serverHash);
    const { id: hashSection, params: hashParams } = parseHash(hash);
    const sections = SECTIONS.filter((section) => me.permissions[section.permission]);
    const active: AdminSectionId = sections.find((section) => section.id === hashSection)?.id ?? "overview";
    const usersQuery = active === "users" ? hashParams.get("q") ?? "" : "";
    const stats = useAdminResource<AdminStatsResponse>("/api/admin/stats");

    const badgeFor = (section: SectionDefinition) => {
        const value = section.badge ? stats.data?.counts[section.badge] : null;
        if (!value || value.count === 0) return null;
        return `${formatNumber(value.count, locale)}${value.capped ? "+" : ""}`;
    };

    const navItem = (section: SectionDefinition, layout: "side" | "top") => {
        const selected = section.id === active;
        const Icon = section.icon;
        const badge = badgeFor(section);
        return (
            <button
                key={section.id}
                type="button"
                onClick={() => navigate(section.id)}
                aria-current={selected ? "page" : undefined}
                className={cx(
                    "relative flex items-center gap-3 rounded-2xl text-start transition",
                    layout === "side" ? "w-full px-3 py-2.5" : "shrink-0 px-3 py-2",
                    selected ? "text-zinc-900 dark:text-white" : "text-zinc-600 hover:bg-white hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-white",
                    FOCUS_RING,
                )}
            >
                {selected ? (
                    <motion.span
                        layoutId={layout === "side" ? "admin-nav-side" : "admin-nav-top"}
                        className="absolute inset-0 rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-900"
                        transition={{ type: "spring", stiffness: 420, damping: 36 }}
                    />
                ) : null}
                <span className={cx(
                    "relative grid shrink-0 place-items-center rounded-xl transition",
                    layout === "side" ? "h-9 w-9" : "h-7 w-7",
                    selected ? "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/25" : "bg-zinc-100 text-zinc-500 dark:bg-white/[0.06]",
                )}>
                    <Icon className={layout === "side" ? "h-4.5 w-4.5" : "h-4 w-4"} aria-hidden="true" />
                </span>
                <span className="relative min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold">{tx(section.label)}</span>
                    {layout === "side" ? <span className="block truncate text-[11px] font-medium text-zinc-500">{tx(section.hint)}</span> : null}
                </span>
                {badge ? (
                    <span className="relative rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-amber-950" title={tx({ TR: "Bekleyen", EN: "Waiting" })}>{badge}</span>
                ) : null}
            </button>
        );
    };

    return (
        <ToastProvider>
            <div className="min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
                <Header />
                <main id="main-content" className="relative mx-auto max-w-7xl px-4 pb-20 pt-24 sm:px-6">
                    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_18%_20%,rgba(99,102,241,.14),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(217,70,239,.10),transparent_35%)]" />

                    <div className="relative flex flex-wrap items-center justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-4">
                            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-xl shadow-violet-500/25">
                                <ShieldCheck className="h-7 w-7" aria-hidden="true" />
                            </span>
                            <div className="min-w-0">
                                <p className="text-[12px] font-bold uppercase tracking-widest text-violet-600 dark:text-violet-300">Hanogt Codev</p>
                                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{tx({ TR: "Yönetici Paneli", EN: "Admin Panel" })}</h1>
                            </div>
                        </div>
                        <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-zinc-200 bg-white/80 px-3 py-2 backdrop-blur dark:border-white/10 dark:bg-zinc-900/70">
                            <RoleBadge role={me.role} />
                            <span className="truncate text-[13px] text-zinc-500" dir="ltr">{me.email}</span>
                        </div>
                    </div>

                    <nav
                        aria-label={tx({ TR: "Yönetim bölümleri", EN: "Admin sections" })}
                        className="sticky top-16 z-20 -mx-4 mt-6 border-b border-zinc-200/80 bg-zinc-50/90 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:hidden dark:border-white/[0.06] dark:bg-zinc-950/85"
                    >
                        <div className="flex gap-1 overflow-x-auto scrollbar-none">
                            {sections.map((section) => navItem(section, "top"))}
                        </div>
                    </nav>

                    <div className="relative mt-6 lg:mt-8 lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-8">
                        <aside className="hidden lg:block">
                            <div className="sticky top-24 space-y-4">
                                <nav aria-label={tx({ TR: "Yönetim bölümleri", EN: "Admin sections" })} className="space-y-1">
                                    {sections.map((section) => navItem(section, "side"))}
                                </nav>
                                <div className="rounded-2xl border border-zinc-200 bg-white/70 p-4 text-[12px] leading-relaxed text-zinc-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
                                    <p className="mb-1.5 flex items-center gap-2 font-bold text-zinc-700 dark:text-zinc-200">{tx({ TR: "Rolünüz", EN: "Your role" })} <RoleBadge role={me.role} /></p>
                                    {tx(ROLE_DESCRIPTION_COPY[me.role])}
                                    <p className="mt-2">{tx({ TR: "Panelden yapılan her değişiklik denetim kaydına yazılır.", EN: "Every change made in the panel is written to the audit log." })}</p>
                                </div>
                            </div>
                        </aside>

                        <motion.div key={active} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="min-w-0">
                            {active === "overview" ? (
                                <OverviewSection stats={stats} permissions={me.permissions} onNavigate={navigate} />
                            ) : active === "users" ? (
                                // A new search in the address starts the section afresh with it.
                                <UsersSection key={usersQuery} selfEmail={me.email} initialQuery={usersQuery} />
                            ) : active === "moderation" ? (
                                <ModerationSection />
                            ) : active === "tickets" ? (
                                <TicketsSection />
                            ) : active === "feedback" ? (
                                <FeedbackSection />
                            ) : active === "announcements" ? (
                                <AnnouncementsSection />
                            ) : active === "security" ? (
                                <SecurityEventsSection />
                            ) : active === "cloud" ? (
                                <CloudHealthSection />
                            ) : (
                                <AuditLogSection />
                            )}
                        </motion.div>
                    </div>
                </main>
            </div>
        </ToastProvider>
    );
}
