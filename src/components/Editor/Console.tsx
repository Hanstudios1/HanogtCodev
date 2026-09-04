"use client";

import { Info, ListTree, StopCircle, Terminal, Trash2 } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";

interface ConsoleProps {
    output: string[];
    isRunning: boolean;
    onClear: () => void;
}

export default function Console({ output, isRunning, onClear }: ConsoleProps) {
    const { t } = useI18n();
    const [activeTab, setActiveTab] = useState<"output" | "details">("output");

    return (
        <div className="flex h-full flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 font-mono text-sm">
            <div className="flex items-center border-b border-zinc-700 bg-zinc-800">
                <button onClick={() => setActiveTab("output")} className={`flex items-center gap-2 border-b-2 px-4 py-2 transition-colors ${activeTab === "output" ? "border-blue-500 bg-zinc-700/50 text-white" : "border-transparent text-zinc-400 hover:text-zinc-200"}`}>
                    <Terminal className="h-4 w-4" />{t("output") || "Çıktı"}
                </button>
                <button onClick={() => setActiveTab("details")} className={`flex items-center gap-2 border-b-2 px-4 py-2 transition-colors ${activeTab === "details" ? "border-blue-500 bg-zinc-700/50 text-white" : "border-transparent text-zinc-400 hover:text-zinc-200"}`}>
                    <ListTree className="h-4 w-4" />Çalıştırma bilgisi
                </button>
                <div className="flex-1" />
                <button onClick={onClear} className="mr-2 p-2 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-300" title={t("delete") || "Temizle"}><Trash2 className="h-4 w-4" /></button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-zinc-950 p-4 text-zinc-300">
                {activeTab === "output" ? (
                    isRunning ? <div className="flex items-center gap-2 text-yellow-500"><StopCircle className="h-4 w-4 animate-pulse" />İzole çalıştırıcı yanıtı bekleniyor…</div>
                        : output.length === 0 ? <span className="text-zinc-600 italic">Kodunuzu çalıştırdığınızda gerçek sunucu çıktısı burada görüntülenir.</span>
                            : output.map((line, index) => <div key={`${index}-${line.slice(0, 20)}`} className={`whitespace-pre-wrap pb-1 ${line.startsWith("Error") ? "text-red-400" : line.startsWith(">") ? "text-blue-400" : "text-zinc-300"}`}>{line || " "}</div>)
                ) : (
                    <div className="space-y-4 font-sans text-sm leading-6 text-zinc-400">
                        <div className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4"><Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-400" /><p>Bu alan bir işletim sistemi terminali taklidi yapmaz. Çıktılar yalnızca yapılandırılmış, izole <code className="rounded bg-zinc-800 px-1 text-zinc-200">CODE_RUNNER_URL</code> hizmetinden gelir.</p></div>
                        <p>Çok dosyalı projede desteklenen diller tek düğmeyle bağımsız işler olarak yürütülür ve sonuçları aynı çıktı alanında birleştirilir. Diller arası süreç iletişimi, paket kurulumu ve kalıcı disk varsayılan olarak kapalıdır.</p>
                        <p>HTML/CSS önizlemesi tarayıcı içindeki ayrı önizleme sekmesinde çalışır. Gizli anahtar veya kişisel veri içeren kodları çalıştırıcıya göndermeyin.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
