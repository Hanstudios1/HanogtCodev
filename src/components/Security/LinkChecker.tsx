"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, CircleAlert, Link2, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { checkLink, type LinkReport } from "@/lib/security/links";

const SAMPLES = ["https://github.com/Hanstudios1", "paypa1-giris.com/dogrula", "https://аpple.com", "bit.ly/3xYz", "http://192.168.1.10/login", "https://edevlet-odeme.top/iade"];

export default function LinkChecker() {
    const { tx } = useI18n();
    const [input, setInput] = useState("");
    const [report, setReport] = useState<LinkReport | null>(null);

    const run = (value = input) => {
        setInput(value);
        setReport(checkLink(value));
    };

    const verdict = report?.verdict;
    const tone = verdict === "safe"
        ? { icon: ShieldCheck, title: tx({ TR: "Belirgin bir tehlike işareti yok", EN: "No obvious danger signs" }), box: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200", bar: "bg-emerald-500" }
        : verdict === "caution"
            ? { icon: ShieldQuestion, title: tx({ TR: "Dikkatli ol", EN: "Be careful" }), box: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200", bar: "bg-amber-500" }
            : verdict === "danger"
                ? { icon: ShieldAlert, title: tx({ TR: "Tehlikeli görünüyor — tıklama!", EN: "Looks dangerous — don't click!" }), box: "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200", bar: "bg-red-500" }
                : { icon: CircleAlert, title: tx({ TR: "Geçerli bir bağlantı değil", EN: "Not a valid link" }), box: "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300", bar: "bg-zinc-400" };

    return (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900/60">
                <form onSubmit={(event) => { event.preventDefault(); run(); }}>
                    <label htmlFor="link-check" className="text-[13px] font-bold text-zinc-700 dark:text-zinc-200">{tx({ TR: "Şüpheli bağlantıyı yapıştır", EN: "Paste a suspicious link" })}</label>
                    <div className="mt-2 flex gap-2">
                        <div className="relative min-w-0 flex-1">
                            <Link2 className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                            <input id="link-check" value={input} onChange={(event) => setInput(event.target.value)} dir="ltr" spellCheck={false} placeholder="https://…" className="h-12 w-full rounded-xl border border-zinc-200 bg-zinc-50 pe-3 ps-10 text-[14px] text-zinc-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 dark:border-white/10 dark:bg-zinc-950 dark:text-white" />
                        </div>
                        <button type="submit" className="h-12 shrink-0 rounded-xl bg-emerald-600 px-4 text-[14px] font-bold text-white transition hover:bg-emerald-500">{tx({ TR: "Kontrol et", EN: "Check" })}</button>
                    </div>
                </form>
                <p className="mt-3 text-[12px] font-bold uppercase tracking-wider text-zinc-400">{tx({ TR: "Örnekleri dene", EN: "Try samples" })}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {SAMPLES.map((sample) => <button key={sample} type="button" onClick={() => run(sample)} className="rounded-lg border border-zinc-200 px-2 py-1 font-mono text-[11.5px] text-zinc-600 transition hover:border-emerald-400 hover:text-emerald-600 dark:border-white/10 dark:text-zinc-300" dir="ltr">{sample}</button>)}
                </div>
                <ul className="mt-5 space-y-2 text-[13px] text-zinc-600 dark:text-zinc-400">
                    <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{tx({ TR: "Bankana veya e-Devlet'e giderken bağlantıya tıklama; adresi kendin yaz.", EN: "Don't click links to your bank or government portal; type the address yourself." })}</li>
                    <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{tx({ TR: "\"Hesabın kapanacak\", \"hediye kazandın\" gibi acele ettiren mesajlar en yaygın tuzaktır.", EN: "Urgent messages like \"your account will close\" or \"you won a gift\" are the most common trap." })}</li>
                    <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{tx({ TR: "Bu araç ağ bağlantısı kurmaz; yalnızca adresin yapısını inceler. Kesin karar değildir.", EN: "This tool makes no network request; it inspects the address structure only. It's not a definitive verdict." })}</li>
                </ul>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900/60">
                <AnimatePresence mode="wait">
                    {report ? (
                        <motion.div key={`${report.url}-${report.verdict}`} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                            <div className={`flex items-center gap-3 rounded-2xl border p-4 ${tone.box}`}>
                                <tone.icon className="h-9 w-9 shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-[16px] font-black">{tone.title}</p>
                                    {report.host ? <p className="truncate font-mono text-[12.5px] opacity-80" dir="ltr">{report.host}</p> : null}
                                </div>
                            </div>
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
                                <motion.div className={`h-full ${tone.bar}`} initial={{ width: 0 }} animate={{ width: `${Math.max(4, report.score)}%` }} transition={{ duration: 0.6 }} />
                            </div>
                            <p className="mt-1 text-end text-[11px] text-zinc-400">{tx({ TR: "Risk puanı", EN: "Risk score" })}: {report.score}/100</p>
                            {report.signals.length ? (
                                <ul className="mt-3 space-y-2">
                                    {report.signals.map((signal, index) => (
                                        <motion.li key={signal.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }} className="flex gap-2 rounded-xl bg-zinc-50 px-3 py-2 text-[13px] text-zinc-700 dark:bg-white/[0.04] dark:text-zinc-300">
                                            <ShieldAlert className={`mt-0.5 h-4 w-4 shrink-0 ${signal.weight >= 35 ? "text-red-500" : "text-amber-500"}`} />{tx(signal.text)}
                                        </motion.li>
                                    ))}
                                </ul>
                            ) : null}
                            {report.positives.length ? (
                                <ul className="mt-3 space-y-1.5">
                                    {report.positives.map((positive, index) => <li key={index} className="flex gap-2 text-[13px] text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{tx(positive)}</li>)}
                                </ul>
                            ) : null}
                        </motion.div>
                    ) : (
                        <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid h-full min-h-[260px] place-items-center text-center">
                            <div>
                                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-300"><Link2 className="h-8 w-8" /></div>
                                <p className="mt-4 text-[15px] font-bold text-zinc-800 dark:text-zinc-100">{tx({ TR: "Taklit alan adlarını yakala", EN: "Catch lookalike domains" })}</p>
                                <p className="mx-auto mt-1 max-w-xs text-[13px] text-zinc-500">{tx({ TR: "Kiril harfli sahte adresler, paypa1 gibi taklitler, kısaltıcılar, çift uzantılı dosyalar ve daha fazlası.", EN: "Cyrillic fakes, imitations like paypa1, shorteners, double-extension files and more." })}</p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
