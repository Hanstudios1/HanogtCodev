"use client";

import { motion } from "framer-motion";
import { Check, Clock, ExternalLink, FileText, History, Languages, Link2, Printer, Scale, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";
import { useI18n } from "@/lib/i18n";
import { LEGAL_CHANGES, LEGAL_EFFECTIVE_DATE, LEGAL_VERSION } from "@/lib/legal";

export type LegalSection = {
    id: string;
    title: string;
    paragraphs?: string[];
    items?: string[];
    table?: { head: string[]; rows: string[][] };
    note?: string;
};

export type LegalHighlight = { title: string; text: string };

const RELATED = [
    { href: "/privacy-policy", label: "Gizlilik Politikası" },
    { href: "/disclosure", label: "KVKK Aydınlatma Metni" },
    { href: "/terms-of-use", label: "Kullanım Şartları" },
];

export default function LegalPage({
    eyebrow,
    title,
    summary,
    sections,
    notice,
    highlights = [],
    current,
}: {
    eyebrow: string;
    title: string;
    summary: string;
    sections: LegalSection[];
    notice?: string;
    highlights?: LegalHighlight[];
    current: string;
}) {
    const { language } = useI18n();
    const [active, setActive] = useState(sections[0]?.id ?? "");
    const [copied, setCopied] = useState<string | null>(null);
    const words = sections.reduce((sum, section) => sum + [...(section.paragraphs ?? []), ...(section.items ?? []), ...(section.table?.rows.flat() ?? [])].join(" ").split(/\s+/).length, 0);
    const minutes = Math.max(1, Math.round(words / 200));

    // Scroll spy for the table of contents.
    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
            if (visible[0]) setActive(visible[0].target.id);
        }, { rootMargin: "-80px 0px -65% 0px" });
        for (const section of sections) {
            const element = document.getElementById(section.id);
            if (element) observer.observe(element);
        }
        return () => observer.disconnect();
    }, [sections]);

    const copyLink = async (id: string) => {
        try {
            await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#${id}`);
            setCopied(id);
            window.setTimeout(() => setCopied(null), 1500);
        } catch {
            setCopied(null);
        }
    };

    return (
        <div className="min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-white">
            <Header />
            {/* The legal texts are written (and binding) in Turkish; lang lets browsers offer translation. */}
            <main id="main-content" lang="tr" className="px-4 pb-16 pt-24 sm:px-6">
                <div className="mx-auto max-w-6xl">
                    {language !== "TR" ? (
                        <div lang="en" dir="ltr" className="mb-4 flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm leading-6 text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100">
                            <Languages className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                            <p>This document is published in Turkish, and the Turkish text is the legally binding version. Your browser&apos;s translate feature can show it in your language; for questions, contact us through the Feedback page.</p>
                        </div>
                    ) : null}
                    <motion.header initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-zinc-900">
                        <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-700 p-7 text-white sm:p-10">
                            <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
                            <div className="relative">
                                <div className="mb-5 flex items-center justify-between gap-3">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15"><Scale className="h-6 w-6" /></div>
                                    <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold transition hover:bg-white/25"><Printer className="h-4 w-4" />Yazdır / PDF</button>
                                </div>
                                <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-100">{eyebrow}</p>
                                <h1 className="mt-3 max-w-4xl text-3xl font-black tracking-tight sm:text-5xl">{title}</h1>
                                <p className="mt-5 max-w-3xl text-sm leading-7 text-indigo-50 sm:text-base">{summary}</p>
                                <div className="mt-6 flex flex-wrap gap-2 text-xs text-indigo-50">
                                    <span className="rounded-full bg-white/10 px-3 py-1.5">Sürüm {LEGAL_VERSION}</span>
                                    <span className="rounded-full bg-white/10 px-3 py-1.5">Yürürlük: {LEGAL_EFFECTIVE_DATE}</span>
                                    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5"><Clock className="h-3 w-3" />~{minutes} dk okuma</span>
                                    <span className="rounded-full bg-white/10 px-3 py-1.5">Türkiye · KVKK</span>
                                </div>
                            </div>
                        </div>
                        {notice ? <div className="flex gap-3 border-t border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><p>{notice}</p></div> : null}
                    </motion.header>

                    {highlights.length ? (
                        <section className="mt-6" aria-labelledby="highlights-title">
                            <h2 id="highlights-title" className="mb-3 text-[13px] font-black uppercase tracking-[0.16em] text-zinc-400">Bir bakışta</h2>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                {highlights.map((highlight, index) => (
                                    <motion.div key={highlight.title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * index }} className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/[0.08] dark:bg-zinc-900">
                                        <p className="flex items-center gap-2 text-[14px] font-bold text-zinc-900 dark:text-white"><Check className="h-4 w-4 text-emerald-500" />{highlight.title}</p>
                                        <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">{highlight.text}</p>
                                    </motion.div>
                                ))}
                            </div>
                        </section>
                    ) : null}

                    <div className="mt-8 grid gap-8 lg:grid-cols-[270px_minmax(0,1fr)]">
                        <aside className="h-fit space-y-4 lg:sticky lg:top-24">
                            <nav className="scrollbar-thin rounded-2xl border border-zinc-200 bg-white p-3 dark:border-white/[0.08] dark:bg-zinc-900 lg:max-h-[calc(100dvh-14rem)] lg:overflow-y-auto" aria-label="İçindekiler">
                                <p className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-zinc-400">İçindekiler</p>
                                {sections.map((section, index) => (
                                    <a key={section.id} href={`#${section.id}`} aria-current={active === section.id ? "true" : undefined} className={`relative flex gap-3 rounded-xl px-3 py-2 text-[13.5px] transition ${active === section.id ? "bg-indigo-500/10 font-semibold text-indigo-700 dark:text-indigo-300" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.05] dark:hover:text-white"}`}>
                                        <span className="shrink-0 tabular-nums text-zinc-400">{String(index + 1).padStart(2, "0")}</span>{section.title}
                                    </a>
                                ))}
                            </nav>
                            <div className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-white/[0.08] dark:bg-zinc-900">
                                <p className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-zinc-400">İlgili metinler</p>
                                {RELATED.filter((entry) => entry.href !== current).map((entry) => (
                                    <Link key={entry.href} href={entry.href} className="flex items-center gap-2 rounded-xl px-3 py-2 text-[13.5px] text-zinc-600 transition hover:bg-zinc-100 hover:text-indigo-600 dark:text-zinc-400 dark:hover:bg-white/[0.05]"><FileText className="h-4 w-4" />{entry.label}</Link>
                                ))}
                            </div>
                        </aside>

                        <article className="min-w-0 space-y-4">
                            {sections.map((section, index) => (
                                <motion.section
                                    key={section.id}
                                    id={section.id}
                                    initial={{ opacity: 0, y: 14 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, margin: "-60px" }}
                                    transition={{ duration: 0.35 }}
                                    className="group scroll-mt-24 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-white/[0.08] dark:bg-zinc-900 sm:p-8"
                                >
                                    <div className="mb-5 flex items-start gap-4">
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-sm font-bold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">{index + 1}</span>
                                        <h2 className="flex-1 pt-1 text-xl font-bold">{section.title}</h2>
                                        <button type="button" onClick={() => void copyLink(section.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-400 opacity-0 transition hover:bg-zinc-100 hover:text-indigo-600 group-hover:opacity-100 focus:opacity-100 dark:hover:bg-white/[0.06]" aria-label="Bölüm bağlantısını kopyala" title="Bölüm bağlantısını kopyala">
                                            {copied === section.id ? <Check className="h-4 w-4 text-emerald-500" /> : <Link2 className="h-4 w-4" />}
                                        </button>
                                    </div>
                                    <div className="space-y-4 text-[14px] leading-7 text-zinc-600 dark:text-zinc-300">
                                        {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                                        {section.items ? (
                                            <ul className="space-y-2 ps-1">
                                                {section.items.map((item) => <li key={item} className="flex gap-3"><span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" /><span>{item}</span></li>)}
                                            </ul>
                                        ) : null}
                                        {section.table ? (
                                            <div className="scrollbar-thin overflow-x-auto rounded-xl border border-zinc-200 dark:border-white/[0.08]">
                                                <table className="w-full min-w-[560px] text-start text-[13px]">
                                                    <thead className="bg-zinc-50 dark:bg-white/[0.04]">
                                                        <tr>{section.table.head.map((cell) => <th key={cell} scope="col" className="px-3 py-2.5 text-start font-bold text-zinc-800 dark:text-zinc-100">{cell}</th>)}</tr>
                                                    </thead>
                                                    <tbody>
                                                        {section.table.rows.map((row) => (
                                                            <tr key={row.join("|")} className="border-t border-zinc-100 align-top dark:border-white/[0.06]">
                                                                {row.map((cell, cellIndex) => <td key={cellIndex} className={`px-3 py-2.5 ${cellIndex === 0 ? "font-semibold text-zinc-800 dark:text-zinc-100" : ""}`}>{cell}</td>)}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : null}
                                        {section.note ? <p className="rounded-xl bg-indigo-500/[0.07] px-4 py-3 text-[13px] text-indigo-900 dark:text-indigo-200">{section.note}</p> : null}
                                    </div>
                                </motion.section>
                            ))}

                            <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-white/[0.08] dark:bg-zinc-900 sm:p-8" aria-labelledby="changes-title">
                                <h2 id="changes-title" className="flex items-center gap-2 text-lg font-bold"><History className="h-5 w-5 text-indigo-500" />Sürüm geçmişi</h2>
                                <ol className="mt-4 space-y-5 border-s-2 border-indigo-500/20 ps-5">
                                    {LEGAL_CHANGES.map((change) => (
                                        <li key={change.version} className="relative">
                                            <span className="absolute -start-[27px] top-1 h-3 w-3 rounded-full bg-indigo-500 ring-4 ring-white dark:ring-zinc-900" />
                                            <p className="text-[14px] font-bold text-zinc-900 dark:text-white">Sürüm {change.version} <span className="font-normal text-zinc-500">· {change.date}</span></p>
                                            <ul className="mt-1.5 space-y-1 text-[13px] leading-6 text-zinc-600 dark:text-zinc-400">
                                                {change.items.map((item) => <li key={item}>• {item}</li>)}
                                            </ul>
                                        </li>
                                    ))}
                                </ol>
                            </section>

                            <section className="rounded-2xl border border-zinc-200 bg-zinc-950 p-6 text-zinc-300 dark:border-white/[0.08] sm:p-8">
                                <div className="flex items-center gap-3 text-white"><FileText className="h-5 w-5 text-indigo-400" /><h2 className="text-lg font-bold">Resmî mevzuat kaynakları</h2></div>
                                <p className="mt-3 text-sm leading-6 text-zinc-400">Metin hazırlanırken aşağıdaki resmî kaynaklar esas alınmıştır. Mevzuat değişiklikleri yürürlüğe girdikçe metin güncellenir.</p>
                                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                                    {[
                                        { href: "https://www.mevzuat.gov.tr/mevzuatmetin/1.5.6698.pdf", label: "6698 sayılı KVKK" },
                                        { href: "https://www.resmigazete.gov.tr/eskiler/2018/03/20180310-5.htm", label: "Aydınlatma Yükümlülüğü Tebliği" },
                                        { href: "https://www.kvkk.gov.tr/", label: "Kişisel Verileri Koruma Kurumu" },
                                        { href: "https://www.mevzuat.gov.tr/mevzuatmetin/1.5.6563.pdf", label: "6563 sayılı E-Ticaret Kanunu" },
                                        { href: "https://www.mevzuat.gov.tr/mevzuatmetin/1.5.6502.pdf", label: "6502 sayılı Tüketici Kanunu" },
                                        { href: "https://www.mevzuat.gov.tr/mevzuatmetin/1.5.5846.pdf", label: "5846 sayılı FSEK" },
                                        { href: "https://www.mevzuat.gov.tr/mevzuatmetin/1.5.5651.pdf", label: "5651 sayılı Kanun" },
                                        { href: "https://www.mevzuat.gov.tr/mevzuatmetin/1.5.6098.pdf", label: "6098 sayılı Türk Borçlar Kanunu" },
                                    ].map((source) => (
                                        <a key={source.href} href={source.href} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3 text-sm transition hover:bg-white/10">{source.label}<ExternalLink className="h-4 w-4" /></a>
                                    ))}
                                </div>
                            </section>
                        </article>
                    </div>
                </div>
            </main>
            <SiteFooter />
        </div>
    );
}
