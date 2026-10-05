/**
 * The message box's suggestions: what is being typed at the caret ("@ali"
 * for a person, "#gen" for a channel, "/sus" for a command at the start of
 * the message, ":smi" for an emoji) and how a picked suggestion replaces it.
 * Framework-free.
 */

export type TriggerKind = "mention" | "channel" | "command" | "emoji";

export type ComposerTrigger = {
    kind: TriggerKind;
    /** What was typed after the marker. */
    query: string;
    /** Where the marker starts; the suggestion replaces [start, end). */
    start: number;
    end: number;
};

const MENTION = /(?:^|\s)@([^\s@]{0,32})$/u;
const CHANNEL = /(?:^|\s)#([\p{L}\p{N}_-]{0,24})$/u;
const COMMAND = /^\/([\p{L}\p{N}_-]{0,32})$/u;
const EMOJI = /(?:^|\s):([\p{L}\p{N}_+-]{2,24})$/u;

/** The suggestion trigger right before the caret, or null. */
export function findTrigger(value: string, caret: number): ComposerTrigger | null {
    const end = Math.max(0, Math.min(caret, value.length));
    const before = value.slice(0, end);
    // Commands only at the very start of the message, like Discord.
    const command = COMMAND.exec(before);
    if (command) return { kind: "command", query: command[1], start: 0, end };
    for (const [kind, pattern] of [["mention", MENTION], ["channel", CHANNEL], ["emoji", EMOJI]] as const) {
        const match = pattern.exec(before);
        if (match) {
            const query = match[1];
            return { kind, query, start: end - query.length - 1, end };
        }
    }
    return null;
}

/**
 * Replaces the trigger with `replacement` (e.g. "@Ali", "#genel", "/sustur",
 * "😀") and a space; returns the new text and where the caret goes.
 */
export function applySuggestion(value: string, trigger: ComposerTrigger, replacement: string): { value: string; caret: number } {
    const after = value.slice(trigger.end);
    const spacer = after.startsWith(" ") ? "" : " ";
    const next = `${value.slice(0, trigger.start)}${replacement}${spacer}${after}`;
    return { value: next, caret: trigger.start + replacement.length + 1 };
}

/** Folds text for matching: lower case without accents, "ı" as "i" (Turkish names). */
export function foldForMatch(value: string) {
    return value.toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");
}

/**
 * Orders names for a query: names starting with it first, then names with a
 * word starting with it, then names containing it; at most `limit`.
 */
export function rankByQuery<T>(items: readonly T[], query: string, nameOf: (item: T) => string, limit = 8): T[] {
    const wanted = foldForMatch(query.trim());
    if (!wanted) return items.slice(0, limit);
    const scored: Array<{ item: T; score: number; index: number }> = [];
    items.forEach((item, index) => {
        const name = foldForMatch(nameOf(item));
        const score = name.startsWith(wanted) ? 0 : name.split(/[\s_-]+/).some((word) => word.startsWith(wanted)) ? 1 : name.includes(wanted) ? 2 : -1;
        if (score >= 0) scored.push({ item, score, index });
    });
    return scored.sort((a, b) => a.score - b.score || a.index - b.index).slice(0, limit).map((entry) => entry.item);
}
