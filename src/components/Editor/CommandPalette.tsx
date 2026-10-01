"use client";

import { CornerDownLeft, Search } from "lucide-react";
import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import Modal from "@/components/Editor/Modal";
import { matchScore } from "@/components/Editor/search";
import { useI18n } from "@/lib/i18n";

export interface PaletteCommand {
    id: string;
    /** Translated group heading. */
    group: string;
    label: string;
    hint?: string;
    shortcut?: string;
    icon?: ReactNode;
    disabled?: boolean;
    /** Extra search terms (e.g. English names). */
    keywords?: string;
    run: () => void;
}

interface CommandPaletteProps {
    open: boolean;
    onClose: () => void;
    commands: PaletteCommand[];
}

export default function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
    const { tx } = useI18n();
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listId = useId();
    // Every opening starts with an empty search, also after Mod+K closed the palette.
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            setQuery("");
            setActiveIndex(0);
        }
    }

    const results = useMemo(() => {
        const scored = commands
            .map((command, order) => ({ command, order, score: Math.max(matchScore(query, command.label), matchScore(query, `${command.group} ${command.hint ?? ""} ${command.keywords ?? ""}`) * 0.6) }))
            .filter((entry) => entry.score > 0);
        if (query.trim()) scored.sort((a, b) => b.score - a.score || a.order - b.order);
        return scored.map((entry) => entry.command).slice(0, 80);
    }, [commands, query]);
    const active = Math.min(activeIndex, Math.max(0, results.length - 1));

    const close = () => {
        setQuery("");
        setActiveIndex(0);
        onClose();
    };
    const execute = (command: PaletteCommand | undefined) => {
        if (!command || command.disabled) return;
        close();
        // Let the dialog close (and restore focus) before the command moves focus elsewhere.
        window.setTimeout(command.run, 0);
    };
    const move = (delta: number) => {
        if (!results.length) return;
        const next = (active + delta + results.length) % results.length;
        setActiveIndex(next);
        document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" });
    };

    const showHeadings = !query.trim();
    return (
        <Modal open={open} onClose={close} title={tx({ TR: "Hızlı işlemler", EN: "Quick actions" })} hideHeader align="top" size="md" initialFocus={inputRef} bodyClassName="p-0">
            <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3 dark:border-white/5">
                <Search className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
                <input
                    ref={inputRef}
                    value={query}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setActiveIndex(0);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
                        else if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
                        else if (event.key === "Enter") { event.preventDefault(); execute(results[active]); }
                        else if (event.key === "Home" && event.ctrlKey) { event.preventDefault(); setActiveIndex(0); }
                        else if (event.key === "End" && event.ctrlKey) { event.preventDefault(); setActiveIndex(results.length - 1); }
                    }}
                    role="combobox"
                    aria-expanded="true"
                    aria-controls={listId}
                    aria-activedescendant={results.length ? `${listId}-${active}` : undefined}
                    aria-autocomplete="list"
                    placeholder={tx({ TR: "Bir işlem, dosya veya dil arayın…", EN: "Search for an action, file or language…" })}
                    className="min-w-0 flex-1 bg-transparent text-base text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-white"
                />
                <kbd className="hidden rounded-md border border-zinc-200 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 sm:block dark:border-white/10">Esc</kbd>
            </div>
            <div id={listId} role="listbox" aria-label={tx({ TR: "Sonuçlar", EN: "Results" })} className="max-h-[60vh] overflow-y-auto p-2">
                {results.length === 0 && <p className="px-3 py-8 text-center text-sm text-zinc-500">{tx({ TR: "Eşleşen işlem yok.", EN: "No matching actions." })}</p>}
                {results.map((command, index) => {
                    const heading = showHeadings && (index === 0 || results[index - 1].group !== command.group) ? command.group : null;
                    return (
                        <div key={command.id}>
                            {heading && <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 first:pt-1">{heading}</p>}
                            <div
                                id={`${listId}-${index}`}
                                role="option"
                                aria-selected={index === active}
                                aria-disabled={command.disabled || undefined}
                                onMouseMove={() => setActiveIndex(index)}
                                onClick={() => execute(command)}
                                className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm ${index === active ? "bg-indigo-500/10 text-indigo-900 dark:text-white" : "text-zinc-700 dark:text-zinc-200"} ${command.disabled ? "cursor-not-allowed opacity-50" : ""}`}
                            >
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center text-zinc-500 dark:text-zinc-400">{command.icon}</span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate font-medium">{command.label}</span>
                                    {command.hint && <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{command.hint}</span>}
                                </span>
                                {command.shortcut && <kbd className="shrink-0 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">{command.shortcut}</kbd>}
                                {index === active && !command.disabled && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />}
                            </div>
                        </div>
                    );
                })}
            </div>
        </Modal>
    );
}
