"use client";

import { Plus, X } from "lucide-react";
import { useId, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { MEDIA_LIMITS, isValidMediaTag, normalizeMediaTag, splitMediaTags } from "@/components/Editor/media-publish";
import { useI18n } from "@/lib/i18n";
import { M } from "./copy";

type Problem = { kind: "full" } | { kind: "invalid"; tag: string } | null;

/**
 * Up to five tags as removable chips. A typed tag is added with Enter or a
 * comma (pasted lists are split), normalized the way the server does it
 * ("Game Dev" → "game-dev") and refused when it doesn't fit the tag rules;
 * the project's languages are offered as one-click tags.
 */
export default function TagInput({ id, value, onChange, suggestions = [], dark = false, disabled = false }: {
    id: string;
    value: string[];
    onChange: (tags: string[]) => void;
    suggestions?: string[];
    dark?: boolean;
    disabled?: boolean;
}) {
    const { tx } = useI18n();
    const hintId = useId();
    const [draft, setDraft] = useState("");
    const [problem, setProblem] = useState<Problem>(null);
    const full = value.length >= MEDIA_LIMITS.tags;
    const offered = suggestions.filter((tag) => !value.includes(tag));

    /** Adds what fits; true when nothing was refused. */
    const addAll = (items: string[]) => {
        let next = value;
        let issue: Problem = null;
        for (const raw of items) {
            const tag = normalizeMediaTag(raw);
            if (!tag || next.includes(tag)) continue;
            if (next.length >= MEDIA_LIMITS.tags) {
                issue = { kind: "full" };
                break;
            }
            if (!isValidMediaTag(tag) && !suggestions.includes(tag)) {
                issue = { kind: "invalid", tag: raw.trim().slice(0, 40) };
                continue;
            }
            next = [...next, tag];
        }
        if (next !== value) onChange(next);
        setProblem(issue);
        return issue === null;
    };

    const commitDraft = () => {
        if (!draft.trim()) return;
        // A refused tag stays in the field so it can be corrected.
        if (addAll([draft])) setDraft("");
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter" || event.key === "," || event.key === "،" || event.key === "、") {
            event.preventDefault();
            commitDraft();
        } else if (event.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
            setProblem(null);
        }
    };

    const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
        const text = event.clipboardData.getData("text");
        const items = splitMediaTags(text);
        if (items.length < 2) return;
        event.preventDefault();
        addAll(items);
    };

    const box = dark
        ? "mt-1 flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950 px-2 py-1.5 focus-within:border-blue-500"
        : "mt-2 flex min-h-12 flex-wrap items-center gap-1.5 rounded-2xl border border-zinc-200 px-3 py-2 focus-within:border-blue-500 dark:border-zinc-700";
    const chip = dark ? "bg-zinc-800 text-zinc-200" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";
    const message = problem?.kind === "full" ? tx(M.tagsFull) : problem?.kind === "invalid" ? tx(M.tagInvalid, { tag: problem.tag }) : null;

    return (
        <div>
            <div className={box}>
                {value.length > 0 && (
                    <ul role="list" className="contents" aria-label={tx(M.tags)}>
                        {value.map((tag) => (
                            <li key={tag} className={`inline-flex items-center gap-1 rounded-full py-0.5 ps-2.5 pe-1 text-xs font-semibold ${chip}`}>
                                <span dir="ltr">#{tag}</span>
                                <button
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => {
                                        onChange(value.filter((item) => item !== tag));
                                        setProblem(null);
                                    }}
                                    className="rounded-full p-0.5 opacity-70 transition hover:bg-black/10 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-white/10"
                                    aria-label={tx(M.removeTag, { tag })}
                                >
                                    <X className="h-3 w-3" aria-hidden />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                <input
                    id={id}
                    value={draft}
                    disabled={disabled || full}
                    maxLength={60}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="done"
                    placeholder={full ? "" : tx(M.tagsPlaceholder)}
                    aria-describedby={hintId}
                    aria-invalid={problem?.kind === "invalid" || undefined}
                    onChange={(event) => {
                        setDraft(event.target.value);
                        if (problem) setProblem(null);
                    }}
                    onKeyDown={onKeyDown}
                    onPaste={onPaste}
                    onBlur={commitDraft}
                    className={`min-w-28 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed ${dark ? "text-white" : ""}`}
                />
            </div>
            {offered.length > 0 && !full && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className={`text-xs ${dark ? "text-zinc-400" : "text-zinc-500"}`}>{tx(M.tagSuggestions)}:</span>
                    {offered.map((tag) => (
                        <button
                            key={tag}
                            type="button"
                            disabled={disabled}
                            onClick={() => addAll([tag])}
                            aria-label={tx(M.addTag, { tag })}
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${dark ? "border-zinc-700 text-zinc-300 hover:bg-zinc-800" : "border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"}`}
                        >
                            <Plus className="h-3 w-3" aria-hidden />
                            <span dir="ltr">{tag}</span>
                        </button>
                    ))}
                </div>
            )}
            <p id={hintId} role={message ? "alert" : undefined} className={`mt-1.5 flex items-start justify-between gap-3 text-xs leading-5 ${message ? "text-red-600 dark:text-red-400" : dark ? "text-zinc-400" : "text-zinc-500"}`}>
                <span>{message ?? tx(M.tagsHint)}</span>
                <span className="shrink-0 tabular-nums" aria-hidden>{value.length}/{MEDIA_LIMITS.tags}</span>
            </p>
        </div>
    );
}
