"use client";

import { useState, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { Users, Info, MessageSquare, FileText, Shield, ScrollText, Github, ChevronUp, ChevronDown } from "lucide-react";

export default function FloatingFooter() {
    const { t } = useI18n();
    const router = useRouter();
    const [isScrolled, setIsScrolled] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        let lastScrollY = 0;
        const handleScroll = () => {
            const currentScrollY = window.scrollY;
            setIsScrolled(currentScrollY > 200);

            // Hide when scrolling down rapidly, show when scrolling up
            if (currentScrollY > lastScrollY && currentScrollY > 400) {
                setIsVisible(false);
            } else {
                setIsVisible(true);
            }
            lastScrollY = currentScrollY;
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const links = [
        { icon: Users, label: t("friends") || "Arkadaşlar", href: "/friends", color: "text-blue-500" },
        { icon: Info, label: t("about_link") || "Hakkımızda", href: "/about", color: "text-emerald-500" },
        { icon: MessageSquare, label: t("feedback_link") || "Geri Bildirim", href: "/feedback", color: "text-amber-500" },
        { icon: FileText, label: t("terms_of_use") || "Kullanım Şartları", href: "/terms-of-use", color: "text-indigo-500" },
        { icon: Shield, label: t("privacy_policy") || "Gizlilik", href: "/privacy-policy", color: "text-rose-500" },
        { icon: ScrollText, label: t("disclosure_text") || "Aydınlatma", href: "/disclosure", color: "text-cyan-500" },
        { icon: Github, label: "GitHub", href: "https://github.com/Hanstudios1/HanogtLanguageSoftwareScript", external: true, color: "text-zinc-500 dark:text-zinc-400" },
    ];

    const handleNavigate = (href: string, external?: boolean) => {
        if (external) {
            window.open(href, "_blank");
        } else {
            router.push(href);
        }
    };

    // ===== EXPANDED BAR (page top) =====
    if (!isScrolled) {
        return (
            <div
                className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 ${isVisible ? "translate-y-0 opacity-100" : "translate-y-20 opacity-0"}`}
            >
                <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-700/80 rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/40 px-2 py-2 flex items-center gap-1">
                    {links.map((link, i) => (
                        <button
                            key={i}
                            onClick={() => handleNavigate(link.href, link.external)}
                            className="group flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all duration-200 whitespace-nowrap"
                        >
                            <link.icon className={`w-4 h-4 ${link.color} transition-transform group-hover:scale-110`} />
                            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 hidden sm:inline">
                                {link.label}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    // ===== COLLAPSED PILL (scrolled) =====
    return (
        <div
            className={`fixed bottom-6 right-6 z-50 transition-all duration-500 ${isVisible ? "translate-y-0 opacity-100" : "translate-y-20 opacity-0"}`}
        >
            {/* Expanded mini-menu */}
            {isExpanded && (
                <div className="absolute bottom-16 right-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-700/80 rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/40 p-2 mb-2 animate-in slide-in-from-bottom-4 fade-in duration-200">
                    <div className="flex flex-col gap-1 min-w-[180px]">
                        {links.map((link, i) => (
                            <button
                                key={i}
                                onClick={() => {
                                    handleNavigate(link.href, link.external);
                                    setIsExpanded(false);
                                }}
                                className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all duration-200 text-left"
                            >
                                <link.icon className={`w-4 h-4 ${link.color} flex-shrink-0`} />
                                <span className="text-sm text-zinc-700 dark:text-zinc-300 font-medium">
                                    {link.label}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Toggle FAB */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg shadow-black/15 dark:shadow-black/40 ${isExpanded
                        ? "bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 rotate-180"
                        : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                    }`}
            >
                {isExpanded ? (
                    <ChevronDown className="w-5 h-5" />
                ) : (
                    <ChevronUp className="w-5 h-5" />
                )}
            </button>
        </div>
    );
}
