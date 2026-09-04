"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Braces, Check, Code2, LoaderCircle, X } from "lucide-react";
import type { ScriptLanguage } from "@/lib/game-engine/types";

type Props = {
    open: boolean;
    entityName?: string;
    busy?: boolean;
    error?: string;
    onClose: () => void;
    onConfirm: (value: { name: string; language: ScriptLanguage; attachToSelected: boolean }) => void | Promise<void>;
};

const LANGUAGES: Array<{ id: ScriptLanguage; title: string; extension: string; description: string; accent: string }> = [
    { id: "csharp", title: "C#", extension: ".cs", description: "Bileşen tabanlı oyun davranışları ve hızlı prototipleme", accent: "from-violet-500 to-blue-500" },
    { id: "cpp", title: "C++", extension: ".cpp", description: "Performans odaklı sistemler ve düşük seviye oyun mantığı", accent: "from-blue-500 to-cyan-500" },
];

export default function ScriptDialog({ open, entityName, busy = false, error, onClose, onConfirm }: Props) {
    const [language, setLanguage] = useState<ScriptLanguage>("csharp");
    const [name, setName] = useState("PlayerController");
    const [attachToSelected, setAttachToSelected] = useState(Boolean(entityName));
    const extension = language === "csharp" ? ".cs" : ".cpp";
    const safeName = useMemo(() => name.trim().replace(/\.(cs|cpp)$/i, "").replace(/[^a-zA-Z0-9_\-]/g, "").slice(0, 64), [name]);

    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !busy) onClose();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [busy, onClose, open]);

    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-md" onMouseDown={() => !busy && onClose()}>
            <section role="dialog" aria-modal="true" aria-labelledby="script-dialog-title" onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-xl overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-[0_30px_100px_rgba(0,0,0,.45)] dark:border-zinc-700 dark:bg-zinc-900">
                <div className="relative overflow-hidden border-b border-zinc-200 p-6 dark:border-zinc-800">
                    <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-violet-500/15 blur-3xl" />
                    <div className="relative flex items-start justify-between gap-4">
                        <div className="flex gap-3">
                            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 text-white shadow-lg shadow-violet-500/20"><Code2 className="h-5 w-5" /></div>
                            <div><h2 id="script-dialog-title" className="text-xl font-black">Yeni oyun scripti</h2><p className="mt-1 text-sm text-zinc-500">Dili seçin; kaynak dosyası Hanogt Kod Editörü’nde açılacak.</p></div>
                        </div>
                        <button type="button" disabled={busy} onClick={onClose} aria-label="Pencereyi kapat" className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-white"><X className="h-5 w-5" /></button>
                    </div>
                </div>
                <div className="space-y-5 p-6">
                    <div className="flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>Oyun projelerinde şu an yalnızca <strong>C# ve C++</strong> kaynak dosyaları desteklenir. Kodun derlenmesi için yapılandırılmış, izole bir harici araç zinciri gerekir.</p>
                    </div>
                    <fieldset>
                        <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">Script dili</legend>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {LANGUAGES.map((item) => (
                                <button key={item.id} type="button" aria-pressed={language === item.id} onClick={() => setLanguage(item.id)} className={`relative overflow-hidden rounded-2xl border p-4 text-left transition ${language === item.id ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/15 dark:bg-blue-950/25" : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"}`}>
                                    <div className="flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ${item.accent} font-mono text-sm font-black text-white`}>{item.title}</span><span><strong className="block text-sm">{item.title}</strong><span className="font-mono text-[10px] text-zinc-400">{item.extension}</span></span>{language === item.id && <span className="ml-auto grid h-5 w-5 place-items-center rounded-full bg-blue-600 text-white"><Check className="h-3 w-3" /></span>}</div>
                                    <p className="mt-3 text-[11px] leading-4 text-zinc-500">{item.description}</p>
                                </button>
                            ))}
                        </div>
                    </fieldset>
                    <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-300">Dosya adı
                        <div className="mt-2 flex items-center rounded-xl border border-zinc-200 bg-zinc-50 px-3 focus-within:border-blue-500 dark:border-zinc-700 dark:bg-zinc-950"><Braces className="mr-2 h-4 w-4 text-zinc-400" /><input autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && safeName && !busy) void onConfirm({ name: `${safeName}${extension}`, language, attachToSelected }); }} className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" /><span className="font-mono text-xs text-zinc-400">{extension}</span></div>
                    </label>
                    {entityName && <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800"><input type="checkbox" checked={attachToSelected} onChange={(event) => setAttachToSelected(event.target.checked)} className="mt-0.5 h-4 w-4 accent-blue-600" /><span className="text-xs"><strong className="block">{entityName} nesnesine bağla</strong><span className="mt-0.5 block text-zinc-500">Script bileşeni seçili nesnenin Inspector alanına eklenir.</span></span></label>}
                    {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button type="button" disabled={busy} onClick={onClose} className="rounded-xl px-5 py-2.5 text-sm font-bold text-zinc-500 hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-800">Vazgeç</button>
                        <button type="button" disabled={!safeName || busy} onClick={() => void onConfirm({ name: `${safeName}${extension}`, language, attachToSelected })} className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Code2 className="h-4 w-4" />}{busy ? "Script hazırlanıyor…" : "Oluştur ve düzenle"}<ArrowRight className="h-4 w-4" /></button>
                    </div>
                </div>
            </section>
        </div>
    );
}
