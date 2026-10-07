"use client";

import { CaseSensitive, ChevronDown, ChevronRight, Regex, ReplaceAll, Search, WholeWord, type LucideIcon } from "lucide-react";
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import LanguageIcon from "@/components/Editor/LanguageIcon";
import { formatShortcut, useIsMac } from "@/components/Editor/keyboard";
import type { ConfirmOptions } from "@/components/Editor/Modal";
import { SEARCH_RESULT_LIMIT, compileSearch, countMatches, expandReplacement, searchFiles, type SearchMatch, type SearchOptions } from "@/lib/editor/find-in-files";
import { useI18n, type Copy } from "@/lib/i18n";

const C = {
    title: { TR: "Ara", EN: "Search" },
    region: { TR: "Dosyalarda ara", EN: "Search in files" },
    searchPlaceholder: { TR: "Tüm dosyalarda ara", EN: "Search all files" },
    replacePlaceholder: { TR: "Değiştir", EN: "Replace" },
    showReplace: { TR: "Değiştirme alanını göster", EN: "Show replace" },
    hideReplace: { TR: "Değiştirme alanını gizle", EN: "Hide replace" },
    matchCase: { TR: "Büyük/küçük harf eşleşsin", EN: "Match case" },
    wholeWord: { TR: "Yalnızca tam kelime", EN: "Match whole word" },
    regex: { TR: "Düzenli ifade kullan", EN: "Use regular expression" },
    replaceAll: { TR: "Tümünü değiştir", EN: "Replace all" },
    summary: { TR: "{count} sonuç, {files} dosyada", EN: "{count} results in {files} files" },
    truncated: { TR: "Yalnızca ilk {limit} sonuç gösteriliyor; diğerlerini görmek için aramayı daraltın.", EN: "Only the first {limit} results are shown; narrow the search to see the rest." },
    noResults: { TR: "Sonuç bulunamadı.", EN: "No results found." },
    invalidRegex: { TR: "Geçersiz düzenli ifade: {message}", EN: "Invalid regular expression: {message}" },
    emptyHint: { TR: "Açık dosyaların hepsinde metin veya düzenli ifade arayın. Bir sonuca tıklayınca dosya açılır ve eşleşme seçilir.", EN: "Search all open files for text or a regular expression. Clicking a result opens the file and selects the match." },
    results: { TR: "Arama sonuçları", EN: "Search results" },
    group: { TR: "{name}: {count} sonuç", EN: "{name}: {count} results" },
    row: { TR: "{file}, {line}. satır: {text}", EN: "{file}, line {line}: {text}" },
    confirmTitle: { TR: "Tümü değiştirilsin mi?", EN: "Replace all?" },
    confirmReplace: { TR: "{files} dosyadaki {count} eşleşme “{text}” ile değiştirilecek. Her dosyadaki değişikliği o dosyada {undo} ile geri alabilirsiniz.", EN: "{count} matches in {files} files will be replaced with “{text}”. You can undo the change in each file with {undo} in that file." },
    confirmDelete: { TR: "{files} dosyadaki {count} eşleşme silinecek. Her dosyadaki değişikliği o dosyada {undo} ile geri alabilirsiniz.", EN: "{count} matches in {files} files will be deleted. You can undo the change in each file with {undo} in that file." },
    readOnly: { TR: "Bu canlı oturumda düzenleme izniniz yok.", EN: "You can't edit files in this live session." },
} satisfies Record<string, Copy>;

/** The panel's name (its tab in the output panel). */
export const SEARCH_TITLE: Copy = C.title;

export interface SearchState {
    query: string;
    replacement: string;
    matchCase: boolean;
    wholeWord: boolean;
    regex: boolean;
    showReplace: boolean;
}

export const INITIAL_SEARCH: SearchState = { query: "", replacement: "", matchCase: false, wholeWord: false, regex: false, showReplace: false };

export interface SearchableFile {
    id: string;
    name: string;
    lang: string;
    code: string;
}

interface SearchPanelProps {
    files: readonly SearchableFile[];
    /** Lives in the page, so switching panels keeps the search. */
    state: SearchState;
    onStateChange: (next: SearchState) => void;
    onOpenMatch: (fileId: string, match: SearchMatch) => void;
    /** Replaces every match in every file (one undo step per file); returns what changed. */
    onReplaceAll: (options: SearchOptions, replacement: string) => void;
    confirm: (options: ConfirmOptions) => Promise<boolean>;
    /** False for read-only live sessions. */
    canReplace: boolean;
    /** Changes when Ctrl/⌘+Shift+F opened the panel: the search box takes the focus. */
    focusRequest?: number;
}

const toggleClass = (active: boolean) => `grid h-7 w-7 shrink-0 place-items-center rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${active ? "bg-indigo-600 text-white" : "text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"}`;
const fieldClass = "min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 py-1.5 pe-[5.5rem] ps-2.5 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100";

export default function SearchPanel({ files, state, onStateChange, onOpenMatch, onReplaceAll, confirm, canReplace, focusRequest = 0 }: SearchPanelProps) {
    const { tx, locale } = useI18n();
    const mac = useIsMac();
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
    const summaryId = useId();
    const number = new Intl.NumberFormat(locale);
    const update = (patch: Partial<SearchState>) => onStateChange({ ...state, ...patch });

    useEffect(() => {
        if (!focusRequest) return;
        const frame = window.requestAnimationFrame(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
        });
        return () => window.cancelAnimationFrame(frame);
    }, [focusRequest]);

    // Searching follows typing (in the box and in the files) without blocking it.
    const options: SearchOptions = useMemo(() => ({ query: state.query, matchCase: state.matchCase, wholeWord: state.wholeWord, regex: state.regex }), [state.query, state.matchCase, state.wholeWord, state.regex]);
    const deferredOptions = useDeferredValue(options);
    const deferredFiles = useDeferredValue(files);
    const result = useMemo(() => searchFiles(deferredFiles.map((file) => ({ id: file.id, name: file.name, text: file.code })), deferredOptions), [deferredFiles, deferredOptions]);
    const languages = useMemo(() => new Map(files.map((file) => [file.id, file.lang])), [files]);
    const stale = deferredOptions !== options;

    // The replacement as it will be inserted, for the preview in each result.
    const previewReplacement = useMemo(() => {
        if (!state.showReplace || !state.replacement) return null;
        const compiled = compileSearch(options);
        if (!compiled?.ok) return null;
        if (!state.regex) return () => state.replacement;
        const single = new RegExp(compiled.pattern.source, compiled.pattern.flags.replace("g", ""));
        return (text: string) => {
            const match = single.exec(text);
            return match ? expandReplacement(state.replacement, match, text) : state.replacement;
        };
    }, [options, state.regex, state.replacement, state.showReplace]);

    const replaceAll = async () => {
        if (!canReplace || !state.query) return;
        let count = 0;
        let fileCount = 0;
        for (const file of files) {
            const found = countMatches(file.code, options);
            if (found) {
                count += found;
                fileCount += 1;
            }
        }
        if (!count) return;
        const undo = formatShortcut(["Mod", "Z"], mac);
        const accepted = await confirm({
            title: tx(C.confirmTitle),
            message: state.replacement
                ? tx(C.confirmReplace, { count: number.format(count), files: number.format(fileCount), text: state.replacement, undo })
                : tx(C.confirmDelete, { count: number.format(count), files: number.format(fileCount), undo }),
            confirmLabel: tx(C.replaceAll),
            destructive: true,
        });
        if (accepted) onReplaceAll(options, state.replacement);
    };

    const onFieldKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>, field: "search" | "replace") => {
        // Alt+C / Alt+W / Alt+R like the editor's find widget (by key position: ⌥ letters differ on a Mac).
        if (event.altKey && !event.ctrlKey && !event.metaKey) {
            const toggle = event.code === "KeyC" ? "matchCase" : event.code === "KeyW" ? "wholeWord" : event.code === "KeyR" ? "regex" : null;
            if (toggle) {
                event.preventDefault();
                update({ [toggle]: !state[toggle] });
                return;
            }
        }
        if (event.key === "ArrowDown" && field === "search" && !state.showReplace) {
            const first = listRef.current?.querySelector<HTMLElement>("[data-search-nav]");
            if (first) {
                event.preventDefault();
                first.focus();
            }
        }
        if (event.key === "Enter" && field === "replace" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            void replaceAll();
        }
    };

    const onListKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>) => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        const items = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-search-nav]")];
        if (!items.length) return;
        event.preventDefault();
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (event.key === "ArrowUp" && index <= 0) {
            inputRef.current?.focus();
            return;
        }
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : Math.min(items.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)));
        items[next]?.focus();
    };

    const toggles: Array<{ key: "matchCase" | "wholeWord" | "regex"; icon: LucideIcon; label: Copy; shortcut: string }> = [
        { key: "matchCase", icon: CaseSensitive, label: C.matchCase, shortcut: "C" },
        { key: "wholeWord", icon: WholeWord, label: C.wholeWord, shortcut: "W" },
        { key: "regex", icon: Regex, label: C.regex, shortcut: "R" },
    ];
    const compiledError = "error" in result ? result.error : undefined;
    const ReplaceChevron = state.showReplace ? ChevronDown : ChevronRight;

    return (
        <div className="flex h-full min-h-0 flex-col bg-white text-sm dark:bg-zinc-950" data-search-panel role="search" aria-label={tx(C.region)}>
            <div className="shrink-0 space-y-1.5 border-b border-zinc-200 p-2 dark:border-white/10">
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => update({ showReplace: !state.showReplace })}
                        aria-expanded={state.showReplace}
                        aria-label={tx(state.showReplace ? C.hideReplace : C.showReplace)}
                        title={tx(state.showReplace ? C.hideReplace : C.showReplace)}
                        className="grid h-8 w-6 shrink-0 place-items-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
                    >
                        <ReplaceChevron className={`h-4 w-4 ${state.showReplace ? "" : "rtl:rotate-180"}`} aria-hidden />
                    </button>
                    <div className="relative flex min-w-0 flex-1 items-center">
                        <input
                            ref={inputRef}
                            type="text"
                            value={state.query}
                            onChange={(event) => update({ query: event.target.value })}
                            onKeyDown={(event) => onFieldKeyDown(event, "search")}
                            placeholder={tx(C.searchPlaceholder)}
                            aria-label={tx(C.searchPlaceholder)}
                            aria-invalid={compiledError ? true : undefined}
                            aria-describedby={summaryId}
                            spellCheck={false}
                            autoComplete="off"
                            data-search-input
                            className={`${fieldClass} ${compiledError ? "border-red-500 focus:border-red-500 focus:ring-red-500/20" : ""}`}
                        />
                        <div className="absolute end-1 flex items-center gap-0.5">
                            {toggles.map(({ key, icon: Icon, label, shortcut }) => {
                                const text = `${tx(label)} (${formatShortcut(["Alt", shortcut], mac)})`;
                                return (
                                    <button key={key} type="button" aria-pressed={state[key]} aria-label={text} title={text} onClick={() => update({ [key]: !state[key] })} className={toggleClass(state[key])} data-search-toggle={key}>
                                        <Icon className="h-4 w-4" aria-hidden />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
                {state.showReplace && (
                    <div className="flex items-center gap-1 ps-7">
                        <input
                            type="text"
                            value={state.replacement}
                            onChange={(event) => update({ replacement: event.target.value })}
                            onKeyDown={(event) => onFieldKeyDown(event, "replace")}
                            placeholder={tx(C.replacePlaceholder)}
                            aria-label={tx(C.replacePlaceholder)}
                            spellCheck={false}
                            autoComplete="off"
                            data-replace-input
                            className={fieldClass.replace("pe-[5.5rem]", "pe-2.5")}
                        />
                        <button
                            type="button"
                            onClick={() => void replaceAll()}
                            disabled={!canReplace || !result.total || Boolean(compiledError)}
                            title={canReplace ? `${tx(C.replaceAll)} (${formatShortcut(["Mod", "Enter"], mac)})` : tx(C.readOnly)}
                            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 text-xs font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 dark:focus-visible:ring-offset-zinc-950 dark:disabled:bg-white/10 dark:disabled:text-zinc-500"
                            data-replace-all
                        >
                            <ReplaceAll className="h-4 w-4" aria-hidden />
                            <span className="hidden min-[400px]:inline">{tx(C.replaceAll)}</span>
                        </button>
                    </div>
                )}
                {!canReplace && state.showReplace && <p className="ps-7 text-xs text-amber-700 dark:text-amber-300">{tx(C.readOnly)}</p>}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-1.5" aria-busy={stale}>
                <p id={summaryId} className={`px-2 pb-1.5 pt-0.5 text-xs ${compiledError ? "text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"}`} role="status" aria-live="polite">
                    {!state.query ? tx(C.emptyHint)
                        : compiledError ? tx(C.invalidRegex, { message: compiledError })
                            : result.total === 0 ? tx(C.noResults)
                                : tx(C.summary, { count: number.format(result.total), files: number.format(result.files.length) })}
                </p>
                {result.truncated && (
                    <p className="mx-1 mb-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-200" data-search-truncated>
                        {tx(C.truncated, { limit: number.format(SEARCH_RESULT_LIMIT) })}
                    </p>
                )}
                {result.files.length > 0 && (
                    <ul ref={listRef} aria-label={tx(C.results)} className={`space-y-1 ${stale ? "opacity-60" : ""}`} onKeyDown={onListKeyDown}>
                        {result.files.map((file) => {
                            const open = !collapsed.has(file.id);
                            const listId = `search-${file.id}`;
                            return (
                                <li key={file.id}>
                                    <button
                                        type="button"
                                        onClick={() => setCollapsed((current) => {
                                            const next = new Set(current);
                                            if (next.has(file.id)) next.delete(file.id);
                                            else next.add(file.id);
                                            return next;
                                        })}
                                        aria-expanded={open}
                                        aria-controls={listId}
                                        aria-label={tx(C.group, { name: file.name, count: file.matches.length })}
                                        data-search-nav
                                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:text-zinc-200 dark:hover:bg-white/5"
                                    >
                                        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform ${open ? "" : "-rotate-90 rtl:rotate-90"}`} aria-hidden />
                                        <LanguageIcon language={languages.get(file.id) ?? "plaintext"} size={14} />
                                        <span className="min-w-0 truncate">{file.name}</span>
                                        <span className="ms-auto shrink-0 rounded-full bg-zinc-100 px-1.5 text-[10px] font-bold tabular-nums text-zinc-600 dark:bg-white/10 dark:text-zinc-300">{number.format(file.matches.length)}</span>
                                    </button>
                                    {open && (
                                        <ul id={listId} className="mt-0.5 space-y-px">
                                            {file.matches.map((match) => (
                                                <li key={`${match.line}:${match.column}`}>
                                                    <button
                                                        type="button"
                                                        onClick={() => onOpenMatch(file.id, match)}
                                                        aria-label={tx(C.row, { file: file.name, line: match.line, text: `${match.before}${match.text}${match.after}`.trim() })}
                                                        data-search-nav
                                                        data-search-result
                                                        className="flex w-full items-baseline gap-2 rounded-lg py-1 pe-2 ps-7 text-start transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:hover:bg-white/5"
                                                    >
                                                        <span className="w-8 shrink-0 text-end font-mono text-[11px] tabular-nums text-zinc-400">{match.line}</span>
                                                        <span dir="ltr" className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-600 dark:text-zinc-300">
                                                            {match.before}
                                                            {previewReplacement ? (
                                                                <>
                                                                    <del className="rounded-sm bg-red-500/15 text-red-700 decoration-red-500/70 dark:text-red-300">{match.text}</del>
                                                                    <ins className="rounded-sm bg-emerald-500/15 text-emerald-700 no-underline dark:text-emerald-300">{previewReplacement(match.text)}</ins>
                                                                </>
                                                            ) : (
                                                                <mark className="rounded-sm bg-amber-200 px-px text-zinc-900 dark:bg-amber-400/30 dark:text-amber-50">{match.text}</mark>
                                                            )}
                                                            {match.after}
                                                        </span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
                {!state.query && (
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-zinc-400">
                        <Search className="h-6 w-6" aria-hidden />
                    </div>
                )}
            </div>
        </div>
    );
}
