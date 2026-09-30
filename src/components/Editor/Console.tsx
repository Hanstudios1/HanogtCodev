"use client";

import { Info, Keyboard, ListTree, StopCircle, Terminal, Trash2 } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";

interface ConsoleProps {
    output: string[];
    isRunning: boolean;
    onClear: () => void;
    /** Text fed to the program's standard input (input(), Scanner, cin…). */
    stdin?: string;
    onStdinChange?: (value: string) => void;
    /** Progress note while a run is starting, e.g. "Python loading…". */
    statusText?: string;
}

export default function Console({ output, isRunning, onClear, stdin, onStdinChange, statusText }: ConsoleProps) {
    const { t, tx } = useI18n();
    const [activeTab, setActiveTab] = useState<"output" | "input" | "details">("output");
    const tabClass = (tab: typeof activeTab) =>
        `flex items-center gap-2 border-b-2 px-3 py-2 transition-colors sm:px-4 ${activeTab === tab ? "border-blue-500 bg-zinc-700/50 text-white" : "border-transparent text-zinc-400 hover:text-zinc-200"}`;
    const inputLines = stdin ? stdin.split("\n").filter(Boolean).length : 0;

    return (
        <div className="flex h-full flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 font-mono text-sm">
            <div className="flex items-center overflow-x-auto border-b border-zinc-700 bg-zinc-800">
                <button onClick={() => setActiveTab("output")} className={tabClass("output")}>
                    <Terminal className="h-4 w-4" />{t("output") || "Çıktı"}
                </button>
                {onStdinChange && (
                    <button onClick={() => setActiveTab("input")} className={tabClass("input")}>
                        <Keyboard className="h-4 w-4" />{tx({ TR: "Girdi", EN: "Input" })}
                        {inputLines > 0 && <span className="rounded-full bg-blue-500/20 px-1.5 text-[10px] text-blue-300">{inputLines}</span>}
                    </button>
                )}
                <button onClick={() => setActiveTab("details")} className={tabClass("details")}>
                    <ListTree className="h-4 w-4" />{tx({ TR: "Bilgi", EN: "Info" })}
                </button>
                <div className="flex-1" />
                <button onClick={onClear} className="mr-2 p-2 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-300" title={t("delete") || "Temizle"}><Trash2 className="h-4 w-4" /></button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-zinc-950 p-4 text-zinc-300">
                {activeTab === "output" ? (
                    isRunning ? (
                        <div className="flex items-center gap-2 text-yellow-500">
                            <StopCircle className="h-4 w-4 flex-shrink-0 animate-pulse" />
                            {statusText || tx({ TR: "Kod çalıştırılıyor…", EN: "Running your code…" })}
                        </div>
                    ) : output.length === 0 ? (
                        <span className="italic text-zinc-600">{tx({ TR: "Kodunuzu çalıştırdığınızda (Ctrl + Enter) çıktısı burada görünür.", EN: "Run your code (Ctrl + Enter) to see its output here." })}</span>
                    ) : output.map((line, index) => (
                        <div key={`${index}-${line.slice(0, 20)}`} className={`whitespace-pre-wrap pb-1 ${line.startsWith("Error") ? "text-red-400" : line.startsWith(">") ? "text-blue-400" : "text-zinc-300"}`}>{line || " "}</div>
                    ))
                ) : activeTab === "input" && onStdinChange ? (
                    <div className="flex h-full flex-col gap-2 font-sans">
                        <label htmlFor="program-stdin" className="text-xs leading-5 text-zinc-400">
                            {tx({
                                TR: "Programınızın okuyacağı girdiyi yazın; her satır bir input() / Scanner / cin okumasıdır. Çalıştırmadan önce doldurun.",
                                EN: "Type the input your program reads; each line answers one input() / Scanner / cin call. Fill it in before running.",
                            })}
                        </label>
                        <textarea
                            id="program-stdin"
                            value={stdin ?? ""}
                            onChange={(event) => onStdinChange(event.target.value.slice(0, 10_000))}
                            spellCheck={false}
                            placeholder={tx({ TR: "Örnek:\nAli\n42", EN: "Example:\nAlice\n42" })}
                            className="min-h-24 flex-1 resize-none rounded-lg border border-zinc-800 bg-zinc-900 p-3 font-mono text-sm text-zinc-100 outline-none focus:border-blue-500"
                        />
                    </div>
                ) : (
                    <div className="space-y-4 font-sans text-sm leading-6 text-zinc-400">
                        <div className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                            <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-400" />
                            <p>{tx({
                                TR: "JavaScript, TypeScript, Python, SQL ve Lua doğrudan tarayıcınızda (WebAssembly) çalışır; giriş gerekmez ve kodunuz hiçbir sunucuya gönderilmez. Python ilk çalıştırmada yaklaşık 12 MB indirir.",
                                EN: "JavaScript, TypeScript, Python, SQL and Lua run right in your browser (WebAssembly); no sign-in is needed and your code is never sent to a server. Python downloads about 12 MB on its first run.",
                            })}</p>
                        </div>
                        <p>{tx({
                            TR: "C, C++, C#, Java, Go, Rust ve diğer derlenen diller Hanogt Security Bot taramasından sonra izole bir uzak derleyicide çalışır (giriş gerekir, dakikada 20 çalıştırma, en fazla 25 saniye).",
                            EN: "C, C++, C#, Java, Go, Rust and other compiled languages run on an isolated remote compiler after a Hanogt Security Bot scan (sign-in required, 20 runs per minute, 25 seconds max).",
                        })}</p>
                        <p>{tx({
                            TR: "Çok dosyalı projelerde her dosya bağımsız bir iş olarak çalışır ve sonuçlar burada birleştirilir. Paket kurulumu, ağ erişimi ve kalıcı disk yoktur. Gizli anahtar veya kişisel veri içeren kodları çalıştırmayın.",
                            EN: "In multi-file projects each file runs as an independent job and the results are combined here. There is no package installation, network access or persistent disk. Do not run code that contains secrets or personal data.",
                        })}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
