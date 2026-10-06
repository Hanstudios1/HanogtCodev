"use client";

import { motion } from "framer-motion";
import { Cloud, Crown, LayoutDashboard, LifeBuoy, Megaphone, MessageSquareText, ScrollText, ShieldAlert, Users, type LucideIcon } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import Header from "@/components/Header";
import ProductLogo from "@/components/ProductLogo";
import { useI18n, type Copy } from "@/lib/i18n";
import type { ProductId } from "@/lib/products";
import AiUsageSection from "./AiUsageSection";
import AnnouncementsSection from "./AnnouncementsSection";
import AuditLogSection from "./AuditLogSection";
import CloudHealthSection from "./CloudHealthSection";
import { ROLE_DESCRIPTION_COPY } from "./copy";
import { CountersProvider, useCounters } from "./counters";
import FeedbackSection from "./FeedbackSection";
import { formatNumber, useAdminResource } from "./hooks";
import ModerationSection from "./ModerationSection";
import { openAdminSection, parseAdminHash } from "./navigation";
import OverviewSection from "./OverviewSection";
import PlansSection from "./PlansSection";
import SecurityEventsSection from "./SecurityEventsSection";
import SocialSection from "./SocialSection";
import TicketsSection from "./TicketsSection";
import type { AdminCountersResponse, AdminIdentity, AdminPermissions, AdminSectionId, AdminStatsResponse } from "./types";
import { FOCUS_RING, ToastProvider, cx } from "./ui";
import UsersSection, { RoleBadge } from "./UsersSection";

type SectionDefinition = {
    id: AdminSectionId;
    /** A product's own logo, or an icon for the panel's own pages. */
    logo?: ProductId;
    icon?: LucideIcon;
    label: Copy;
    hint: Copy;
    permission: keyof AdminPermissions;
    /** The counter shown as a badge (work waiting in that section). */
    badge?: keyof Omit<AdminCountersResponse, "generatedAt">;
};

type SectionGroup = { label: Copy; sections: SectionDefinition[] };

const GROUPS: SectionGroup[] = [
    {
        label: { TR: "Genel", EN: "General" },
        sections: [
            { id: "overview", icon: LayoutDashboard, label: { TR: "Genel Bakış", EN: "Overview" }, hint: { TR: "Gidişat ve bekleyen işler", EN: "Trends and waiting work" }, permission: "viewStats" },
        ],
    },
    {
        label: { TR: "Topluluk", EN: "Community" },
        sections: [
            { id: "users", icon: Users, label: { TR: "Kullanıcılar", EN: "Users" }, hint: { TR: "Arama, askıya alma, roller", EN: "Search, suspensions, roles" }, permission: "manageUsers" },
            { id: "moderation", icon: ShieldAlert, label: { TR: "Moderasyon", EN: "Moderation" }, hint: { TR: "Media, haber yorumları, Arcade", EN: "Media, news comments, Arcade" }, permission: "moderate", badge: "reportsOpen" },
            { id: "social", logo: "social", label: { TR: "Hanogt Social", EN: "Hanogt Social" }, hint: { TR: "Gruplar, raporlar, AutoMod", EN: "Groups, reports, AutoMod" }, permission: "moderate" },
            { id: "tickets", icon: LifeBuoy, label: { TR: "Destek Talepleri", EN: "Support Tickets" }, hint: { TR: "Sorular, hata ve güvenlik bildirimleri", EN: "Questions, bug and security reports" }, permission: "tickets", badge: "ticketsOpen" },
            { id: "feedback", icon: MessageSquareText, label: { TR: "Geri Bildirim", EN: "Feedback" }, hint: { TR: "Gelen kutusu ve yanıtlar", EN: "Inbox and replies" }, permission: "feedback", badge: "feedbackOpen" },
        ],
    },
    {
        label: { TR: "Ürünler", EN: "Products" },
        sections: [
            { id: "ai", logo: "ai", label: { TR: "Hanogt AI", EN: "Hanogt AI" }, hint: { TR: "Kullanım ve sınırlar", EN: "Usage and limits" }, permission: "viewStats" },
            { id: "plans", icon: Crown, label: { TR: "Abonelikler", EN: "Subscriptions" }, hint: { TR: "Fiyat, kupon, plan ve AI sınırı", EN: "Prices, coupons, plans, AI limits" }, permission: "managePlans" },
            { id: "announcements", icon: Megaphone, label: { TR: "Duyurular", EN: "Announcements" }, hint: { TR: "Site geneli bildirim çubuğu", EN: "Site-wide notice bar" }, permission: "manageAnnouncements" },
        ],
    },
    {
        label: { TR: "Sistem", EN: "System" },
        sections: [
            { id: "security", logo: "security", label: { TR: "Güvenlik Olayları", EN: "Security Events" }, hint: { TR: "Engellenen istekler ve hesap uyarıları", EN: "Blocked requests and account alerts" }, permission: "viewSecurityEvents" },
            { id: "cloud", icon: Cloud, label: { TR: "Bulut Sağlığı", EN: "Cloud Health" }, hint: { TR: "Firebase bağlantısı ve kurallar", EN: "Firebase connection and rules" }, permission: "cloudHealth" },
            { id: "audit", icon: ScrollText, label: { TR: "Denetim Kaydı", EN: "Audit Log" }, hint: { TR: "Ekip işlemlerinin kaydı", EN: "Record of staff actions" }, permission: "viewAuditLog" },
        ],
    },
];

// The active section and its parameters live in the URL hash (#users?q=…), so reloads and the back button keep them.
function subscribeHash(callback: () => void) {
    window.addEventListener("hashchange", callback);
    window.addEventListener("popstate", callback);
    return () => {
        window.removeEventListener("hashchange", callback);
        window.removeEventListener("popstate", callback);
    };
}

function hashSnapshot() {
    return window.location.hash;
}

function serverHash() {
    return "";
}

function SectionMark({ section, selected, size }: { section: SectionDefinition; selected: boolean; size: "side" | "top" }) {
    const box = size === "side" ? "h-9 w-9" : "h-7 w-7";
    if (section.logo) {
        return (
            <span className={cx("relative grid shrink-0 place-items-center rounded-xl", box, selected ? "bg-white shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-white/10" : "bg-zinc-100 dark:bg-white/[0.06]")}>
                <ProductLogo product={section.logo} size={size === "side" ? 22 : 18} />
            </span>
        );
    }
    const Icon = section.icon ?? LayoutDashboard;
    return (
        <span className={cx(
            "relative grid shrink-0 place-items-center rounded-xl transition",
            box,
            selected ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400",
        )}>
            <Icon className={size === "side" ? "h-4.5 w-4.5" : "h-4 w-4"} aria-hidden="true" />
        </span>
    );
}

function Shell({ me }: { me: AdminIdentity }) {
    const { tx, locale } = useI18n();
    const { counters } = useCounters();
    const hash = useSyncExternalStore(subscribeHash, hashSnapshot, serverHash);
    const { section: hashSection, params } = parseAdminHash(hash);
    const groups = GROUPS
        .map((group) => ({ ...group, sections: group.sections.filter((section) => me.permissions[section.permission]) }))
        .filter((group) => group.sections.length > 0);
    const sections = groups.flatMap((group) => group.sections);
    const active: AdminSectionId = sections.find((section) => section.id === hashSection)?.id ?? "overview";
    const current = sections.find((section) => section.id === active);
    const usersQuery = active === "users" ? params.get("q") ?? "" : "";
    // A refresh on the overview counts again on the server instead of answering from its 30-second copy.
    const [statsNonce, setStatsNonce] = useState(0);
    const stats = useAdminResource<AdminStatsResponse>(me.permissions.viewStats ? `/api/admin/stats${statsNonce ? `?fresh=1&n=${statsNonce}` : ""}` : null);

    const badgeFor = (section: SectionDefinition) => {
        const value = section.badge ? counters?.[section.badge] : null;
        if (!value || value.count === 0) return null;
        return `${formatNumber(value.count, locale)}${value.capped ? "+" : ""}`;
    };

    const navItem = (section: SectionDefinition, layout: "side" | "top") => {
        const selected = section.id === active;
        const badge = badgeFor(section);
        return (
            <button
                key={section.id}
                type="button"
                onClick={() => openAdminSection(section.id)}
                aria-current={selected ? "page" : undefined}
                className={cx(
                    "relative flex items-center gap-3 rounded-2xl text-start transition",
                    layout === "side" ? "w-full px-2.5 py-2" : "shrink-0 px-2.5 py-1.5",
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
                <SectionMark section={section} selected={selected} size={layout} />
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
        <div className="min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
            <Header />
            <main id="main-content" className="relative mx-auto max-w-7xl px-4 pb-20 pt-24 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3.5">
                        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-900">
                            <ProductLogo product="hanogt" size={30} />
                        </span>
                        <div className="min-w-0">
                            <p className="text-[12px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Hanogt Codev</p>
                            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{tx({ TR: "Yönetici Paneli", EN: "Admin Panel" })}</h1>
                        </div>
                    </div>
                    <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-zinc-900">
                        <RoleBadge role={me.role} />
                        <span className="truncate text-[13px] text-zinc-500" dir="ltr">{me.email}</span>
                    </div>
                </div>

                <nav
                    aria-label={tx({ TR: "Yönetim bölümleri", EN: "Admin sections" })}
                    className="sticky top-16 z-20 -mx-4 mt-5 border-b border-zinc-200/80 bg-zinc-50/95 px-4 py-2 sm:-mx-6 sm:px-6 lg:hidden dark:border-white/[0.06] dark:bg-zinc-950/95"
                >
                    <div className="flex gap-1 overflow-x-auto scrollbar-none">
                        {sections.map((section) => navItem(section, "top"))}
                    </div>
                </nav>

                <div className="relative mt-5 lg:mt-8 lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-8">
                    <aside className="hidden lg:block">
                        <div className="sticky top-24 space-y-5">
                            {groups.map((group) => (
                                <nav key={tx(group.label)} aria-label={tx(group.label)} className="space-y-0.5">
                                    <p className="px-2.5 pb-1 text-[11px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">{tx(group.label)}</p>
                                    {group.sections.map((section) => navItem(section, "side"))}
                                </nav>
                            ))}
                            <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-[12px] leading-relaxed text-zinc-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
                                <p className="mb-1.5 flex items-center gap-2 font-bold text-zinc-700 dark:text-zinc-200">{tx({ TR: "Rolünüz", EN: "Your role" })} <RoleBadge role={me.role} /></p>
                                {tx(ROLE_DESCRIPTION_COPY[me.role])}
                                <p className="mt-2">{tx({ TR: "Panelden yapılan her değişiklik denetim kaydına yazılır.", EN: "Every change made in the panel is written to the audit log." })}</p>
                            </div>
                        </div>
                    </aside>

                    <motion.div key={active} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className="min-w-0" aria-label={current ? tx(current.label) : undefined}>
                        {active === "overview" ? (
                            <OverviewSection
                                stats={stats}
                                onRefreshStats={() => setStatsNonce((value) => value + 1)}
                                permissions={me.permissions}
                                onNavigate={(section, sectionParams) => openAdminSection(section, sectionParams)}
                            />
                        ) : active === "users" ? (
                            // A new search in the address starts the section afresh with it.
                            <UsersSection key={usersQuery} selfEmail={me.email} initialQuery={usersQuery} />
                        ) : active === "moderation" ? (
                            <ModerationSection params={params} />
                        ) : active === "social" ? (
                            <SocialSection />
                        ) : active === "ai" ? (
                            <AiUsageSection />
                        ) : active === "tickets" ? (
                            <TicketsSection />
                        ) : active === "feedback" ? (
                            <FeedbackSection params={params} />
                        ) : active === "announcements" ? (
                            <AnnouncementsSection />
                        ) : active === "plans" ? (
                            <PlansSection />
                        ) : active === "security" ? (
                            <SecurityEventsSection params={params} />
                        ) : active === "cloud" ? (
                            <CloudHealthSection />
                        ) : (
                            <AuditLogSection params={params} />
                        )}
                    </motion.div>
                </div>
            </main>
        </div>
    );
}

export default function AdminPanel({ me }: { me: AdminIdentity }) {
    return (
        <ToastProvider>
            <CountersProvider enabled>
                <Shell me={me} />
            </CountersProvider>
        </ToastProvider>
    );
}
