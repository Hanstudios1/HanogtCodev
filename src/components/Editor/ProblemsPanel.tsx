"use client";

import { ChevronDown, CircleCheck, Info, TriangleAlert, XCircle, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import LanguageIcon from "@/components/Editor/LanguageIcon";
import { PROBLEM_SEVERITIES, filterProblems, type Problem, type ProblemCounts, type ProblemGroup, type ProblemSeverity } from "@/lib/editor/problems";
import { useI18n, type Copy } from "@/lib/i18n";

const C = {
    title: { TR: "Sorunlar", EN: "Problems" },
    filters: { TR: "Önem düzeyine göre süz", EN: "Filter by severity" },
    list: { TR: "Açık dosyalardaki sorunlar", EN: "Problems in the open files" },
    empty: { TR: "Açık dosyalarda sorun yok.", EN: "No problems in the open files." },
    emptyHint: { TR: "Sorunları editörün JavaScript, TypeScript, JSON, CSS, SCSS ve Less denetimleri bulur.", EN: "Problems are found by the editor's JavaScript, TypeScript, JSON, CSS, SCSS and Less checks." },
    filteredEmpty: { TR: "Seçili önem düzeylerinde sorun yok.", EN: "No problems with the selected severities." },
    position: { TR: "Sat {line}, Süt {column}", EN: "Ln {line}, Col {column}" },
    group: { TR: "{name}: {count} sorun", EN: "{name}: {count} problems" },
    open: { TR: "{file} dosyasında {line}. satıra git", EN: "Go to line {line} in {file}" },
} satisfies Record<string, Copy>;

const SEVERITY: Record<ProblemSeverity, { icon: LucideIcon; tone: string; label: Copy; plural: Copy }> = {
    error: { icon: XCircle, tone: "text-red-600 dark:text-red-400", label: { TR: "Hata", EN: "Error" }, plural: { TR: "Hatalar", EN: "Errors" } },
    warning: { icon: TriangleAlert, tone: "text-amber-600 dark:text-amber-400", label: { TR: "Uyarı", EN: "Warning" }, plural: { TR: "Uyarılar", EN: "Warnings" } },
    info: { icon: Info, tone: "text-sky-600 dark:text-sky-400", label: { TR: "Bilgi", EN: "Info" }, plural: { TR: "Bilgiler", EN: "Infos" } },
};

interface ProblemsPanelProps {
    groups: readonly ProblemGroup[];
    counts: ProblemCounts;
    onOpen: (problem: Problem) => void;
    /** Changes when the panel was opened from the keyboard: the list takes the focus. */
    focusRequest?: number;
}

/** The panel's name (its tab in the output panel). */
export const PROBLEMS_TITLE: Copy = C.title;

/** Errors, warnings and infos of all open files; a click opens the file at the problem. */
export default function ProblemsPanel({ groups, counts, onOpen, focusRequest = 0 }: ProblemsPanelProps) {
    const { tx, locale } = useI18n();
    const [hidden, setHidden] = useState<ReadonlySet<ProblemSeverity>>(() => new Set());
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
    const rootRef = useRef<HTMLDivElement>(null);
    const number = new Intl.NumberFormat(locale);
    const total = counts.error + counts.warning + counts.info;
    const shown = useMemo(() => new Set(PROBLEM_SEVERITIES.filter((severity) => !hidden.has(severity))), [hidden]);
    const visible = useMemo(() => filterProblems(groups, shown), [groups, shown]);

    useEffect(() => {
        if (!focusRequest) return;
        const frame = window.requestAnimationFrame(() => {
            const root = rootRef.current;
            (root?.querySelector<HTMLElement>("[data-problem-row]") ?? root?.querySelector<HTMLElement>("button"))?.focus();
        });
        return () => window.cancelAnimationFrame(frame);
    }, [focusRequest]);

    const toggleSeverity = (severity: ProblemSeverity) => setHidden((current) => {
        const next = new Set(current);
        if (next.has(severity)) next.delete(severity);
        else next.add(severity);
        return next;
    });
    const toggleGroup = (tabId: string) => setCollapsed((current) => {
        const next = new Set(current);
        if (next.has(tabId)) next.delete(tabId);
        else next.add(tabId);
        return next;
    });

    // Up/Down move between the file headers and the problems, Home/End to the first and last.
    const onListKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        const items = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-problem-nav]")];
        if (!items.length) return;
        event.preventDefault();
        const index = items.indexOf(document.activeElement as HTMLElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : Math.min(items.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)));
        items[next]?.focus();
    };

    return (
        <div ref={rootRef} className="flex h-full min-h-0 flex-col bg-white text-sm dark:bg-zinc-950" data-problems-panel>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-zinc-200 px-2 py-1.5 dark:border-white/10" role="group" aria-label={tx(C.filters)}>
                {PROBLEM_SEVERITIES.map((severity) => {
                    const { icon: Icon, tone, plural } = SEVERITY[severity];
                    const active = !hidden.has(severity);
                    return (
                        <button
                            key={severity}
                            type="button"
                            aria-pressed={active}
                            onClick={() => toggleSeverity(severity)}
                            data-problem-filter={severity}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${active ? "border-zinc-300 bg-zinc-100 text-zinc-800 dark:border-white/15 dark:bg-white/10 dark:text-zinc-100" : "border-zinc-200 text-zinc-400 line-through decoration-zinc-400/60 hover:text-zinc-600 dark:border-white/10 dark:text-zinc-500 dark:hover:text-zinc-300"}`}
                        >
                            <Icon className={`h-3.5 w-3.5 ${active ? tone : ""}`} aria-hidden />
                            {tx(plural)}
                            <span className="tabular-nums">{number.format(counts[severity])}</span>
                        </button>
                    );
                })}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-1.5" onKeyDown={onListKeyDown}>
                {total === 0 ? (
                    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 px-4 text-center" role="status">
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><CircleCheck className="h-6 w-6" aria-hidden /></span>
                        <p className="font-medium text-zinc-700 dark:text-zinc-200">{tx(C.empty)}</p>
                        <p className="max-w-xs text-xs leading-5 text-zinc-500 dark:text-zinc-400">{tx(C.emptyHint)}</p>
                    </div>
                ) : visible.length === 0 ? (
                    <p className="px-3 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400" role="status">{tx(C.filteredEmpty)}</p>
                ) : (
                    <ul aria-label={tx(C.list)} className="space-y-1">
                        {visible.map((group) => {
                            const open = !collapsed.has(group.tabId);
                            const listId = `problems-${group.tabId}`;
                            return (
                                <li key={group.tabId}>
                                    <button
                                        type="button"
                                        onClick={() => toggleGroup(group.tabId)}
                                        aria-expanded={open}
                                        aria-controls={listId}
                                        aria-label={tx(C.group, { name: group.name, count: group.problems.length })}
                                        data-problem-nav
                                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:text-zinc-200 dark:hover:bg-white/5"
                                    >
                                        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform ${open ? "" : "-rotate-90 rtl:rotate-90"}`} aria-hidden />
                                        <LanguageIcon language={group.language} size={14} />
                                        <span className="min-w-0 truncate">{group.name}</span>
                                        <span className="ms-auto flex shrink-0 items-center gap-2 font-normal tabular-nums text-zinc-500 dark:text-zinc-400">
                                            {PROBLEM_SEVERITIES.filter((severity) => group.counts[severity] > 0).map((severity) => {
                                                const { icon: Icon, tone } = SEVERITY[severity];
                                                return <span key={severity} className="inline-flex items-center gap-0.5"><Icon className={`h-3 w-3 ${tone}`} aria-hidden />{number.format(group.counts[severity])}</span>;
                                            })}
                                        </span>
                                    </button>
                                    {open && (
                                        <ul id={listId} className="mt-0.5 space-y-px">
                                            {group.problems.map((problem) => {
                                                const { icon: Icon, tone, label } = SEVERITY[problem.severity];
                                                const origin = [problem.source, problem.code ? `(${problem.code})` : ""].filter(Boolean).join(" ");
                                                return (
                                                    <li key={problem.key}>
                                                        <button
                                                            type="button"
                                                            onClick={() => onOpen(problem)}
                                                            title={tx(C.open, { file: group.name, line: problem.line })}
                                                            data-problem-row
                                                            data-problem-nav
                                                            data-severity={problem.severity}
                                                            className="flex w-full items-start gap-2 rounded-lg py-1.5 pe-2 ps-7 text-start text-xs leading-5 transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:hover:bg-white/5"
                                                        >
                                                            <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone}`} aria-hidden />
                                                            <span className="sr-only">{tx(label)}:</span>
                                                            {/* The checkers' messages are English: keep their own direction in right-to-left pages. */}
                                                            <span dir="auto" className="min-w-0 flex-1">
                                                                <span className="whitespace-pre-wrap break-words text-zinc-800 dark:text-zinc-100">{problem.message}</span>
                                                                {origin && <span className="ms-1.5 text-zinc-400 dark:text-zinc-500">{origin}</span>}
                                                            </span>
                                                            <span className="shrink-0 whitespace-nowrap font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">{tx(C.position, { line: number.format(problem.line), column: number.format(problem.column) })}</span>
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
