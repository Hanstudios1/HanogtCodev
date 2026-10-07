"use client";

import { BadgeCheck, EyeOff, ScrollText, X } from "lucide-react";
import type { ReactNode } from "react";
import ProductLogo from "@/components/ProductLogo";
import RulesList from "@/components/Groups/RulesList";
import { cx, fullDateTime } from "@/components/Groups/ui";
import type { CustomCommand, GroupBot, GroupRuleDraft } from "@/lib/groups";
import { useI18n, type Copy } from "@/lib/i18n";
import { BOT_EVENT_COPY, BOT_REASON_COPY, COMMAND_ERROR_COPY, EPHEMERAL_COPY, formatDuration, type BotEvent, type EphemeralReply } from "@/lib/social/bots";
import { suggestCommands, type GroupRank } from "@/lib/social/commands";

const C = {
    bot: { TR: "BOT", EN: "BOT" },
    verified: { TR: "Hanogt'un doğrulanmış botu", EN: "Hanogt's verified bot" },
    thinking: { TR: "Düşünüyor", EN: "Thinking" },
    security: { TR: "Hanogt Security Bot", EN: "Hanogt Security Bot" },
    ai: { TR: "Hanogt AI", EN: "Hanogt AI" },
    customUsed: { TR: "{actor}, /{command} komutunu kullandı", EN: "{actor} used /{command}" },
    builtIn: { TR: "Hanogt komutları", EN: "Hanogt commands" },
} satisfies Record<string, Copy>;

export const BOT_LABEL: Record<GroupBot, Copy> = { security: C.security, ai: C.ai };

/** A bot's round avatar: the product's logo on a quiet tile. */
export function BotAvatar({ bot, size = 36, className }: { bot: GroupBot; size?: number; className?: string }) {
    return (
        <span
            className={cx("flex shrink-0 items-center justify-center rounded-full border", bot === "security" ? "border-emerald-500/30 bg-emerald-500/10" : "border-indigo-500/30 bg-indigo-500/10", className)}
            style={{ width: size, height: size }}
            aria-hidden
        >
            <ProductLogo product={bot === "security" ? "security" : "ai"} size={Math.round(size * 0.66)} />
        </span>
    );
}

/** Discord's "✓ BOT" tag next to a bot's name. */
export function BotTag() {
    const { tx } = useI18n();
    return (
        <span className="inline-flex items-center gap-0.5 rounded bg-indigo-600 px-1 py-px text-[10px] font-black leading-4 tracking-wide text-white" title={tx(C.verified)}>
            <BadgeCheck className="h-3 w-3" aria-hidden />{tx(C.bot)}
        </span>
    );
}

/** The three bouncing dots Hanogt AI shows while it writes its answer. */
export function ThinkingDots() {
    const { tx } = useI18n();
    return (
        <span className="inline-flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400" role="status">
            <span className="inline-flex gap-0.5" aria-hidden>
                {[0, 150, 300].map((delay) => <span key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-500/80" style={{ animationDelay: `${delay}ms` }} />)}
            </span>
            {tx(C.thinking)}…
        </span>
    );
}

/** A bot notice in the reader's language: the event's text with its values and the reason, if any. */
export function botNoticeText(event: BotEvent, vars: Record<string, string>, tx: (copy: Copy, values?: Record<string, string | number>) => string, language: "TR" | "EN") {
    const ms = Number(vars.ms);
    const values = { ...vars, duration: Number.isFinite(ms) && ms > 0 ? formatDuration(ms, language) : "" };
    const main = tx(BOT_EVENT_COPY[event], values);
    return vars.reason ? `${main} ${tx(BOT_REASON_COPY, { reason: vars.reason })}` : main;
}

/** The small line above a custom command's answer ("Ali used /kurallar"). */
export function customCommandLine(vars: Record<string, string>, tx: (copy: Copy, values?: Record<string, string | number>) => string) {
    return tx(C.customUsed, { actor: vars.actor || "—", command: vars.command || "?" });
}

function formatWhen(iso: string | null, locale: string) {
    if (!iso) return "";
    const time = Date.parse(iso);
    return Number.isFinite(time) ? fullDateTime(time, locale) : "";
}

/**
 * What only the person who ran a command sees (never stored): the command
 * list, the rules, warnings, a report receipt, or why it didn't work.
 */
export function EphemeralCard({ reply, onDismiss, rank, customCommands, rules, renderRules, onOpenRules }: {
    reply: EphemeralReply;
    onDismiss: () => void;
    rank: GroupRank;
    customCommands: readonly CustomCommand[];
    /** The group's Rules section (shown when the reply carries no list). */
    rules: readonly GroupRuleDraft[];
    /** Renders rule texts with the chat's Markdown. */
    renderRules: (text: string) => ReactNode;
    /** Opens the group's Rules section. */
    onOpenRules?: () => void;
}) {
    const { tx, language, locale } = useI18n();
    let body: ReactNode;
    switch (reply.kind) {
        case "help": {
            const builtIn = suggestCommands("", rank, language === "TR" ? "TR" : "EN").filter((command) => command.kind === "builtin");
            body = (
                <>
                    <p className="font-bold">{tx(EPHEMERAL_COPY.helpTitle)}</p>
                    <ul className="mt-1.5 space-y-1">
                        {builtIn.map((command) => (
                            <li key={command.name} className="text-[13px]"><code className="rounded bg-zinc-200/70 px-1 font-mono text-[12px] dark:bg-zinc-800">{command.usage}</code> <span className="text-zinc-600 dark:text-zinc-300">{command.description}</span></li>
                        ))}
                    </ul>
                    {customCommands.length > 0 && (
                        <>
                            <p className="mt-3 font-bold">{tx(EPHEMERAL_COPY.customTitle)}</p>
                            <ul className="mt-1.5 space-y-1">
                                {customCommands.map((command) => (
                                    <li key={command.name} className="text-[13px]"><code className="rounded bg-zinc-200/70 px-1 font-mono text-[12px] dark:bg-zinc-800">/{command.name}</code> {command.description && <span className="text-zinc-600 dark:text-zinc-300">{command.description}</span>}</li>
                                ))}
                            </ul>
                        </>
                    )}
                </>
            );
            break;
        }
        case "rules": {
            // The numbered list the server sent; the group's own list, or the plain text of an older server, otherwise.
            const items = Array.isArray(reply.items) ? reply.items : rules;
            const text = typeof reply.rules === "string" ? reply.rules.trim() : "";
            body = (
                <>
                    <p className="font-bold">{tx(EPHEMERAL_COPY.rulesTitle)}</p>
                    <div className="mt-1.5">
                        {items.length ? <RulesList rules={items} renderDescription={renderRules} /> : text ? renderRules(text) : <p className="text-zinc-500">{tx(EPHEMERAL_COPY.noRules)}</p>}
                    </div>
                    {onOpenRules && (items.length > 0 || text !== "") && (
                        <button type="button" onClick={onOpenRules} className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-indigo-300">
                            <ScrollText className="h-3.5 w-3.5" aria-hidden />{tx(EPHEMERAL_COPY.openRules)}
                        </button>
                    )}
                </>
            );
            break;
        }
        case "warnings":
            body = (
                <>
                    <p className="font-bold">{tx(EPHEMERAL_COPY.warningsTitle, { name: reply.target })}</p>
                    {reply.items.length ? (
                        <ol className="mt-1.5 space-y-1.5">
                            {reply.items.map((item, index) => (
                                <li key={`${item.at}-${index}`} className="text-[13px]">
                                    <span className="font-semibold">{index + 1}.</span> {item.reason || "—"}
                                    <span className="ms-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">{formatWhen(item.at, locale)}</span>
                                    {item.auto && <span className="ms-1.5 rounded bg-amber-500/15 px-1 text-[10px] font-bold text-amber-700 dark:text-amber-300">{tx(EPHEMERAL_COPY.auto)}</span>}
                                </li>
                            ))}
                        </ol>
                    ) : <p className="mt-1 text-zinc-600 dark:text-zinc-300">{tx(EPHEMERAL_COPY.noWarnings)}</p>}
                </>
            );
            break;
        case "reported":
            body = <p>{tx(EPHEMERAL_COPY.reported, { name: reply.target })}</p>;
            break;
        case "unmuted_none":
            body = <p>{tx(EPHEMERAL_COPY.unmutedNone, { name: reply.target })}</p>;
            break;
        case "ai_limit":
            body = <p>{reply.resetsAt ? tx(EPHEMERAL_COPY.aiLimit, { time: formatWhen(reply.resetsAt, locale) }) : tx(EPHEMERAL_COPY.aiLimitSoon)}</p>;
            break;
        case "ai_off":
            body = <p>{tx(EPHEMERAL_COPY.aiOff)}</p>;
            break;
        case "ai_unavailable":
            body = <p>{tx(EPHEMERAL_COPY.aiUnavailable)}</p>;
            break;
        case "error":
            body = <p>{tx(COMMAND_ERROR_COPY[reply.code] ?? COMMAND_ERROR_COPY.server_error)}</p>;
            break;
    }
    const bot: GroupBot = reply.kind === "ai_limit" || reply.kind === "ai_off" || reply.kind === "ai_unavailable" ? "ai" : "security";
    return (
        <div className="mx-3 my-1.5 flex gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/[0.05] px-3 py-2.5" role="status">
            <BotAvatar bot={bot} size={32} />
            <div className="min-w-0 flex-1 text-sm text-zinc-800 dark:text-zinc-100">
                <div className="mb-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-sm font-bold">{tx(BOT_LABEL[bot])}</span>
                    <BotTag />
                </div>
                {body}
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    <EyeOff className="h-3 w-3" aria-hidden />{tx(EPHEMERAL_COPY.onlyYou)} ·
                    <button type="button" onClick={onDismiss} className="font-semibold text-indigo-600 hover:underline dark:text-indigo-300">{tx(EPHEMERAL_COPY.dismiss)}</button>
                </p>
            </div>
            <button type="button" onClick={onDismiss} className="self-start rounded-md p-1 text-zinc-400 transition hover:bg-zinc-200/60 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-white" aria-label={tx(EPHEMERAL_COPY.dismiss)}><X className="h-3.5 w-3.5" aria-hidden /></button>
        </div>
    );
}

/** Values a bot notice may carry, already checked by the message model. */
export function noticeOf(message: { botEvent: BotEvent | null; vars: Record<string, string> }, tx: (copy: Copy, values?: Record<string, string | number>) => string, language: "TR" | "EN") {
    return message.botEvent && message.botEvent !== "custom" && message.botEvent !== "welcome" && message.botEvent !== "ai_failed"
        ? botNoticeText(message.botEvent, message.vars, tx, language)
        : null;
}

