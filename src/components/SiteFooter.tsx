"use client";

import { ArrowUpRight, Github, Heart } from "lucide-react";
import Link from "next/link";
import ProductLogo from "@/components/ProductLogo";
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
    const [madeBefore, madeAfter = ""] = t("sf_made").split("{heart}");

    const columns: Array<{ title: Copy; links: FooterLink[] }> = [
        {
            title: NAV_LABELS.explore,
            links: [
                { href: "/ai", label: { TR: "Hanogt AI", EN: "Hanogt AI" } },
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
                { href: "/social", label: NAV_LABELS.social },
                { href: "/feedback", label: t("feedback_link") },
                { href: "/plans", label: NAV_LABELS.pricing },
                { href: "/about", label: t("about_link") },
            ],
        },
        {
            title: NAV_LABELS.resources,
            links: [
                { href: "/guide", label: NAV_LABELS.guide },
                { href: "/game-engine/docs", label: NAV_LABELS.docs },
                { href: "/security", label: NAV_LABELS.security },
                { href: RELEASES_URL, label: t("sf_desktop"), external: true },
            ],
        },
        {
            title: NAV_LABELS.legal,
            links: [
                { href: "/terms-of-use", label: t("terms_of_use") },
                { href: "/privacy-policy", label: t("privacy_policy") },
                { href: "/disclosure", label: t("disclosure_text") },
                { href: "/refund-policy", label: { TR: "İade Politikası", EN: "Refund Policy" } },
                { href: "/contact", label: { TR: "İletişim", EN: "Contact" } },
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
                            <ProductLogo product="hanogt" size={40} />
                            <span className="text-lg font-black tracking-tight text-zinc-900 dark:text-white">Hanogt <span className="text-gradient">Codev</span></span>
                        </Link>
                        <p className="mt-4 text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                            {t("sf_about")}
                        </p>
                        <div className="mt-5 flex items-center gap-2">
                            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="grid h-9 w-9 place-items-center rounded-xl border border-zinc-200 text-zinc-600 transition hover:-translate-y-0.5 hover:text-zinc-950 dark:border-white/10 dark:text-zinc-300 dark:hover:text-white" aria-label="GitHub">
                                <Github className="h-4 w-4" />
                            </a>
                            <LangToggle placement="up-start" />
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
                    <p>© {YEAR} Hanogt Codev · HanStudios. {t("all_rights_reserved")}</p>
                    <p className="inline-flex items-center gap-1.5">{madeBefore.trim()}<Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" aria-hidden="true" />{madeAfter.trim()}</p>
                </div>
            </div>
        </footer>
    );
}
