"use client";

import { useState } from "react";
import { Box, Braces, Brush, ChevronDown, CircleAlert, Code2, FileCode2, FolderOpen, Image, Info, Plus, Search, Trash2 } from "lucide-react";
import type { GameComponent, GameEntity } from "@/lib/game-engine/types";

export type EngineLog = {
    id: string;
    level: "info" | "warning" | "error";
    message: string;
    time: string;
};

type Props = {
    sceneName: string;
    entities: GameEntity[];
    scripts: Extract<GameComponent, { type: "script" }>[];
    logs: EngineLog[];
    onClearLogs: () => void;
    onCreateScript: () => void;
    onEditScript: (script: Extract<GameComponent, { type: "script" }>) => void;
    onCreatePrimitive: () => void;
    collapsed: boolean;
    onCollapsedChange: (value: boolean) => void;
};

type Tab = "project" | "console";

export default function AssetsConsolePanel({ sceneName, entities, scripts, logs, onClearLogs, onCreateScript, onEditScript, onCreatePrimitive, collapsed, onCollapsedChange }: Props) {
    const [tab, setTab] = useState<Tab>("project");
    const [query, setQuery] = useState("");
    const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");

    return (
        <section className={`relative shrink-0 border-t border-zinc-200 bg-zinc-50 transition-[height] duration-300 dark:border-zinc-800 dark:bg-zinc-950 ${collapsed ? "h-10" : "h-[210px]"}`} aria-label="Proje varlıkları ve konsol">
            <div className="flex h-10 items-center border-b border-zinc-200 px-2 dark:border-zinc-800">
                <button type="button" onClick={() => setTab("project")} className={`h-full border-b-2 px-3 text-[11px] font-bold uppercase tracking-wider ${tab === "project" ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"}`}>Project</button>
                <button type="button" onClick={() => setTab("console")} className={`relative h-full border-b-2 px-3 text-[11px] font-bold uppercase tracking-wider ${tab === "console" ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"}`}>Console{logs.some((log) => log.level === "error") && <span className="absolute right-0 top-1.5 h-1.5 w-1.5 rounded-full bg-red-500" />}</button>
                <div className="ml-auto flex items-center gap-1">
                    {!collapsed && tab === "project" && <button type="button" onClick={onCreateScript} className="hidden items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-bold text-violet-600 hover:bg-violet-50 sm:flex dark:text-violet-400 dark:hover:bg-violet-950/30"><Plus className="h-3.5 w-3.5" />Script oluştur</button>}
                    {!collapsed && tab === "console" && <button type="button" onClick={onClearLogs} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-red-500 dark:hover:bg-zinc-800" title="Konsolu temizle"><Trash2 className="h-3.5 w-3.5" /></button>}
                    <button type="button" aria-label={collapsed ? "Alt paneli aç" : "Alt paneli kapat"} onClick={() => onCollapsedChange(!collapsed)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"><ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`} /></button>
                </div>
            </div>
            {!collapsed && (tab === "project" ? (
                <div className="grid h-[170px] grid-cols-[160px_minmax(0,1fr)] overflow-hidden sm:grid-cols-[200px_minmax(0,1fr)]">
                    <nav className="border-r border-zinc-200 p-2 dark:border-zinc-800" aria-label="Varlık klasörleri">
                        <AssetFolder icon={FolderOpen} label="Assets" active />
                        <AssetFolder icon={Braces} label="Scripts" count={scripts.length} />
                        <AssetFolder icon={Brush} label="Materials" count={entities.filter((entity) => entity.components.some((component) => component.type === "meshRenderer")).length} />
                        <AssetFolder icon={Image} label="Textures" count={0} />
                    </nav>
                    <div className="min-w-0 overflow-y-auto p-2.5">
                        <div className="mb-2 flex items-center gap-2">
                            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-900"><Search className="h-3.5 w-3.5 text-zinc-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Assets içinde ara" className="min-w-0 flex-1 bg-transparent text-[11px] outline-none" /></div>
                            <button type="button" onClick={onCreateScript} className="rounded-lg bg-violet-600 p-2 text-white transition hover:bg-violet-700 sm:hidden" aria-label="Script oluştur"><FileCode2 className="h-3.5 w-3.5" /></button>
                        </div>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                            <AssetCard icon={Box} label={sceneName} type="Scene" color="blue" onClick={onCreatePrimitive} hidden={normalizedQuery ? !sceneName.toLocaleLowerCase("tr-TR").includes(normalizedQuery) : false} />
                            <AssetCard icon={Brush} label="Default Material" type="Material" color="orange" hidden={normalizedQuery ? !"default material".includes(normalizedQuery) : false} />
                            {scripts.map((script) => <AssetCard key={script.id} icon={FileCode2} label={script.fileName} type={script.language === "csharp" ? "C# Script" : "C++ Script"} color="violet" onClick={() => onEditScript(script)} hidden={normalizedQuery ? !script.fileName.toLocaleLowerCase("tr-TR").includes(normalizedQuery) : false} />)}
                            {scripts.length === 0 && !normalizedQuery && <button type="button" onClick={onCreateScript} className="flex min-h-20 flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 p-2 text-center text-[10px] text-zinc-500 transition hover:border-violet-400 hover:bg-violet-50 dark:border-zinc-700 dark:hover:bg-violet-950/20"><Plus className="mb-1 h-5 w-5 text-violet-500" />İlk scripti oluştur</button>}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="h-[170px] overflow-y-auto bg-zinc-950 p-2 font-mono text-[11px] text-zinc-300">
                    {logs.length === 0 ? <div className="flex h-full flex-col items-center justify-center text-zinc-600"><Code2 className="mb-2 h-6 w-6" /><span>Konsol temiz · oyun motoru hazır</span></div> : logs.map((log) => <div key={log.id} className={`mb-1 flex items-start gap-2 rounded px-2 py-1.5 ${log.level === "error" ? "bg-red-950/30 text-red-300" : log.level === "warning" ? "bg-amber-950/30 text-amber-300" : "hover:bg-white/5"}`}><LogIcon level={log.level} /><span className="min-w-0 flex-1 break-words">{log.message}</span><time className="shrink-0 text-[9px] text-zinc-600">{log.time}</time></div>)}
                </div>
            ))}
        </section>
    );
}

function AssetFolder({ icon: Icon, label, active = false, count }: { icon: typeof FolderOpen; label: string; active?: boolean; count?: number }) {
    return <button type="button" className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11px] ${active ? "bg-blue-100 font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "text-zinc-500 hover:bg-zinc-200/70 dark:hover:bg-zinc-900"}`}><Icon className="h-3.5 w-3.5" /><span className="min-w-0 flex-1 truncate">{label}</span>{typeof count === "number" && <span className="text-[9px] opacity-60">{count}</span>}</button>;
}

function AssetCard({ icon: Icon, label, type, color, onClick, hidden }: { icon: typeof Box; label: string; type: string; color: "blue" | "orange" | "violet"; onClick?: () => void; hidden?: boolean }) {
    if (hidden) return null;
    const palette = color === "blue" ? "bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400" : color === "orange" ? "bg-orange-100 text-orange-600 dark:bg-orange-950/60 dark:text-orange-400" : "bg-violet-100 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400";
    return <button type="button" onDoubleClick={onClick} onClick={onClick} className="group min-w-0 rounded-xl border border-zinc-200 bg-white p-2 text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-blue-800"><span className={`grid aspect-[1.6] w-full place-items-center rounded-lg ${palette}`}><Icon className="h-6 w-6 transition-transform group-hover:scale-110" /></span><span className="mt-1.5 block truncate text-[10px] font-bold">{label}</span><span className="block truncate text-[9px] text-zinc-400">{type}</span></button>;
}

function LogIcon({ level }: { level: EngineLog["level"] }) {
    return level === "error" ? <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : level === "warning" ? <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" />;
}
