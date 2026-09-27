"use client";

import { ArrowUpRight, Github, Heart } from "lucide-react";
import Link from "next/link";
import OptimizedImage from "@/components/OptimizedImage";
import { useI18n, type Copy } from "@/lib/i18n";
import { NAV_LABELS } from "@/lib/nav";
import { GITHUB_URL, RELEASES_URL } from "@/lib/site";
import LangToggle from "./LangToggle";
import ThemeToggle from "./ThemeToggle";

const YEAR = new Date().getFullYear();

type FooterLink = { href: string; label: Copy | string; external?: boolean };

export default function SiteFooter({ className = "" }: { className?: string }) {
    const { t, tx } = useI18n();
    const label = (value: Copy | string) => (typeof value === "string" ? value : tx(value));

    const columns: Array<{ title: Copy; links: FooterLink[] }> = [
        {
            title: NAV_LABELS.explore,
            links: [
                { href: "/news", label: NAV_LABELS.news },
                { href: "/arcade", label: NAV_LABELS.arcade },
                { href: "/game-engine", label: NAV_LABELS.engine },
                { href: "/media", label: NAV_LABELS.media },
                { href: "/dashboard", label: NAV_LABELS.editor },
            ],
        },
        {
            title: NAV_LABELS.community,
            links: [
                { href: "/groups", label: NAV_LABELS.groups },
                { href: "/friends", label: NAV_LABELS.friends },
                { href: "/feedback", label: t("feedback_link") || "Geri Bildirim" },
                { href: "/about", label: t("about_link") || "Hakkımızda" },
            ],
        },
        {
            title: NAV_LABELS.resources,
            links: [
                { href: "/guide", label: NAV_LABELS.guide },
                { href: "/game-engine/docs", label: NAV_LABELS.docs },
                { href: "/security", label: NAV_LABELS.security },
                { href: RELEASES_URL, label: { TR: "Masaüstü uygulaması", EN: "Desktop app" }, external: true },
            ],
        },
        {
            title: NAV_LABELS.legal,
            links: [
                { href: "/terms-of-use", label: t("terms_of_use") || "Kullanım Şartları" },
                { href: "/privacy-policy", label: t("privacy_policy") || "Gizlilik Politikası" },
                { href: "/disclosure", label: t("disclosure_text") || "KVKK Aydınlatma Metni" },
            ],
        },
    ];

    return (
        <footer className={`relative overflow-hidden border-t border-zinc-200/80 bg-white dark:border-white/[0.06] dark:bg-zinc-950 ${className}`}>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
            <div className="pointer-events-none absolute -bottom-40 left-1/2 h-80 w-[60rem] -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl" />
            <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6">
                <div className="grid gap-10 lg:grid-cols-[1.3fr_repeat(4,1fr)]">
                    <div className="max-w-sm">
                        <Link href="/" className="inline-flex items-center gap-2.5">
                            <OptimizedImage src="/logo-light.png" alt="" className="block h-10 w-10 object-contain dark:hidden" />
                            <OptimizedImage src="/logo-dark.png" alt="" className="hidden h-10 w-10 object-contain dark:block" />
                            <span className="text-lg font-black tracking-tight text-zinc-900 dark:text-white">Hanogt <span className="text-gradient">Codev</span></span>
                        </Link>
                        <p className="mt-4 text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                            {tx({
                                TR: "Tarayıcıda kod yaz, C# ve C++ ile 2D/3D oyun yap, Arcade'de yayınla, canlı teknoloji haberlerini takip et. Tek hesap, kurulum yok.",
                                EN: "Code in the browser, build 2D/3D games with C# and C++, publish to the Arcade and follow live tech news. One account, no setup.",
                            })}
                        </p>
                        <div className="mt-5 flex items-center gap-2">
                            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="grid h-9 w-9 place-items-center rounded-xl border border-zinc-200 text-zinc-600 transition hover:-translate-y-0.5 hover:text-zinc-950 dark:border-white/10 dark:text-zinc-300 dark:hover:text-white" aria-label="GitHub">
                                <Github className="h-4 w-4" />
                            </a>
                            <LangToggle />
                            <ThemeToggle />
                        </div>
                    </div>
                    {columns.map((column) => (
                        <div key={column.title.EN}>
                            <h2 className="text-[12px] font-black uppercase tracking-[0.14em] text-zinc-400">{tx(column.title)}</h2>
                            <ul className="mt-4 space-y-2.5">
                                {column.links.map((link) => (
                                    <li key={link.href}>
                                        {link.external ? (
                                            <a href={link.href} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-1 text-[14px] text-zinc-600 transition hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white">
                                                {label(link.label)}<ArrowUpRight className="h-3.5 w-3.5 opacity-50 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" />
                                            </a>
                                        ) : (
                                            <Link href={link.href} className="text-[14px] text-zinc-600 transition hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white">{label(link.label)}</Link>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
                <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-zinc-200/80 pt-6 text-[13px] text-zinc-500 sm:flex-row sm:items-center dark:border-white/[0.06]">
                    <p>© {YEAR} Hanogt Codev · HanStudios. {t("all_rights_reserved") || "Tüm hakları saklıdır."}</p>
                    <p className="inline-flex items-center gap-1.5">{tx({ TR: "Geliştiriciler için", EN: "Made for developers with" })} <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" /> {tx({ TR: "ile yapıldı", EN: "" })}</p>
                </div>
            </div>
        </footer>
    );
}
