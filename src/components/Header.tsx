"use client";

import { AnimatePresence, motion, useScroll, useSpring } from "framer-motion";
import {
    Bell, BookOpen, Bot, Boxes, ChevronDown, ChevronLeft, ChevronRight, FileCode, Gamepad2, Gauge, LayoutDashboard, LogOut, Menu, MessageSquare, Newspaper, Radio,
    Settings, ShieldCheck, Sparkles, Tag, Users, UsersRound, X, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { prepareSignOut } from "@/lib/ai/sign-out";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { StaffRole } from "@/components/Admin/types";
import NotificationCenter, { useUnreadNotifications } from "@/components/NotificationCenter";
import ProductLogo from "@/components/ProductLogo";
import PresenceAvatar, { PresenceMark } from "@/components/PresenceAvatar";
import { useRawSession } from "@/components/Provider";
import StaffBadge, { parseStaffRole } from "@/components/StaffBadge";
import StatusMenu from "@/components/StatusMenu";
import { reportPresenceOffline, useOwnProfile, useOwnStatus } from "@/lib/account-profile-client";
import { useI18n, type Copy } from "@/lib/i18n";
import { PRESENCE_STATUS_COPY, STATUS_PREFERENCE_COPY, resolvePresence } from "@/lib/presence";
import { ADMIN_NAV, fitNavItems, isActivePath, NAV_LABELS, PRIMARY_NAV, SECONDARY_NAV, type NavIcon, type NavItem } from "@/lib/nav";
import ChangelogModal from "./ChangelogModal";
import LangToggle from "./LangToggle";
import ThemeToggle from "./ThemeToggle";

export const NAV_ICONS: Record<NavIcon, LucideIcon> = {
    news: Newspaper,
    arcade: Gamepad2,
    engine: Boxes,
    media: Radio,
    guide: BookOpen,
    dashboard: LayoutDashboard,
    security: ShieldCheck,
    groups: UsersRound,
    friends: Users,
    messages: MessageSquare,
    about: Sparkles,
    feedback: MessageSquare,
    docs: FileCode,
    ai: Bot,
    admin: Gauge,
    pricing: Tag,
};

const C = {
    notificationsWithUnread: { TR: "{label} ({count} okunmamış)", EN: "{label} ({count} unread)" },
    unread: { TR: "okunmamış", EN: "unread" },
    accountMenu: { TR: "Hesap menüsü", EN: "Account menu" },
    accountMenuStatus: { TR: "Hesap menüsü ({status})", EN: "Account menu ({status})" },
    setStatus: { TR: "Durumu ayarla", EN: "Set status" },
    back: { TR: "Geri", EN: "Back" },
} satisfies Record<string, Copy>;

type StaffAccess = { email: string; role: StaffRole | null; checkedAt: number };

/**
 * Remembers in this browser that someone was signed in, so while the session
 * is still loading after a page load the bar already shows their links (the
 * Panel) instead of jumping once it arrives. Only a hint for what to draw:
 * every page checks the session itself.
 */
const SIGNED_IN_HINT = "hanogt:signed-in";

function readSignedInHint() {
    try {
        return window.localStorage.getItem(SIGNED_IN_HINT) === "1";
    } catch {
        return false;
    }
}

function writeSignedInHint(signedIn: boolean) {
    try {
        if (signedIn) window.localStorage.setItem(SIGNED_IN_HINT, "1");
        else window.localStorage.removeItem(SIGNED_IN_HINT);
    } catch {
        // Storage can be blocked; the bar then waits for the session.
    }
}

function subscribeNothing() {
    return () => undefined;
}

const NAV_ITEM_CLASS = "group relative flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 text-[13.5px] font-semibold transition-colors";

function LiveDot() {
    return <span className="relative ms-0.5 flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" /></span>;
}

const STAFF_ACCESS_TTL_MS = 5 * 60_000;
// The server also answers "not staff" when it could not check (database
// unreachable), so a negative answer is asked again sooner.
const NO_STAFF_ACCESS_TTL_MS = 60_000;
// Module scope: every page renders its own Header, so the answer survives
// client-side navigation instead of being requested again on each page.
let staffAccessCache: StaffAccess | null = null;

function cachedStaffAccess(email: string | null) {
    return email && staffAccessCache?.email === email ? staffAccessCache : null;
}

function isFresh(access: StaffAccess) {
    return Date.now() - access.checkedAt < (access.role ? STAFF_ACCESS_TTL_MS : NO_STAFF_ACCESS_TTL_MS);
}

/**
 * Staff role of the signed-in account ("owner" | "admin" | "moderator") or
 * null. It only decides which links are shown: every admin API checks the
 * role on the server. Pass the e-mail of the raw NextAuth session, so staff
 * see their links without waiting for the Firebase bridge.
 */
export function useStaffRole(email: string | null): StaffRole | null {
    const [access, setAccess] = useState<StaffAccess | null>(() => cachedStaffAccess(email));

    useEffect(() => {
        if (!email) return;
        const cached = cachedStaffAccess(email);
        if (cached && isFresh(cached)) return;
        let cancelled = false;
        fetch("/api/admin/me", { cache: "no-store", credentials: "same-origin" })
            .then((response) => (response.ok ? response.json() as Promise<{ isAdmin?: boolean; email?: unknown; role?: unknown }> : null))
            .then((data) => {
                // A rate limit or network error keeps the last known answer instead of hiding the links.
                if (!data) return;
                const role = data.isAdmin === true && data.email === email ? parseStaffRole(data.role) : null;
                staffAccessCache = { email, role, checkedAt: Date.now() };
                if (!cancelled) setAccess(staffAccessCache);
            })
            .catch(() => undefined);
        return () => { cancelled = true; };
    }, [email]);

    // An answer for a previous account (after switching accounts) never applies.
    const current = access?.email === email ? access : cachedStaffAccess(email);
    return current?.role ?? null;
}

function MoreItem({ item, active, onPick }: { item: NavItem; active: boolean; onPick: () => void }) {
    const { t, tx } = useI18n();
    const Icon = NAV_ICONS[item.icon];
    const description = item.desc ? tx(item.desc) : item.descKey ? t(item.descKey) : "";
    return (
        <Link
            role="menuitem"
            href={item.href}
            onClick={onPick}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 transition ${active ? "bg-zinc-900/[0.05] dark:bg-white/[0.06]" : "hover:bg-zinc-100 dark:hover:bg-white/[0.06]"}`}
        >
            {item.product ? <ProductLogo product={item.product} size={28} /> : <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300"><Icon className="h-4 w-4" aria-hidden="true" /></span>}
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-[14px] font-semibold text-zinc-900 dark:text-white">{tx(item.label)}{item.live ? <LiveDot /> : null}</span>
                {description ? <span className="block truncate text-[12px] text-zinc-500 dark:text-zinc-400">{description}</span> : null}
            </span>
        </Link>
    );
}

export default function Header() {
    const { t, tx } = useI18n();
    const pathname = usePathname();
    const [scrolled, setScrolled] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const [profileView, setProfileView] = useState<"menu" | "status">("menu");
    const [mobileStatusOpen, setMobileStatusOpen] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [showChangelog, setShowChangelog] = useState(false);
    const [aiOpen, setAiOpen] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);
    const statusViewRef = useRef<HTMLDivElement>(null);
    const statusRowRef = useRef<HTMLButtonElement>(null);
    const bellRef = useRef<HTMLButtonElement>(null);
    const navRef = useRef<HTMLElement>(null);
    const navListRef = useRef<HTMLDivElement>(null);
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    // The menu bar shows as many items as fit between the logo and the
    // controls (how wide they are depends on the language); the rest go into
    // "More". The first item, the Panel for signed-in people, always stays.
    const measureRef = useRef<HTMLDivElement>(null);
    const moreRef = useRef<HTMLDivElement>(null);
    const [visibleCount, setVisibleCount] = useState(Number.POSITIVE_INFINITY);
    const [moreOpen, setMoreOpen] = useState(false);
    const { scrollYProgress } = useScroll();
    const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.001 });
    // The header reflects the NextAuth cookie right away; waiting for the Firebase
    // bridge used to show "Sign in" for a few seconds after every refresh.
    const auth = useRawSession();
    const account = auth.status === "authenticated" ? auth.data?.user : undefined;
    const signedIn = Boolean(account);
    const sessionLoading = auth.status === "loading";
    const signedInHint = useSyncExternalStore(subscribeNothing, readSignedInHint, () => false);
    // Someone signed in last time sees their links while the session is still loading.
    const showMemberLinks = signedIn || (sessionLoading && signedInHint);
    const email = account?.email?.toLowerCase() || null;
    // Name, avatar and status come from /api/account/profile and /api/presence
    // (cached for the session, updated by Account Settings and the status menu).
    const profile = useOwnProfile(email);
    const reportedStatus = useOwnStatus(email);
    const ownStatus = reportedStatus ?? (profile ? resolvePresence(profile.statusPreference, "active", profile.showOnlineStatus) : null);
    const statusLabel = profile?.statusPreference === "invisible"
        ? tx(STATUS_PREFERENCE_COPY.invisible.label)
        : ownStatus ? tx(PRESENCE_STATUS_COPY[ownStatus]) : "";
    const customStatus = profile?.customStatus ?? "";
    const unread = useUnreadNotifications(signedIn ? email : null);
    // Staff see the Admin Panel in the profile menu and the mobile menu.
    const staffRole = useStaffRole(email);
    const isAdmin = signedIn && staffRole !== null;

    // The global Hanogt AI dock reports whether its panel is open.
    useEffect(() => {
        const onState = (event: Event) => setAiOpen(Boolean((event as CustomEvent<{ open?: boolean }>).detail?.open));
        window.addEventListener("hanogt:ai-state", onState);
        return () => window.removeEventListener("hanogt:ai-state", onState);
    }, []);

    useEffect(() => {
        if (auth.status !== "loading") writeSignedInHint(auth.status === "authenticated");
    }, [auth.status]);

    useEffect(() => {
        const nav = navRef.current;
        const measure = measureRef.current;
        if (!nav || !measure || typeof ResizeObserver === "undefined") return;
        // Observing reports the sizes right away, and again whenever the space or the labels change.
        const observer = new ResizeObserver(() => {
            if (getComputedStyle(nav).display === "none") return; // Below lg the menu button shows instead.
            // The hidden copy holds every item and, last, the "More" button.
            const widths = Array.from(measure.children, (child) => (child as HTMLElement).offsetWidth);
            const moreWidth = widths.pop() ?? 0;
            setVisibleCount(fitNavItems(widths, nav.clientWidth, moreWidth));
        });
        observer.observe(nav);
        observer.observe(measure);
        return () => observer.disconnect();
    }, []);

    // "More" closes on a click outside, on Escape or when one of its links is picked.
    useEffect(() => {
        if (!moreOpen) return;
        const onPointer = (event: MouseEvent) => {
            if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setMoreOpen(false);
        };
        document.addEventListener("mousedown", onPointer);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onPointer);
            document.removeEventListener("keydown", onKey);
        };
    }, [moreOpen]);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 8);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    // The status view gets focus on its current choice; going back returns it to the status row.
    useEffect(() => {
        if (!profileOpen) return;
        if (profileView === "status") statusViewRef.current?.querySelector<HTMLElement>("[role='menuitemradio'][tabindex='0']")?.focus();
        else statusRowRef.current?.focus({ preventScroll: true });
    }, [profileOpen, profileView]);

    useEffect(() => {
        if (!profileOpen) return;
        const onPointer = (event: MouseEvent) => {
            if (profileRef.current && !profileRef.current.contains(event.target as Node)) setProfileOpen(false);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setProfileOpen(false);
        };
        document.addEventListener("mousedown", onPointer);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onPointer);
            document.removeEventListener("keydown", onKey);
        };
    }, [profileOpen]);

    // Mobile menu: lock page scroll and close with Escape.
    useEffect(() => {
        if (!menuOpen) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setMenuOpen(false);
        };
        document.addEventListener("keydown", onKey);
        return () => {
            document.body.style.overflow = previous;
            document.removeEventListener("keydown", onKey);
        };
    }, [menuOpen]);

    const displayName = profile?.username || account?.name || t("user");
    const displayAvatar = profile?.avatarUrl || account?.image;
    const primary = PRIMARY_NAV.filter((item) => !item.auth || showMemberLinks);
    const shown = primary.slice(0, visibleCount);
    const overflow = primary.slice(shown.length);
    const secondary = SECONDARY_NAV.filter((item) => !item.auth || signedIn);
    const notificationsLabel = t("notifications") || "Bildirimler";
    const bellLabel = unread > 0 ? tx(C.notificationsWithUnread, { label: notificationsLabel, count: unread }) : notificationsLabel;
    const openNotifications = () => {
        setProfileOpen(false);
        setMenuOpen(false);
        setNotificationsOpen(true);
    };

    const toggleProfile = () => {
        setProfileView("menu");
        setProfileOpen((value) => !value);
    };

    const signOutNow = () => {
        writeSignedInHint(false);
        reportPresenceOffline();
        prepareSignOut();
        void signOut({ callbackUrl: "/" });
    };

    return (
        <>
            <header className={`fixed inset-x-0 top-0 z-50 h-16 transition-[background-color,box-shadow,border-color] duration-300 ${scrolled || menuOpen ? "border-b border-zinc-200/80 bg-white/80 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] backdrop-blur-xl dark:border-white/[0.06] dark:bg-zinc-950/80" : "border-b border-transparent bg-white/40 backdrop-blur-md dark:bg-zinc-950/30"}`}>
                <div className="mx-auto flex h-full max-w-7xl items-center gap-3 px-4 sm:px-6">
                    <Link href="/" className="group flex shrink-0 items-center gap-2.5" onClick={() => setMenuOpen(false)} aria-label="Hanogt Codev">
                        <span className="grid h-10 w-10 place-items-center transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none">
                            <ProductLogo product="hanogt" size={36} priority />
                        </span>
                        <span className="hidden text-[17px] font-black tracking-tight text-zinc-900 sm:block dark:text-white">
                            Hanogt <span className="text-gradient">Codev</span>
                        </span>
                    </Link>

                    <nav ref={navRef} className="relative hidden min-w-0 flex-1 justify-center lg:flex" aria-label={t("hd_main_nav")}>
                        {/* A hidden copy of every item and of "More": its widths decide how many items the bar shows. */}
                        <div className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden" aria-hidden="true">
                            <div ref={measureRef} className="flex w-max items-center">
                                {primary.map((item) => (
                                    <span key={item.href} className={NAV_ITEM_CLASS}>
                                        <span className="pb-0.5">{tx(item.label)}</span>
                                        {item.live ? <span className="ms-0.5 h-1.5 w-1.5" /> : null}
                                    </span>
                                ))}
                                <span className={NAV_ITEM_CLASS}>{tx(NAV_LABELS.more)}<ChevronDown className="h-3.5 w-3.5" /></span>
                            </div>
                        </div>
                        <div ref={navListRef} className="flex w-max items-center">
                            {shown.map((item) => {
                                const active = isActivePath(pathname, item.href);
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        aria-current={active ? "page" : undefined}
                                        className={`${NAV_ITEM_CLASS} ${active ? "text-zinc-950 dark:text-white" : "text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"}`}
                                    >
                                        {active ? <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-zinc-900/[0.06] ring-1 ring-zinc-900/[0.06] dark:bg-white/[0.08] dark:ring-white/10" transition={{ type: "spring", stiffness: 420, damping: 36 }} /> : null}
                                        {/* The accent underline draws in on hover (the current page has its pill instead). */}
                                        <span className={`relative pb-0.5 ${active ? "" : "underline-accent"}`}>{tx(item.label)}</span>
                                        {item.live ? <LiveDot /> : null}
                                    </Link>
                                );
                            })}
                            {overflow.length ? (
                                <div ref={moreRef} className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setMoreOpen((value) => !value)}
                                        aria-haspopup="menu"
                                        aria-expanded={moreOpen}
                                        className={`${NAV_ITEM_CLASS} ${moreOpen || overflow.some((item) => isActivePath(pathname, item.href)) ? "text-zinc-950 dark:text-white" : "text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"}`}
                                    >
                                        {tx(NAV_LABELS.more)}
                                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${moreOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                                    </button>
                                    <AnimatePresence>
                                        {moreOpen ? (
                                            <motion.div
                                                role="menu"
                                                aria-label={tx(NAV_LABELS.more)}
                                                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                                                transition={{ duration: 0.14 }}
                                                className="absolute end-0 top-full z-[70] mt-2 w-64 origin-top-right rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-2xl shadow-black/10 dark:border-white/10 dark:bg-zinc-900"
                                            >
                                                {overflow.map((item) => <MoreItem key={item.href} item={item} active={isActivePath(pathname, item.href)} onPick={() => setMoreOpen(false)} />)}
                                            </motion.div>
                                        ) : null}
                                    </AnimatePresence>
                                </div>
                            ) : null}
                        </div>
                    </nav>

                    <div className="ms-auto flex items-center gap-1 sm:gap-1.5 lg:ms-0">
                        <button
                            type="button"
                            onClick={() => setShowChangelog(true)}
                            className="relative hidden h-9 w-9 place-items-center rounded-xl text-zinc-600 transition hover:bg-zinc-900/5 hover:text-zinc-950 sm:grid dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white"
                            title={tx(NAV_LABELS.whatsNew)}
                            aria-label={tx(NAV_LABELS.whatsNew)}
                        >
                            <Sparkles className="h-[18px] w-[18px]" />
                            <span className="absolute end-1.5 top-1.5 h-2 w-2 rounded-full bg-brand-green ring-2 ring-white dark:ring-zinc-950" />
                        </button>
                        <button
                            type="button"
                            onClick={() => window.dispatchEvent(new Event("hanogt:toggle-ai"))}
                            className={`grid h-9 w-9 place-items-center rounded-xl transition ${aiOpen ? "bg-zinc-900/[0.07] ring-1 ring-zinc-900/10 dark:bg-white/10 dark:ring-white/15" : "hover:bg-zinc-900/5 dark:hover:bg-white/10"}`}
                            title="Hanogt AI"
                            aria-label="Hanogt AI"
                            aria-pressed={aiOpen}
                        >
                            <ProductLogo product="ai" size={24} />
                        </button>
                        <div className="hidden sm:block"><LangToggle compact /></div>
                        {/* On phones the theme switch lives in the menu, which leaves room for the Panel. */}
                        <div className="hidden sm:block"><ThemeToggle /></div>

                        {showMemberLinks ? (
                            <Link
                                href="/dashboard"
                                aria-current={isActivePath(pathname, "/dashboard") ? "page" : undefined}
                                aria-label={tx(NAV_LABELS.dashboard)}
                                title={tx(NAV_LABELS.dashboard)}
                                className={`flex h-9 items-center gap-1.5 rounded-xl px-2 text-[13.5px] font-semibold transition lg:hidden ${isActivePath(pathname, "/dashboard") ? "bg-zinc-900/[0.06] text-zinc-950 dark:bg-white/10 dark:text-white" : "text-zinc-700 hover:bg-zinc-900/5 dark:text-zinc-200 dark:hover:bg-white/10"}`}
                            >
                                <LayoutDashboard className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                                <span className="max-w-[5.5rem] truncate">{tx(NAV_LABELS.dashboard)}</span>
                            </Link>
                        ) : null}

                        {signedIn ? (
                            <button
                                ref={bellRef}
                                type="button"
                                onClick={() => (notificationsOpen ? setNotificationsOpen(false) : openNotifications())}
                                className={`relative grid h-9 w-9 place-items-center rounded-xl text-zinc-600 transition hover:bg-zinc-900/5 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white ${notificationsOpen ? "bg-zinc-900/5 text-zinc-950 dark:bg-white/10 dark:text-white" : ""}`}
                                title={bellLabel}
                                aria-label={bellLabel}
                                aria-haspopup="dialog"
                                aria-expanded={notificationsOpen}
                            >
                                <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
                                {unread > 0 ? (
                                    <span aria-hidden="true" className="absolute -end-0.5 -top-0.5 min-w-[18px] rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-[18px] tabular-nums text-white ring-2 ring-white dark:ring-zinc-950">
                                        {unread > 9 ? "9+" : unread}
                                    </span>
                                ) : null}
                            </button>
                        ) : null}

                        {signedIn ? (
                            <div className="relative" ref={profileRef}>
                                <button
                                    type="button"
                                    onClick={toggleProfile}
                                    aria-haspopup="menu"
                                    aria-expanded={profileOpen}
                                    aria-label={statusLabel ? tx(C.accountMenuStatus, { status: statusLabel }) : tx(C.accountMenu)}
                                    className="flex items-center gap-1 rounded-full p-1 transition hover:bg-zinc-900/5 dark:hover:bg-white/10"
                                >
                                    <PresenceAvatar src={displayAvatar} name={displayName} status={ownStatus} size="sm" ring="bg-white dark:bg-zinc-950" />
                                    <ChevronDown className={`hidden h-4 w-4 text-zinc-500 transition-transform sm:block ${profileOpen ? "rotate-180" : ""}`} />
                                </button>
                                <AnimatePresence>
                                    {profileOpen ? (
                                        <motion.div
                                            role={profileView === "menu" ? "menu" : "dialog"}
                                            aria-label={profileView === "menu" ? tx(C.accountMenu) : tx(C.setStatus)}
                                            initial={{ opacity: 0, y: -6, scale: 0.97 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: -6, scale: 0.97 }}
                                            transition={{ duration: 0.16 }}
                                            className="absolute end-0 top-full z-[70] mt-2 max-h-[calc(100dvh-5rem)] w-72 max-w-[calc(100vw-2rem)] origin-top-right overflow-y-auto rounded-2xl border border-zinc-200 bg-white shadow-2xl shadow-black/10 dark:border-white/10 dark:bg-zinc-900"
                                        >
                                            <div className="flex items-center gap-3 border-b border-zinc-100 bg-zinc-50 p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
                                                <PresenceAvatar src={displayAvatar} name={displayName} status={ownStatus} size="md" ring="bg-white dark:bg-zinc-900" />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex min-w-0 items-center gap-1.5">
                                                        <p className="min-w-0 truncate font-bold text-zinc-900 dark:text-white">{displayName}</p>
                                                        <StaffBadge role={staffRole} size="sm" />
                                                    </div>
                                                    <p className="truncate text-[12.5px] text-zinc-500">{account?.email}</p>
                                                </div>
                                            </div>
                                            {profileView === "status" && email ? (
                                                <div ref={statusViewRef} className="p-3">
                                                    <button type="button" onClick={() => setProfileView("menu")} className="mb-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]">
                                                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />{tx(C.back)}
                                                    </button>
                                                    <StatusMenu email={email} />
                                                </div>
                                            ) : (
                                                <div className="p-1.5">
                                                    <button ref={statusRowRef} role="menuitem" type="button" onClick={() => setProfileView("status")} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-[14px] text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]">
                                                        <span className="grid h-4.5 w-4.5 shrink-0 place-items-center">{ownStatus ? <PresenceMark status={ownStatus} className="h-3 w-3" /> : null}</span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block font-semibold text-zinc-900 dark:text-white">{statusLabel || tx(C.setStatus)}</span>
                                                            {customStatus ? <span className="block truncate text-[12px] text-zinc-500" dir="auto">{customStatus}</span> : null}
                                                        </span>
                                                        <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 rtl:rotate-180" aria-hidden="true" />
                                                    </button>
                                                    <div className="my-1 h-px bg-zinc-100 dark:bg-white/[0.06]" />
                                                    {[...PRIMARY_NAV.filter((item) => item.auth), ...SECONDARY_NAV.filter((item) => item.auth)].map((item) => {
                                                        const Icon = NAV_ICONS[item.icon];
                                                        return (
                                                            <Link key={item.href} role="menuitem" href={item.href} onClick={() => setProfileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]">
                                                                <Icon className="h-4.5 w-4.5 text-zinc-400" />{tx(item.label)}
                                                            </Link>
                                                        );
                                                    })}
                                                    {isAdmin ? (
                                                        <Link role="menuitem" href={ADMIN_NAV.href} onClick={() => setProfileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] font-semibold text-violet-700 transition hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-500/10">
                                                            <Gauge className="h-4.5 w-4.5" />{tx(ADMIN_NAV.label)}
                                                        </Link>
                                                    ) : null}
                                                    <Link role="menuitem" href="/account-settings" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]">
                                                        <Settings className="h-4.5 w-4.5 text-zinc-400" />{t("account_settings") || "Hesap Ayarları"}
                                                    </Link>
                                                    <div className="my-1 h-px bg-zinc-100 dark:bg-white/[0.06]" />
                                                    <button role="menuitem" type="button" onClick={signOutNow} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[14px] text-red-600 transition hover:bg-red-50 dark:hover:bg-red-500/10">
                                                        <LogOut className="h-4.5 w-4.5" />{t("sign_out")}
                                                    </button>
                                                </div>
                                            )}
                                        </motion.div>
                                    ) : null}
                                </AnimatePresence>
                            </div>
                        ) : sessionLoading ? (
                            <div className="h-9 w-9 animate-pulse rounded-full bg-zinc-200 dark:bg-white/10" aria-hidden="true" />
                        ) : (
                            <div className="flex items-center gap-1.5">
                                <Link href="/login" className="hidden h-9 items-center rounded-xl px-3 text-[13.5px] font-semibold text-zinc-700 transition hover:bg-zinc-900/5 sm:flex dark:text-zinc-200 dark:hover:bg-white/10">{t("login")}</Link>
                                <Link href="/signup" className="flex h-9 items-center rounded-xl bg-zinc-900 px-3.5 text-[13.5px] font-bold text-white shadow-lg shadow-zinc-900/10 transition hover:-translate-y-px hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100">{t("signup")}</Link>
                            </div>
                        )}

                        <button
                            ref={menuButtonRef}
                            type="button"
                            onClick={() => setMenuOpen((value) => !value)}
                            className="grid h-9 w-9 place-items-center rounded-xl text-zinc-700 transition hover:bg-zinc-900/5 lg:hidden dark:text-zinc-200 dark:hover:bg-white/10"
                            aria-expanded={menuOpen}
                            aria-controls="mobile-menu"
                            aria-label={tx(NAV_LABELS.menu)}
                        >
                            <AnimatePresence mode="wait" initial={false}>
                                <motion.span key={menuOpen ? "close" : "open"} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
                                    {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                                </motion.span>
                            </AnimatePresence>
                        </button>
                    </div>
                </div>
                <motion.div className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-brand-green" style={{ scaleX: progress }} aria-hidden="true" />
            </header>

            <AnimatePresence>
                {menuOpen ? (
                    <motion.div
                        id="mobile-menu"
                        className="fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto bg-white/95 backdrop-blur-xl lg:hidden dark:bg-zinc-950/95"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <nav className="mx-auto max-w-2xl px-4 pb-10 pt-4" aria-label={tx(NAV_LABELS.menu)}>
                            {signedIn && email ? (
                                <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-3.5 dark:border-white/[0.08] dark:bg-zinc-950">
                                    <button type="button" onClick={() => setMobileStatusOpen((value) => !value)} aria-expanded={mobileStatusOpen} className="flex w-full items-center gap-3 text-start">
                                        <PresenceAvatar src={displayAvatar} name={displayName} status={ownStatus} size="md" ring="bg-white dark:bg-zinc-950" />
                                        <span className="min-w-0 flex-1">
                                            <span className="flex min-w-0 items-center gap-1.5">
                                                <span className="truncate text-[15px] font-bold text-zinc-900 dark:text-white">{displayName}</span>
                                                <StaffBadge role={staffRole} size="sm" compactOnMobile />
                                            </span>
                                            <span className="block truncate text-[12.5px] text-zinc-500" dir="auto">{customStatus || statusLabel || tx(C.setStatus)}</span>
                                        </span>
                                        <span className="shrink-0 text-[12px] font-semibold text-brand-green">{tx(C.setStatus)}</span>
                                        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${mobileStatusOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                                    </button>
                                    {mobileStatusOpen ? <StatusMenu email={email} className="mt-3 border-t border-zinc-100 pt-3 dark:border-white/[0.08]" /> : null}
                                </div>
                            ) : null}
                            <div className="grid grid-cols-2 gap-2">
                                {primary.map((item, index) => {
                                    const Icon = NAV_ICONS[item.icon];
                                    const active = isActivePath(pathname, item.href);
                                    return (
                                        <motion.div key={item.href} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.035 }}>
                                            <Link
                                                href={item.href}
                                                onClick={() => setMenuOpen(false)}
                                                aria-current={active ? "page" : undefined}
                                                className={`flex h-full flex-col gap-2 rounded-2xl border p-3.5 transition ${active ? "border-brand-green/40 bg-brand-green/[0.06]" : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-white/[0.08] dark:bg-white/[0.03]"}`}
                                            >
                                                <span className="flex items-center gap-2">
                                                    {item.product ? <ProductLogo product={item.product} size={32} /> : <span className="grid h-8 w-8 place-items-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-white/10 dark:text-zinc-200"><Icon className="h-4 w-4" /></span>}
                                                    {item.live ? <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-black uppercase text-red-600 dark:text-red-400">{tx(NAV_LABELS.live)}</span> : null}
                                                </span>
                                                <span className="text-[15px] font-bold text-zinc-900 dark:text-white">{tx(item.label)}</span>
                                                <span className="text-[12px] leading-snug text-zinc-500 dark:text-zinc-400">{item.desc ? tx(item.desc) : item.descKey ? t(item.descKey) : ""}</span>
                                            </Link>
                                        </motion.div>
                                    );
                                })}
                            </div>
                            {isAdmin ? (
                                <Link
                                    href={ADMIN_NAV.href}
                                    onClick={() => setMenuOpen(false)}
                                    aria-current={isActivePath(pathname, ADMIN_NAV.href) ? "page" : undefined}
                                    className="mt-4 flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50/70 p-3.5 transition hover:border-violet-300 dark:border-violet-400/25 dark:bg-violet-500/10 dark:hover:border-violet-400/40"
                                >
                                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-600 text-white"><Gauge className="h-4.5 w-4.5" /></span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[15px] font-bold text-zinc-900 dark:text-white">{tx(ADMIN_NAV.label)}</span>
                                        {ADMIN_NAV.desc ? <span className="block text-[12px] leading-snug text-zinc-500 dark:text-zinc-400">{tx(ADMIN_NAV.desc)}</span> : null}
                                    </span>
                                    <StaffBadge role={staffRole} size="sm" compactOnMobile />
                                </Link>
                            ) : null}
                            <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/[0.08]">
                                {signedIn ? (
                                    <button type="button" onClick={openNotifications} className="flex w-full items-center gap-3 border-b border-zinc-100 px-4 py-3 text-start text-[14px] font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-white/[0.05] dark:text-zinc-300 dark:hover:bg-white/[0.04]">
                                        <Bell className="h-4.5 w-4.5 text-zinc-400" aria-hidden="true" />
                                        <span className="min-w-0 flex-1">{notificationsLabel}</span>
                                        {unread > 0 ? (
                                            <span className="shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold tabular-nums text-white">
                                                {unread > 99 ? "99+" : unread}<span className="sr-only"> {tx(C.unread)}</span>
                                            </span>
                                        ) : null}
                                    </button>
                                ) : null}
                                {secondary.map((item) => {
                                    const Icon = NAV_ICONS[item.icon];
                                    return (
                                        <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} className="flex items-center gap-3 border-b border-zinc-100 px-4 py-3 text-[14px] font-semibold text-zinc-700 last:border-0 hover:bg-zinc-50 dark:border-white/[0.05] dark:text-zinc-300 dark:hover:bg-white/[0.04]">
                                            <Icon className="h-4.5 w-4.5 text-zinc-400" />{tx(item.label)}
                                        </Link>
                                    );
                                })}
                                <button type="button" onClick={() => { setMenuOpen(false); setShowChangelog(true); }} className="flex w-full items-center gap-3 px-4 py-3 text-start text-[14px] font-semibold text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/[0.04]">
                                    <Sparkles className="h-4.5 w-4.5 text-zinc-400" />{tx(NAV_LABELS.whatsNew)}
                                </button>
                            </div>
                            <div className="mt-4 flex items-center justify-between gap-2 rounded-2xl border border-zinc-200 px-4 py-3 dark:border-white/[0.08]">
                                <span className="text-[13px] font-semibold text-zinc-500">{t("hd_lang_theme")}</span>
                                <div className="flex items-center gap-1.5"><LangToggle /><ThemeToggle /></div>
                            </div>
                            {!signedIn && !sessionLoading ? (
                                <div className="mt-4 grid grid-cols-2 gap-2">
                                    <Link href="/login" onClick={() => setMenuOpen(false)} className="flex h-11 items-center justify-center rounded-xl border border-zinc-200 text-[14px] font-bold text-zinc-800 dark:border-white/10 dark:text-zinc-100">{t("login")}</Link>
                                    <Link href="/signup" onClick={() => setMenuOpen(false)} className="flex h-11 items-center justify-center rounded-xl bg-zinc-900 text-[14px] font-bold text-white dark:bg-white dark:text-zinc-900">{t("signup")}</Link>
                                </div>
                            ) : null}
                        </nav>
                    </motion.div>
                ) : null}
            </AnimatePresence>

            <ChangelogModal isOpen={showChangelog} onClose={() => setShowChangelog(false)} />
            <NotificationCenter isOpen={signedIn && notificationsOpen} onClose={() => setNotificationsOpen(false)} returnFocusRef={bellRef} />
        </>
    );
}
