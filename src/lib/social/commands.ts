/**
 * Slash commands of Hanogt Social groups: the built-in ones (Hanogt AI and
 * the Hanogt Security Bot), who may use them and how their arguments are
 * read. Framework-free: the composer suggests from it, the server runs it.
 */
import type { Copy } from "@/lib/i18n";

/** A member's standing in a group, lowest first. */
export type GroupRank = "member" | "moderator" | "admin" | "owner";

export const RANK_ORDER: Record<GroupRank, number> = { member: 0, moderator: 1, admin: 2, owner: 3 };

export function rankAtLeast(rank: GroupRank, needed: GroupRank) {
    return RANK_ORDER[rank] >= RANK_ORDER[needed];
}

export type CommandBot = "security" | "ai";

export type CommandId = "help" | "ai" | "warn" | "warnings" | "mute" | "unmute" | "kick" | "ban" | "purge" | "slowmode" | "rules" | "report";

export interface CommandSpec {
    id: CommandId;
    /** The name shown in each language (without the slash). */
    name: { TR: string; EN: string };
    /** Every accepted name, folded (see foldCommandName). */
    aliases: readonly string[];
    bot: CommandBot;
    /** Who may run it; "member" means everyone in the group. */
    minRank: GroupRank;
    usage: Copy;
    description: Copy;
}

export const GROUP_COMMANDS: readonly CommandSpec[] = [
    {
        id: "help", bot: "security", minRank: "member", name: { TR: "yardim", EN: "help" }, aliases: ["yardim", "help", "komutlar", "commands"],
        usage: { TR: "/yardim", EN: "/help" },
        description: { TR: "Kullanabileceğin komutları listeler.", EN: "Lists the commands you can use." },
    },
    {
        id: "ai", bot: "ai", minRank: "member", name: { TR: "ai", EN: "ai" }, aliases: ["ai", "hanogt", "sor", "ask"],
        usage: { TR: "/ai <soru>", EN: "/ai <question>" },
        description: { TR: "Hanogt AI'a sorar; yanıt senin Hanogt AI hakkından düşer.", EN: "Asks Hanogt AI; the answer counts against your Hanogt AI allowance." },
    },
    {
        id: "rules", bot: "security", minRank: "member", name: { TR: "kurallar", EN: "rules" }, aliases: ["kurallar", "rules"],
        usage: { TR: "/kurallar", EN: "/rules" },
        description: { TR: "Grubun kurallarını gösterir.", EN: "Shows the group's rules." },
    },
    {
        id: "report", bot: "security", minRank: "member", name: { TR: "rapor", EN: "report" }, aliases: ["rapor", "report", "bildir"],
        usage: { TR: "/rapor @kişi <sebep>", EN: "/report @person <reason>" },
        description: { TR: "Bir üyeyi grubun yöneticilerine bildirir.", EN: "Reports a member to the group's moderators." },
    },
    {
        id: "warnings", bot: "security", minRank: "member", name: { TR: "uyarilar", EN: "warnings" }, aliases: ["uyarilar", "warnings"],
        usage: { TR: "/uyarilar [@kişi]", EN: "/warnings [@person]" },
        description: { TR: "Uyarıları gösterir; başkasınınkini yalnızca moderatörler görür.", EN: "Shows warnings; only moderators see someone else's." },
    },
    {
        id: "warn", bot: "security", minRank: "moderator", name: { TR: "uyar", EN: "warn" }, aliases: ["uyar", "warn"],
        usage: { TR: "/uyar @kişi [sebep]", EN: "/warn @person [reason]" },
        description: { TR: "Üyeye uyarı verir.", EN: "Warns a member." },
    },
    {
        id: "mute", bot: "security", minRank: "moderator", name: { TR: "sustur", EN: "mute" }, aliases: ["sustur", "mute", "timeout"],
        usage: { TR: "/sustur @kişi [süre: 10dk, 2sa, 1g] [sebep]", EN: "/mute @person [duration: 10m, 2h, 1d] [reason]" },
        description: { TR: "Üyeyi bir süre susturur (varsayılan 10 dakika, en çok 28 gün).", EN: "Mutes a member for a while (10 minutes by default, 28 days at most)." },
    },
    {
        id: "unmute", bot: "security", minRank: "moderator", name: { TR: "sesiac", EN: "unmute" }, aliases: ["sesiac", "unmute"],
        usage: { TR: "/sesiac @kişi", EN: "/unmute @person" },
        description: { TR: "Susturmayı kaldırır.", EN: "Lifts a mute." },
    },
    {
        id: "kick", bot: "security", minRank: "moderator", name: { TR: "at", EN: "kick" }, aliases: ["at", "kick"],
        usage: { TR: "/at @kişi [sebep]", EN: "/kick @person [reason]" },
        description: { TR: "Üyeyi gruptan çıkarır; davetle geri dönebilir.", EN: "Removes a member; they can come back with an invite." },
    },
    {
        id: "ban", bot: "security", minRank: "admin", name: { TR: "yasakla", EN: "ban" }, aliases: ["yasakla", "ban"],
        usage: { TR: "/yasakla @kişi [sebep]", EN: "/ban @person [reason]" },
        description: { TR: "Üyeyi çıkarır ve geri katılmasını engeller.", EN: "Removes a member and keeps them from rejoining." },
    },
    {
        id: "purge", bot: "security", minRank: "moderator", name: { TR: "temizle", EN: "purge" }, aliases: ["temizle", "purge", "clear"],
        usage: { TR: "/temizle <1-100> [@kişi]", EN: "/purge <1-100> [@person]" },
        description: { TR: "Bu kanaldaki son mesajları siler (isteğe bağlı olarak bir kişinin).", EN: "Deletes the latest messages in this channel (optionally one person's)." },
    },
    {
        id: "slowmode", bot: "security", minRank: "moderator", name: { TR: "yavasmod", EN: "slowmode" }, aliases: ["yavasmod", "slowmode"],
        usage: { TR: "/yavasmod <süre: 5sn, 1dk> | kapat", EN: "/slowmode <duration: 5s, 1m> | off" },
        description: { TR: "Bu kanalda iki mesaj arasında beklenecek süreyi ayarlar.", EN: "Sets how long people wait between messages in this channel." },
    },
];

const TURKISH_FOLD: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

/** Lower case without Turkish diacritics: "Yavaşmod" → "yavasmod". */
export function foldCommandName(value: string) {
    return value.replace(/[çğıİöşüâîû]/gi, (char) => TURKISH_FOLD[char] ?? TURKISH_FOLD[char.toLowerCase()] ?? char).toLowerCase();
}

export function findCommand(name: string): CommandSpec | null {
    const folded = foldCommandName(name);
    return GROUP_COMMANDS.find((command) => command.aliases.includes(folded)) ?? null;
}

/** Custom commands are named like built-ins: a letter, then letters, digits, - or _ (at most 24). */
export const CUSTOM_COMMAND_NAME = /^[a-z][a-z0-9_-]{0,23}$/;

/** "/name rest of the line" → its parts; anything else (including "//" and "/ ") is not a command. */
export function readCommandLine(text: string): { name: string; rest: string } | null {
    const match = /^\/([\p{L}][\p{L}\p{N}_-]{0,31})(?:\s+([\s\S]*))?$/u.exec(text.trim());
    if (!match) return null;
    return { name: foldCommandName(match[1]), rest: (match[2] ?? "").trim() };
}

const UNITS: Record<string, number> = {
    s: 1_000, sn: 1_000, sec: 1_000, saniye: 1_000, second: 1_000, seconds: 1_000,
    m: 60_000, dk: 60_000, min: 60_000, dakika: 60_000, minute: 60_000, minutes: 60_000,
    h: 3_600_000, sa: 3_600_000, saat: 3_600_000, hr: 3_600_000, hour: 3_600_000, hours: 3_600_000,
    d: 86_400_000, g: 86_400_000, gun: 86_400_000, day: 86_400_000, days: 86_400_000,
    w: 604_800_000, hafta: 604_800_000, week: 604_800_000, weeks: 604_800_000,
};

/** "10dk", "2h", "1 gün", "90" (seconds) → milliseconds; null when it isn't a duration. */
export function parseDuration(value: string): number | null {
    const match = /^(\d{1,6})\s*([\p{L}]*)$/u.exec(foldCommandName(value.trim()));
    if (!match) return null;
    const amount = Number(match[1]);
    const unit = match[2] ? UNITS[match[2]] : 1_000;
    if (!unit || amount <= 0) return null;
    return amount * unit;
}

/** The first word of `rest` read as a duration, and what follows. */
export function takeDuration(rest: string): { duration: number | null; rest: string } {
    const match = /^(\d{1,6}\s*[\p{L}]*)(?:\s+([\s\S]*))?$/u.exec(rest);
    if (!match) return { duration: null, rest };
    const duration = parseDuration(match[1]);
    return duration === null ? { duration: null, rest } : { duration, rest: (match[2] ?? "").trim() };
}

/**
 * "@name …" at the start of `rest` → the member's name (the longest member
 * name that matches, names may contain spaces) and what follows.
 */
export function takeMember(rest: string, usernames: readonly string[]): { username: string | null; rest: string } {
    if (!rest.startsWith("@")) return { username: null, rest };
    const after = rest.slice(1);
    const names = [...new Set(usernames.map((name) => name.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
    const name = names.find((candidate) => {
        const head = after.slice(0, candidate.length);
        const next = after[candidate.length];
        return head.toLocaleLowerCase("tr") === candidate.toLocaleLowerCase("tr") && (next === undefined || /\s/.test(next));
    });
    return name ? { username: name, rest: after.slice(name.length).trim() } : { username: null, rest };
}

export const MUTE_DEFAULT_MS = 10 * 60_000;
export const MUTE_MAX_MS = 28 * 86_400_000;
export const SLOWMODE_MAX_SECONDS = 6 * 3600;
export const PURGE_MAX = 100;
export const REASON_MAX = 300;

export function clipReason(value: string) {
    return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, REASON_MAX);
}

/** What a command line asks for, before the server checks the group and the people. */
export type ParsedCommand =
    | { id: "help" | "rules" }
    | { id: "ai"; question: string }
    | { id: "warn" | "kick" | "ban"; target: string; reason: string }
    | { id: "report"; target: string; reason: string }
    | { id: "warnings"; target: string | null }
    | { id: "mute"; target: string; durationMs: number; reason: string }
    | { id: "unmute"; target: string }
    | { id: "purge"; count: number; target: string | null }
    | { id: "slowmode"; seconds: number };

export type CommandProblem = "unknown" | "needs_member" | "unknown_member" | "needs_text" | "bad_duration" | "bad_count";

/** Reads a built-in command's arguments; `usernames` are the group's members' names. */
export function parseCommand(spec: CommandSpec, rest: string, usernames: readonly string[]): { ok: true; command: ParsedCommand } | { ok: false; problem: CommandProblem } {
    const member = () => {
        if (!rest.startsWith("@")) return { ok: false as const, problem: "needs_member" as const };
        const taken = takeMember(rest, usernames);
        return taken.username ? { ok: true as const, ...taken, username: taken.username } : { ok: false as const, problem: "unknown_member" as const };
    };
    switch (spec.id) {
        case "help":
        case "rules":
            return { ok: true, command: { id: spec.id } };
        case "ai": {
            const question = rest.trim();
            return question ? { ok: true, command: { id: "ai", question } } : { ok: false, problem: "needs_text" };
        }
        case "warn":
        case "kick":
        case "ban":
        case "report": {
            const taken = member();
            if (!taken.ok) return taken;
            const reason = clipReason(taken.rest);
            if (spec.id === "report" && !reason) return { ok: false, problem: "needs_text" };
            return { ok: true, command: { id: spec.id, target: taken.username, reason } };
        }
        case "warnings": {
            if (!rest) return { ok: true, command: { id: "warnings", target: null } };
            const taken = member();
            return taken.ok ? { ok: true, command: { id: "warnings", target: taken.username } } : taken;
        }
        case "mute": {
            const taken = member();
            if (!taken.ok) return taken;
            const timed = takeDuration(taken.rest);
            const durationMs = timed.duration ?? (/^\d/.test(taken.rest) ? -1 : MUTE_DEFAULT_MS);
            if (durationMs <= 0 || durationMs > MUTE_MAX_MS) return { ok: false, problem: "bad_duration" };
            return { ok: true, command: { id: "mute", target: taken.username, durationMs, reason: clipReason(timed.rest) } };
        }
        case "unmute": {
            const taken = member();
            return taken.ok ? { ok: true, command: { id: "unmute", target: taken.username } } : taken;
        }
        case "purge": {
            const match = /^(\d{1,3})(?:\s+([\s\S]*))?$/.exec(rest);
            const count = match ? Number(match[1]) : 0;
            if (!count || count > PURGE_MAX) return { ok: false, problem: "bad_count" };
            const after = (match?.[2] ?? "").trim();
            if (!after) return { ok: true, command: { id: "purge", count, target: null } };
            const taken = takeMember(after, usernames);
            return taken.username ? { ok: true, command: { id: "purge", count, target: taken.username } } : { ok: false, problem: "unknown_member" };
        }
        case "slowmode": {
            const word = foldCommandName(rest);
            if (["kapat", "off", "0", "kapali"].includes(word)) return { ok: true, command: { id: "slowmode", seconds: 0 } };
            const duration = parseDuration(rest);
            if (duration === null || duration > SLOWMODE_MAX_SECONDS * 1000) return { ok: false, problem: "bad_duration" };
            return { ok: true, command: { id: "slowmode", seconds: Math.round(duration / 1000) } };
        }
        default:
            return { ok: false, problem: "unknown" };
    }
}

/** Commands the composer suggests for what has been typed after "/", for someone of `rank`. */
export function suggestCommands(typed: string, rank: GroupRank, language: "TR" | "EN", custom: readonly { name: string; description: string }[] = []) {
    const prefix = foldCommandName(typed.replace(/^\//, ""));
    const builtIn = GROUP_COMMANDS
        .filter((command) => rankAtLeast(rank, command.minRank))
        .filter((command) => !prefix || command.aliases.some((alias) => alias.startsWith(prefix)))
        .map((command) => ({ kind: "builtin" as const, name: command.name[language], bot: command.bot, usage: command.usage[language], description: command.description[language] }));
    const own = custom
        .filter((command) => !prefix || command.name.startsWith(prefix))
        .map((command) => ({ kind: "custom" as const, name: command.name, bot: "custom" as const, usage: `/${command.name}`, description: command.description }));
    return [...builtIn, ...own].slice(0, 12);
}
