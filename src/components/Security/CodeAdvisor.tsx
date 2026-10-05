"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, ChevronDown, ClipboardCopy, FlaskConical, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import { analyzeCode, type AdvisorReport, type AdvisorSeverity, type CodeLanguage } from "@/lib/security/advisor";

const SEVERITY: Record<AdvisorSeverity, { label: Copy; chip: string; dot: string }> = {
    critical: { label: { TR: "Kritik", EN: "Critical" }, chip: "bg-red-600 text-white", dot: "bg-red-600" },
    high: { label: { TR: "Yüksek", EN: "High" }, chip: "bg-orange-500 text-white", dot: "bg-orange-500" },
    medium: { label: { TR: "Orta", EN: "Medium" }, chip: "bg-amber-400 text-amber-950", dot: "bg-amber-400" },
    low: { label: { TR: "Düşük", EN: "Low" }, chip: "bg-sky-500 text-white", dot: "bg-sky-500" },
    info: { label: { TR: "Bilgi", EN: "Info" }, chip: "bg-zinc-400 text-white", dot: "bg-zinc-400" },
};

const LANGUAGE_LABEL: Record<CodeLanguage, string> = {
    python: "Python", javascript: "JavaScript", typescript: "TypeScript", csharp: "C#", cpp: "C++", c: "C", java: "Java", php: "PHP", go: "Go",
    rust: "Rust", kotlin: "Kotlin", swift: "Swift", ruby: "Ruby", lua: "Lua", sql: "SQL", html: "HTML", shell: "Shell", unknown: "?",
};

const EXAMPLES: Array<{ label: string; code: string }> = [
    {
        label: "Python",
        code: `import os, sqlite3, requests\n\nAPI_KEY = "sk-proj-4f9d8a7b6c5e4d3c2b1a0f9e8d7c6b5a"\n\ndef find_user(conn, user_id):\n    cur = conn.cursor()\n    cur.execute("SELECT * FROM users WHERE id = " + user_id)\n    return cur.fetchone()\n\ndef ping(host):\n    os.system("ping -c 1 " + host)\n\nr = requests.get("https://api.example.org/data", verify=False)\napp.run(debug=True)\n`,
    },
    {
        label: "JavaScript",
        code: `const params = new URLSearchParams(location.search);\ndocument.getElementById("welcome").innerHTML = "Merhaba " + params.get("name");\n\nconst sessionToken = Math.random().toString(36).slice(2);\nlocalStorage.setItem("token", sessionToken);\n\nconst token = jwt.sign({ id: user.id }, "gizli123");\nfetch("http://api.hanogt-demo.net/user", { headers: { Authorization: "Bearer " + token } });\n`,
    },
    {
        label: "C",
        code: `#include <stdio.h>\n#include <string.h>\n\nint main(int argc, char **argv) {\n    char name[16];\n    gets(name);\n    strcpy(name, argv[1]);\n    printf(name);\n    return 0;\n}\n`,
    },
    {
        label: "C# (Unity)",
        code: `using UnityEngine;\n\npublic class Login : MonoBehaviour\n{\n    public string apiKey = "AKIAIOSFODNN7EXAMPLE";\n\n    void Save(string password)\n    {\n        PlayerPrefs.SetString("password", password);\n        Debug.Log("Saved password: " + password);\n    }\n}\n`,
    },
];

export default function CodeAdvisor() {
    const { tx } = useI18n();
    const [code, setCode] = useState("");
    const [language, setLanguage] = useState<CodeLanguage | "auto">("auto");
    const [report, setReport] = useState<AdvisorReport | null>(null);
    const [open, setOpen] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // Re-analyze shortly after the user stops typing.
    useEffect(() => {
        if (!code.trim()) return;
        const timer = window.setTimeout(() => {
            setReport(analyzeCode(code, language === "auto" ? undefined : language));
            setOpen(null);
        }, 350);
        return () => window.clearTimeout(timer);
    }, [code, language]);

    const shownReport = code.trim() ? report : null;

    const copyReport = async () => {
        if (!shownReport) return;
        const lines = [
            `# Hanogt Security Advisor — ${shownReport.grade} (${shownReport.score}/100)`,
            "",
            ...shownReport.findings.map((finding) => `- [${tx(SEVERITY[finding.severity].label)}] L${finding.line} ${tx(finding.title)} — ${tx(finding.fix)}`),
        ];
        try {
            await navigator.clipboard.writeText(lines.join("\n"));
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
        } catch {
            setCopied(false);
        }
    };

    const gradeColor = !shownReport ? "text-zinc-400" : shownReport.grade === "A" ? "text-emerald-500" : shownReport.grade === "B" ? "text-lime-500" : shownReport.grade === "C" ? "text-amber-500" : shownReport.grade === "D" ? "text-orange-500" : "text-red-500";

    return (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-[12px] font-bold uppercase tracking-wider text-zinc-400">{tx({ TR: "Örnekler", EN: "Examples" })}</span>
                    {EXAMPLES.map((example) => (
                        <button key={example.label} type="button" onClick={() => setCode(example.code)} className="rounded-lg border border-zinc-200 px-2.5 py-1 text-[12px] font-semibold text-zinc-600 transition hover:border-emerald-400 hover:text-emerald-600 dark:border-white/10 dark:text-zinc-300">
                            {example.label}
                        </button>
                    ))}
                    <select value={language} onChange={(event) => setLanguage(event.target.value as CodeLanguage | "auto")} className="ms-auto h-8 rounded-lg border border-zinc-200 bg-white px-2 text-[12px] font-semibold text-zinc-700 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200" aria-label={tx({ TR: "Dil", EN: "Language" })}>
                        <option value="auto">{tx({ TR: "Dili otomatik bul", EN: "Detect language" })}{shownReport && language === "auto" ? ` (${LANGUAGE_LABEL[shownReport.language]})` : ""}</option>
                        {(Object.keys(LANGUAGE_LABEL) as CodeLanguage[]).filter((key) => key !== "unknown").map((key) => <option key={key} value={key}>{LANGUAGE_LABEL[key]}</option>)}
                    </select>
                </div>
                <div className="relative min-h-[360px] flex-1 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-950 shadow-inner dark:border-white/10">
                    <textarea
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                        spellCheck={false}
                        dir="ltr"
                        placeholder={tx({ TR: "Kodunu buraya yapıştır… (analiz tamamen tarayıcında yapılır)", EN: "Paste your code here… (analysis runs entirely in your browser)" })}
                        className="scrollbar-thin h-full min-h-[360px] w-full resize-y bg-transparent p-4 font-mono text-[12.5px] leading-relaxed text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400/50 placeholder:text-zinc-500"
                        aria-label={tx({ TR: "Analiz edilecek kod", EN: "Code to analyze" })}
                    />
                    {code ? (
                        <button type="button" onClick={() => setCode("")} className="absolute end-3 top-3 grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-zinc-300 transition hover:bg-white/20" aria-label={tx({ TR: "Temizle", EN: "Clear" })}><Trash2 className="h-4 w-4" /></button>
                    ) : null}
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-[12px] text-zinc-500"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />{tx({ TR: "Kodun hiçbir sunucuya gönderilmez; kurallar bu sayfada çalışır.", EN: "Your code is never sent to a server; the rules run on this page." })}</p>
            </div>

            <div className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900/60">
                {!shownReport ? (
                    <div className="grid h-full min-h-[320px] place-items-center text-center">
                        <div>
                            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xl animate-float"><FlaskConical className="h-8 w-8" /></div>
                            <p className="mt-4 text-[15px] font-bold text-zinc-800 dark:text-zinc-100">{tx({ TR: "Rapor burada görünecek", EN: "Your report will appear here" })}</p>
                            <p className="mx-auto mt-1 max-w-xs text-[13px] text-zinc-500">{tx({ TR: "Sızmış anahtarlar, SQL/komut enjeksiyonu, XSS, zayıf kripto, kapalı TLS doğrulaması ve daha fazlası için 65+ kural.", EN: "65+ rules for leaked keys, SQL/command injection, XSS, weak crypto, disabled TLS checks and more." })}</p>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-4">
                            <div className="relative grid h-20 w-20 shrink-0 place-items-center">
                                <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
                                    <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" className="stroke-zinc-200 dark:stroke-white/10" />
                                    <motion.circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" strokeLinecap="round" className={`stroke-current ${gradeColor}`} initial={{ pathLength: 0 }} animate={{ pathLength: shownReport.score / 100 }} transition={{ duration: 0.8, ease: "easeOut" }} />
                                </svg>
                                <span className={`text-3xl font-black ${gradeColor}`}>{shownReport.grade}</span>
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-semibold text-zinc-500">{tx({ TR: "Güvenlik puanı", EN: "Security score" })} · {LANGUAGE_LABEL[shownReport.language]} · {shownReport.lines} {tx({ TR: "satır", EN: "lines" })}</p>
                                <p className="text-2xl font-black text-zinc-900 dark:text-white">{shownReport.score}<span className="text-base text-zinc-400">/100</span></p>
                                <div className="mt-1 flex flex-wrap gap-1">
                                    {(Object.keys(SEVERITY) as AdvisorSeverity[]).filter((key) => shownReport.counts[key]).map((key) => (
                                        <span key={key} className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${SEVERITY[key].chip}`}>{shownReport.counts[key]} {tx(SEVERITY[key].label)}</span>
                                    ))}
                                </div>
                            </div>
                            <button type="button" onClick={() => void copyReport()} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-zinc-200 text-zinc-500 transition hover:text-emerald-600 dark:border-white/10" title={tx({ TR: "Raporu kopyala", EN: "Copy report" })} aria-label={tx({ TR: "Raporu kopyala", EN: "Copy report" })}>
                                {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <ClipboardCopy className="h-4 w-4" />}
                            </button>
                        </div>

                        {shownReport.blockedByGuard ? (
                            <p className="mt-3 flex items-start gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-[12.5px] font-medium text-red-700 dark:text-red-300"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />{tx({ TR: "Bu kod Hanogt'un kod çalıştırıcısı, Media ve Arcade yayın denetiminde engellenir.", EN: "This code would be blocked by Hanogt's runner, Media and Arcade publishing checks." })}</p>
                        ) : null}

                        {shownReport.findings.length ? (
                            <ul className="scrollbar-thin mt-4 max-h-[440px] space-y-2 overflow-y-auto pe-1">
                                {shownReport.findings.map((finding, index) => {
                                    const key = `${finding.id}-${finding.line}-${index}`;
                                    const expanded = open === key;
                                    return (
                                        <motion.li key={key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 12) * 0.03 }} className="overflow-hidden rounded-xl border border-zinc-200 dark:border-white/10">
                                            <button type="button" onClick={() => setOpen(expanded ? null : key)} aria-expanded={expanded} className="flex w-full items-start gap-2.5 px-3 py-2.5 text-start transition hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
                                                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY[finding.severity].dot}`} />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block text-[13.5px] font-bold text-zinc-800 dark:text-zinc-100">{tx(finding.title)}</span>
                                                    <span className="mt-0.5 block truncate font-mono text-[11.5px] text-zinc-500" dir="ltr"><span className="text-zinc-400">L{finding.line}</span> {finding.snippet}</span>
                                                </span>
                                                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${SEVERITY[finding.severity].chip}`}>{tx(SEVERITY[finding.severity].label)}</span>
                                                <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-zinc-400 transition ${expanded ? "rotate-180" : ""}`} />
                                            </button>
                                            <AnimatePresence initial={false}>
                                                {expanded ? (
                                                    <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                                                        <div className="space-y-2 border-t border-zinc-100 px-3 py-2.5 text-[13px] dark:border-white/[0.06]">
                                                            <p className="flex gap-2 text-zinc-600 dark:text-zinc-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />{tx(finding.why)}</p>
                                                            <p className="flex gap-2 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />{tx(finding.fix)}</p>
                                                        </div>
                                                    </motion.div>
                                                ) : null}
                                            </AnimatePresence>
                                        </motion.li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <div className="mt-6 rounded-2xl bg-emerald-500/10 p-5 text-center">
                                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
                                <p className="mt-2 text-[14px] font-bold text-emerald-700 dark:text-emerald-300">{tx({ TR: "Bilinen bir risk deseni bulunamadı", EN: "No known risk patterns found" })}</p>
                                <p className="mt-1 text-[12.5px] text-emerald-700/80 dark:text-emerald-300/80">{tx({ TR: "Bu, kodun kesinlikle güvenli olduğu anlamına gelmez; mantık hatalarını da gözden geçir.", EN: "This doesn't prove the code is secure; review the logic too." })}</p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
