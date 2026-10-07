"use client";

import {
    CheckCircle2, Clock, Copy, Cpu, History, Info, Keyboard, ListTree, LoaderCircle, LogIn, MinusCircle, Play, Server, ShieldAlert,
    Square, Terminal, Trash2, XCircle,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import LanguageIcon from "@/components/Editor/LanguageIcon";
import { linkifyOutput, stripAnsi } from "@/components/Editor/output-links";
import type { HistoryEntry, RunEntry, RunState } from "@/components/Editor/run-types";
import { useEditorSettings } from "@/lib/editor-settings";
import { useI18n, type Copy as CopyText } from "@/lib/i18n";
import { PLAN_COPY, PLAN_RUN_LIMITS, PLAN_RUN_SIZES } from "@/lib/plans";
import { LANGUAGES, languageDisplayName } from "@/lib/runtimes/languages";
import type { RunFailure, RunNotice } from "@/services/piston";

export type ConsoleTab = "output" | "input" | "history" | "info";

interface ConsoleProps {
    run: RunState | null;
    history: HistoryEntry[];
    onClearHistory: () => void;
    /** Program input fed to stdin (input(), Scanner, cin, read-line…). */
    stdin: string;
    onStdinChange: (value: string) => void;
    onClear: () => void;
    onRun: () => void;
    onStop: () => void;
    /** Why nothing can run right now (shown in the empty state). */
    runDisabledReason?: string | null;
    runShortcut: string;
    onGoToLine: (tabId: string, line: number, column?: number) => void;
    tab: ConsoleTab;
    onTabChange: (tab: ConsoleTab) => void;
    /** Characters of program input the person's plan sends to the server (PLAN_RUN_SIZES.stdinChars). */
    stdinLimit?: number;
}

const C = {
    runLimit: { TR: "Planının çalıştırma sınırına ulaştın: derlenen dillerde dakikada {count} dosya.", EN: "You reached your plan's run limit: {count} files a minute for compiled languages." },
    runLimitUpgrade: { TR: "{plan} ile dakikada {count} dosya", EN: "{count} files a minute with {plan}" },
    tooLargeFor: { TR: "Kod planının sınırını aşıyor: dosya başına {file}, toplamda {total} karakter ve {stdin} karakter girdi.", EN: "The code is over your plan's limits: {file} characters per file, {total} in total and {stdin} characters of input." },
    tooLargeAny: { TR: "Kod, en büyük planın sınırını da aşıyor: dosya başına {file}, toplamda {total} karakter ve {stdin} karakter girdi. Kodu birkaç dosyaya bölün.", EN: "The code is over the largest plan's limits too: {file} characters per file, {total} in total and {stdin} characters of input. Split it into several files." },
    tooLargeUpgrade: { TR: "{plan} ile dosya başına {file} karakter", EN: "{file} characters per file with {plan}" },
    output: { TR: "Çıktı", EN: "Output" },
    input: { TR: "Girdi", EN: "Input" },
    history: { TR: "Geçmiş", EN: "History" },
    info: { TR: "Bilgi", EN: "Info" },
    all: { TR: "Tümü", EN: "All" },
    clear: { TR: "Çıktıyı temizle", EN: "Clear output" },
    copy: { TR: "Çıktıyı kopyala", EN: "Copy output" },
    copied: { TR: "Kopyalandı", EN: "Copied" },
    stop: { TR: "Durdur", EN: "Stop" },
    running: { TR: "Çalışıyor…", EN: "Running…" },
    notRun: { TR: "Çalıştırılmadı", EN: "Not run" },
    notRunHint: { TR: "Bu dosya bu çalıştırmada yürütülmedi (çalıştırma durduruldu, engellendi veya bir hata oluştu).", EN: "This file wasn't executed in this run (the run was stopped, blocked or failed)." },
    noOutput: { TR: "(Çıktı yok)", EN: "(No output)" },
    empty: { TR: "Kodunuzu çalıştırdığınızda çıktısı burada görünür.", EN: "Run your code to see its output here." },
    run: { TR: "Çalıştır", EN: "Run" },
    browser: { TR: "Tarayıcı", EN: "Browser" },
    server: { TR: "Sunucu", EN: "Server" },
    exit: { TR: "Çıkış {code}", EN: "Exit {code}" },
    ms: { TR: "{value} ms", EN: "{value} ms" },
    seconds: { TR: "{value} sn", EN: "{value} s" },
    goToLine: { TR: "{line}. satıra git", EN: "Go to line {line}" },
    stdinLabel: { TR: "Programınızın okuyacağı girdiyi yazın. Her satır bir input() / Scanner / cin / read-line okumasına karşılık gelir; web önizlemesinde prompt() da bu satırları okur.", EN: "Type the input your program reads. Each line answers one input() / Scanner / cin / read-line call; in the web preview prompt() reads these lines too." },
    stdinPlaceholder: { TR: "Örnek:\nAli\n42", EN: "Example:\nAlice\n42" },
    stdinCount: { TR: "{count} satır · {chars}/{max} karakter", EN: "{count} lines · {chars}/{max} characters" },
    historyEmpty: { TR: "Henüz çalıştırma yok.", EN: "No runs yet." },
    clearHistory: { TR: "Geçmişi temizle", EN: "Clear history" },
    files: { TR: "{count} dosya", EN: "{count} files" },
    blockedTitle: { TR: "Hanogt Security Bot çalıştırmayı engelledi", EN: "Hanogt Security Bot blocked this run" },
    blockedRisk: { TR: "Risk seviyesi: {risk}", EN: "Risk level: {risk}" },
    blockedNote: { TR: "Bu otomatik bir kötü amaçlı yazılım hükmü değildir. Yanlış engelleme olduğunu düşünüyorsanız geri bildirim sayfasından inceleme isteyebilirsiniz.", EN: "This is not an automatic malware verdict. If you think it is a mistake, you can ask for a review on the feedback page." },
    feedback: { TR: "İnceleme iste", EN: "Request a review" },
    runFailed: { TR: "Çalıştırma tamamlanamadı: {message}", EN: "The run could not be completed: {message}" },
    signIn: { TR: "Giriş yap", EN: "Sign in" },
} satisfies Record<string, CopyText>;

const FAILURES: Record<RunFailure["code"], CopyText> = {
    auth_required: { TR: "Bu dili çalıştırmak için giriş yapın. Tarayıcıda çalışan diller (JavaScript, TypeScript, Python, SQL, Lua, Prolog, BASIC, Forth, MIPS ve diğerleri) ile YAML, TOML, XML ve JSON doğrulayıcıları girişsiz de çalışır.", EN: "Sign in to run this language. Browser languages (JavaScript, TypeScript, Python, SQL, Lua, Prolog, BASIC, Forth, MIPS and more) and the YAML, TOML, XML and JSON validators run without signing in." },
    suspended: { TR: "Hesabınız askıya alındığı için kod çalıştıramazsınız.", EN: "Your account is suspended, so you can't run code." },
    rate_limited: { TR: "Çalıştırma sınırına ulaştınız. Kısa süre sonra tekrar deneyin.", EN: "You reached the run limit. Try again shortly." },
    invalid_request: { TR: "Çalıştırma isteği geçersiz.", EN: "The run request was invalid." },
    unsupported_language: { TR: "Bu dil sunucuda çalıştırılamıyor.", EN: "This language can't run on the server." },
    too_large: { TR: "Kod, planının çalıştırma boyutu sınırını aşıyor.", EN: "The code is over your plan's run size limit." },
    empty_file: { TR: "Boş dosyalar çalıştırılamaz.", EN: "Empty files can't be run." },
    timeout: { TR: "Sunucudaki çalıştırma 25 saniye içinde bitmedi. Sonsuz döngü olmadığından emin olup tekrar deneyin.", EN: "The run didn't finish within 25 seconds on the server. Make sure there is no infinite loop and try again." },
    unavailable: { TR: "Kod çalıştırma hizmetine şu anda ulaşılamıyor. Biraz sonra tekrar deneyin.", EN: "The code runner is unreachable right now. Try again in a moment." },
    no_compiler: { TR: "Bu dilin uzak derleyicisi şu anda kullanılamıyor. Biraz sonra tekrar deneyin.", EN: "The remote compiler for this language is unavailable right now. Try again later." },
    invalid_origin: { TR: "İstek bu siteden gelmediği için reddedildi. Sayfayı yenileyin.", EN: "The request was rejected because it didn't come from this site. Reload the page." },
    network: { TR: "Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.", EN: "Couldn't reach the server. Check your internet connection." },
    invalid_response: { TR: "Çalıştırma hizmeti geçersiz bir yanıt döndürdü.", EN: "The code runner returned an invalid response." },
    aborted: { TR: "Çalıştırma durduruldu.", EN: "The run was stopped." },
    unknown: { TR: "Çalıştırma tamamlanamadı.", EN: "The run could not be completed." },
};

function noticeCopy(notice: RunNotice, locale: string): CopyText {
    switch (notice.code) {
        case "timeout":
            return { TR: "Program {seconds} saniye içinde bitmediği için durduruldu (sonsuz döngü olabilir).", EN: "The program was stopped because it didn't finish within {seconds} seconds (it may contain an infinite loop).", vars: { seconds: notice.seconds } };
        case "stopped":
            return { TR: "Çalıştırma durduruldu.", EN: "The run was stopped." };
        case "output_truncated":
            return { TR: "Çıktı {limit} karakterle sınırlandı; fazlası gösterilmiyor.", EN: "The output was limited to {limit} characters; the rest is not shown.", vars: { limit: new Intl.NumberFormat(locale).format(notice.limit ?? PLAN_RUN_SIZES.free.outputChars) } };
        case "worker_crashed":
            return { TR: "Tarayıcı çalışma ortamı beklenmedik biçimde durdu.", EN: "The browser runtime stopped unexpectedly." };
        case "worker_unavailable":
            return { TR: "Tarayıcı çalışma ortamı başlatılamadı.", EN: "The browser runtime couldn't be started." };
    }
}

function entryState(entry: RunEntry): "pending" | "ok" | "error" {
    if (!entry.job) return "pending";
    return entry.job.failure || entry.job.run.code !== 0 ? "error" : "ok";
}

function entryText(entry: RunEntry) {
    const job = entry.job;
    if (!job) return "";
    return [`> ${entry.name} · ${languageDisplayName(entry.language)}${job.version ? ` (${job.version})` : ""}`, stripAnsi(job.run.stdout).replace(/\n$/, ""), stripAnsi(job.run.stderr).replace(/\n$/, "")].filter(Boolean).join("\n");
}

async function copyText(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

export default function Console({ run, history, onClearHistory, stdin, onStdinChange, onClear, onRun, onStop, runDisabledReason, runShortcut, onGoToLine, tab, onTabChange, stdinLimit = PLAN_RUN_SIZES.free.stdinChars }: ConsoleProps) {
    const { tx, locale } = useI18n();
    // The chosen file belongs to one run; a new run shows every file again.
    const [selection, setSelection] = useState<{ runId: number | undefined; key: string }>({ runId: undefined, key: "all" });
    const selected = selection.runId === run?.id ? selection.key : "all";
    const setSelected = (key: string) => setSelection({ runId: run?.id, key });
    const [copied, setCopied] = useState(false);
    const entries = useMemo(() => run?.entries ?? [], [run]);
    const visible = selected === "all" ? entries : entries.filter((entry) => entry.tabId === selected);
    const shownEntries = visible.length ? visible : entries;
    const inputLines = stdin ? stdin.replace(/\n$/, "").split("\n").length : 0;

    const formatDuration = (ms: number) => (ms < 1000
        ? tx(C.ms, { value: Math.max(0, Math.round(ms)) })
        : tx(C.seconds, { value: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(ms / 1000) }));

    const copyAll = async () => {
        const ok = await copyText(shownEntries.map(entryText).filter(Boolean).join("\n\n"));
        if (!ok) return;
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
    };

    const tabButton = (id: ConsoleTab, label: string, icon: ReactNode, badge?: ReactNode) => (
        <button
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => onTabChange(id)}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition sm:text-sm ${tab === id ? "border-indigo-500 text-zinc-900 dark:text-white" : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"}`}
        >
            {icon}
            {label}
            {badge}
        </button>
    );

    const browserLanguages = LANGUAGES.filter((language) => language.engine === "browser").map((language) => language.name).join(", ");
    const serverLanguages = LANGUAGES.filter((language) => language.engine === "server").map((language) => language.name).join(", ");

    return (
        <div className="flex h-full min-h-0 flex-col bg-white text-sm dark:bg-zinc-950">
            <div className="flex items-center border-b border-zinc-200 dark:border-white/10">
                <div role="tablist" aria-label={tx({ TR: "Konsol bölümleri", EN: "Console sections" })} className="flex min-w-0 flex-1 overflow-x-auto">
                    {tabButton("output", tx(C.output), <Terminal className="h-4 w-4" aria-hidden />)}
                    {tabButton("input", tx(C.input), <Keyboard className="h-4 w-4" aria-hidden />, inputLines > 0 ? <span className="rounded-full bg-indigo-500/15 px-1.5 text-[10px] text-indigo-600 dark:text-indigo-300">{inputLines}</span> : null)}
                    {tabButton("history", tx(C.history), <History className="h-4 w-4" aria-hidden />, history.length ? <span className="rounded-full bg-zinc-500/15 px-1.5 text-[10px]">{history.length}</span> : null)}
                    {tabButton("info", tx(C.info), <ListTree className="h-4 w-4" aria-hidden />)}
                </div>
                {tab === "output" && (
                    <div className="flex shrink-0 items-center gap-0.5 pe-1.5">
                        {run?.status === "running" && (
                            <button type="button" onClick={onStop} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-500/10 dark:text-red-400" title={tx(C.stop)}>
                                <Square className="h-3.5 w-3.5 fill-current" aria-hidden />
                                <span className="hidden sm:inline">{tx(C.stop)}</span>
                            </button>
                        )}
                        <button type="button" onClick={copyAll} disabled={!entries.some((entry) => entry.job)} className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100" title={copied ? tx(C.copied) : tx(C.copy)} aria-label={copied ? tx(C.copied) : tx(C.copy)}>
                            {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                        </button>
                        <button type="button" onClick={onClear} disabled={!run || run.status === "running"} className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100" title={tx(C.clear)} aria-label={tx(C.clear)}>
                            <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                    </div>
                )}
            </div>

            {tab === "output" && entries.length > 1 && (
                <div className="flex gap-1 overflow-x-auto border-b border-zinc-200 px-2 py-1.5 dark:border-white/10" role="tablist" aria-label={tx({ TR: "Dosya çıktıları", EN: "File outputs" })}>
                    {[{ key: "all", label: tx(C.all), entry: null as RunEntry | null }, ...entries.map((entry) => ({ key: entry.tabId, label: entry.name, entry }))].map((chip) => {
                        const state = chip.entry ? entryState(chip.entry) : null;
                        return (
                            <button
                                key={chip.key}
                                type="button"
                                role="tab"
                                aria-selected={selected === chip.key}
                                onClick={() => setSelected(chip.key)}
                                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${selected === chip.key ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-700 dark:text-indigo-200" : "border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"}`}
                            >
                                {chip.entry && <LanguageIcon language={chip.entry.language} size={12} />}
                                <span className="max-w-[9rem] truncate">{chip.label}</span>
                                {state === "pending" && <LoaderCircle className="h-3 w-3 animate-spin text-amber-500" aria-hidden />}
                                {state === "ok" && <CheckCircle2 className="h-3 w-3 text-emerald-500" aria-hidden />}
                                {state === "error" && <XCircle className="h-3 w-3 text-red-500" aria-hidden />}
                                {chip.entry?.job && <span className="text-[10px] tabular-nums text-zinc-400">{formatDuration(chip.entry.job.durationMs)}</span>}
                            </button>
                        );
                    })}
                </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto p-2 sm:p-3" role="tabpanel">
                {tab === "output" && (
                    !run ? (
                        <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 px-4 text-center">
                            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500 dark:bg-white/5 dark:text-zinc-400"><Terminal className="h-6 w-6" aria-hidden /></span>
                            <p className="max-w-xs text-sm text-zinc-500 dark:text-zinc-400">{runDisabledReason || tx(C.empty)}</p>
                            {!runDisabledReason && (
                                <button type="button" onClick={onRun} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700">
                                    <Play className="h-4 w-4 fill-current" aria-hidden />
                                    {tx(C.run)}
                                    <kbd className="rounded bg-white/20 px-1.5 py-0.5 font-mono text-[10px]">{runShortcut}</kbd>
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {run.status === "running" && (
                                <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300" role="status">
                                    <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                                    {run.loading?.code === "loading_python"
                                        ? tx({ TR: "Python çalışma zamanı yükleniyor (ilk çalıştırmada yaklaşık 12 MB)…", EN: "Loading the Python runtime (about 12 MB on the first run)…" })
                                        : run.loading?.code === "loading_prolog"
                                            ? tx({ TR: "Prolog çalışma zamanı yükleniyor…", EN: "Loading the Prolog runtime…" })
                                            : tx(C.running)}
                                </div>
                            )}
                            {run.security && <SecurityPanel risk={run.security.risk} findings={run.security.findings} />}
                            {run.error && (
                                <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">{tx(C.runFailed, { message: run.error })}</p>
                            )}
                            {shownEntries.map((entry) => (
                                <EntryCard key={entry.tabId} entry={entry} running={run.status === "running"} formatDuration={formatDuration} onGoToLine={onGoToLine} />
                            ))}
                        </div>
                    )
                )}

                {tab === "input" && (
                    <div className="flex h-full min-h-40 flex-col gap-2">
                        <label htmlFor="program-stdin" className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">{tx(C.stdinLabel)}</label>
                        <textarea
                            id="program-stdin"
                            value={stdin}
                            onChange={(event) => onStdinChange(event.target.value.slice(0, stdinLimit))}
                            spellCheck={false}
                            placeholder={tx(C.stdinPlaceholder)}
                            className="min-h-28 flex-1 resize-none rounded-xl border border-zinc-200 bg-zinc-50 p-3 font-mono text-sm text-zinc-900 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100"
                        />
                        <p className="text-end text-[11px] tabular-nums text-zinc-400">{tx(C.stdinCount, { count: inputLines, chars: new Intl.NumberFormat(locale).format(stdin.length), max: new Intl.NumberFormat(locale).format(stdinLimit) })}</p>
                    </div>
                )}

                {tab === "history" && (
                    history.length === 0 ? (
                        <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-zinc-500 dark:text-zinc-400">
                            <Clock className="h-6 w-6" aria-hidden />
                            <p>{tx(C.historyEmpty)}</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {history.map((entry) => (
                                <div key={entry.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-white/5">
                                    {entry.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-label="OK" /> : <XCircle className="h-4 w-4 shrink-0 text-red-500" aria-label="Error" />}
                                    <span className="min-w-0 flex-1 truncate font-medium text-zinc-700 dark:text-zinc-200">{entry.count > 1 ? `${tx(C.files, { count: entry.count })} · ${entry.label}` : entry.label}</span>
                                    <span className="tabular-nums text-zinc-400">{formatDuration(entry.durationMs)}</span>
                                    <time className="tabular-nums text-zinc-400" dateTime={new Date(entry.at).toISOString()}>{new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(entry.at)}</time>
                                </div>
                            ))}
                            <button type="button" onClick={onClearHistory} className="mt-2 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100">{tx(C.clearHistory)}</button>
                        </div>
                    )
                )}

                {tab === "info" && (
                    <div className="space-y-3 text-xs leading-6 text-zinc-600 dark:text-zinc-400">
                        <div className="flex gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                            <Cpu className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
                            <p>{tx({ TR: "Tarayıcıda çalışanlar: {list}. Kodunuz cihazınızda izole bir Web Worker içinde çalışır; giriş gerekmez ve hiçbir sunucuya gönderilmez. Python ilk çalıştırmada yaklaşık 12 MB indirir.", EN: "Runs in your browser: {list}. Your code runs on your device in an isolated Web Worker; no sign-in is needed and nothing is sent to a server. Python downloads about 12 MB on its first run." }, { list: browserLanguages })}</p>
                        </div>
                        <div className="flex gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3">
                            <Server className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" aria-hidden />
                            <p>{tx({ TR: "Sunucuda çalışanlar: {list}. Hanogt Security Bot taramasından sonra izole bir uzak derleyicide çalışır (giriş gerekir, dakikada 20 çalıştırma, en fazla 25 saniye).", EN: "Runs on the server: {list}. Runs on an isolated remote compiler after a Hanogt Security Bot scan (sign-in required, 20 runs per minute, 25 seconds max)." }, { list: serverLanguages })}</p>
                        </div>
                        <div className="flex gap-3 rounded-xl border border-zinc-200 p-3 dark:border-white/10">
                            <Info className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" aria-hidden />
                            <div className="space-y-2">
                                <p>{tx({ TR: "Çok dosyalı projelerde her dosya bağımsız bir iş olarak paralel çalışır (en fazla 8 dosya). HTML, CSS ve JavaScript dosyaları olan web projeleri çalıştırılmaz; Önizleme panelinde birlikte görüntülenir.", EN: "In multi-file projects each file runs in parallel as an independent job (up to 8 files). Web projects with HTML, CSS and JavaScript files are not executed; they are shown together in the Preview panel." })}</p>
                                <p>{tx({ TR: "Scheme yorumlayıcısı R7RS'in pratik bir alt kümesini destekler: kuyruk özyinelemesi sınırsızdır, diğer özyinelemeler birkaç bin seviyeyle sınırlıdır. JSON dosyalarında Çalıştır, dosyayı doğrular ve biçimlendirir.", EN: "The Scheme interpreter supports a practical subset of R7RS: tail recursion is unlimited, other recursion is limited to a few thousand levels. For JSON files, Run validates and formats the file." })}</p>
                                <p>{tx({ TR: "Paket kurulumu, ağ erişimi ve kalıcı disk yoktur. Gizli anahtar veya kişisel veri içeren kodları çalıştırmayın.", EN: "There is no package installation, network access or persistent disk. Don't run code that contains secrets or personal data." })}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function SecurityPanel({ risk, findings }: { risk: string; findings: Array<{ id: string; message: string; line?: number }> }) {
    const { tx } = useI18n();
    return (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs" role="alert">
            <p className="flex items-center gap-2 font-semibold text-red-700 dark:text-red-300">
                <ShieldAlert className="h-4 w-4" aria-hidden />
                {tx(C.blockedTitle)}
            </p>
            <ul className="mt-2 list-disc space-y-1 ps-6 text-zinc-700 dark:text-zinc-300">
                {findings.map((finding) => <li key={`${finding.id}-${finding.line ?? 0}`}>{finding.message}</li>)}
            </ul>
            <p className="mt-2 font-medium uppercase tracking-wide text-red-600 dark:text-red-400">{tx(C.blockedRisk, { risk: risk.toUpperCase() })}</p>
            <p className="mt-2 text-zinc-500 dark:text-zinc-400">{tx(C.blockedNote)}</p>
            <Link href="/feedback" className="mt-2 inline-block font-semibold text-indigo-600 hover:underline dark:text-indigo-300">{tx(C.feedback)}</Link>
        </div>
    );
}

function OutputText({ text, entry, onGoToLine, className }: { text: string; entry: RunEntry; onGoToLine: ConsoleProps["onGoToLine"]; className: string }) {
    const { tx } = useI18n();
    // Editor Settings: the console's text size and whether long lines wrap.
    const { consoleFontSize, consoleWordWrap } = useEditorSettings();
    const segments = useMemo(() => linkifyOutput(stripAnsi(text), [entry.name]), [text, entry.name]);
    return (
        <pre className={`font-mono ${consoleWordWrap ? "whitespace-pre-wrap break-words" : "overflow-x-auto whitespace-pre"} ${className}`} style={{ fontSize: consoleFontSize, lineHeight: 1.6 }} data-console-wrap={consoleWordWrap ? "on" : "off"}>
            {segments.map((segment, index) => (typeof segment === "string" ? segment : (
                <button
                    key={index}
                    type="button"
                    onClick={() => onGoToLine(entry.tabId, segment.line, segment.column)}
                    className="rounded underline decoration-dotted underline-offset-2 hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-300"
                    title={tx(C.goToLine, { line: segment.line })}
                >
                    {segment.text}
                </button>
            )))}
        </pre>
    );
}

function EntryCard({ entry, running, formatDuration, onGoToLine }: { entry: RunEntry; running: boolean; formatDuration: (ms: number) => string; onGoToLine: ConsoleProps["onGoToLine"] }) {
    const { tx, locale } = useI18n();
    const number = (value: number) => new Intl.NumberFormat(locale).format(value);
    const [copied, setCopied] = useState(false);
    const job = entry.job;
    const state = entryState(entry);
    const failure = job?.failure;
    const exitCode = job?.run.code ?? 0;
    const copy = async () => {
        if (await copyText(entryText(entry))) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        }
    };
    return (
        <article className="overflow-hidden rounded-xl border border-zinc-200 dark:border-white/10">
            <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-zinc-100 bg-zinc-50 px-3 py-1.5 text-xs dark:border-white/5 dark:bg-white/[0.03]">
                <LanguageIcon language={entry.language} size={14} />
                <span className="max-w-[12rem] truncate font-semibold text-zinc-800 dark:text-zinc-100">{entry.name}</span>
                <span className="truncate text-zinc-500 dark:text-zinc-400">{languageDisplayName(entry.language)}{job?.version ? ` · ${job.version}` : ""}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${entry.engine === "browser" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"}`}>
                    {entry.engine === "browser" ? <Cpu className="h-3 w-3" aria-hidden /> : <Server className="h-3 w-3" aria-hidden />}
                    {tx(entry.engine === "browser" ? C.browser : C.server)}
                </span>
                <span className="ms-auto flex items-center gap-2">
                    {state === "pending" && running ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><LoaderCircle className="h-3 w-3 animate-spin" aria-hidden />{tx(C.running)}</span>
                    ) : state === "pending" ? (
                        <span className="inline-flex items-center gap-1 text-zinc-500 dark:text-zinc-400"><MinusCircle className="h-3.5 w-3.5" aria-hidden />{tx(C.notRun)}</span>
                    ) : failure ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-red-600 dark:text-red-400"><XCircle className="h-3.5 w-3.5" aria-hidden />{failure.status ?? "!"}</span>
                    ) : (
                        <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold ${exitCode === 0 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-red-500/10 text-red-700 dark:text-red-300"}`}>
                            {exitCode === 0 ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : <XCircle className="h-3 w-3" aria-hidden />}
                            {tx(C.exit, { code: exitCode })}
                        </span>
                    )}
                    {job && <span className="tabular-nums text-zinc-400">{formatDuration(job.durationMs)}</span>}
                    {job && (
                        <button type="button" onClick={copy} className="rounded p-1 text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200" aria-label={copied ? tx(C.copied) : tx(C.copy)} title={copied ? tx(C.copied) : tx(C.copy)}>
                            {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                        </button>
                    )}
                </span>
            </header>
            <div className="space-y-2 px-3 py-2">
                {!job && running && <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-100 dark:bg-white/5" />}
                {!job && !running && <p className="text-xs text-zinc-500 dark:text-zinc-400">{tx(C.notRunHint)}</p>}
                {failure && (
                    <div className="space-y-1 text-xs text-red-700 dark:text-red-300">
                        <p>{failure.code === "rate_limited" && failure.limit ? tx(C.runLimit, { count: failure.limit.perMinute })
                            : failure.code === "too_large" && failure.sizes ? tx(failure.sizes.largest ? C.tooLargeAny : C.tooLargeFor, { file: number(failure.sizes.fileChars), total: number(failure.sizes.requestChars), stdin: number(failure.sizes.stdinChars) })
                                : tx(FAILURES[failure.code])}</p>
                        {failure.code === "rate_limited" && failure.retryAfterSeconds ? <p className="text-zinc-500">{tx({ TR: "{seconds} saniye sonra tekrar deneyin.", EN: "Try again in {seconds} seconds." }, { seconds: failure.retryAfterSeconds })}</p> : null}
                        {failure.code === "rate_limited" && failure.limit?.upgrade ? (
                            <Link href="/plans" className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline dark:text-indigo-300">{tx(C.runLimitUpgrade, { plan: tx(PLAN_COPY[failure.limit.upgrade].name), count: PLAN_RUN_LIMITS[failure.limit.upgrade].perMinute })}</Link>
                        ) : null}
                        {failure.code === "too_large" && failure.sizes?.upgrade ? (
                            <Link href="/plans" className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline dark:text-indigo-300" data-run-size-upgrade>{tx(C.tooLargeUpgrade, { plan: tx(PLAN_COPY[failure.sizes.upgrade].name), file: number(PLAN_RUN_SIZES[failure.sizes.upgrade].fileChars) })}</Link>
                        ) : null}
                        {failure.code === "auth_required" && (
                            <Link href="/login?callbackUrl=%2Feditor" className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline dark:text-indigo-300"><LogIn className="h-3.5 w-3.5" aria-hidden />{tx(C.signIn)}</Link>
                        )}
                        {failure.code === "unknown" && failure.message && <p className="text-zinc-500">{failure.message}</p>}
                    </div>
                )}
                {job && !failure && job.run.stdout && <OutputText text={job.run.stdout} entry={entry} onGoToLine={onGoToLine} className="text-zinc-800 dark:text-zinc-200" />}
                {job && !failure && job.run.stderr && <OutputText text={job.run.stderr} entry={entry} onGoToLine={onGoToLine} className={exitCode === 0 ? "text-amber-700 dark:text-amber-300" : "text-red-600 dark:text-red-400"} />}
                {job && !failure && !job.run.stdout && !job.run.stderr && <p className="font-mono text-xs italic text-zinc-400">{tx(C.noOutput)}</p>}
                {job?.notices?.map((notice, index) => (
                    <p key={`${notice.code}-${index}`} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                        {tx(noticeCopy(notice, locale))}
                    </p>
                ))}
            </div>
        </article>
    );
}
