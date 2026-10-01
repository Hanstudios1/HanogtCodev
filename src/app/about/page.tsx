"use client";

import { animate, motion, useInView, useReducedMotion } from "framer-motion";
import {
    ArrowRight, Boxes, Building2, Check, Code, FolderGit2, Gamepad2, Globe2, Languages, MessagesSquare, Newspaper, Radio, Rocket, Shield,
    ShieldCheck, Sparkles, Trophy, Users, UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";
import { LANGUAGES, formatCopy, useI18n } from "@/lib/i18n";
import { NAV_LABELS } from "@/lib/nav";
import { LANGUAGE_STATS } from "@/lib/runtimes/languages";
import { SITE_MILESTONES, type PublicStats } from "@/lib/site";

function CountUp({ value }: { value: number }) {
    const { locale } = useI18n();
    const ref = useRef<HTMLSpanElement | null>(null);
    const inView = useInView(ref, { once: true, margin: "-40px" });
    const reduced = useReducedMotion();
    const [shown, setShown] = useState(0);
    useEffect(() => {
        if (!inView) return;
        if (reduced) {
            const frame = window.requestAnimationFrame(() => setShown(value));
            return () => window.cancelAnimationFrame(frame);
        }
        const controls = animate(0, value, { duration: 1.2, ease: [0.22, 1, 0.36, 1], onUpdate: (latest) => setShown(Math.round(latest)) });
        return () => controls.stop();
    }, [inView, reduced, value]);
    let text = String(shown);
    try {
        text = new Intl.NumberFormat(locale).format(shown);
    } catch {
        // Unknown locale tag: plain digits.
    }
    return <span ref={ref} className="tabular-nums">{text}</span>;
}

type StatTile = { key: string; label: string; value: number | null; icon: typeof Users; tone: string };

export default function AboutPage() {
    const { t, tx, locale } = useI18n();
    const [stats, setStats] = useState<PublicStats | null>(null);
    const [statsState, setStatsState] = useState<"loading" | "ready" | "unavailable">("loading");

    useEffect(() => {
        let active = true;
        fetch("/api/stats/public")
            .then((response) => (response.ok ? response.json() as Promise<PublicStats> : null))
            .then((data) => {
                if (!active) return;
                setStats(data);
                setStatsState(data ? "ready" : "unavailable");
            })
            .catch(() => {
                if (active) setStatsState("unavailable");
            });
        return () => {
            active = false;
        };
    }, []);

    const products = [
        { icon: Code, href: "/dashboard", title: tx(NAV_LABELS.editor), text: formatCopy(t("ab_editor_text"), { count: LANGUAGE_STATS.usable }), color: "from-sky-500 to-indigo-500" },
        { icon: Boxes, href: "/game-engine", title: "Hanogt Engine V3", text: t("ab2_engine_text"), color: "from-violet-500 to-fuchsia-500" },
        { icon: Sparkles, href: "/ai", title: "Hanogt AI", text: t("ab2_ai_text"), color: "from-indigo-500 to-sky-500" },
        { icon: UsersRound, href: "/friends", title: "Hanogt Social", text: t("ab2_social_text"), color: "from-emerald-500 to-teal-500" },
        { icon: Gamepad2, href: "/arcade", title: "Arcade", text: t("ab_arcade_text"), color: "from-amber-400 to-orange-500" },
        { icon: Newspaper, href: "/news", title: "Hanogt News", text: t("ab2_news_text"), color: "from-rose-500 to-red-500" },
        { icon: Radio, href: "/media", title: "Hanogt Media", text: t("ab2_media_text"), color: "from-fuchsia-500 to-pink-500" },
        { icon: ShieldCheck, href: "/security", title: "Hanogt Security", text: t("ab_security_text"), color: "from-emerald-600 to-green-500" },
    ];

    const live: StatTile[] = [
        { key: "users", label: t("ab2_stat_users"), value: stats?.users ?? null, icon: Users, tone: "text-sky-500" },
        { key: "projects", label: t("ab2_stat_projects"), value: stats?.projects ?? null, icon: FolderGit2, tone: "text-indigo-500" },
        { key: "games", label: t("ab2_stat_games"), value: stats?.games ?? null, icon: Trophy, tone: "text-amber-500" },
        { key: "posts", label: t("ab2_stat_posts"), value: stats?.posts ?? null, icon: MessagesSquare, tone: "text-fuchsia-500" },
    ];
    const fixed: StatTile[] = [
        { key: "code", label: t("ab2_stat_code_langs"), value: LANGUAGE_STATS.usable, icon: Code, tone: "text-emerald-500" },
        { key: "ui", label: t("ab2_stat_ui_langs"), value: LANGUAGES.length, icon: Languages, tone: "text-rose-500" },
    ];
    // While loading every tile keeps its place; afterwards only real numbers stay.
    const tiles = statsState === "loading" ? [...live, ...fixed] : [...live.filter((tile) => tile.value !== null), ...fixed];

    const formatDate = (iso: string) => {
        try {
            return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
        } catch {
            return iso;
        }
    };

    return (
        <div className="min-h-dvh bg-white text-zinc-900 dark:bg-zinc-950 dark:text-white">
            <Header />
            <main id="main-content">
                {/* Hero */}
                <section className="relative overflow-hidden">
                    <div className="absolute inset-0 bg-grid opacity-60 mask-fade-b" />
                    <div className="absolute -right-24 top-10 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl animate-float" />
                    <div className="absolute -left-24 top-40 h-72 w-72 rounded-full bg-fuchsia-500/15 blur-3xl animate-float" style={{ animationDelay: "-3s" }} />
                    <div className="relative mx-auto max-w-5xl px-4 pb-12 pt-32 text-center sm:px-6">
                        <p className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[12px] font-bold text-indigo-600 dark:text-indigo-300 animate-fade-up">
                            <Building2 className="h-3.5 w-3.5" />HanStudios
                        </p>
                        <h1 className="mt-5 text-5xl font-black tracking-tight sm:text-6xl animate-fade-up" style={{ animationDelay: "60ms" }}>{t("about_title")}</h1>
                        <p className="mx-auto mt-5 max-w-3xl text-[17px] leading-relaxed text-zinc-600 dark:text-zinc-400 animate-fade-up" style={{ animationDelay: "120ms" }}>
                            {formatCopy(t("ab2_lead"), { count: LANGUAGE_STATS.usable })}
                        </p>
                        <ul className="mx-auto mt-7 grid max-w-3xl gap-2 text-start sm:grid-cols-2 animate-fade-up" style={{ animationDelay: "180ms" }}>
                            {[t("ab2_feature_1"), t("ab2_feature_2"), t("ab2_feature_3"), t("ab2_feature_4")].map((feature) => (
                                <li key={feature} className="flex items-start gap-2.5 rounded-2xl border border-zinc-200 bg-white/70 px-3.5 py-3 text-[14px] leading-snug text-zinc-700 backdrop-blur dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-zinc-300">
                                    <span className="mt-0.5 grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"><Check className="h-3 w-3" strokeWidth={3} /></span>
                                    {feature}
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                {/* Live numbers */}
                <section aria-labelledby="about-stats" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
                    <h2 id="about-stats" className="text-center text-3xl font-black tracking-tight">{t("ab2_stats_title")}</h2>
                    <ul className="mt-8 flex flex-wrap justify-center gap-3" aria-busy={statsState === "loading"}>
                        {tiles.map((tile, index) => (
                            <motion.li
                                key={tile.key}
                                initial={{ opacity: 0, y: 16 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.05 }}
                                className="w-[calc(50%-0.375rem)] rounded-3xl border border-zinc-200 bg-zinc-50/80 p-5 text-center sm:w-44 lg:w-[10.5rem] dark:border-white/[0.08] dark:bg-white/[0.03]"
                            >
                                <tile.icon className={`mx-auto h-5 w-5 ${tile.tone}`} aria-hidden="true" />
                                <p className="mt-2 text-3xl font-black tracking-tight">
                                    {tile.value === null ? <span className="mx-auto block h-9 w-16 animate-pulse rounded-lg bg-zinc-200 dark:bg-white/10" /> : <CountUp value={tile.value} />}
                                </p>
                                <p className="mt-1 text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">{tile.label}</p>
                            </motion.li>
                        ))}
                    </ul>
                </section>

                {/* Products */}
                <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
                    <h2 className="text-center text-3xl font-black tracking-tight">{t("ab_products")}</h2>
                    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {products.map((product, index) => (
                            <motion.div key={product.href} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (index % 4) * 0.06 }}>
                                <Link href={product.href} className="group flex h-full flex-col rounded-3xl border border-zinc-200 bg-white p-6 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10 dark:border-white/[0.08] dark:bg-zinc-900/60">
                                    <span className={`grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br ${product.color} text-white shadow-lg`}><product.icon className="h-5 w-5" /></span>
                                    <h3 className="mt-4 text-lg font-black">{product.title}</h3>
                                    <p className="mt-1.5 flex-1 text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400">{product.text}</p>
                                    <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-bold text-indigo-600 transition group-hover:gap-2 dark:text-indigo-300">{tx(NAV_LABELS.explore)}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></span>
                                </Link>
                            </motion.div>
                        ))}
                    </div>
                </section>

                {/* Who we are + security */}
                <section className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
                    <div className="grid gap-4 md:grid-cols-2">
                        {[
                            { icon: Building2, title: t("about_company_title"), text: t("about_company_text"), tone: "text-sky-500" },
                            { icon: Shield, title: t("about_security_title"), text: t("about_security_text"), tone: "text-emerald-500" },
                        ].map((section, index) => (
                            <motion.article key={section.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.06 }} className="rounded-3xl border border-zinc-200 bg-zinc-50 p-6 dark:border-white/[0.08] dark:bg-white/[0.03]">
                                <h2 className="flex items-center gap-2.5 text-xl font-black"><section.icon className={`h-6 w-6 ${section.tone}`} />{section.title}</h2>
                                <p className="mt-3 text-[14.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">{section.text}</p>
                            </motion.article>
                        ))}
                    </div>
                </section>

                {/* Journey */}
                <section aria-labelledby="about-journey" className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
                    <h2 id="about-journey" className="text-center text-3xl font-black tracking-tight">{t("ab2_milestones_title")}</h2>
                    <ol className="relative mt-10 space-y-6 border-s-2 border-indigo-500/25 ps-7">
                        {SITE_MILESTONES.map((milestone, index) => {
                            const latest = index === SITE_MILESTONES.length - 1;
                            return (
                                <motion.li key={milestone.version} initial={{ opacity: 0, x: -12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.08 }} className="relative">
                                    <span className={`absolute -start-[2.15rem] top-1 grid h-5 w-5 place-items-center rounded-full ring-4 ring-white dark:ring-zinc-950 ${latest ? "bg-gradient-to-br from-indigo-500 to-fuchsia-500" : "bg-indigo-500/70"}`}>
                                        {latest ? <Rocket className="h-3 w-3 text-white" aria-hidden="true" /> : null}
                                    </span>
                                    <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-bold text-indigo-600 dark:text-indigo-300">
                                        <span className="rounded-md bg-indigo-500/10 px-1.5 py-0.5 font-mono">v{milestone.version}</span>
                                        <time dateTime={milestone.date} className="font-semibold text-zinc-500 dark:text-zinc-400">{formatDate(milestone.date)}</time>
                                    </p>
                                    <p className="mt-1.5 text-[15px] font-semibold leading-relaxed text-zinc-800 dark:text-zinc-200">{formatCopy(t(milestone.key), { count: LANGUAGES.length })}</p>
                                </motion.li>
                            );
                        })}
                    </ol>
                </section>

                {/* What's next + contact */}
                <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
                    <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
                        <div className="rounded-3xl border border-zinc-200 bg-gradient-to-br from-indigo-500/[0.07] to-fuchsia-500/[0.07] p-7 dark:border-white/[0.08]">
                            <h2 className="flex items-center gap-2.5 text-xl font-black"><Sparkles className="h-6 w-6 text-fuchsia-500" />{t("ab2_future_title")}</h2>
                            <p className="mt-3 text-[14.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">{t("ab2_future_text")}</p>
                        </div>
                        <div className="flex flex-col justify-center rounded-3xl border border-zinc-200 bg-zinc-50 p-7 text-center dark:border-white/[0.08] dark:bg-white/[0.03]">
                            <Globe2 className="mx-auto h-7 w-7 text-indigo-500" aria-hidden="true" />
                            <p className="mt-3 text-[15px] text-zinc-600 dark:text-zinc-400">{t("about_contact")}</p>
                            <Link href="/feedback" className="mt-2 inline-flex items-center justify-center gap-1 text-[15px] font-bold text-indigo-600 hover:underline dark:text-indigo-300">{t("about_feedback_link")}</Link>
                        </div>
                    </div>
                </section>
            </main>
            <SiteFooter />
        </div>
    );
}
