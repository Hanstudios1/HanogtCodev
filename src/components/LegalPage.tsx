"use client";

import Link from "next/link";
import { motion, useScroll } from "framer-motion";
import { ArrowLeft, ExternalLink, FileText, Printer, Scale, ShieldCheck } from "lucide-react";

export type LegalSection = { id: string; title: string; paragraphs?: string[]; items?: string[] };

export default function LegalPage({
    eyebrow,
    title,
    summary,
    sections,
    notice,
}: {
    eyebrow: string;
    title: string;
    summary: string;
    sections: LegalSection[];
    notice?: string;
}) {
    const { scrollYProgress } = useScroll();
    return (
        <main className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-900 dark:bg-black dark:text-white sm:px-6">
            <motion.div className="fixed left-0 top-0 z-[80] h-1 w-full origin-left bg-gradient-to-r from-blue-500 to-violet-500" style={{ scaleX: scrollYProgress }} />
            <div className="mx-auto max-w-6xl">
                <div className="mb-8 flex items-center justify-between gap-3"><Link href="/" className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-600 shadow-sm transition hover:border-blue-300 hover:text-blue-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"><ArrowLeft className="h-4 w-4" /> Ana sayfaya dön</Link><button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-600 shadow-sm transition hover:border-blue-300 hover:text-blue-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"><Printer className="h-4 w-4" />Yazdır / PDF</button></div>
                <motion.header initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 p-7 text-white sm:p-10">
                        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15"><Scale className="h-6 w-6" /></div>
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-100">{eyebrow}</p>
                        <h1 className="mt-3 max-w-4xl text-3xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
                        <p className="mt-5 max-w-3xl text-sm leading-7 text-blue-50 sm:text-base">{summary}</p>
                        <div className="mt-6 flex flex-wrap gap-2 text-xs text-blue-50">
                            <span className="rounded-full bg-white/10 px-3 py-1.5">Sürüm 2.0</span>
                            <span className="rounded-full bg-white/10 px-3 py-1.5">Yürürlük: 3 Eylül 2026</span>
                            <span className="rounded-full bg-white/10 px-3 py-1.5">Türkiye</span>
                        </div>
                    </div>
                    {notice && <div className="flex gap-3 border-t border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><p>{notice}</p></div>}
                </motion.header>

                <div className="mt-8 grid gap-8 lg:grid-cols-[260px_1fr]">
                    <aside className="h-fit rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 lg:sticky lg:top-6">
                        <p className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-zinc-400">İçindekiler</p>
                        <nav className="space-y-1">
                            {sections.map((section, index) => <a key={section.id} href={`#${section.id}`} className="flex gap-3 rounded-xl px-3 py-2.5 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-blue-600 dark:text-zinc-300 dark:hover:bg-zinc-800"><span className="text-zinc-400">{String(index + 1).padStart(2, "0")}</span>{section.title}</a>)}
                        </nav>
                    </aside>
                    <article className="space-y-4">
                        {sections.map((section, index) => (
                            <motion.section initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: .35 }} key={section.id} id={section.id} className="scroll-mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 sm:p-8">
                                <div className="mb-5 flex items-start gap-4">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">{index + 1}</span>
                                    <h2 className="pt-1 text-xl font-bold">{section.title}</h2>
                                </div>
                                <div className="space-y-4 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
                                    {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                                    {section.items && <ul className="space-y-2 pl-1">{section.items.map((item) => <li key={item} className="flex gap-3"><span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" /><span>{item}</span></li>)}</ul>}
                                </div>
                            </motion.section>
                        ))}

                        <section className="rounded-2xl border border-zinc-200 bg-zinc-950 p-6 text-zinc-300 dark:border-zinc-800 sm:p-8">
                            <div className="flex items-center gap-3 text-white"><FileText className="h-5 w-5 text-blue-400" /><h2 className="text-lg font-bold">Resmî mevzuat kaynakları</h2></div>
                            <p className="mt-3 text-sm leading-6 text-zinc-400">Metin hazırlanırken aşağıdaki resmî kaynaklar esas alınmıştır. Mevzuat değişiklikleri yürürlüğe girdikçe metin güncellenir.</p>
                            <div className="mt-5 grid gap-2 sm:grid-cols-2">
                                <a href="https://www.mevzuat.gov.tr/mevzuatmetin/1.5.6698.pdf" target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3 text-sm hover:bg-white/10">6698 sayılı KVKK <ExternalLink className="h-4 w-4" /></a>
                                <a href="https://www.resmigazete.gov.tr/eskiler/2018/03/20180310-5.htm" target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3 text-sm hover:bg-white/10">Aydınlatma Tebliği <ExternalLink className="h-4 w-4" /></a>
                                <a href="https://www.mevzuat.gov.tr/mevzuatmetin/1.5.6563.pdf" target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3 text-sm hover:bg-white/10">6563 sayılı Kanun <ExternalLink className="h-4 w-4" /></a>
                                <a href="https://www.mevzuat.gov.tr/mevzuatmetin/1.5.6502.pdf" target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3 text-sm hover:bg-white/10">6502 sayılı Kanun <ExternalLink className="h-4 w-4" /></a>
                            </div>
                        </section>
                    </article>
                </div>
            </div>
        </main>
    );
}
