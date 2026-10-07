"use client";

import type { ReactNode } from "react";
import type { GroupRuleDraft } from "@/lib/groups";
import { cx } from "./ui";

/**
 * A group's rules, numbered like Discord's rules screen: the title in bold
 * and its description under it. `cards` is the Rules section's look, `compact`
 * fits inside other cards (the join page, /kurallar, the settings).
 */
export default function RulesList({ rules, variant = "compact", renderDescription, className }: {
    rules: ReadonlyArray<GroupRuleDraft & { id?: string }>;
    variant?: "cards" | "compact";
    /** Renders a description (the chat's Markdown inside a group); plain text otherwise. */
    renderDescription?: (text: string) => ReactNode;
    className?: string;
}) {
    const cards = variant === "cards";
    return (
        <ol className={cx(cards ? "space-y-3" : "space-y-2.5", className)}>
            {rules.map((rule, index) => (
                <li
                    key={rule.id || `${index}-${rule.title}`}
                    className={cx("flex gap-3", cards && "rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900/80")}
                >
                    <span
                        aria-hidden
                        className={cx(
                            "flex shrink-0 items-center justify-center rounded-full bg-indigo-500/10 font-black tabular-nums text-indigo-700 dark:text-indigo-300",
                            cards ? "h-8 w-8 text-sm" : "h-6 w-6 text-[11px]",
                        )}
                    >
                        {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className={cx("break-words font-bold text-zinc-900 dark:text-white", cards ? "pt-1 text-[15px]" : "pt-0.5 text-sm")}>{rule.title}</p>
                        {rule.description && (renderDescription
                            ? <div className="mt-0.5 break-words text-zinc-600 dark:text-zinc-300">{renderDescription(rule.description)}</div>
                            : <p className="mt-0.5 whitespace-pre-line break-words text-sm leading-6 text-zinc-600 dark:text-zinc-300">{rule.description}</p>)}
                    </div>
                </li>
            ))}
        </ol>
    );
}
