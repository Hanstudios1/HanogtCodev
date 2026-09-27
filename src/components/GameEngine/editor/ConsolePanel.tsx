"use client";

import { AlertTriangle, Ban, Info, Layers, Search, Terminal, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { useEditor, type ConsoleEntry } from "./context";
import { useEditorState } from "./store";
import { IconButton, PanelHeader, cx, inputClass } from "./ui";

export default function ConsolePanel({ entries, onClear }: { entries: ConsoleEntry[]; onClear: () => void }) {
    const { t, store, openScript } = useEditor();
    const scripts = useEditorState(store, (state) => state.project.scripts);
    const [filters, setFilters] = useState({ info: true, warning: true, error: true });
    const [collapse, setCollapse] = useState(true);
    const [query, setQuery] = useState("");
    const [expanded, setExpanded] = useState<number | null>(null);

    const counts = useMemo(() => {
        const result = { info: 0, warning: 0, error: 0 };
        for (const entry of entries) result[entry.level] += entry.count;
        return result;
    }, [entries]);

    const visible = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase();
        let list = entries.filter((entry) => filters[entry.level] && (!needle || entry.message.toLocaleLowerCase().includes(needle)));
        if (!collapse) {
            list = list.flatMap((entry) => (entry.count > 1 ? Array.from({ length: Math.min(entry.count, 50) }, () => ({ ...entry, count: 1 })) : [entry]));
        }
        return list.slice(-500);
    }, [entries, filters, collapse, query]);

    const openSource = (entry: ConsoleEntry) => {
        if (!entry.source?.scriptName) return;
        const script = scripts.find((item) => item.name === entry.source?.scriptName);
        if (script) openScript(script.id, entry.source.line || undefined);
    };

    const filterButton = (level: "info" | "warning" | "error", Icon: typeof Info, className: string, label: string) => (
        <button
            type="button"
            onClick={() => setFilters((current) => ({ ...current, [level]: !current[level] }))}
            aria-pressed={filters[level]}
            title={label}
            className={cx("inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold transition", filters[level] ? "bg-white/[0.07] text-zinc-200" : "text-zinc-600 hover:text-zinc-400")}
        >
            <Icon className={cx("h-3.5 w-3.5", filters[level] ? className : "text-zinc-600")} />
            {counts[level] > 999 ? "999+" : counts[level]}
        </button>
    );

    return (
        <div className="flex h-full min-h-0 flex-col">
            <PanelHeader
                actions={(
                    <>
                        <div className="relative mr-1 hidden sm:block">
                            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500" />
                            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search")} className={cx(inputClass, "h-6 w-40 pl-6 text-[11.5px]")} />
                        </div>
                        {filterButton("info", Info, "text-zinc-300", t("messages"))}
                        {filterButton("warning", AlertTriangle, "text-amber-300", t("warnings"))}
                        {filterButton("error", XCircle, "text-red-400", t("errors"))}
                        <IconButton icon={Layers} label={t("collapse")} size="sm" active={collapse} onClick={() => setCollapse(!collapse)} />
                        <IconButton icon={Ban} label={t("clear")} size="sm" onClick={onClear} />
                    </>
                )}
            >
                <Terminal className="h-3.5 w-3.5 text-zinc-500" />
                <span className="text-[12px] font-semibold text-zinc-300">{t("console")}</span>
            </PanelHeader>
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto font-mono text-[11.5px]" role="log" aria-live="polite">
                {visible.length ? visible.map((entry, index) => {
                    const Icon = entry.level === "error" ? XCircle : entry.level === "warning" ? AlertTriangle : Info;
                    const multiline = entry.message.includes("\n");
                    const isExpanded = expanded === entry.id;
                    return (
                        <div
                            key={`${entry.id}-${index}`}
                            onClick={() => setExpanded(isExpanded ? null : entry.id)}
                            onDoubleClick={() => openSource(entry)}
                            className={cx(
                                "flex cursor-default items-start gap-2 border-b border-white/[0.04] px-2.5 py-1.5",
                                entry.level === "error" && "bg-red-500/[0.06] text-red-200",
                                entry.level === "warning" && "bg-amber-500/[0.05] text-amber-100",
                                entry.level === "info" && "text-zinc-300",
                            )}
                        >
                            <Icon className={cx("mt-0.5 h-3.5 w-3.5 shrink-0", entry.level === "error" ? "text-red-400" : entry.level === "warning" ? "text-amber-300" : "text-zinc-500")} />
                            <div className="min-w-0 flex-1">
                                <p className={cx("whitespace-pre-wrap break-words", !isExpanded && "line-clamp-2")}>{isExpanded || !multiline ? entry.message : entry.message.split("\n")[0]}</p>
                                <p className="mt-0.5 text-[10px] text-zinc-500">
                                    {entry.origin === "game" ? `${entry.time.toFixed(2)}s · kare ${entry.frame}` : "Editör"}
                                    {entry.source?.scriptName ? (
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                openSource(entry);
                                            }}
                                            className="ml-2 text-indigo-300 hover:underline"
                                        >
                                            {entry.source.scriptName}{entry.source.line ? `:${entry.source.line}` : ""}
                                        </button>
                                    ) : null}
                                </p>
                            </div>
                            {entry.count > 1 ? <span className="shrink-0 rounded-full bg-white/10 px-1.5 text-[10px] font-bold text-zinc-200">{entry.count > 999 ? "999+" : entry.count}</span> : null}
                        </div>
                    );
                }) : (
                    <div className="grid h-full place-items-center p-4 text-center font-sans text-[12px] text-zinc-500">{t("consoleEmpty")}</div>
                )}
            </div>
        </div>
    );
}
