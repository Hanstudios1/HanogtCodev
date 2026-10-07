"use client";

import { CornerDownLeft, Search } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
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
    /**
     * When the palette was opened with its shortcut (Ctrl/⌘+K), the time
     * (performance.now()) it happened: a key from `chords` pressed right
     * after it completes a two-step shortcut such as Ctrl/⌘+K Z.
     */
    chordArmedAt?: number;
    /** Second keys of two-step shortcuts (lower case) and what they do. */
    chords?: Readonly<Record<string, () => void>>;
}

/** How long after Ctrl/⌘+K the second key of a two-step shortcut is accepted. */
const CHORD_WINDOW_MS = 1500;
/** A letter typed this soon after the chord key means a search ("zip"), not the shortcut. */
const CHORD_CONTINUATION_MS = 280;

export default function CommandPalette({ open, onClose, commands, chordArmedAt = 0, chords }: CommandPaletteProps) {
    const { tx } = useI18n();
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listId = useId();
    /** The second key of a two-step shortcut, waiting to see whether more letters follow. */
    const pendingChord = useRef<{ key: string; typed: string; timer: number } | null>(null);
    useEffect(() => {
        const pending = pendingChord;
        return () => {
            if (pending.current) window.clearTimeout(pending.current.timer);
        };
    }, []);
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

    const cancelChord = () => {
        const pending = pendingChord.current;
        if (pending) window.clearTimeout(pending.timer);
        pendingChord.current = null;
        return pending;
    };
    const close = () => {
        cancelChord();
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
    const runChord = (key: string) => {
        const action = chords?.[key];
        close();
        if (action) window.setTimeout(action, 0);
    };
    /**
     * Two-step shortcuts: right after Ctrl/⌘+K, a chord key (Z) in the empty
     * search box runs its action unless another letter follows at once.
     * Returns true when the key was handled here.
     */
    const handleChordKey = (event: ReactKeyboardEvent<HTMLInputElement>): boolean => {
        if (event.nativeEvent.isComposing) return false;
        const pending = pendingChord.current;
        if (pending) {
            if (event.key === "Enter") {
                event.preventDefault();
                runChord(pending.key);
                return true;
            }
            cancelChord();
            if (event.key === "Backspace") {
                event.preventDefault();
                return true;
            }
            if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                // A search that starts with the chord letter: keep both letters.
                event.preventDefault();
                setQuery(`${pending.typed}${event.key}`);
                setActiveIndex(0);
                return true;
            }
            // Arrows and other keys: the letter counts as typed.
            setQuery(pending.typed);
            return false;
        }
        const key = event.key.toLowerCase();
        const armed = chordArmedAt > 0 && performance.now() - chordArmedAt < CHORD_WINDOW_MS;
        if (!armed || query || !chords?.[key] || event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return false;
        event.preventDefault();
        pendingChord.current = { key, typed: event.key, timer: window.setTimeout(() => runChord(key), CHORD_CONTINUATION_MS) };
        return true;
    };
    /**
     * The search box gets focus on the next frame, so a key pressed right
     * after Ctrl/⌘+K (the Z of Ctrl/⌘+K Z, or the first letter of a search)
     * would otherwise land in the code editor. Until the box has focus, such
     * keys are kept out of the page and handled here.
     */
    const earlyKey = useRef<(key: string) => void>(() => {});
    useLayoutEffect(() => {
        earlyKey.current = (key: string) => {
            const pending = cancelChord();
            if (pending) {
                setQuery(`${pending.typed}${key}`);
                setActiveIndex(0);
                return;
            }
            const lower = key.toLowerCase();
            const armed = chordArmedAt > 0 && performance.now() - chordArmedAt < CHORD_WINDOW_MS;
            if (armed && !query && chords?.[lower]) {
                pendingChord.current = { key: lower, typed: key, timer: window.setTimeout(() => runChord(lower), CHORD_CONTINUATION_MS) };
                return;
            }
            setQuery((current) => `${current}${key}`);
            setActiveIndex(0);
        };
    });
    useLayoutEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            const input = inputRef.current;
            if (!input || document.activeElement === input || event.isComposing) return;
            if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
            event.preventDefault();
            event.stopPropagation();
            input.focus();
            earlyKey.current(event.key);
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [open]);
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
                        if (handleChordKey(event)) return;
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
