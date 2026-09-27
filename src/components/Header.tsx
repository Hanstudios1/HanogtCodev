"use client";

import { AnimatePresence, motion, useScroll, useSpring } from "framer-motion";
import {
    BookOpen, Boxes, ChevronDown, FileCode, Gamepad2, LayoutDashboard, LogOut, Menu, MessageSquare, Newspaper, Radio, Settings,
    ShieldCheck, Sparkles, Users, UsersRound, X, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import OptimizedImage from "@/components/OptimizedImage";
import { db } from "@/lib/firebase";
import { useI18n } from "@/lib/i18n";
import { isActivePath, NAV_LABELS, PRIMARY_NAV, SECONDARY_NAV, type NavIcon } from "@/lib/nav";
import ChangelogModal from "./ChangelogModal";
import LangToggle from "./LangToggle";
import { SecurityBotChatWindow } from "./SecurityBotChat";
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
};

type UserData = { username?: string; avatarUrl?: string; isOnline?: boolean };

export default function Header() {
    const { data: session } = useSession();
    const { t, tx } = useI18n();
    const pathname = usePathname();
    const [scrolled, setScrolled] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const [showChangelog, setShowChangelog] = useState(false);
    const [showSecurityBot, setShowSecurityBot] = useState(false);
    const [userData, setUserData] = useState<UserData | null>(null);
    const profileRef = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll();
    const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.001 });
    const signedIn = Boolean(session?.user);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 8);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    // Presence: the header is mounted on every signed-in page.
    useEffect(() => {
        if (!session?.user?.email) return;
        const email = session.user.email;
        const markOnline = () => {
            const presence = { isOnline: true, lastSeenAt: new Date().toISOString() };
            void setDoc(doc(db, "users", email), presence, { merge: true }).catch(() => undefined);
            void setDoc(doc(db, "public_profiles", email), { ...presence, email }, { merge: true }).catch(() => undefined);
        };
        markOnline();
        const heartbeat = window.setInterval(markOnline, 45_000);
        const handleBeforeUnload = () => {
            void setDoc(doc(db, "users", email), { isOnline: false }, { merge: true }).catch(() => undefined);
            void setDoc(doc(db, "public_profiles", email), { isOnline: false, lastSeenAt: new Date().toISOString(), email }, { merge: true }).catch(() => undefined);
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => {
            window.clearInterval(heartbeat);
            window.removeEventListener("beforeunload", handleBeforeUnload);
        };
    }, [session?.user?.email]);

    useEffect(() => {
        if (!session?.user?.email) return;
        const unsubscribe = onSnapshot(doc(db, "users", session.user.email), (snapshot) => {
            if (snapshot.exists()) setUserData(snapshot.data() as UserData);
        }, () => undefined);
        return () => unsubscribe();
    }, [session?.user?.email]);

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

    const displayName = userData?.username || session?.user?.name || t("user");
    const displayAvatar = userData?.avatarUrl || session?.user?.image;
    const primary = PRIMARY_NAV.filter((item) => !item.auth || signedIn);
    const secondary = SECONDARY_NAV.filter((item) => !item.auth || signedIn);

    const avatar = (size: string) => displayAvatar ? (
        <OptimizedImage src={displayAvatar} alt="" className={`${size} rounded-full border-2 border-white object-cover shadow-sm dark:border-zinc-800`} />
    ) : (
        <span className={`${size} grid place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-sm font-bold text-white`}>{displayName?.charAt(0)?.toUpperCase() || "U"}</span>
    );

    return (
        <>
            <header className={`fixed inset-x-0 top-0 z-50 h-16 transition-[background-color,box-shadow,border-color] duration-300 ${scrolled || menuOpen ? "border-b border-zinc-200/80 bg-white/80 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] backdrop-blur-xl dark:border-white/[0.06] dark:bg-zinc-950/80" : "border-b border-transparent bg-white/40 backdrop-blur-md dark:bg-zinc-950/30"}`}>
                <div className="mx-auto flex h-full max-w-7xl items-center gap-3 px-4 sm:px-6">
                    <Link href="/" className="group flex shrink-0 items-center gap-2.5" onClick={() => setMenuOpen(false)} aria-label="Hanogt Codev">
                        <span className="relative grid h-10 w-10 place-items-center">
                            <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-500/25 to-fuchsia-500/25 opacity-0 blur-md transition group-hover:opacity-100" />
                            <OptimizedImage src="/logo-light.png" alt="" className="relative block h-10 w-10 object-contain transition-transform duration-500 group-hover:rotate-[-8deg] group-hover:scale-110 dark:hidden" />
                            <OptimizedImage src="/logo-dark.png" alt="" className="relative hidden h-10 w-10 object-contain transition-transform duration-500 group-hover:rotate-[-8deg] group-hover:scale-110 dark:block" />
                        </span>
                        <span className="hidden text-[17px] font-black tracking-tight text-zinc-900 sm:block dark:text-white">
                            Hanogt <span className="text-gradient">Codev</span>
                        </span>
                    </Link>

                    <nav className="mx-auto hidden items-center gap-0.5 lg:flex" aria-label={tx({ TR: "Ana menü", EN: "Main navigation" })}>
                        {primary.map((item) => {
                            const Icon = NAV_ICONS[item.icon];
                            const active = isActivePath(pathname, item.href);
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    aria-current={active ? "page" : undefined}
                                    className={`relative flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13.5px] font-semibold transition-colors ${active ? "text-zinc-950 dark:text-white" : "text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"}`}
                                >
                                    {active ? <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-zinc-900/[0.06] ring-1 ring-zinc-900/[0.06] dark:bg-white/[0.08] dark:ring-white/10" transition={{ type: "spring", stiffness: 420, damping: 36 }} /> : null}
                                    <Icon className="relative hidden h-4 w-4 xl:block" />
                                    <span className="relative">{tx(item.label)}</span>
                                    {item.live ? <span className="relative ms-0.5 flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" /></span> : null}
                                </Link>
                            );
                        })}
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
                            <span className="absolute end-1.5 top-1.5 h-2 w-2 rounded-full bg-indigo-500 ring-2 ring-white dark:ring-zinc-950" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowSecurityBot((value) => !value)}
                            className={`relative grid h-9 w-9 place-items-center rounded-xl transition ${showSecurityBot ? "bg-emerald-500/15 ring-2 ring-emerald-500/40" : "hover:bg-zinc-900/5 dark:hover:bg-white/10"}`}
                            title="Hanogt Security Bot"
                            aria-label="Hanogt Security Bot"
                            aria-pressed={showSecurityBot}
                        >
                            <OptimizedImage src="/hanogt-bot-logo.png" alt="" className="h-6 w-6 rounded-full object-cover" />
                            <span className="absolute bottom-1.5 end-1.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-950" />
                        </button>
                        <div className="hidden sm:block"><LangToggle compact /></div>
                        <ThemeToggle />

                        {signedIn ? (
                            <div className="relative" ref={profileRef}>
                                <button
                                    type="button"
                                    onClick={() => setProfileOpen((value) => !value)}
                                    aria-haspopup="menu"
                                    aria-expanded={profileOpen}
                                    className="flex items-center gap-1 rounded-full p-1 transition hover:bg-zinc-900/5 dark:hover:bg-white/10"
                                >
                                    <span className="relative">
                                        {avatar("h-8 w-8")}
                                        <span className={`absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-zinc-950 ${userData?.isOnline ? "bg-emerald-500" : "bg-zinc-400"}`} />
                                    </span>
                                    <ChevronDown className={`hidden h-4 w-4 text-zinc-500 transition-transform sm:block ${profileOpen ? "rotate-180" : ""}`} />
                                </button>
                                <AnimatePresence>
                                    {profileOpen ? (
                                        <motion.div
                                            role="menu"
                                            initial={{ opacity: 0, y: -6, scale: 0.97 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: -6, scale: 0.97 }}
                                            transition={{ duration: 0.16 }}
                                            className="absolute end-0 top-full z-[70] mt-2 w-72 origin-top-right overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl shadow-black/10 dark:border-white/10 dark:bg-zinc-900"
                                        >
                                            <div className="flex items-center gap-3 border-b border-zinc-100 bg-gradient-to-br from-indigo-500/[0.06] to-fuchsia-500/[0.06] p-4 dark:border-white/[0.06]">
                                                {avatar("h-11 w-11")}
                                                <div className="min-w-0">
                                                    <p className="truncate font-bold text-zinc-900 dark:text-white">{displayName}</p>
                                                    <p className="truncate text-[12.5px] text-zinc-500">{session?.user?.email}</p>
                                                </div>
                                            </div>
                                            <div className="p-1.5">
                                                {[...PRIMARY_NAV.filter((item) => item.auth), ...SECONDARY_NAV.filter((item) => item.auth)].map((item) => {
                                                    const Icon = NAV_ICONS[item.icon];
                                                    return (
                                                        <Link key={item.href} role="menuitem" href={item.href} onClick={() => setProfileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]">
                                                            <Icon className="h-4.5 w-4.5 text-zinc-400" />{tx(item.label)}
                                                        </Link>
                                                    );
                                                })}
                                                <Link role="menuitem" href="/account-settings" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]">
                                                    <Settings className="h-4.5 w-4.5 text-zinc-400" />{t("account_settings") || "Hesap Ayarları"}
                                                </Link>
                                                <div className="my-1 h-px bg-zinc-100 dark:bg-white/[0.06]" />
                                                <button role="menuitem" type="button" onClick={() => void signOut({ callbackUrl: "/" })} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[14px] text-red-600 transition hover:bg-red-50 dark:hover:bg-red-500/10">
                                                    <LogOut className="h-4.5 w-4.5" />{t("sign_out")}
                                                </button>
                                            </div>
                                        </motion.div>
                                    ) : null}
                                </AnimatePresence>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5">
                                <Link href="/login" className="hidden h-9 items-center rounded-xl px-3 text-[13.5px] font-semibold text-zinc-700 transition hover:bg-zinc-900/5 sm:flex dark:text-zinc-200 dark:hover:bg-white/10">{t("login")}</Link>
                                <Link href="/signup" className="flex h-9 items-center rounded-xl bg-zinc-900 px-3.5 text-[13.5px] font-bold text-white shadow-lg shadow-zinc-900/10 transition hover:-translate-y-px hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100">{t("signup")}</Link>
                            </div>
                        )}

                        <button
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
                <motion.div className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-400" style={{ scaleX: progress }} aria-hidden="true" />
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
                                                className={`flex h-full flex-col gap-2 rounded-2xl border p-3.5 transition ${active ? "border-indigo-500/40 bg-indigo-500/[0.08]" : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-white/[0.08] dark:bg-white/[0.03]"}`}
                                            >
                                                <span className="flex items-center gap-2">
                                                    <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow"><Icon className="h-4 w-4" /></span>
                                                    {item.live ? <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-black uppercase text-red-600 dark:text-red-400">{tx(NAV_LABELS.live)}</span> : null}
                                                </span>
                                                <span className="text-[15px] font-bold text-zinc-900 dark:text-white">{tx(item.label)}</span>
                                                <span className="text-[12px] leading-snug text-zinc-500 dark:text-zinc-400">{tx(item.description)}</span>
                                            </Link>
                                        </motion.div>
                                    );
                                })}
                            </div>
                            <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/[0.08]">
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
                                <span className="text-[13px] font-semibold text-zinc-500">{tx({ TR: "Dil ve tema", EN: "Language & theme" })}</span>
                                <div className="flex items-center gap-1.5"><LangToggle /><ThemeToggle /></div>
                            </div>
                            {!signedIn ? (
                                <div className="mt-4 grid grid-cols-2 gap-2">
                                    <Link href="/login" onClick={() => setMenuOpen(false)} className="flex h-11 items-center justify-center rounded-xl border border-zinc-200 text-[14px] font-bold text-zinc-800 dark:border-white/10 dark:text-zinc-100">{t("login")}</Link>
                                    <Link href="/signup" onClick={() => setMenuOpen(false)} className="flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-[14px] font-bold text-white shadow-lg shadow-indigo-500/25">{t("signup")}</Link>
                                </div>
                            ) : null}
                        </nav>
                    </motion.div>
                ) : null}
            </AnimatePresence>

            <ChangelogModal isOpen={showChangelog} onClose={() => setShowChangelog(false)} />
            {showSecurityBot ? <SecurityBotChatWindow onClose={() => setShowSecurityBot(false)} /> : null}
        </>
    );
}
