"use client";

import { motion } from "framer-motion";
import { ArrowRight, Boxes, Building2, Code, Gamepad2, Newspaper, Radio, Shield, ShieldCheck, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";
import { formatCopy, useI18n } from "@/lib/i18n";
import { NAV_LABELS } from "@/lib/nav";
import { LANGUAGE_STATS } from "@/lib/runtimes/languages";

export default function AboutPage() {
    const { t, tx } = useI18n();

    const products = [
        { icon: Code, href: "/dashboard", title: tx(NAV_LABELS.editor), text: formatCopy(t("ab_editor_text"), { count: LANGUAGE_STATS.usable }), color: "from-sky-500 to-indigo-500" },
        { icon: Boxes, href: "/game-engine", title: "Hanogt Engine", text: t("ab_engine_text"), color: "from-violet-500 to-fuchsia-500" },
        { icon: Gamepad2, href: "/arcade", title: "Arcade", text: t("ab_arcade_text"), color: "from-amber-400 to-orange-500" },
        { icon: Newspaper, href: "/news", title: "Hanogt News", text: t("ab_news_text"), color: "from-rose-500 to-red-500" },
        { icon: Radio, href: "/media", title: "Hanogt Media", text: t("ab_media_text"), color: "from-indigo-500 to-violet-500" },
        { icon: ShieldCheck, href: "/security", title: "Hanogt Security", text: t("ab_security_text"), color: "from-emerald-500 to-teal-500" },
    ];

    const sections = [
        { icon: Building2, title: t("about_company_title"), text: t("about_company_text"), tone: "text-sky-500" },
        { icon: Sparkles, title: t("about_future_title"), text: t("about_ai_text"), tone: "text-fuchsia-500" },
        { icon: Users, title: t("about_subscription_title"), text: t("about_subscription_text"), tone: "text-amber-500" },
        { icon: Shield, title: t("about_security_title"), text: t("about_security_text"), tone: "text-emerald-500" },
    ];

    return (
        <div className="min-h-dvh bg-white text-zinc-900 dark:bg-zinc-950 dark:text-white">
            <Header />
            <main id="main-content">
                <section className="relative overflow-hidden">
                    <div className="absolute inset-0 bg-grid opacity-60 mask-fade-b" />
                    <div className="absolute -right-24 top-10 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl animate-float" />
                    <div className="relative mx-auto max-w-5xl px-4 pb-14 pt-32 text-center sm:px-6">
                        <p className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[12px] font-bold text-indigo-600 dark:text-indigo-300 animate-fade-up">HanStudios</p>
                        <h1 className="mt-5 text-5xl font-black tracking-tight sm:text-6xl animate-fade-up" style={{ animationDelay: "60ms" }}>{t("about_title")}</h1>
                        <p className="mx-auto mt-5 max-w-2xl text-[17px] leading-relaxed text-zinc-600 dark:text-zinc-400 animate-fade-up" style={{ animationDelay: "120ms" }}>{formatCopy(t("about_purpose_text"), { count: LANGUAGE_STATS.usable })}</p>
                        <ul className="mx-auto mt-6 grid max-w-2xl gap-2 text-start sm:grid-cols-2 animate-fade-up" style={{ animationDelay: "180ms" }}>
                            {[t("about_feature_1"), t("about_feature_2"), t("about_feature_3"), t("about_feature_4")].map((feature) => (
                                <li key={feature} className="flex items-start gap-2 rounded-2xl border border-zinc-200 bg-white/70 px-3.5 py-2.5 text-[14px] text-zinc-700 backdrop-blur dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-zinc-300">
                                    <span className="mt-0.5 text-emerald-500">✓</span>{feature}
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
                    <h2 className="text-center text-3xl font-black tracking-tight">{t("ab_products")}</h2>
                    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {products.map((product, index) => (
                            <motion.div key={product.href} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.06 }}>
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

                <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
                    <div className="grid gap-4 md:grid-cols-2">
                        {sections.map((section, index) => (
                            <motion.article key={section.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.06 }} className="rounded-3xl border border-zinc-200 bg-zinc-50 p-6 dark:border-white/[0.08] dark:bg-white/[0.03]">
                                <h2 className="flex items-center gap-2.5 text-xl font-black"><section.icon className={`h-6 w-6 ${section.tone}`} />{section.title}</h2>
                                <p className="mt-3 text-[14.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">{section.text}</p>
                            </motion.article>
                        ))}
                    </div>
                    <div className="mt-10 rounded-3xl border border-zinc-200 bg-gradient-to-br from-indigo-500/[0.06] to-fuchsia-500/[0.06] p-8 text-center dark:border-white/[0.08]">
                        <p className="text-[15px] text-zinc-600 dark:text-zinc-400">{t("about_contact")}</p>
                        <Link href="/feedback" className="mt-2 inline-flex items-center gap-1 text-[15px] font-bold text-indigo-600 hover:underline dark:text-indigo-300">{t("about_feedback_link")}</Link>
                    </div>
                </section>
            </main>
            <SiteFooter />
        </div>
    );
}
