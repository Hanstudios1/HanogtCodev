"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { User, Settings, LogOut, ChevronDown } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import LangToggle from "./LangToggle";
import { useI18n } from "@/lib/i18n";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

export default function Header() {
    const { data: session } = useSession();
    const { t } = useI18n();
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [isScrolled, setIsScrolled] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // User data from Firebase
    const [userData, setUserData] = useState<{ username?: string; avatarUrl?: string } | null>(null);

    // Scroll detection for shrinking header
    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 50);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    // Load user data from Firebase
    useEffect(() => {
        const loadUserData = async () => {
            if (!session?.user?.email) return;
            try {
                const userDoc = await getDoc(doc(db, "users", session.user.email));
                if (userDoc.exists()) {
                    setUserData(userDoc.data() as { username?: string; avatarUrl?: string });
                }
            } catch (error) {
                console.error("Error loading user data:", error);
            }
        };
        loadUserData();
    }, [session?.user?.email]);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowProfileMenu(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSignOut = async () => {
        await signOut({ callbackUrl: "/" });
    };

    // Get display name and avatar - prefer Firebase data over session data
    const displayName = userData?.username || session?.user?.name || t("user");
    const displayAvatar = userData?.avatarUrl || session?.user?.image;

    return (
        <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled
            ? "py-2 backdrop-blur-xl bg-white/90 dark:bg-zinc-950/90 shadow-lg"
            : "py-4 backdrop-blur-md bg-white/80 dark:bg-zinc-950/80"
            } border-b border-zinc-200 dark:border-zinc-800`}>
            <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-3 group">
                    <img
                        src="/logo-light.png"
                        alt="Hanogt Logo"
                        className={`object-contain block dark:hidden transition-all duration-300 ${isScrolled ? "w-10 h-10" : "w-14 h-14"}`}
                    />
                    <img
                        src="/logo-dark.png"
                        alt="Hanogt Logo"
                        className={`object-contain hidden dark:block transition-all duration-300 ${isScrolled ? "w-10 h-10" : "w-14 h-14"}`}
                    />

                    <h1 className={`font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600 transition-all duration-300 ${isScrolled ? "text-lg opacity-0 w-0 overflow-hidden" : "text-xl opacity-100"}`}>
                        Hanogt Codev
                    </h1>
                </Link>

                {/* Right Side - Controls */}
                <div className="flex items-center gap-2 md:gap-3">
                    <LangToggle />
                    <ThemeToggle />

                    {session?.user ? (
                        /* Profile Dropdown */
                        <div className="relative" ref={menuRef}>
                            <button
                                onClick={() => setShowProfileMenu(!showProfileMenu)}
                                className="flex items-center gap-2 p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                                {displayAvatar ? (
                                    <img
                                        src={displayAvatar}
                                        alt="Profile"
                                        className={`rounded-full object-cover border-2 border-zinc-200 dark:border-zinc-700 transition-all duration-300 ${isScrolled ? "w-7 h-7" : "w-8 h-8"}`}
                                    />
                                ) : (
                                    <div className={`rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm transition-all duration-300 ${isScrolled ? "w-7 h-7" : "w-8 h-8"}`}>
                                        {displayName?.charAt(0) || "U"}
                                    </div>
                                )}
                                <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${showProfileMenu ? "rotate-180" : ""}`} />
                            </button>

                            {/* Dropdown Menu */}
                            {showProfileMenu && (
                                <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden z-50">
                                    {/* User Info */}
                                    <div className="p-4 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
                                        <p className="font-bold text-zinc-900 dark:text-white truncate">
                                            {displayName}
                                        </p>
                                        <p className="text-sm text-zinc-500 truncate">
                                            {session.user.email}
                                        </p>
                                    </div>

                                    {/* Menu Items */}
                                    <div className="p-2">
                                        <Link
                                            href="/account-settings"
                                            onClick={() => setShowProfileMenu(false)}
                                            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-700 dark:text-zinc-300"
                                        >
                                            <Settings className="w-5 h-5" />
                                            {t("account_settings") || "Hesap Ayarları"}
                                        </Link>

                                        <button
                                            onClick={handleSignOut}
                                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-600"
                                        >
                                            <LogOut className="w-5 h-5" />
                                            {t("sign_out")}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Login/Signup Buttons */
                        <div className="flex items-center gap-2">
                            <Link
                                href="/login"
                                className={`px-3 md:px-4 py-2 text-zinc-700 dark:text-zinc-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors ${isScrolled ? "text-sm" : ""}`}
                            >
                                {t("login")}
                            </Link>
                            <Link
                                href="/signup"
                                className={`px-3 md:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-2xl transition-colors shadow-md ${isScrolled ? "text-sm" : ""}`}
                            >
                                {t("signup")}
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
