"use client";

import { ChevronRight, Search, X } from "lucide-react";
import { useId, type KeyboardEvent, type ReactNode } from "react";
import en from "@/locales/EN.json";
import { useI18n } from "@/lib/i18n";
import { C } from "./copy";
import { plainClick } from "./helpers";
import { SEARCH_ENTRIES, isKeyLabel, matchRank, matchesAll, searchTerms, type SearchEntry, type SettingLabel } from "./search";
import { GROUPS, SECTIONS, sectionInfo, type SectionId } from "./sections";

const ENGLISH = en as Record<string, string>;
/** The best matches only; the menu below still shows every section that has one. */
const MAX_RESULTS = 8;

/** Inset rings: the phone list clips its rows to rounded corners. */
const NAV_FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500";

/** Phones: a bordered list like a card. Wide screens: a plain sidebar column. */
const LIST = "max-lg:divide-y max-lg:divide-zinc-100 max-lg:overflow-hidden max-lg:rounded-2xl max-lg:border max-lg:border-zinc-200 max-lg:bg-white max-lg:dark:divide-white/[0.06] max-lg:dark:border-white/[0.08] max-lg:dark:bg-zinc-900 lg:space-y-0.5";

const GROUP_LABEL = "px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 lg:px-3 lg:pb-1.5 dark:text-zinc-400";

/**
 * The sections, grouped, with a search box that filters them and lists the
 * matching settings (in the site's language and in English). On wide screens
 * it is the sticky sidebar; on phones it is the category list shown before a
 * section is opened.
 */
export default function SettingsNav({ active, selected, wide, query, onQueryChange, onNavigate, onReveal, top }: {
    active: SectionId;
    selected: SectionId | null;
    wide: boolean;
    query: string;
    onQueryChange: (value: string) => void;
    onNavigate: (id: SectionId) => void;
    onReveal: (entry: SearchEntry) => void;
    /** Shown above the list on phones while nothing is searched (the account card). */
    top?: ReactNode;
}) {
    const { t, tx } = useI18n();
    const baseId = useId();
    const terms = searchTerms(query);
    const searching = terms.length > 0;

    const labelText = (label: SettingLabel) => (isKeyLabel(label) ? t(label.key) : tx(label));
    const englishText = (label: SettingLabel) => (isKeyLabel(label) ? ENGLISH[label.key] ?? "" : label.EN);
    const matches = searching
        ? SEARCH_ENTRIES.filter((entry) => matchesAll(terms, [labelText(entry.label), englishText(entry.label), ...(entry.keywords ?? []).flatMap((word) => [tx(word), word.EN])]))
        : [];
    const results = matches
        .map((entry, index) => ({ entry, index, rank: Math.max(matchRank(query, labelText(entry.label)), matchRank(query, englishText(entry.label))) }))
        .sort((a, b) => b.rank - a.rank || a.index - b.index)
        .slice(0, MAX_RESULTS)
        .map(({ entry }) => entry);
    const shownSections = new Set<SectionId>(searching
        ? [
            ...SECTIONS.filter((section) => matchesAll(terms, [tx(section.label), section.label.EN, tx(section.hint), section.hint.EN])).map((section) => section.id),
            ...matches.map((entry) => entry.section),
        ]
        : SECTIONS.map((section) => section.id));

    const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Escape" && query) {
            event.preventDefault();
            onQueryChange("");
        } else if (event.key === "Enter" && results[0]) {
            event.preventDefault();
            onReveal(results[0]);
        }
    };

    return (
        <div className="space-y-5">
            <div>
                <label htmlFor={`${baseId}-search`} className="sr-only">{tx(C.search)}</label>
                <div className="relative">
                    <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
                    <input
                        id={`${baseId}-search`}
                        type="search"
                        value={query}
                        onChange={(event) => onQueryChange(event.target.value)}
                        onKeyDown={onSearchKey}
                        placeholder={tx(C.search)}
                        autoComplete="off"
                        enterKeyHint="search"
                        className="w-full rounded-xl border border-zinc-200 bg-white py-2 pe-9 ps-9 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/25 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500 [&::-webkit-search-cancel-button]:hidden"
                        data-account-search
                    />
                    {query ? (
                        <button type="button" onClick={() => onQueryChange("")} aria-label={tx(C.clearSearch)} className={`absolute end-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/[0.06] dark:hover:text-zinc-200 ${NAV_FOCUS}`}>
                            <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                    ) : null}
                </div>
                <p className="sr-only" role="status">{searching ? (matches.length ? tx(C.resultCount, { count: matches.length }) : tx(C.noMatch, { query: query.trim() })) : ""}</p>
            </div>

            {searching && (results.length || !shownSections.size) ? (
                results.length ? (
                    <div>
                        <p className={GROUP_LABEL}>{tx(C.results)}</p>
                        <ul className={LIST}>
                            {results.map((entry, index) => (
                                <li key={`${entry.section}-${index}`}>
                                    <button type="button" onClick={() => onReveal(entry)} className={`flex w-full flex-col items-start text-start transition max-lg:px-4 max-lg:py-3 max-lg:hover:bg-zinc-50 max-lg:dark:hover:bg-white/[0.03] lg:rounded-lg lg:px-3 lg:py-1.5 lg:hover:bg-zinc-900/[0.04] lg:dark:hover:bg-white/[0.05] ${NAV_FOCUS}`} data-account-result={entry.target ?? entry.section}>
                                        <span className="block max-w-full truncate text-[14px] font-medium text-zinc-900 lg:text-[13.5px] dark:text-zinc-100">{labelText(entry.label)}</span>
                                        <span className="block max-w-full truncate text-[12px] text-zinc-500 dark:text-zinc-400">{tx(sectionInfo(entry.section).label)}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : (
                    <div className="rounded-xl border border-dashed border-zinc-300 px-4 py-5 text-center dark:border-white/15">
                        <p className="text-[13px] text-zinc-500 dark:text-zinc-400" aria-hidden="true">{tx(C.noMatch, { query: query.trim() })}</p>
                        <button type="button" onClick={() => onQueryChange("")} className={`mt-2 rounded-md px-1 text-[13px] font-semibold text-indigo-600 hover:underline dark:text-indigo-400 ${NAV_FOCUS}`}>{tx(C.clearSearch)}</button>
                    </div>
                )
            ) : null}

            {!searching && top ? <div className="lg:hidden">{top}</div> : null}

            <nav aria-label={tx(C.settings)} className="space-y-5">
                {GROUPS.map((group) => {
                    const items = SECTIONS.filter((section) => section.group === group.id && shownSections.has(section.id));
                    if (!items.length) return null;
                    const labelId = `${baseId}-${group.id}`;
                    return (
                        <div key={group.id}>
                            <p id={labelId} className={GROUP_LABEL}>{tx(group.label)}</p>
                            <ul aria-labelledby={labelId} className={LIST}>
                                {items.map((section) => {
                                    const Icon = section.icon;
                                    // Phones show the list only while no section is open: nothing is "current" there.
                                    const current = section.id === active && (selected !== null || wide);
                                    return (
                                        <li key={section.id}>
                                            <a
                                                href={`#${section.id}`}
                                                onClick={(event) => { if (plainClick(event)) onNavigate(section.id); }}
                                                aria-current={current ? "page" : undefined}
                                                data-account-nav={section.id}
                                                className={`group flex w-full items-center text-start transition max-lg:gap-3 max-lg:px-4 max-lg:py-3.5 max-lg:hover:bg-zinc-50 max-lg:dark:hover:bg-white/[0.03] lg:gap-2.5 lg:rounded-lg lg:px-3 lg:py-2 lg:text-[14px] ${NAV_FOCUS} ${current
                                                    ? "lg:bg-zinc-900/[0.06] lg:font-medium lg:text-zinc-950 lg:dark:bg-white/[0.08] lg:dark:text-white"
                                                    : "lg:text-zinc-600 lg:hover:bg-zinc-900/[0.04] lg:hover:text-zinc-900 lg:dark:text-zinc-400 lg:dark:hover:bg-white/[0.05] lg:dark:hover:text-white"}`}
                                            >
                                                <span className={`grid shrink-0 place-items-center max-lg:h-9 max-lg:w-9 max-lg:rounded-xl max-lg:border max-lg:border-zinc-200 max-lg:bg-zinc-50 max-lg:text-zinc-600 max-lg:dark:border-white/10 max-lg:dark:bg-white/[0.04] max-lg:dark:text-zinc-300 ${current ? "lg:text-indigo-600 lg:dark:text-indigo-400" : "lg:text-zinc-400 lg:group-hover:text-zinc-600 lg:dark:text-zinc-500 lg:dark:group-hover:text-zinc-300"}`}>
                                                    <Icon className="h-[18px] w-[18px] lg:h-4 lg:w-4" aria-hidden="true" />
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate max-lg:text-[15px] max-lg:font-medium max-lg:text-zinc-900 max-lg:dark:text-white">{tx(section.label)}</span>
                                                    <span className="block truncate text-[12.5px] text-zinc-500 lg:hidden dark:text-zinc-400">{tx(section.hint)}</span>
                                                </span>
                                                <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 lg:hidden rtl:rotate-180" aria-hidden="true" />
                                            </a>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    );
                })}
            </nav>
        </div>
    );
}
