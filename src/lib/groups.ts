/**
 * Hanogt Groups — shared, framework-free building blocks.
 *
 * Imported by the group API routes (server) and by the group pages (client),
 * so this module must stay free of Node, React and Firebase imports. It holds
 * limits and validators, the color/emoji/reaction palettes, the API contract
 * types, message tokenizing helpers and the starter templates that seed a new
 * group (README, rules, task list, template files and the welcome message).
 */
import type { Copy } from "@/lib/i18n";
import { GROUP_FEATURES_MAX, type GroupPlanLimits } from "@/lib/plans";
import type { PresenceStatus } from "@/lib/presence";

/* -------------------------------------------------------------------------- */
/* Limits and validation                                                      */
/* -------------------------------------------------------------------------- */

export const GROUP_LIMITS = {
    nameMin: 2,
    nameMax: 60,
    descriptionMax: 500,
    rulesMax: 4000,
    fileNameMax: 120,
    fileContentMax: 500_000,
    filesMax: 50,
    messageMax: 4000,
    topicsMax: 12,
    topicMax: 24,
    activeLinksMax: 20,
} as const;

/** Every id that ends up in a Firestore document path (groups, messages, files, projects). */
export const GROUP_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
/** Invite link tokens: 128 random bits, base64url encoded. */
export const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;
export const GROUP_EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
/** Pseudonymous member keys used for reactions and typing state. */
export const MEMBER_KEY_PATTERN = /^k[0-9a-f]{20}$/;
/** `fromEmail` of messages written by the platform itself. */
export const SYSTEM_SENDER = "system";
/**
 * `fromEmail` of messages written by Hanogt's group bots: the Hanogt Security
 * Bot (moderation, rules, custom commands; in every group) and Hanogt AI.
 */
export const BOT_SENDERS = { security: "bot:security", ai: "bot:ai" } as const;
export type GroupBot = keyof typeof BOT_SENDERS;
export const BOT_NAMES: Record<GroupBot, string> = { security: "Hanogt Security Bot", ai: "Hanogt AI" };

export function botOfSender(value: unknown): GroupBot | null {
    return value === BOT_SENDERS.security ? "security" : value === BOT_SENDERS.ai ? "ai" : null;
}
/** Document id of the pinned welcome message every new group starts with. */
export const WELCOME_MESSAGE_ID = "welcome";
/** How long a presence heartbeat counts as "online" (the heartbeat runs every 45 s). */
export const ONLINE_WINDOW_MS = 100_000;

export function isGroupId(value: unknown): value is string {
    return typeof value === "string" && GROUP_ID_PATTERN.test(value);
}

export function isInviteToken(value: unknown): value is string {
    return typeof value === "string" && INVITE_TOKEN_PATTERN.test(value);
}

export function isMemberKey(value: unknown): value is string {
    return typeof value === "string" && MEMBER_KEY_PATTERN.test(value);
}

/** Lower-cases and validates an e-mail address; returns null when it is not acceptable. */
export function normalizeGroupEmail(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const email = value.trim().toLowerCase();
    return email.length <= 254 && GROUP_EMAIL_PATTERN.test(email) ? email : null;
}

/**
 * Voice messages may only point into the group's own Storage folder
 * (`group-voice-messages/<groupId>/<file>`); anything else is ignored.
 */
export function safeGroupVoicePath(value: unknown, groupId: string): string | null {
    if (typeof value !== "string" || !isGroupId(groupId)) return null;
    const parts = value.split("/");
    if (parts.length !== 3 || parts[0] !== "group-voice-messages" || parts[1] !== groupId) return null;
    const file = parts[2];
    if (file === "." || file === ".." || !/^[A-Za-z0-9._-]{1,200}$/.test(file)) return null;
    return value;
}

/** Single-line text: control characters removed, whitespace collapsed. */
export function cleanSingleLine(value: unknown, max = 1000): string {
    if (typeof value !== "string") return "";
    return value
        .slice(0, max * 4)
        .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** Multi-line text: keeps line breaks and tabs, removes other control characters. */
export function cleanMultiLine(value: unknown, max = 10_000): string {
    if (typeof value !== "string") return "";
    return value
        .slice(0, max * 4)
        .replace(/\r\n?/g, "\n")
        .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "")
        .replace(/\n{4,}/g, "\n\n\n")
        .trim();
}

/** Replaces {name} placeholders (same syntax as the UI copy). */
export function fillVars(text: string, vars: Record<string, string | number>) {
    return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/** Firestore timestamps arrive as Timestamp objects (client), ISO strings (server) or Dates. */
export function toMillis(value: unknown): number {
    if (!value) return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") return Date.parse(value) || 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value === "object" && "toMillis" in value && typeof (value as { toMillis: unknown }).toMillis === "function") {
        return (value as { toMillis: () => number }).toMillis();
    }
    return 0;
}

/* -------------------------------------------------------------------------- */
/* Roles, palette, emoji, reactions                                           */
/* -------------------------------------------------------------------------- */

/**
 * owner › admin › moderator › member. Admins manage the group (settings,
 * pins, invite links, bans, AutoMod); moderators keep the chat in order
 * (delete messages, warn, mute, remove, purge, slow mode).
 */
export type GroupRole = "owner" | "admin" | "moderator" | "member";

export const ROLE_RANK: Record<GroupRole, number> = { member: 0, moderator: 1, admin: 2, owner: 3 };

export function isManagerRole(role: GroupRole | null | undefined) {
    return role === "owner" || role === "admin";
}

/** Owners, admins and moderators. */
export function canModerate(role: GroupRole | null | undefined) {
    return role === "owner" || role === "admin" || role === "moderator";
}

/** Moderation reaches only people of a lower rank (the owner is never a target). */
export function outranks(actor: GroupRole, target: GroupRole) {
    return ROLE_RANK[actor] > ROLE_RANK[target];
}

export const GROUP_ROLE_COPY: Record<GroupRole, Copy> = {
    owner: { TR: "Sahip", EN: "Owner" },
    admin: { TR: "Yönetici", EN: "Admin" },
    moderator: { TR: "Moderatör", EN: "Moderator" },
    member: { TR: "Üye", EN: "Member" },
};

/** An admin-defined command answered by the Hanogt Security Bot ("/kurulum" → the text). */
export type CustomCommand = { name: string; description: string; response: string };

/** `count` is the most any plan allows (Pro); a group's own limit is its owner's plan's (PLAN_GROUP_FEATURES). */
export const CUSTOM_COMMAND_LIMITS = { count: GROUP_FEATURES_MAX.commands, description: 80, response: 1_000 } as const;
export const WELCOME_MESSAGE_MAX = 500;
/** At most six hours between two messages of one person in slow mode. */
export const SLOWMODE_MAX_SECONDS = 21_600;

const COMMAND_NAME = /^[a-z][a-z0-9_-]{0,23}$/;

/** Stored or sent custom commands, checked: valid unique names (lower case), clipped texts, at most 100 (the most any plan allows). */
export function sanitizeCustomCommands(value: unknown, reserved: readonly string[] = []): CustomCommand[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>(reserved);
    const commands: CustomCommand[] = [];
    for (const entry of value) {
        if (!entry || typeof entry !== "object") continue;
        const raw = entry as Record<string, unknown>;
        const name = typeof raw.name === "string" ? raw.name.trim().replace(/^\//, "").toLowerCase() : "";
        // The cleaners don't clip (callers check lengths), so the limits are applied here.
        const response = cleanMultiLine(raw.response, CUSTOM_COMMAND_LIMITS.response).slice(0, CUSTOM_COMMAND_LIMITS.response).trim();
        if (!COMMAND_NAME.test(name) || seen.has(name) || !response) continue;
        seen.add(name);
        commands.push({ name, description: cleanSingleLine(raw.description, CUSTOM_COMMAND_LIMITS.description).slice(0, CUSTOM_COMMAND_LIMITS.description).trim(), response });
        if (commands.length >= CUSTOM_COMMAND_LIMITS.count) break;
    }
    return commands;
}

/**
 * The main channel's key in `slowmode`. Firestore map keys can't be empty, and
 * "~" can't appear in a topic, so it never collides with one.
 */
export const MAIN_CHANNEL_KEY = "~main";

/** The key of a channel in `slowmode`: MAIN_CHANNEL_KEY for the main channel, the topic otherwise. */
export function channelKey(topic: string | null | undefined) {
    return (topic ?? "").trim().toLocaleLowerCase("tr").slice(0, 24) || MAIN_CHANNEL_KEY;
}

/** Stored slow-mode settings, checked: known-looking channel keys, 1 s to 6 h. */
export function readSlowmode(value: unknown): Record<string, number> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result: Record<string, number> = {};
    for (const [key, seconds] of Object.entries(value as Record<string, unknown>)) {
        if (!key || key.length > 24 || typeof seconds !== "number" || !Number.isFinite(seconds)) continue;
        const clamped = Math.min(SLOWMODE_MAX_SECONDS, Math.max(0, Math.round(seconds)));
        if (clamped > 0) result[key] = clamped;
    }
    return result;
}

export type GroupColor = "indigo" | "violet" | "fuchsia" | "rose" | "amber" | "emerald" | "sky" | "slate";

export type GroupColorStyle = {
    name: Copy;
    /** Gradient stops for `bg-gradient-to-br`. */
    gradient: string;
    /** Tinted surface + readable text in both themes. */
    soft: string;
    text: string;
    ring: string;
    border: string;
    swatch: string;
    shadow: string;
};

export const GROUP_COLORS: Record<GroupColor, GroupColorStyle> = {
    indigo: { name: { TR: "Çivit", EN: "Indigo" }, gradient: "from-indigo-500 to-violet-600", soft: "bg-indigo-500/10", text: "text-indigo-600 dark:text-indigo-300", ring: "ring-indigo-500/50", border: "border-indigo-500/30", swatch: "bg-indigo-500", shadow: "shadow-indigo-500/25" },
    violet: { name: { TR: "Mor", EN: "Violet" }, gradient: "from-violet-500 to-purple-700", soft: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-300", ring: "ring-violet-500/50", border: "border-violet-500/30", swatch: "bg-violet-500", shadow: "shadow-violet-500/25" },
    fuchsia: { name: { TR: "Fuşya", EN: "Fuchsia" }, gradient: "from-fuchsia-500 to-pink-600", soft: "bg-fuchsia-500/10", text: "text-fuchsia-600 dark:text-fuchsia-300", ring: "ring-fuchsia-500/50", border: "border-fuchsia-500/30", swatch: "bg-fuchsia-500", shadow: "shadow-fuchsia-500/25" },
    rose: { name: { TR: "Gül", EN: "Rose" }, gradient: "from-rose-500 to-red-600", soft: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-300", ring: "ring-rose-500/50", border: "border-rose-500/30", swatch: "bg-rose-500", shadow: "shadow-rose-500/25" },
    amber: { name: { TR: "Kehribar", EN: "Amber" }, gradient: "from-amber-400 to-orange-500", soft: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-300", ring: "ring-amber-500/50", border: "border-amber-500/30", swatch: "bg-amber-500", shadow: "shadow-amber-500/25" },
    emerald: { name: { TR: "Zümrüt", EN: "Emerald" }, gradient: "from-emerald-500 to-teal-600", soft: "bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-300", ring: "ring-emerald-500/50", border: "border-emerald-500/30", swatch: "bg-emerald-500", shadow: "shadow-emerald-500/25" },
    sky: { name: { TR: "Gök mavisi", EN: "Sky" }, gradient: "from-sky-500 to-blue-600", soft: "bg-sky-500/10", text: "text-sky-700 dark:text-sky-300", ring: "ring-sky-500/50", border: "border-sky-500/30", swatch: "bg-sky-500", shadow: "shadow-sky-500/25" },
    slate: { name: { TR: "Grafit", EN: "Graphite" }, gradient: "from-zinc-600 to-zinc-900", soft: "bg-zinc-500/10", text: "text-zinc-700 dark:text-zinc-300", ring: "ring-zinc-500/50", border: "border-zinc-500/30", swatch: "bg-zinc-600", shadow: "shadow-zinc-500/25" },
};

export const GROUP_COLOR_IDS = Object.keys(GROUP_COLORS) as GroupColor[];
export const DEFAULT_GROUP_COLOR: GroupColor = "indigo";

export function isGroupColor(value: unknown): value is GroupColor {
    return typeof value === "string" && value in GROUP_COLORS;
}

export function groupColor(value: unknown): GroupColor {
    return isGroupColor(value) ? value : DEFAULT_GROUP_COLOR;
}

/** Curated icons: a free-form field would let people put arbitrary text in the icon slot. */
export const GROUP_EMOJIS = [
    "👥", "💻", "🚀", "🎮", "📚", "🎓", "🧠", "🛠️", "🎨", "🔬",
    "🏆", "🌍", "⚡", "🔥", "🧩", "🎯", "📦", "🤖", "🎵", "🧪",
    "🌱", "☕", "🦊", "🐍", "💡", "📱", "🌐", "🔐", "📊", "🏗️",
    "✏️", "🎬", "🧭", "🛰️", "🐙", "🦄", "🍕", "⭐", "❤️", "🌈",
] as const;
export const DEFAULT_GROUP_EMOJI = "👥";

export function isGroupEmoji(value: unknown): value is string {
    return typeof value === "string" && (GROUP_EMOJIS as readonly string[]).includes(value);
}

export function groupEmoji(value: unknown): string {
    return isGroupEmoji(value) ? value : DEFAULT_GROUP_EMOJI;
}

export const GROUP_REACTIONS = [
    { key: "like", emoji: "👍", label: { TR: "Beğendim", EN: "Like" } },
    { key: "love", emoji: "❤️", label: { TR: "Bayıldım", EN: "Love" } },
    { key: "laugh", emoji: "😂", label: { TR: "Komik", EN: "Funny" } },
    { key: "party", emoji: "🎉", label: { TR: "Kutlama", EN: "Celebrate" } },
    { key: "rocket", emoji: "🚀", label: { TR: "Harika", EN: "Awesome" } },
    { key: "eyes", emoji: "👀", label: { TR: "Bakıyorum", EN: "Looking" } },
    { key: "done", emoji: "✅", label: { TR: "Tamam", EN: "Done" } },
] as const satisfies ReadonlyArray<{ key: string; emoji: string; label: Copy }>;

export type GroupReactionKey = (typeof GROUP_REACTIONS)[number]["key"];

export function isReactionKey(value: unknown): value is GroupReactionKey {
    return typeof value === "string" && GROUP_REACTIONS.some((reaction) => reaction.key === value);
}

/* -------------------------------------------------------------------------- */
/* Topics (#hashtags that keep the chat organized)                            */
/* -------------------------------------------------------------------------- */

const TOPIC_PATTERN = /^[\p{L}\p{N}_-]{1,24}$/u;

export function normalizeTopic(value: unknown, language: SeedLanguage = "tr"): string | null {
    if (typeof value !== "string") return null;
    const topic = value.trim().replace(/^#+/, "").toLocaleLowerCase(language === "tr" ? "tr-TR" : "en-US");
    return TOPIC_PATTERN.test(topic) ? topic : null;
}

/** Returns the cleaned, de-duplicated list, or null when any entry is invalid. */
export function normalizeTopics(value: unknown, language: SeedLanguage = "tr"): string[] | null {
    if (!Array.isArray(value) || value.length > GROUP_LIMITS.topicsMax) return null;
    const topics: string[] = [];
    for (const entry of value) {
        const topic = normalizeTopic(entry, language);
        if (!topic) return null;
        if (!topics.includes(topic)) topics.push(topic);
    }
    return topics;
}

/* -------------------------------------------------------------------------- */
/* Invite links                                                               */
/* -------------------------------------------------------------------------- */

export const INVITE_LINK_EXPIRIES = ["1h", "24h", "7d", "never"] as const;
export type InviteLinkExpiry = (typeof INVITE_LINK_EXPIRIES)[number];
export const INVITE_LINK_EXPIRY_MS: Record<InviteLinkExpiry, number | null> = {
    "1h": 60 * 60_000,
    "24h": 24 * 60 * 60_000,
    "7d": 7 * 24 * 60 * 60_000,
    never: null,
};
/** 0 means "no limit" (the group size still caps it). */
export const INVITE_LINK_MAX_USES = [0, 1, 5, 10, 25] as const;
export type InviteLinkMaxUses = (typeof INVITE_LINK_MAX_USES)[number];

export function isInviteLinkExpiry(value: unknown): value is InviteLinkExpiry {
    return typeof value === "string" && (INVITE_LINK_EXPIRIES as readonly string[]).includes(value);
}

export function isInviteLinkMaxUses(value: unknown): value is InviteLinkMaxUses {
    return typeof value === "number" && (INVITE_LINK_MAX_USES as readonly number[]).includes(value);
}

/** Canonical share URL of an invite link (older /groups/join/<token> links redirect here). */
export function inviteLinkPath(token: string) {
    return `/social/join/${token}`;
}

/** Accepts a full invite URL (new or old path), a `?join=` URL or the bare 22-character code. */
export function extractInviteToken(value: string) {
    const trimmed = value.trim();
    const match = /(?:\/(?:social|groups)\/join\/|[?&]join=)([A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])/.exec(trimmed);
    if (match) return match[1];
    return INVITE_TOKEN_PATTERN.test(trimmed) ? trimmed : null;
}

/* -------------------------------------------------------------------------- */
/* Files                                                                      */
/* -------------------------------------------------------------------------- */

const EXTENSION_LANGUAGES: Record<string, string> = {
    js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
    ts: "typescript", tsx: "typescript", mts: "typescript",
    py: "python", cs: "csharp", cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp", h: "cpp", c: "c",
    java: "java", html: "html", htm: "html", css: "css", scss: "scss", less: "less",
    php: "php", go: "go", swift: "swift", rb: "ruby", rs: "rust", kt: "kotlin", kts: "kotlin",
    sql: "sql", lua: "lua", md: "markdown", markdown: "markdown", json: "json",
    yml: "yaml", yaml: "yaml", xml: "xml", svg: "xml", sh: "shell", bash: "shell",
    dart: "dart", r: "r", txt: "plaintext",
};

export function fileExtension(name: string) {
    const base = name.split("/").pop() || name;
    const dot = base.lastIndexOf(".");
    return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/** Monaco / runner language id for a file name (same ids the editor uses). */
export function languageFromFileName(name: string) {
    return EXTENSION_LANGUAGES[fileExtension(name)] || "plaintext";
}

export type FileNameProblem = "empty" | "too_long" | "invalid";

/** Validates a user supplied file name; `/` is allowed for folders inside the ZIP export. */
export function fileNameProblem(value: string): FileNameProblem | null {
    const name = value.trim();
    if (!name) return "empty";
    if (name.length > GROUP_LIMITS.fileNameMax) return "too_long";
    if (/[\u0000-\u001f\u007f\\:*?"<>|]/.test(name) || name.startsWith("/") || name.endsWith("/")) return "invalid";
    if (name.split("/").some((segment) => !segment.trim() || segment === "." || segment === "..")) return "invalid";
    return null;
}

/** Server-side clean-up for names imported from projects. */
export function cleanFileName(value: unknown, fallback: string) {
    const name = cleanSingleLine(value, GROUP_LIMITS.fileNameMax).replace(/[\\:*?"<>|]/g, "_").replace(/^\/+|\/+$/g, "");
    return name && !fileNameProblem(name) ? name.slice(0, GROUP_LIMITS.fileNameMax) : fallback;
}

export type NewFileTemplate = { id: string; label: Copy; fileName: string; code: string };

/** Starters offered by the "new file" dialog. */
export const NEW_FILE_TEMPLATES: readonly NewFileTemplate[] = [
    { id: "empty", label: { TR: "Boş dosya", EN: "Empty file" }, fileName: "notes.txt", code: "" },
    { id: "markdown", label: { TR: "Markdown notu", EN: "Markdown note" }, fileName: "notes.md", code: "# Başlık / Title\n\n- \n" },
    { id: "javascript", label: { TR: "JavaScript", EN: "JavaScript" }, fileName: "script.js", code: "function main() {\n    console.log(\"Hello from Hanogt!\");\n}\n\nmain();\n" },
    { id: "typescript", label: { TR: "TypeScript", EN: "TypeScript" }, fileName: "module.ts", code: "export function greet(name: string): string {\n    return `Hello, ${name}!`;\n}\n\nconsole.log(greet(\"Hanogt\"));\n" },
    { id: "python", label: { TR: "Python", EN: "Python" }, fileName: "script.py", code: "def main():\n    print(\"Hello from Hanogt!\")\n\n\nif __name__ == \"__main__\":\n    main()\n" },
    { id: "csharp", label: { TR: "C# sınıfı", EN: "C# class" }, fileName: "Program.cs", code: "using System;\n\nclass Program\n{\n    static void Main()\n    {\n        Console.WriteLine(\"Hello from Hanogt!\");\n    }\n}\n" },
    { id: "html", label: { TR: "HTML sayfası", EN: "HTML page" }, fileName: "index.html", code: "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n    <meta charset=\"UTF-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n    <title>Hanogt</title>\n</head>\n<body>\n    <h1>Hello from Hanogt!</h1>\n</body>\n</html>\n" },
    { id: "css", label: { TR: "CSS stil dosyası", EN: "CSS stylesheet" }, fileName: "style.css", code: ":root {\n    color-scheme: light dark;\n    font-family: system-ui, sans-serif;\n}\n\nbody {\n    margin: 0;\n    padding: 2rem;\n}\n" },
    { id: "json", label: { TR: "JSON verisi", EN: "JSON data" }, fileName: "data.json", code: "{\n    \"name\": \"hanogt\",\n    \"items\": []\n}\n" },
    { id: "sql", label: { TR: "SQL sorgusu", EN: "SQL query" }, fileName: "query.sql", code: "CREATE TABLE members (\n    id INTEGER PRIMARY KEY,\n    name TEXT NOT NULL\n);\n\nINSERT INTO members (name) VALUES ('Hanogt');\n\nSELECT * FROM members;\n" },
];

/* -------------------------------------------------------------------------- */
/* Messages                                                                   */
/* -------------------------------------------------------------------------- */

export type GroupSystemEvent = "welcome" | "member_joined" | "member_left" | "owner_changed";

/** Stored with `{name}`; rendered in each reader's language. */
export const GROUP_SYSTEM_EVENT_COPY: Record<Exclude<GroupSystemEvent, "welcome">, Copy> = {
    member_joined: { TR: "{name} gruba katıldı. Hoş geldin! 👋", EN: "{name} joined the group. Welcome! 👋" },
    member_left: { TR: "{name} gruptan ayrıldı.", EN: "{name} left the group." },
    owner_changed: { TR: "Grup sahipliği {name} kullanıcısına devredildi. 👑", EN: "Group ownership was transferred to {name}. 👑" },
};

export function isSystemEvent(value: unknown): value is GroupSystemEvent {
    return value === "welcome" || value === "member_joined" || value === "member_left" || value === "owner_changed";
}

export type MessageSegment =
    | { kind: "text"; text: string }
    | { kind: "mention"; text: string; username: string; everyone: boolean }
    | { kind: "topic"; text: string; topic: string }
    | { kind: "link"; text: string; href: string };

const WORD_CHAR = /[\p{L}\p{N}_]/u;
const EVERYONE_WORDS = ["everyone", "herkes"];

function isWordChar(char: string | undefined) {
    return Boolean(char) && WORD_CHAR.test(char as string);
}

/**
 * Splits message text into plain text, @mentions (only real member names or
 * @everyone/@herkes), #topics and http(s) links. Usernames may contain spaces,
 * so the longest matching member name wins.
 */
export function tokenizeMessage(text: string, usernames: readonly string[]): MessageSegment[] {
    const names = [...new Set(usernames.map((name) => name.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
    const segments: MessageSegment[] = [];
    let buffer = "";
    const flush = () => {
        if (buffer) segments.push({ kind: "text", text: buffer });
        buffer = "";
    };
    let index = 0;
    while (index < text.length) {
        const char = text[index];
        const boundary = index === 0 || !isWordChar(text[index - 1]);
        if (char === "@" && boundary) {
            const rest = text.slice(index + 1);
            const everyone = EVERYONE_WORDS.find((word) => rest.slice(0, word.length).toLowerCase() === word && !isWordChar(rest[word.length]));
            if (everyone) {
                flush();
                segments.push({ kind: "mention", text: `@${rest.slice(0, everyone.length)}`, username: everyone, everyone: true });
                index += everyone.length + 1;
                continue;
            }
            const name = names.find((candidate) => rest.slice(0, candidate.length).toLocaleLowerCase() === candidate.toLocaleLowerCase() && !isWordChar(rest[candidate.length]));
            if (name) {
                flush();
                segments.push({ kind: "mention", text: `@${rest.slice(0, name.length)}`, username: name, everyone: false });
                index += name.length + 1;
                continue;
            }
        }
        if (char === "#" && boundary) {
            const match = /^[\p{L}\p{N}_-]{1,24}/u.exec(text.slice(index + 1));
            if (match && !isWordChar(text[index + 1 + match[0].length])) {
                flush();
                segments.push({ kind: "topic", text: `#${match[0]}`, topic: match[0].toLocaleLowerCase() });
                index += match[0].length + 1;
                continue;
            }
        }
        if ((char === "h" || char === "H") && boundary) {
            const match = /^https?:\/\/[^\s<>"'`]+/i.exec(text.slice(index));
            if (match) {
                const url = match[0].replace(/[)\].,;:!?]+$/, "");
                if (url.length > 8) {
                    flush();
                    segments.push({ kind: "link", text: url, href: url });
                    index += url.length;
                    continue;
                }
            }
        }
        buffer += char;
        index += 1;
    }
    flush();
    return segments;
}

/** True when the text mentions `username` (or everyone). */
export function mentionsUser(text: string, username: string, usernames: readonly string[]) {
    const own = username.trim().toLocaleLowerCase();
    if (!own || !text.includes("@")) return false;
    return tokenizeMessage(text, usernames).some((segment) => segment.kind === "mention" && (segment.everyone || segment.username.toLocaleLowerCase() === own));
}

/* -------------------------------------------------------------------------- */
/* API contracts                                                              */
/* -------------------------------------------------------------------------- */

export type GroupErrorCode =
    | "unauthorized" | "forbidden_origin" | "rate_limited" | "invalid_request" | "payload_too_large"
    | "invalid_id" | "invalid_email" | "not_found" | "forbidden" | "self_action"
    | "name_too_short" | "name_too_long" | "description_too_long" | "rules_too_long"
    | "invalid_template" | "invalid_color" | "invalid_emoji" | "invalid_topics"
    | "project_not_found" | "group_limit" | "target_group_limit" | "group_full" | "not_friend" | "user_not_found"
    | "invites_disabled" | "invite_not_found" | "banned" | "target_banned" | "target_not_member"
    | "cannot_remove_owner" | "cannot_remove_admin" | "owner_cannot_leave" | "confirm_mismatch"
    | "link_not_found" | "link_expired" | "link_exhausted" | "link_limit" | "invalid_expiry" | "invalid_max_uses"
    | "message_not_found" | "pin_limit" | "invalid_reaction" | "conflict" | "server_error"
    | "muted" | "slowmode" | "automod_blocked" | "cannot_moderate" | "invalid_command"
    | "commands_limit" | "words_limit";

export type GroupLanguage = "tr" | "en";

export type GroupListItem = {
    id: string;
    name: string;
    description: string;
    emoji: string;
    color: GroupColor;
    template: GroupTemplateId | null;
    role: GroupRole;
    memberCount: number;
    projectName: string;
    createdAt: string | null;
    updatedAt: string | null;
    lastMessageAt: string | null;
    lastMessageFromMe: boolean;
    members: Array<{ username: string; avatarUrl: string | null }>;
};

export type GroupInvitationItem = {
    id: string;
    groupId: string;
    groupName: string;
    groupEmoji: string;
    groupColor: GroupColor;
    memberCount: number;
    fromEmail: string;
    fromName: string;
    fromAvatar: string | null;
    expiresAt: string | null;
};

export type GroupListResponse = { groups: GroupListItem[]; invites: GroupInvitationItem[] };

export type GroupInfo = {
    id: string;
    name: string;
    description: string;
    emoji: string;
    color: GroupColor;
    rules: string;
    topics: string[];
    template: GroupTemplateId | null;
    contentLanguage: GroupLanguage;
    ownerEmail: string;
    admins: string[];
    members: string[];
    projectName: string;
    createdAt: string | null;
    updatedAt: string | null;
    pinnedMessageIds: string[];
    allowMemberInvites: boolean;
    onboarding: { dismissed: boolean; callStarted: boolean };
    moderators: string[];
    /** Seconds between two messages of one person, per channel ("" is the main channel). */
    slowmode: Record<string, number>;
    /** Hanogt AI answers /ai and @Hanogt AI in this group. */
    aiBot: boolean;
    /** Posted by the Hanogt Security Bot when someone joins ("{name}" is replaced); empty: none. */
    welcomeMessage: string;
    customCommands: CustomCommand[];
};

export type GroupMemberInfo = {
    email: string;
    username: string;
    avatarUrl: string | null;
    /** `nickname#tag` lets members send each other friend requests. */
    nickname: string;
    nicknameTag: string;
    customStatus: string;
    /** effectiveStatus() of the public profile when the detail was read. */
    status: PresenceStatus;
    /** status !== "offline" (kept for older readers). */
    online: boolean;
    lastSeenAt: string | null;
    role: GroupRole;
    key: string;
    isFriend: boolean;
    /** Hanogt team badge (server-written public_profiles/{email}.staffRole), not the role in the group. */
    staffRole?: "owner" | "admin" | "moderator" | null;
};

export type GroupDetailResponse = {
    group: GroupInfo;
    members: GroupMemberInfo[];
    me: { email: string; role: GroupRole; key: string };
    /** Only for owners/admins. */
    stats: { pendingInvites: number; activeLinks: number } | null;
    banned: Array<{ email: string; username: string }>;
    /** What the group holds by its owner's plan (members, pins, commands, banned words); the plan itself isn't sent. */
    limits: GroupPlanLimits;
};

export type GroupInviteLinkInfo = {
    token: string;
    createdByName: string;
    createdByMe: boolean;
    createdAt: string | null;
    expiresAt: string | null;
    maxUses: number;
    uses: number;
};

export type GroupFriendCandidate = {
    email: string;
    username: string;
    avatarUrl: string | null;
    online: boolean;
    status: "available" | "member" | "invited" | "banned";
};

export type GroupPendingInvite = {
    email: string;
    username: string;
    avatarUrl: string | null;
    invitedByName: string;
    invitedByMe: boolean;
    expiresAt: string | null;
};

export type GroupInvitesResponse = {
    canInviteFriends: boolean;
    canManageLinks: boolean;
    canCreatePermanentLinks: boolean;
    friends: GroupFriendCandidate[];
    pending: GroupPendingInvite[];
    links: GroupInviteLinkInfo[];
};

export type GroupJoinPreview = {
    groupId: string;
    name: string;
    description: string;
    emoji: string;
    color: GroupColor;
    template: GroupTemplateId | null;
    memberCount: number;
    membersMax: number;
    inviter: { username: string; avatarUrl: string | null };
    expiresAt: string | null;
    alreadyMember: boolean;
    full: boolean;
    banned: boolean;
};

/* -------------------------------------------------------------------------- */
/* Templates                                                                  */
/* -------------------------------------------------------------------------- */

export type GroupTemplateId = "blank" | "study" | "gamejam" | "opensource" | "classroom" | "hackathon";
export type SeedLanguage = GroupLanguage;

export type GroupTemplate = {
    id: GroupTemplateId;
    emoji: string;
    color: GroupColor;
    name: Copy;
    description: Copy;
    /** Pinned welcome message; `{group}` is the group name. Only universal file names are mentioned. */
    welcome: Copy;
    /** Files created on day one (TR and EN content may use localized names). */
    files: { tr: readonly string[]; en: readonly string[] };
    topics: { tr: readonly string[]; en: readonly string[] };
};

export const GROUP_TEMPLATES: readonly GroupTemplate[] = [
    {
        id: "blank",
        emoji: "👥",
        color: "indigo",
        name: { TR: "Boş grup", EN: "Blank group" },
        description: { TR: "Sade bir başlangıç: kullanım rehberi, tek bir kod dosyası ve genel sohbet.", EN: "A clean start: a how-to guide, a single code file and a general chat." },
        welcome: { TR: "👋 {group} grubuna hoş geldiniz! Soldaki dosyalarda birlikte kod yazabilir, bu sohbette yazılı veya sesli mesajlaşabilirsiniz. Başlamak için README.md dosyasına göz atın.", EN: "👋 Welcome to {group}! Write code together in the files on the left and chat here with text or voice messages. Take a look at README.md to get started." },
        files: { tr: ["README.md", "main.js"], en: ["README.md", "main.js"] },
        topics: { tr: ["genel"], en: ["general"] },
    },
    {
        id: "study",
        emoji: "📚",
        color: "emerald",
        name: { TR: "Çalışma grubu", EN: "Study group" },
        description: { TR: "Haftalık plan, ortak notlar, kaynak listesi ve kendini kontrol eden Python alıştırmaları.", EN: "A weekly plan, shared notes, a resource list and self-checking Python exercises." },
        welcome: { TR: "📚 {group} çalışma grubuna hoş geldiniz! Haftalık plan TODO.md dosyasında. Kuralları okuyun, sorularınızı çekinmeden sorun ve öğrendiklerinizi paylaşın.", EN: "📚 Welcome to the {group} study group! The weekly plan lives in TODO.md. Read the rules, ask questions freely and share what you learn." },
        files: { tr: ["README.md", "KURALLAR.md", "TODO.md", "notlar.md", "kaynaklar.md", "alistirma.py"], en: ["README.md", "RULES.md", "TODO.md", "notes.md", "resources.md", "practice.py"] },
        topics: { tr: ["genel", "sorular", "kaynaklar", "sınav"], en: ["general", "questions", "resources", "exams"] },
    },
    {
        id: "gamejam",
        emoji: "🎮",
        color: "fuchsia",
        name: { TR: "Oyun geliştirme (Game jam)", EN: "Game dev (Game jam)" },
        description: { TR: "Oyun tasarım belgesi, Hanogt Oyun Motoru için C# oyuncu scripti ve tarayıcıda çalışan prototip.", EN: "A game design document, a C# player script for the Hanogt Engine and a browser prototype." },
        welcome: { TR: "🎮 {group} jam takımına hoş geldiniz! Oyun fikrini game_design.md dosyasında şekillendirin, görevleri TODO.md dosyasından paylaşın. İyi jamler!", EN: "🎮 Welcome to the {group} jam team! Shape the game idea in game_design.md and split the work in TODO.md. Happy jamming!" },
        files: { tr: ["README.md", "KURALLAR.md", "TODO.md", "game_design.md", "PlayerController.cs", "prototype.html"], en: ["README.md", "RULES.md", "TODO.md", "game_design.md", "PlayerController.cs", "prototype.html"] },
        topics: { tr: ["genel", "tasarım", "kod", "sanat", "ses"], en: ["general", "design", "code", "art", "audio"] },
    },
    {
        id: "opensource",
        emoji: "🌍",
        color: "sky",
        name: { TR: "Açık kaynak proje", EN: "Open-source project" },
        description: { TR: "Proje README'si, katkı rehberi, davranış kuralları, yol haritası, MIT lisansı ve örnek bir modül.", EN: "A project README, contribution guide, code of conduct, roadmap, MIT license and a sample module." },
        welcome: { TR: "🌍 {group} projesine hoş geldiniz! README.md projeyi, CONTRIBUTING.md katkı sürecini, TODO.md yol haritasını anlatıyor. İlk katkınızı bekliyoruz!", EN: "🌍 Welcome to {group}! README.md describes the project, CONTRIBUTING.md the contribution flow and TODO.md the roadmap. We can't wait for your first contribution!" },
        files: { tr: ["README.md", "CONTRIBUTING.md", "KURALLAR.md", "TODO.md", "LICENSE", "index.js", "package.json"], en: ["README.md", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "TODO.md", "LICENSE", "index.js", "package.json"] },
        topics: { tr: ["genel", "hatalar", "özellikler", "inceleme", "sürümler"], en: ["general", "bugs", "features", "reviews", "releases"] },
    },
    {
        id: "classroom",
        emoji: "🎓",
        color: "amber",
        name: { TR: "Sınıf", EN: "Classroom" },
        description: { TR: "Ders planı, ilk ders notları ve otomatik kontrollü ilk ödev ile hazır bir sınıf alanı.", EN: "A ready classroom with a syllabus, first lesson notes and an auto-checked first assignment." },
        welcome: { TR: "🎓 {group} sınıfına hoş geldiniz! Ders planı TODO.md dosyasında; ilk ders notları ve ödev dosyası soldaki listede. Sorularınızı bu sohbette sorabilirsiniz.", EN: "🎓 Welcome to the {group} class! The syllabus is in TODO.md; the first lesson notes and assignment are in the file list. Ask your questions here in the chat." },
        files: { tr: ["README.md", "KURALLAR.md", "TODO.md", "ders-01.md", "odev-01.py"], en: ["README.md", "RULES.md", "TODO.md", "lesson-01.md", "assignment-01.py"] },
        topics: { tr: ["duyurular", "ödevler", "sorular", "kaynaklar"], en: ["announcements", "homework", "questions", "resources"] },
    },
    {
        id: "hackathon",
        emoji: "⚡",
        color: "violet",
        name: { TR: "Hackathon takımı", EN: "Hackathon team" },
        description: { TR: "Zaman çizelgesi, rol dağılımı, 3 dakikalık sunum taslağı ve çalışan bir web MVP'si.", EN: "A timeline, role split, a 3-minute pitch outline and a working web MVP." },
        welcome: { TR: "⚡ {group} takımına hoş geldiniz! Zaman çizelgesi TODO.md dosyasında, sunum taslağı pitch.md dosyasında. Hızlı karar verin, sık kaydedin ve eğlenin!", EN: "⚡ Welcome to team {group}! The timeline is in TODO.md and the pitch outline in pitch.md. Decide fast, save often and have fun!" },
        files: { tr: ["README.md", "KURALLAR.md", "TODO.md", "pitch.md", "index.html", "style.css", "app.js"], en: ["README.md", "RULES.md", "TODO.md", "pitch.md", "index.html", "style.css", "app.js"] },
        topics: { tr: ["genel", "fikirler", "görevler", "sunum", "demo"], en: ["general", "ideas", "tasks", "pitch", "demo"] },
    },
];

export const GROUP_TEMPLATE_IDS = GROUP_TEMPLATES.map((template) => template.id);

export function isGroupTemplateId(value: unknown): value is GroupTemplateId {
    return typeof value === "string" && GROUP_TEMPLATES.some((template) => template.id === value);
}

export function getGroupTemplate(id: unknown): GroupTemplate {
    return GROUP_TEMPLATES.find((template) => template.id === id) ?? GROUP_TEMPLATES[0];
}

/** Group content (starter files, system texts) is written in Turkish for Turkish UIs, English otherwise. */
export function seedLanguageFor(language: unknown): SeedLanguage {
    return typeof language === "string" && language.trim().toUpperCase() === "TR" ? "tr" : "en";
}

/* -------------------------------------------------------------------------- */
/* Template content                                                           */
/* -------------------------------------------------------------------------- */

export type GroupSeedContext = { groupName: string; ownerName: string; date: string; year: number };
export type GroupSeed = {
    files: Array<{ name: string; code: string }>;
    rules: string;
    topics: string[];
    projectName: string;
    welcomeText: string;
};

type SeedFile = { name: string; code: string };
type TopicNote = { topic: string; about: string };

function escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char] as string));
}

function packageName(groupName: string) {
    const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };
    const slug = groupName
        .toLocaleLowerCase("tr-TR")
        .replace(/[çğıöşü]/g, (char) => map[char] ?? char)
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 50);
    return slug || "hanogt-project";
}

function topicList(notes: TopicNote[]) {
    return notes.map((note) => `- \`#${note.topic}\` — ${note.about}`).join("\n");
}

function checklist(items: string[]) {
    return items.map((item) => `- [ ] ${item}`).join("\n");
}

function guideTable(lang: SeedLanguage) {
    return lang === "tr"
        ? `| Bölüm | Ne işe yarar? |
| --- | --- |
| 📁 **Dosyalar** | Soldaki listeden bir dosya seç. Yazdıkların birkaç saniye içinde otomatik kaydedilir ve diğer üyelerin ekranında canlı güncellenir. |
| 💬 **Sohbet** | Yazılı veya sesli mesaj gönder. Birini anmak için \`@kullanıcıadı\`, mesajını bir konuyla etiketlemek için \`#konu\` yaz. |
| 📌 **Sabitlenenler** | Yöneticilerin sabitlediği önemli mesajlar tek bir yerde toplanır. |
| 📞 **Sesli arama** | Üyeler listesinden arkadaşın olan üyeleri tek tıkla sesli arayabilirsin. |
| ✉️ **Davet** | Arkadaşlarını davet et; yöneticiler süreli ve sınırlı kullanımlı davet bağlantıları da oluşturabilir. |
| 📦 **İndir ve çalıştır** | Tüm dosyaları ZIP olarak indir ya da bir dosyanın kopyasını Düzenleyici'de açıp çalıştır. |`
        : `| Area | What it's for |
| --- | --- |
| 📁 **Files** | Pick a file from the list on the left. Everything you type is saved automatically within seconds and updates live for every member. |
| 💬 **Chat** | Send text or voice messages. Type \`@username\` to mention someone and \`#topic\` to tag your message. |
| 📌 **Pinned** | Important messages pinned by admins are collected in one place. |
| 📞 **Voice calls** | Call members who are also your friends with one click from the member list. |
| ✉️ **Invites** | Invite your friends; admins can also create invite links that expire and have a use limit. |
| 📦 **Download & run** | Download every file as a ZIP, or open a copy of a file in the Editor and run it. |`;
}

function readme(lang: SeedLanguage, ctx: GroupSeedContext, options: { emoji: string; intro: string; body?: string; topics: TopicNote[]; steps: string[]; extra?: string }) {
    const tr = lang === "tr";
    return `# ${options.emoji} ${ctx.groupName}

${options.intro}

- **${tr ? "Kurucu" : "Founder"}:** ${ctx.ownerName}
- **${tr ? "Oluşturulma" : "Created"}:** ${ctx.date}
${options.body ? `\n${options.body}\n` : ""}
## 🧭 ${tr ? "Bu grubu nasıl kullanırım?" : "How do I use this group?"}

${guideTable(lang)}

## 🏷️ ${tr ? "Konular" : "Topics"}

${tr ? "Mesajlarını bir konuyla etiketlersen sohbet düzenli kalır ve konuya tıklayarak filtreleyebilirsin:" : "Tag your messages with a topic to keep the chat tidy; click a topic to filter the conversation:"}

${topicList(options.topics)}

## ✅ ${tr ? "İlk adımlar" : "First steps"}

${checklist(options.steps)}
${options.extra ? `\n${options.extra}\n` : ""}
---
_${tr ? "Bu dosya grup oluşturulurken otomatik hazırlandı; dilediğin gibi düzenleyebilirsin." : "This file was generated when the group was created; edit it however you like."}_
`;
}

const BASE_RULES: Record<SeedLanguage, string[]> = {
    tr: [
        "Herkese saygılı ve yapıcı ol; kişiyi değil fikri eleştir.",
        "Hakaret, taciz, ayrımcılık ve spam yasaktır.",
        "Kişisel bilgileri, parolaları ve API anahtarlarını paylaşma.",
        "Başkasının dosyasında büyük bir değişiklik yapmadan önce sohbette haber ver.",
        "Mesajlarını uygun #konu ile etiketle; @herkes bahsini yalnızca önemli duyurular için kullan.",
    ],
    en: [
        "Be respectful and constructive; criticize ideas, not people.",
        "Insults, harassment, discrimination and spam are not allowed.",
        "Never share personal data, passwords or API keys.",
        "Tell the chat before making a big change in someone else's file.",
        "Tag your messages with the right #topic; use @everyone only for important announcements.",
    ],
};

function rulesSummary(lang: SeedLanguage, extra: string[]) {
    return [...BASE_RULES[lang], ...extra].map((rule, index) => `${index + 1}. ${rule}`).join("\n");
}

function rulesFile(lang: SeedLanguage, ctx: GroupSeedContext, extraTitle: string, extra: string[]) {
    const tr = lang === "tr";
    const list = (items: string[], start: number) => items.map((item, index) => `${start + index}. ${item}`).join("\n");
    return tr
        ? `# 📜 ${ctx.groupName} · Grup Kuralları

Bu kurallar grubu herkes için güvenli, verimli ve keyifli tutmak için var. Gruba katılan herkes bu kuralları kabul etmiş sayılır.

## 🤝 Saygı
${list(["Herkese nazik ve yapıcı ol; kişiyi değil fikri eleştir.", "Hakaret, taciz, ayrımcılık ve spam kesinlikle yasaktır.", "Başkalarının kişisel bilgilerini (e-posta, telefon, adres) paylaşma."], 1)}

## 💻 Kod ve dosyalar
${list(["Başkasının dosyasında büyük bir değişiklik yapmadan önce sohbette haber ver.", "Parola, API anahtarı veya gizli bilgi içeren kod paylaşma.", "Başka bir yerden aldığın kodun kaynağını ve lisansını belirt."], 4)}

## 💬 Sohbet
${list(["Mesajlarını uygun `#konu` ile etiketle.", "Soru sormadan önce sabitlenen mesajlara ve README.md dosyasına göz at.", "`@herkes` bahsini yalnızca gerçekten önemli duyurular için kullan."], 7)}

## ${extraTitle}
${list(extra, 10)}

## 🛡️ Yaptırımlar
Kurallara uymayan üyeler önce uyarılır. Tekrarında yöneticiler üyeyi gruptan çıkarabilir veya gruba yeniden katılmasını engelleyebilir.
`
        : `# 📜 ${ctx.groupName} · Group Rules

These rules keep the group safe, productive and fun for everyone. Everyone who joins the group agrees to them.

## 🤝 Respect
${list(["Be kind and constructive; criticize ideas, not people.", "Insults, harassment, discrimination and spam are strictly forbidden.", "Never share other people's personal data (e-mail, phone, address)."], 1)}

## 💻 Code and files
${list(["Tell the chat before making a big change in someone else's file.", "Never share code that contains passwords, API keys or other secrets.", "Credit the source and license of code you copy from elsewhere."], 4)}

## 💬 Chat
${list(["Tag your messages with the right `#topic`.", "Check the pinned messages and README.md before asking a question.", "Use `@everyone` only for truly important announcements."], 7)}

## ${extraTitle}
${list(extra, 10)}

## 🛡️ Enforcement
Members who break the rules get a warning first. If it happens again, admins may remove the member and block them from rejoining.
`;
}

function blankSeed(lang: SeedLanguage, ctx: GroupSeedContext): { files: SeedFile[]; rules: string } {
    const tr = lang === "tr";
    return {
        rules: "",
        files: [
            {
                name: "README.md",
                code: readme(lang, ctx, {
                    emoji: "👥",
                    intro: tr
                        ? `**${ctx.groupName}** grubuna hoş geldin! Bu çalışma alanı Hanogt Codev üzerinde birlikte kod yazmak, konuşmak ve üretmek için kuruldu.`
                        : `Welcome to **${ctx.groupName}**! This workspace was set up to write code, talk and build things together on Hanogt Codev.`,
                    topics: [{ topic: tr ? "genel" : "general", about: tr ? "Her türlü sohbet, duyuru ve soru." : "Any conversation, announcement or question." }],
                    steps: tr
                        ? ["Sohbette kendini tanıt.", "Grubun amacını bu dosyaya birkaç cümleyle yaz.", "`main.js` dosyasını düzenle ya da yeni bir dosya oluştur."]
                        : ["Introduce yourself in the chat.", "Describe the purpose of the group in a few sentences in this file.", "Edit `main.js` or create a new file."],
                }),
            },
            {
                name: "main.js",
                code: tr
                    ? `// ${ctx.groupName} · ortak başlangıç dosyası
// Bu dosyayı düzenle; değişiklikler tüm üyelere canlı olarak yansır.

function selamla(isim) {
    return "Merhaba " + isim + "! Gruba hoş geldin.";
}

console.log(selamla("dünya"));
`
                    : `// ${ctx.groupName} · shared starter file
// Edit this file; every change shows up live for all members.

function greet(name) {
    return "Hello " + name + "! Welcome to the group.";
}

console.log(greet("world"));
`,
            },
        ],
    };
}

function studySeed(lang: SeedLanguage, ctx: GroupSeedContext): { files: SeedFile[]; rules: string } {
    const tr = lang === "tr";
    const extra = tr
        ? ["Çözümü değil yolu paylaş; ödevleri birbirinizden kopyalamayın.", "Oturumlara zamanında katıl, katılamayacaksan önceden haber ver."]
        : ["Share the path, not the answer; don't copy each other's homework.", "Join sessions on time and let the group know in advance if you can't make it."];
    return {
        rules: rulesSummary(lang, extra),
        files: [
            {
                name: "README.md",
                code: readme(lang, ctx, {
                    emoji: "📚",
                    intro: tr
                        ? `**${ctx.groupName}** çalışma grubuna hoş geldin! Burada birlikte düzenli çalışıyor, soru soruyor ve öğrendiklerimizi paylaşıyoruz.`
                        : `Welcome to the **${ctx.groupName}** study group! This is where we study together regularly, ask questions and share what we learn.`,
                    topics: tr
                        ? [{ topic: "genel", about: "Duyurular ve günlük sohbet." }, { topic: "sorular", about: "Takıldığın her şey; soru sormaktan çekinme." }, { topic: "kaynaklar", about: "Faydalı bağlantılar, videolar ve kitaplar." }, { topic: "sınav", about: "Sınav tarihleri, konu listeleri ve deneme soruları." }]
                        : [{ topic: "general", about: "Announcements and everyday chat." }, { topic: "questions", about: "Anything you are stuck on; don't be shy." }, { topic: "resources", about: "Useful links, videos and books." }, { topic: "exams", about: "Exam dates, topic lists and practice questions." }],
                    steps: tr
                        ? ["Sohbette kendini ve hedefini tanıt.", "KURALLAR.md dosyasını oku.", "TODO.md dosyasından bu haftanın bir görevini üstlen.", "`alistirma.py` dosyasını Düzenleyici'de açıp çalıştır."]
                        : ["Introduce yourself and your goal in the chat.", "Read RULES.md.", "Pick one of this week's tasks from TODO.md.", "Open `practice.py` in the Editor and run it."],
                    extra: tr
                        ? `## 📅 Haftalık ritim

| Gün | Ne yapıyoruz? |
| --- | --- |
| Pazartesi | Haftanın konusunu seçiyor, görevleri TODO.md dosyasına yazıyoruz. |
| Çarşamba | Ara kontrol: takıldığımız yerleri \`#sorular\` konusunda paylaşıyoruz. |
| Cuma | Kısa bir sesli görüşmeyle haftayı değerlendiriyor, özetleri \`notlar.md\` dosyasına ekliyoruz. |`
                        : `## 📅 Weekly rhythm

| Day | What we do |
| --- | --- |
| Monday | Pick the topic of the week and write the tasks into TODO.md. |
| Wednesday | Check-in: share where you are stuck under \`#questions\`. |
| Friday | Review the week in a short voice call and add summaries to \`notes.md\`. |`,
                }),
            },
            { name: tr ? "KURALLAR.md" : "RULES.md", code: rulesFile(lang, ctx, tr ? "📚 Çalışma düzeni" : "📚 Study habits", extra) },
            {
                name: "TODO.md",
                code: tr
                    ? `# ✅ Yapılacaklar

## Bu hafta
- [ ] Haftanın konusunu belirle (sorumlu: …)
- [ ] \`alistirma.py\` dosyasındaki alıştırmaları çöz
- [ ] Öğrendiklerini \`notlar.md\` dosyasına özetle
- [ ] Çarşamba ara kontrolüne katıl

## Gelecek hafta
- [ ] Yeni konu için kaynak bul ve \`kaynaklar.md\` dosyasına ekle
- [ ] Deneme sınavı hazırla

## Tamamlananlar
- [x] Çalışma grubunu kur (${ctx.date})
`
                    : `# ✅ To-do

## This week
- [ ] Choose the topic of the week (owner: …)
- [ ] Solve the exercises in \`practice.py\`
- [ ] Summarize what you learned in \`notes.md\`
- [ ] Join the Wednesday check-in

## Next week
- [ ] Find resources for the next topic and add them to \`resources.md\`
- [ ] Prepare a practice exam

## Done
- [x] Set up the study group (${ctx.date})
`,
            },
            {
                name: tr ? "notlar.md" : "notes.md",
                code: tr
                    ? `# 📝 Ortak Notlar

Her oturumdan sonra buraya kısa bir özet ekleyin. En yeni not en üstte dursun.

---

## ${ctx.date} · Konu: …
**Hazırlayan:** …

### Özet
- …

### Anahtar kavramlar
| Kavram | Açıklama |
| --- | --- |
| … | … |

### Açık sorular
- [ ] …
`
                    : `# 📝 Shared Notes

Add a short summary here after every session. Keep the newest note at the top.

---

## ${ctx.date} · Topic: …
**Written by:** …

### Summary
- …

### Key concepts
| Concept | Explanation |
| --- | --- |
| … | … |

### Open questions
- [ ] …
`,
            },
            {
                name: tr ? "kaynaklar.md" : "resources.md",
                code: tr
                    ? `# 🔗 Kaynaklar

Faydalı bulduğun her kaynağı kısa bir notla ekle.

## Başlangıç
- [Hanogt Rehber](/guide) — platformdaki dillere ve araçlara hızlı giriş
- [MDN Web Docs](https://developer.mozilla.org/tr/) — HTML, CSS ve JavaScript başvuru kaynağı
- [Python resmi eğitimi](https://docs.python.org/3/tutorial/) — Python'a adım adım giriş

## Dersler ve alıştırmalar
- [CS50x](https://cs50.harvard.edu/x/) — Harvard'ın ücretsiz bilgisayar bilimine giriş dersi
- [freeCodeCamp](https://www.freecodecamp.org/learn/) — sertifikalı, uygulamalı müfredat
- [Exercism](https://exercism.org/) — mentor destekli alıştırmalar

## Görsel öğrenme
- [VisuAlgo](https://visualgo.net/) — algoritmalar ve veri yapıları animasyonlarla
- [roadmap.sh](https://roadmap.sh/) — alan alan öğrenme yol haritaları
`
                    : `# 🔗 Resources

Add every resource you find useful with a short note.

## Getting started
- [Hanogt Guide](/guide) — quick intro to the languages and tools on the platform
- [MDN Web Docs](https://developer.mozilla.org/en-US/) — the HTML, CSS and JavaScript reference
- [Official Python tutorial](https://docs.python.org/3/tutorial/) — a step-by-step introduction to Python

## Courses and exercises
- [CS50x](https://cs50.harvard.edu/x/) — Harvard's free introduction to computer science
- [freeCodeCamp](https://www.freecodecamp.org/learn/) — a hands-on curriculum with certificates
- [Exercism](https://exercism.org/) — exercises with mentor feedback

## Visual learning
- [VisuAlgo](https://visualgo.net/) — algorithms and data structures, animated
- [roadmap.sh](https://roadmap.sh/) — learning roadmaps for every field
`,
            },
            {
                name: tr ? "alistirma.py" : "practice.py",
                code: tr
                    ? `"""${ctx.groupName} · haftalık alıştırmalar

Her fonksiyonun altında örnek bir çözüm var. Önce kendi çözümünü yazmayı dene,
sonra dosyayı çalıştır: tüm kontroller geçerse ekranda ✓ işaretleri görürsün.
"""


def toplam(sayilar):
    """Listedeki sayıların toplamını döndürür. Örnek: toplam([1, 2, 3]) -> 6"""
    sonuc = 0
    for sayi in sayilar:
        sonuc += sayi
    return sonuc


def en_buyuk(sayilar):
    """Listedeki en büyük sayıyı döndürür; liste boşsa None döndürür."""
    if not sayilar:
        return None
    buyuk = sayilar[0]
    for sayi in sayilar[1:]:
        if sayi > buyuk:
            buyuk = sayi
    return buyuk


def palindrom_mu(metin):
    """Metin tersten de aynı okunuyorsa True döndürür (boşluk ve büyük/küçük harf önemsiz)."""
    temiz = "".join(harf.lower() for harf in metin if harf.isalnum())
    return temiz == temiz[::-1]


def kontrol_et():
    testler = [
        ("toplam", toplam([1, 2, 3]) == 6),
        ("en_buyuk", en_buyuk([4, 9, 2]) == 9 and en_buyuk([]) is None),
        ("palindrom_mu", palindrom_mu("Ey Edip Adana'da pide ye") and not palindrom_mu("Hanogt")),
    ]
    for ad, gecti in testler:
        print(("✓ " if gecti else "✗ ") + ad)
    if all(gecti for _, gecti in testler):
        print("Tebrikler, hepsi geçti!")
    else:
        print("Bazı kontroller geçmedi, tekrar dene.")


# Meydan okuma: sesli_harf_say(metin) fonksiyonunu yaz ve kontrol_et() içine bir test ekle.

if __name__ == "__main__":
    kontrol_et()
`
                    : `"""${ctx.groupName} · weekly practice

Every function comes with a sample solution. Try writing your own first,
then run the file: when every check passes you will see ✓ marks.
"""


def total(numbers):
    """Returns the sum of the numbers in the list. Example: total([1, 2, 3]) -> 6"""
    result = 0
    for number in numbers:
        result += number
    return result


def largest(numbers):
    """Returns the largest number in the list, or None for an empty list."""
    if not numbers:
        return None
    best = numbers[0]
    for number in numbers[1:]:
        if number > best:
            best = number
    return best


def is_palindrome(text):
    """True when the text reads the same backwards (ignoring spaces and case)."""
    clean = "".join(char.lower() for char in text if char.isalnum())
    return clean == clean[::-1]


def run_checks():
    checks = [
        ("total", total([1, 2, 3]) == 6),
        ("largest", largest([4, 9, 2]) == 9 and largest([]) is None),
        ("is_palindrome", is_palindrome("A man, a plan, a canal: Panama") and not is_palindrome("Hanogt")),
    ]
    for name, passed in checks:
        print(("✓ " if passed else "✗ ") + name)
    if all(passed for _, passed in checks):
        print("Congratulations, everything passed!")
    else:
        print("Some checks failed, try again.")


# Challenge: write count_vowels(text) and add a check for it in run_checks().

if __name__ == "__main__":
    run_checks()
`,
            },
        ],
    };
}

function gamejamSeed(lang: SeedLanguage, ctx: GroupSeedContext): { files: SeedFile[]; rules: string } {
    const tr = lang === "tr";
    const extra = tr
        ? ["Kullandığınız görsel, ses ve fontların lisansını kaynak göstererek not edin.", "Kapsamı küçük tutun: önce oynanabilir bir sürüm, sonra cila."]
        : ["Write down the license and source of every image, sound and font you use.", "Keep the scope small: first a playable build, then polish."];
    const title = escapeHtml(ctx.groupName);
    return {
        rules: rulesSummary(lang, extra),
        files: [
            {
                name: "README.md",
                code: readme(lang, ctx, {
                    emoji: "🎮",
                    intro: tr
                        ? `**${ctx.groupName}** oyun geliştirme takımına hoş geldin! Hedefimiz kısa sürede oynanabilir, eğlenceli bir oyun çıkarmak.`
                        : `Welcome to the **${ctx.groupName}** game dev team! Our goal is to ship a playable, fun game in a short time.`,
                    topics: tr
                        ? [{ topic: "genel", about: "Duyurular ve koordinasyon." }, { topic: "tasarım", about: "Oyun fikri, mekanikler ve seviye tasarımı." }, { topic: "kod", about: "Scriptler, hatalar ve teknik kararlar." }, { topic: "sanat", about: "Karakterler, arka planlar ve arayüz." }, { topic: "ses", about: "Müzik ve ses efektleri." }]
                        : [{ topic: "general", about: "Announcements and coordination." }, { topic: "design", about: "Game idea, mechanics and level design." }, { topic: "code", about: "Scripts, bugs and technical decisions." }, { topic: "art", about: "Characters, backgrounds and UI." }, { topic: "audio", about: "Music and sound effects." }],
                    steps: tr
                        ? ["Sohbette hangi rolü üstlenmek istediğini yaz.", "`game_design.md` dosyasındaki fikir bölümünü birlikte doldurun.", "`prototype.html` dosyasını Düzenleyici'de açıp çalıştır.", "`PlayerController.cs` dosyasını Hanogt Oyun Motoru'nda dene."]
                        : ["Tell the chat which role you'd like to take.", "Fill in the idea section of `game_design.md` together.", "Open `prototype.html` in the Editor and run it.", "Try `PlayerController.cs` in the Hanogt Game Engine."],
                    extra: tr
                        ? `## 🎯 Jam bilgileri

| | |
| --- | --- |
| **Tema** | _Henüz açıklanmadı — \`#tasarım\` konusunda duyurulacak._ |
| **Teslim** | _Tarih ve saat_ |
| **Motor** | [Hanogt Oyun Motoru](/game-engine) (C#/C++) veya \`prototype.html\` ile tarayıcı prototipi |

## 👥 Roller

| Rol | Kim? | Sorumluluk |
| --- | --- | --- |
| Tasarım | … | Oyun fikri, mekanikler, seviye tasarımı |
| Programlama | … | Oynanış kodu ve hata ayıklama |
| Sanat | … | Karakterler, arka planlar, arayüz |
| Ses | … | Müzik ve efektler |`
                        : `## 🎯 Jam info

| | |
| --- | --- |
| **Theme** | _Not announced yet — it will be posted under \`#design\`._ |
| **Deadline** | _Date and time_ |
| **Engine** | [Hanogt Game Engine](/game-engine) (C#/C++) or a browser prototype with \`prototype.html\` |

## 👥 Roles

| Role | Who? | Responsibility |
| --- | --- | --- |
| Design | … | Game idea, mechanics, level design |
| Programming | … | Gameplay code and debugging |
| Art | … | Characters, backgrounds, UI |
| Audio | … | Music and effects |`,
                }),
            },
            { name: tr ? "KURALLAR.md" : "RULES.md", code: rulesFile(lang, ctx, tr ? "🎮 Jam kuralları" : "🎮 Jam rules", extra) },
            {
                name: "TODO.md",
                code: tr
                    ? `# ✅ Jam planı

## Gün 0 · Fikir (ilk 2 saat)
- [ ] Temayı birlikte yorumla, 3 fikir çıkar ve oyla
- [ ] Çekirdek döngüyü tek cümleyle yaz (\`game_design.md\`)
- [ ] Rolleri dağıt

## Gün 1 · Prototip
- [ ] Oyuncu hareketi ve kamera
- [ ] Temel mekanik (toplama / kaçma / nişan alma…)
- [ ] Kazanma ve kaybetme koşulu
- [ ] İlk oynanabilir sürümü takımla test et

## Gün 2 · Cila ve teslim
- [ ] Görseller, müzik ve ses efektleri
- [ ] Ana menü ve "yeniden başla"
- [ ] Hata avı ve performans kontrolü
- [ ] Ekran görüntüleri, açıklama ve teslim

## Kesilecekler listesi (zaman yetmezse)
- …
`
                    : `# ✅ Jam plan

## Day 0 · Idea (first 2 hours)
- [ ] Interpret the theme together, pitch 3 ideas and vote
- [ ] Write the core loop in one sentence (\`game_design.md\`)
- [ ] Split the roles

## Day 1 · Prototype
- [ ] Player movement and camera
- [ ] Core mechanic (collect / dodge / aim…)
- [ ] Win and lose conditions
- [ ] Playtest the first playable build as a team

## Day 2 · Polish and submit
- [ ] Art, music and sound effects
- [ ] Main menu and "restart"
- [ ] Bug hunt and performance check
- [ ] Screenshots, description and submission

## Cut list (if time runs out)
- …
`,
            },
            {
                name: "game_design.md",
                code: tr
                    ? `# 🕹️ Oyun Tasarım Belgesi

## Tek cümlelik fikir
_Oyuncu … yaparak … ve … kaçınarak … kazanır._

## Çekirdek döngü
1. …
2. …
3. …

## Mekanikler
| Mekanik | Açıklama | Öncelik |
| --- | --- | --- |
| Hareket | … | Olmazsa olmaz |
| … | … | Olsa iyi olur |

## Kontroller
| Tuş | Eylem |
| --- | --- |
| ← → / A D | Yürü |
| Space | Zıpla |

## Görsel stil ve ses
- Renk paleti: …
- Esinlenilen oyunlar: …
- Müzik havası: …

## Seviye akışı
1. Öğretici bölüm
2. …

## Kapsam dışı
- …
`
                    : `# 🕹️ Game Design Document

## One-sentence pitch
_The player wins by … while avoiding … ._

## Core loop
1. …
2. …
3. …

## Mechanics
| Mechanic | Description | Priority |
| --- | --- | --- |
| Movement | … | Must have |
| … | … | Nice to have |

## Controls
| Key | Action |
| --- | --- |
| ← → / A D | Walk |
| Space | Jump |

## Art style and audio
- Colour palette: …
- Inspiring games: …
- Music mood: …

## Level flow
1. Tutorial level
2. …

## Out of scope
- …
`,
            },
            {
                name: "PlayerController.cs",
                code: `using UnityEngine;

// ${ctx.groupName} · ${tr ? "oyuncu kontrolcüsü" : "player controller"}
// ${tr ? "Hanogt Oyun Motoru'nda Rigidbody2D bileşeni olan bir nesneye ekle." : "Attach it to an object with a Rigidbody2D in the Hanogt Game Engine."}
// ${tr ? "Sol/sağ ok (veya A/D) ile yürü, Space veya W ile zıpla." : "Walk with the left/right arrows (or A/D), jump with Space or W."}
public class PlayerController : MonoBehaviour
{
    public float moveSpeed = 6f;
    public float jumpForce = 10f;

    private Rigidbody2D rb;
    private bool grounded;

    void Start()
    {
        rb = GetComponent<Rigidbody2D>();
    }

    void Update()
    {
        float h = Input.GetAxisRaw("Horizontal");
        rb.velocity = new Vector2(h * moveSpeed, rb.velocity.y);

        bool jumpPressed = Input.GetButtonDown("Jump") || Input.GetKeyDown(KeyCode.W);
        if (grounded && jumpPressed)
        {
            rb.velocity = new Vector2(rb.velocity.x, jumpForce);
            grounded = false;
        }
    }

    void OnCollisionStay2D(Collision2D collision)
    {
        // ${tr ? "Zeminin normali yukarı bakıyorsa karakter yerdedir." : "The character is grounded when the contact normal points up."}
        if (collision.GetContact(0).normal.y > 0.5f) grounded = true;
    }

    void OnCollisionExit2D(Collision2D collision)
    {
        grounded = false;
    }
}
`,
            },
            {
                name: "prototype.html",
                code: `<!DOCTYPE html>
<html lang="${tr ? "tr" : "en"}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} · ${tr ? "Prototip" : "Prototype"}</title>
    <style>
        body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b0b12; color: #f4f4f5; font-family: system-ui, sans-serif; }
        main { text-align: center; padding: 16px; }
        canvas { background: #151522; border-radius: 16px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45); max-width: 100%; }
        p { color: #a1a1aa; }
    </style>
</head>
<body>
    <main>
        <h1>${title}</h1>
        <canvas id="game" width="640" height="400"></canvas>
        <p>${tr ? "Ok tuşları veya WASD ile hareket et, sarı yıldızları topla. R ile yeniden başla." : "Move with the arrow keys or WASD and collect the yellow stars. Press R to restart."}</p>
    </main>
    <script>
        const canvas = document.getElementById("game");
        const ctx = canvas.getContext("2d");
        const keys = new Set();
        let player, star, score, timeLeft, last;

        function randomStar() {
            return { x: 30 + Math.random() * (canvas.width - 60), y: 30 + Math.random() * (canvas.height - 60), r: 10 };
        }

        function reset() {
            player = { x: canvas.width / 2, y: canvas.height / 2, size: 26, speed: 240 };
            star = randomStar();
            score = 0;
            timeLeft = 60;
            last = performance.now();
        }

        addEventListener("keydown", (event) => {
            const key = event.key.toLowerCase();
            keys.add(key);
            if (key === "r") reset();
        });
        addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));

        function update(dt) {
            if (timeLeft <= 0) return;
            timeLeft = Math.max(0, timeLeft - dt);
            const dx = (keys.has("arrowright") || keys.has("d") ? 1 : 0) - (keys.has("arrowleft") || keys.has("a") ? 1 : 0);
            const dy = (keys.has("arrowdown") || keys.has("s") ? 1 : 0) - (keys.has("arrowup") || keys.has("w") ? 1 : 0);
            const half = player.size / 2;
            player.x = Math.min(canvas.width - half, Math.max(half, player.x + dx * player.speed * dt));
            player.y = Math.min(canvas.height - half, Math.max(half, player.y + dy * player.speed * dt));
            if (Math.hypot(player.x - star.x, player.y - star.y) < half + star.r) {
                score += 1;
                star = randomStar();
            }
        }

        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "#facc15";
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#818cf8";
            ctx.fillRect(player.x - player.size / 2, player.y - player.size / 2, player.size, player.size);
            ctx.fillStyle = "#f4f4f5";
            ctx.font = "bold 18px system-ui";
            ctx.fillText("${tr ? "Skor" : "Score"}: " + score, 16, 28);
            ctx.fillText("${tr ? "Süre" : "Time"}: " + Math.ceil(timeLeft), canvas.width - 110, 28);
            if (timeLeft <= 0) {
                ctx.textAlign = "center";
                ctx.font = "bold 30px system-ui";
                ctx.fillText("${tr ? "Süre doldu! Skor" : "Time's up! Score"}: " + score, canvas.width / 2, canvas.height / 2);
                ctx.font = "16px system-ui";
                ctx.fillText("${tr ? "Yeniden başlamak için R" : "Press R to play again"}", canvas.width / 2, canvas.height / 2 + 32);
                ctx.textAlign = "start";
            }
        }

        function loop(now) {
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            update(dt);
            draw();
            requestAnimationFrame(loop);
        }

        reset();
        requestAnimationFrame(loop);
    </script>
</body>
</html>
`,
            },
        ],
    };
}

function opensourceSeed(lang: SeedLanguage, ctx: GroupSeedContext): { files: SeedFile[]; rules: string } {
    const tr = lang === "tr";
    const extra = tr
        ? ["Her değişikliği kısa bir açıklamayla duyurun ve CONTRIBUTING.md dosyasındaki akışa uyun.", "İncelemelerde nazik olun; her katkı bir öğrenme fırsatıdır."]
        : ["Announce every change with a short description and follow the flow in CONTRIBUTING.md.", "Be kind in reviews; every contribution is a chance to learn."];
    const pkg = {
        name: packageName(ctx.groupName),
        version: "0.1.0",
        description: tr ? `${ctx.groupName} · açık kaynak proje` : `${ctx.groupName} · open-source project`,
        main: "index.js",
        scripts: { start: "node index.js", test: "node --test" },
        keywords: ["hanogt"],
        license: "MIT",
    };
    return {
        rules: rulesSummary(lang, extra),
        files: [
            {
                name: "README.md",
                code: readme(lang, ctx, {
                    emoji: "🌍",
                    intro: tr
                        ? `> Projeyi tek cümleyle anlatan açıklamanı buraya yaz.

**${ctx.groupName}**, herkesin katkısına açık bir projedir. Aşağıdaki bölümleri projene göre güncelle.`
                        : `> Describe the project in one sentence here.

**${ctx.groupName}** is open to contributions from everyone. Update the sections below to match your project.`,
                    body: tr
                        ? `## ✨ Özellikler
- Metinleri URL dostu biçime çeviren \`slugify\` fonksiyonu (\`index.js\`)
- …

## 🚀 Kurulum ve kullanım
\`\`\`bash
npm install
npm start
\`\`\`

\`\`\`js
const { slugify } = require("./index.js");
console.log(slugify("Merhaba Dünya")); // "merhaba-dunya"
\`\`\`

## 🤝 Katkıda bulunma
Katkı akışı için \`CONTRIBUTING.md\`, topluluk kuralları için \`KURALLAR.md\`, yol haritası için \`TODO.md\` dosyasına bak.

## 📄 Lisans
MIT — ayrıntılar \`LICENSE\` dosyasında.`
                        : `## ✨ Features
- A \`slugify\` function that turns text into URL-friendly slugs (\`index.js\`)
- …

## 🚀 Install and use
\`\`\`bash
npm install
npm start
\`\`\`

\`\`\`js
const { slugify } = require("./index.js");
console.log(slugify("Hello World")); // "hello-world"
\`\`\`

## 🤝 Contributing
See \`CONTRIBUTING.md\` for the contribution flow, \`CODE_OF_CONDUCT.md\` for community rules and \`TODO.md\` for the roadmap.

## 📄 License
MIT — see the \`LICENSE\` file.`,
                    topics: tr
                        ? [{ topic: "genel", about: "Duyurular ve genel tartışma." }, { topic: "hatalar", about: "Hata bildirimleri: adımlar, beklenen ve gerçekleşen davranış." }, { topic: "özellikler", about: "Yeni özellik önerileri ve tasarım tartışmaları." }, { topic: "inceleme", about: "Değişiklikler için kod inceleme istekleri." }, { topic: "sürümler", about: "Sürüm planları ve sürüm notları." }]
                        : [{ topic: "general", about: "Announcements and general discussion." }, { topic: "bugs", about: "Bug reports: steps, expected and actual behavior." }, { topic: "features", about: "Feature proposals and design discussions." }, { topic: "reviews", about: "Code review requests for changes." }, { topic: "releases", about: "Release plans and release notes." }],
                    steps: tr
                        ? ["Sohbette kendini ve ilgi alanını tanıt.", "`CONTRIBUTING.md` ve `KURALLAR.md` dosyalarını oku.", "`TODO.md` dosyasından \"ilk katkı\" etiketli bir görev seç.", "`index.js` dosyasını Düzenleyici'de açıp çalıştır."]
                        : ["Introduce yourself and your interests in the chat.", "Read `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md`.", "Pick a task tagged \"good first issue\" from `TODO.md`.", "Open `index.js` in the Editor and run it."],
                }),
            },
            {
                name: "CONTRIBUTING.md",
                code: tr
                    ? `# 🤝 Katkı Rehberi

Katkın için teşekkürler! Bu rehber, değişikliklerin düzenli ve güvenli şekilde projeye girmesini sağlar.

## 1. Bir görev seç
- \`TODO.md\` dosyasından bir madde seç ve sohbette \`#özellikler\` veya \`#hatalar\` konusuyla üstlendiğini yaz.
- Büyük değişiklikleri başlamadan önce tartış.

## 2. Değişikliği yap
- Küçük ve odaklı değişiklikler yap; bir değişiklik tek bir konuyu çözsün.
- Kod stiline uy: 2 boşluk girinti, anlamlı adlar, gerekiyorsa kısa yorumlar.
- Yeni davranış için örnek veya test ekle.

## 3. İncelemeye gönder
- Sohbette \`#inceleme\` konusuyla neyi, neden değiştirdiğini anlat.
- En az bir kişinin onayını bekle.

## Mesaj biçimi
Sürüm notlarını kolaylaştırmak için [Conventional Commits](https://www.conventionalcommits.org/tr/) kullan:

| Tür | Ne zaman? |
| --- | --- |
| \`feat:\` | Yeni özellik |
| \`fix:\` | Hata düzeltmesi |
| \`docs:\` | Yalnızca belge değişikliği |
| \`refactor:\` | Davranışı değiştirmeyen düzenleme |
`
                    : `# 🤝 Contributing Guide

Thanks for contributing! This guide keeps changes flowing into the project in a tidy and safe way.

## 1. Pick a task
- Choose an item from \`TODO.md\` and claim it in the chat with \`#features\` or \`#bugs\`.
- Discuss big changes before you start.

## 2. Make the change
- Keep changes small and focused; one change should solve one problem.
- Follow the code style: 2-space indentation, meaningful names, short comments where needed.
- Add an example or a test for new behavior.

## 3. Ask for review
- Explain what you changed and why under \`#reviews\`.
- Wait for at least one approval.

## Message format
Use [Conventional Commits](https://www.conventionalcommits.org/) to make release notes easy:

| Type | When? |
| --- | --- |
| \`feat:\` | A new feature |
| \`fix:\` | A bug fix |
| \`docs:\` | Documentation only |
| \`refactor:\` | A change that keeps behavior the same |
`,
            },
            { name: tr ? "KURALLAR.md" : "CODE_OF_CONDUCT.md", code: rulesFile(lang, ctx, tr ? "🌍 Açık kaynak ilkeleri" : "🌍 Open-source principles", extra) },
            {
                name: "TODO.md",
                code: tr
                    ? `# 🗺️ Yol Haritası

## v0.1 · İlk sürüm
- [x] Proje iskeleti (${ctx.date})
- [ ] README'yi projeye göre güncelle
- [ ] \`slugify\` için testler yaz (\`node --test\`)
- [ ] İlk sürüm notlarını hazırla

## v0.2 · Sonraki adımlar
- [ ] …

## İlk katkı için uygun görevler
- [ ] README'ye kullanım örnekleri ekle _(ilk katkı)_
- [ ] \`slugify\` fonksiyonuna ayırıcı seçeneği ekle _(ilk katkı)_
`
                    : `# 🗺️ Roadmap

## v0.1 · First release
- [x] Project skeleton (${ctx.date})
- [ ] Update the README for the project
- [ ] Write tests for \`slugify\` (\`node --test\`)
- [ ] Draft the first release notes

## v0.2 · Next steps
- [ ] …

## Good first issues
- [ ] Add usage examples to the README _(good first issue)_
- [ ] Add a separator option to \`slugify\` _(good first issue)_
`,
            },
            {
                name: "LICENSE",
                code: `MIT License

Copyright (c) ${ctx.year} ${ctx.groupName} contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`,
            },
            {
                name: "index.js",
                code: `/**
 * ${ctx.groupName} · ${tr ? "örnek modül" : "sample module"}
 * ${tr ? "Metni URL dostu bir \"slug\" biçimine çevirir: \"Merhaba Dünya\" -> \"merhaba-dunya\"." : "Turns text into a URL-friendly slug: \"Hello World\" -> \"hello-world\"."}
 */
const TURKISH_LETTERS = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };

function slugify(text) {
    return String(text)
        .toLocaleLowerCase("tr")
        .replace(/[çğıöşü]/g, (char) => TURKISH_LETTERS[char])
        .normalize("NFD")
        .replace(/[\\u0300-\\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { slugify };
}

console.log(slugify("${tr ? "Merhaba Dünya, Hanogt!" : "Hello World, Hanogt!"}"));
`,
            },
            { name: "package.json", code: `${JSON.stringify(pkg, null, 2)}\n` },
        ],
    };
}

function classroomSeed(lang: SeedLanguage, ctx: GroupSeedContext): { files: SeedFile[]; rules: string } {
    const tr = lang === "tr";
    const extra = tr
        ? ["Ödevler bireyseldir: yardım iste ama kopyalama.", "Teslim tarihlerine uy; gecikecek olursan önceden haber ver."]
        : ["Assignments are individual: ask for help, but don't copy.", "Respect the deadlines; tell the teacher in advance if you'll be late."];
    return {
        rules: rulesSummary(lang, extra),
        files: [
            {
                name: "README.md",
                code: readme(lang, ctx, {
                    emoji: "🎓",
                    intro: tr
                        ? `**${ctx.groupName}** sınıfına hoş geldin! Ders notları, ödevler ve duyurular bu grupta. Öğretmen: **${ctx.ownerName}**`
                        : `Welcome to the **${ctx.groupName}** class! Lesson notes, assignments and announcements live in this group. Teacher: **${ctx.ownerName}**`,
                    topics: tr
                        ? [{ topic: "duyurular", about: "Öğretmenden duyurular ve tarih değişiklikleri." }, { topic: "ödevler", about: "Ödev soruları ve teslim bildirimleri." }, { topic: "sorular", about: "Derse dair her soru." }, { topic: "kaynaklar", about: "Ek okuma ve video önerileri." }]
                        : [{ topic: "announcements", about: "Announcements and schedule changes from the teacher." }, { topic: "homework", about: "Assignment questions and hand-in notes." }, { topic: "questions", about: "Any question about the lessons." }, { topic: "resources", about: "Extra reading and video suggestions." }],
                    steps: tr
                        ? ["Sohbette adınla kendini tanıt.", "KURALLAR.md dosyasını oku.", "`ders-01.md` notlarını oku ve örnekleri dene.", "`odev-01.py` ödevini yap ve teslim et."]
                        : ["Introduce yourself with your name in the chat.", "Read RULES.md.", "Read the `lesson-01.md` notes and try the examples.", "Complete and hand in `assignment-01.py`."],
                    extra: tr
                        ? `## 📤 Ödev nasıl teslim edilir?

1. Dosyalar panelinde **Yeni dosya** ile \`odev-01-adin.py\` adında bir dosya oluştur.
2. \`odev-01.py\` içeriğini kopyala, görevleri kendi dosyanda tamamla.
3. Dosyayı Düzenleyici'de çalıştırıp kontrollerin geçtiğini gör.
4. Sohbette \`#ödevler\` konusuyla teslim ettiğini yaz.`
                        : `## 📤 How to hand in an assignment

1. In the Files panel, use **New file** to create \`assignment-01-yourname.py\`.
2. Copy the contents of \`assignment-01.py\` and complete the tasks in your own file.
3. Run the file in the Editor and make sure the checks pass.
4. Post in the chat under \`#homework\` that you've handed it in.`,
                }),
            },
            { name: tr ? "KURALLAR.md" : "RULES.md", code: rulesFile(lang, ctx, tr ? "🎓 Sınıf kuralları" : "🎓 Class rules", extra) },
            {
                name: "TODO.md",
                code: tr
                    ? `# 📅 Ders Planı

| Hafta | Konu | Ödev |
| --- | --- | --- |
| 1 | Değişkenler, veri tipleri, girdi/çıktı | \`odev-01.py\` |
| 2 | Koşullar (\`if\` / \`elif\` / \`else\`) | … |
| 3 | Döngüler (\`for\`, \`while\`) | … |
| 4 | Fonksiyonlar | … |
| 5 | Listeler ve sözlükler | … |
| 6 | Mini proje | … |

## Bu hafta
- [ ] Ders 1 notlarını oku (\`ders-01.md\`)
- [ ] Ödev 1'i teslim et
- [ ] Sorularını \`#sorular\` konusunda sor
`
                    : `# 📅 Syllabus

| Week | Topic | Assignment |
| --- | --- | --- |
| 1 | Variables, data types, input/output | \`assignment-01.py\` |
| 2 | Conditions (\`if\` / \`elif\` / \`else\`) | … |
| 3 | Loops (\`for\`, \`while\`) | … |
| 4 | Functions | … |
| 5 | Lists and dictionaries | … |
| 6 | Mini project | … |

## This week
- [ ] Read the lesson 1 notes (\`lesson-01.md\`)
- [ ] Hand in assignment 1
- [ ] Ask your questions under \`#questions\`
`,
            },
            {
                name: tr ? "ders-01.md" : "lesson-01.md",
                code: tr
                    ? `# Ders 1 · Değişkenler ve Veri Tipleri

## Değişken nedir?
Değişken, bir değeri saklamak için verdiğimiz isimdir:

\`\`\`python
isim = "Ayşe"
yas = 14
boy = 1.62
ogrenci_mi = True
\`\`\`

## Temel veri tipleri
| Tip | Örnek | Açıklama |
| --- | --- | --- |
| \`str\` | \`"Merhaba"\` | Metin |
| \`int\` | \`42\` | Tam sayı |
| \`float\` | \`3.14\` | Ondalıklı sayı |
| \`bool\` | \`True\` / \`False\` | Doğru ya da yanlış |

## Ekrana yazdırma
\`\`\`python
print("Merhaba", isim)
print(isim + " " + str(yas) + " yaşında.")
\`\`\`

## Kendini dene
1. Kendi adını ve yaşını saklayan iki değişken oluştur ve ekrana yazdır.
2. \`type(3.0)\` ifadesinin sonucu nedir? Tahmin et, sonra dene.
3. \`"5" + "5"\` ile \`5 + 5\` arasındaki fark nedir?
`
                    : `# Lesson 1 · Variables and Data Types

## What is a variable?
A variable is a name we give to a stored value:

\`\`\`python
name = "Ada"
age = 14
height = 1.62
is_student = True
\`\`\`

## Basic data types
| Type | Example | Meaning |
| --- | --- | --- |
| \`str\` | \`"Hello"\` | Text |
| \`int\` | \`42\` | Whole number |
| \`float\` | \`3.14\` | Decimal number |
| \`bool\` | \`True\` / \`False\` | True or false |

## Printing
\`\`\`python
print("Hello", name)
print(name + " is " + str(age) + " years old.")
\`\`\`

## Try it yourself
1. Create two variables with your name and age and print them.
2. What does \`type(3.0)\` return? Guess first, then try it.
3. What is the difference between \`"5" + "5"\` and \`5 + 5\`?
`,
            },
            {
                name: tr ? "odev-01.py" : "assignment-01.py",
                code: tr
                    ? `"""Ödev 1 · Değişkenler, koşullar ve döngüler (${ctx.groupName})

Aşağıdaki üç fonksiyonu tamamla ve dosyayı çalıştır.
Tamamlanmayan görevler "henüz yapılmadı" olarak görünür.
"""


def not_harfi(puan):
    """0-100 arası puanı harf notuna çevir: 90+ A, 80+ B, 70+ C, 60+ D, altı F."""
    raise NotImplementedError("Görev 1")


def cift_sayilar(n):
    """1'den n'e kadar (n dahil) çift sayıların listesini döndür. Örnek: cift_sayilar(7) -> [2, 4, 6]"""
    raise NotImplementedError("Görev 2")


def kelime_say(metin):
    """Metindeki kelime sayısını döndür. Örnek: kelime_say("Merhaba Hanogt dünyası") -> 3"""
    raise NotImplementedError("Görev 3")


def kontrol_et():
    gorevler = [
        ("Görev 1 · not_harfi", lambda: not_harfi(95) == "A" and not_harfi(72) == "C" and not_harfi(10) == "F"),
        ("Görev 2 · cift_sayilar", lambda: cift_sayilar(7) == [2, 4, 6]),
        ("Görev 3 · kelime_say", lambda: kelime_say("Merhaba Hanogt dünyası") == 3),
    ]
    tamam = 0
    for ad, test in gorevler:
        try:
            gecti = test()
        except NotImplementedError:
            print("… " + ad + ": henüz yapılmadı")
            continue
        except Exception as hata:
            print("✗ " + ad + ": hata -> " + str(hata))
            continue
        print(("✓ " if gecti else "✗ ") + ad)
        if gecti:
            tamam += 1
    print(str(tamam) + "/" + str(len(gorevler)) + " görev tamamlandı.")


if __name__ == "__main__":
    kontrol_et()
`
                    : `"""Assignment 1 · Variables, conditions and loops (${ctx.groupName})

Complete the three functions below and run the file.
Unfinished tasks are reported as "not done yet".
"""


def letter_grade(score):
    """Turn a 0-100 score into a letter: 90+ A, 80+ B, 70+ C, 60+ D, below F."""
    raise NotImplementedError("Task 1")


def even_numbers(n):
    """Return the even numbers from 1 to n (inclusive). Example: even_numbers(7) -> [2, 4, 6]"""
    raise NotImplementedError("Task 2")


def count_words(text):
    """Return the number of words in the text. Example: count_words("Hello Hanogt world") -> 3"""
    raise NotImplementedError("Task 3")


def run_checks():
    tasks = [
        ("Task 1 · letter_grade", lambda: letter_grade(95) == "A" and letter_grade(72) == "C" and letter_grade(10) == "F"),
        ("Task 2 · even_numbers", lambda: even_numbers(7) == [2, 4, 6]),
        ("Task 3 · count_words", lambda: count_words("Hello Hanogt world") == 3),
    ]
    done = 0
    for name, check in tasks:
        try:
            passed = check()
        except NotImplementedError:
            print("… " + name + ": not done yet")
            continue
        except Exception as error:
            print("✗ " + name + ": error -> " + str(error))
            continue
        print(("✓ " if passed else "✗ ") + name)
        if passed:
            done += 1
    print(str(done) + "/" + str(len(tasks)) + " tasks completed.")


if __name__ == "__main__":
    run_checks()
`,
            },
        ],
    };
}

function hackathonSeed(lang: SeedLanguage, ctx: GroupSeedContext): { files: SeedFile[]; rules: string } {
    const tr = lang === "tr";
    const extra = tr
        ? ["Kararları sohbette birlikte alın; tartışma uzarsa sahibi olan kişi karar verir.", "Takıldığınızda 30 dakikadan fazla beklemeden yardım isteyin."]
        : ["Make decisions together in the chat; if a debate drags on, the task owner decides.", "Ask for help if you're stuck for more than 30 minutes."];
    const title = escapeHtml(ctx.groupName);
    return {
        rules: rulesSummary(lang, extra),
        files: [
            {
                name: "README.md",
                code: readme(lang, ctx, {
                    emoji: "⚡",
                    intro: tr
                        ? `**${ctx.groupName}** hackathon takımına hoş geldin! Hedef: kısa sürede çalışan bir MVP ve etkileyici bir sunum.`
                        : `Welcome to the **${ctx.groupName}** hackathon team! The goal: a working MVP and a convincing pitch in a short time.`,
                    topics: tr
                        ? [{ topic: "genel", about: "Duyurular ve koordinasyon." }, { topic: "fikirler", about: "Fikir havuzu ve oylama." }, { topic: "görevler", about: "Kim neyi yapıyor, nerede takıldı." }, { topic: "sunum", about: "Pitch metni, slaytlar ve prova." }, { topic: "demo", about: "Demo akışı ve son testler." }]
                        : [{ topic: "general", about: "Announcements and coordination." }, { topic: "ideas", about: "Idea pool and voting." }, { topic: "tasks", about: "Who does what and where they're stuck." }, { topic: "pitch", about: "Pitch script, slides and rehearsal." }, { topic: "demo", about: "Demo flow and final testing." }],
                    steps: tr
                        ? ["Sohbette güçlü yönlerini ve üstlenmek istediğin rolü yaz.", "Problemi ve çözümü `pitch.md` dosyasında tek paragrafa indirin.", "`TODO.md` zaman çizelgesindeki görevleri paylaşın.", "`index.html` dosyasını Düzenleyici'de açıp MVP'yi dene."]
                        : ["Post your strengths and the role you want in the chat.", "Boil the problem and solution down to one paragraph in `pitch.md`.", "Split the tasks on the `TODO.md` timeline.", "Open `index.html` in the Editor and try the MVP."],
                    extra: tr
                        ? `## 👥 Takım

| Rol | Kim? |
| --- | --- |
| Ürün ve sunum | … |
| Ön yüz | … |
| Arka uç / veri | … |
| Tasarım | … |

## 🧩 Meydan okuma
_Yarışmanın problem tanımını buraya yapıştırın._`
                        : `## 👥 Team

| Role | Who? |
| --- | --- |
| Product & pitch | … |
| Front end | … |
| Back end / data | … |
| Design | … |

## 🧩 Challenge
_Paste the hackathon's problem statement here._`,
                }),
            },
            { name: tr ? "KURALLAR.md" : "RULES.md", code: rulesFile(lang, ctx, tr ? "⚡ Takım anlaşmaları" : "⚡ Team agreements", extra) },
            {
                name: "TODO.md",
                code: tr
                    ? `# ⏱️ Zaman Çizelgesi

## 0–2. saat · Başlangıç
- [ ] Problemi seç ve hedef kullanıcıyı tanımla
- [ ] MVP kapsamını 3 özellikle sınırla
- [ ] Rolleri ve iletişim düzenini belirle

## 2–12. saat · MVP
- [ ] Ana ekran ve temel akış
- [ ] Veri modeli ve kalıcılık
- [ ] En önemli özellik uçtan uca çalışıyor

## 12–20. saat · Cila
- [ ] Hataları düzelt, boş durumları ve hata mesajlarını ekle
- [ ] Mobil görünümü kontrol et
- [ ] Demo verisini hazırla

## 20–24. saat · Demo ve sunum
- [ ] \`pitch.md\` metnini bitir ve iki kez prova et
- [ ] Demo videosu veya ekran görüntüleri
- [ ] Teslim
`
                    : `# ⏱️ Timeline

## Hours 0–2 · Kick-off
- [ ] Pick the problem and define the target user
- [ ] Limit the MVP scope to 3 features
- [ ] Agree on roles and how you'll communicate

## Hours 2–12 · MVP
- [ ] Main screen and core flow
- [ ] Data model and persistence
- [ ] The most important feature works end to end

## Hours 12–20 · Polish
- [ ] Fix bugs; add empty states and error messages
- [ ] Check the mobile layout
- [ ] Prepare demo data

## Hours 20–24 · Demo and pitch
- [ ] Finish the \`pitch.md\` script and rehearse twice
- [ ] Demo video or screenshots
- [ ] Submit
`,
            },
            {
                name: "pitch.md",
                code: tr
                    ? `# 🎤 3 Dakikalık Sunum

| Süre | Bölüm | Ne anlatacağız? |
| --- | --- | --- |
| 0:00–0:30 | Problem | Kimin, hangi sorunu var? Neden önemli? |
| 0:30–1:00 | Çözüm | Tek cümlelik fikir ve farkımız |
| 1:00–2:15 | Demo | En güçlü akışı canlı göster |
| 2:15–2:40 | Etki | Kimler, nasıl faydalanır? Sonraki adımlar |
| 2:40–3:00 | Takım ve kapanış | Kimiz, ne istiyoruz? |

## Tek cümlelik fikir
_… için …, … sayesinde … sağlar._

## Olası jüri soruları
- Bu çözümü neden daha önce kimse yapmadı?
- Kullanıcıya nasıl ulaşacaksınız?
- Bir hafta daha olsa ne eklerdiniz?
`
                    : `# 🎤 3-Minute Pitch

| Time | Section | What we'll say |
| --- | --- | --- |
| 0:00–0:30 | Problem | Who has what problem? Why does it matter? |
| 0:30–1:00 | Solution | The one-sentence idea and what makes us different |
| 1:00–2:15 | Demo | Show the strongest flow live |
| 2:15–2:40 | Impact | Who benefits and how? Next steps |
| 2:40–3:00 | Team & close | Who we are and what we're asking for |

## One-sentence idea
_For …, … is a … that … thanks to … ._

## Likely jury questions
- Why hasn't anyone built this before?
- How will you reach your users?
- What would you add with one more week?
`,
            },
            {
                name: "index.html",
                code: `<!DOCTYPE html>
<html lang="${tr ? "tr" : "en"}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} · MVP</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <main class="card">
        <p class="badge">Hackathon MVP</p>
        <h1>${title}</h1>
        <p class="lead">${tr ? "Fikirlerinizi ekleyin, oylayın ve en iyisini birlikte geliştirin." : "Add your ideas, vote on them and build the best one together."}</p>
        <form id="idea-form">
            <input id="idea-input" maxlength="120" placeholder="${tr ? "Yeni bir fikir yaz…" : "Write a new idea…"}" aria-label="${tr ? "Fikir" : "Idea"}">
            <button type="submit">${tr ? "Ekle" : "Add"}</button>
        </form>
        <ol id="idea-list"></ol>
    </main>
    <script src="app.js"></script>
</body>
</html>
`,
            },
            {
                name: "style.css",
                code: `:root {
    color-scheme: dark;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}

body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    background: radial-gradient(circle at 20% 20%, #4f46e5 0, transparent 40%), radial-gradient(circle at 80% 0, #c026d3 0, transparent 35%), #0b0b12;
    color: #f4f4f5;
}

.card {
    width: min(560px, calc(100vw - 32px));
    padding: 32px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 24px;
    background: rgba(24, 24, 27, 0.85);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
}

.badge {
    display: inline-block;
    margin: 0;
    padding: 4px 12px;
    border-radius: 999px;
    background: rgba(129, 140, 248, 0.15);
    color: #a5b4fc;
    font-size: 12px;
    font-weight: 700;
}

.lead {
    color: #a1a1aa;
}

form {
    display: flex;
    gap: 8px;
}

input {
    flex: 1;
    padding: 12px 14px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 12px;
    background: #18181b;
    color: inherit;
}

button {
    padding: 12px 16px;
    border: 0;
    border-radius: 12px;
    background: linear-gradient(135deg, #6366f1, #a855f7);
    color: white;
    font-weight: 700;
    cursor: pointer;
}

li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 10px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.05);
}
`,
            },
            {
                name: "app.js",
                code: `// ${ctx.groupName} · ${tr ? "MVP prototipi: fikir panosu" : "MVP prototype: idea board"}
const STORAGE_KEY = "hackathon-ideas";
const form = document.querySelector("#idea-form");
const input = document.querySelector("#idea-input");
const list = document.querySelector("#idea-list");

function load() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch (error) {
        return [];
    }
}

let ideas = load();

function save() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(ideas));
    } catch (error) {
        // ${tr ? "Depolama kapalıysa fikirler yalnızca bu oturumda kalır." : "When storage is blocked, ideas only last for this session."}
    }
}

function render() {
    list.innerHTML = "";
    ideas
        .slice()
        .sort((a, b) => b.votes - a.votes)
        .forEach((idea) => {
            const item = document.createElement("li");
            const text = document.createElement("span");
            text.textContent = idea.text;
            const vote = document.createElement("button");
            vote.type = "button";
            vote.textContent = "▲ " + idea.votes;
            vote.addEventListener("click", () => {
                idea.votes += 1;
                save();
                render();
            });
            item.append(text, vote);
            list.append(item);
        });
}

form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    ideas.push({ id: Date.now(), text, votes: 0 });
    input.value = "";
    save();
    render();
});

render();
`,
            },
        ],
    };
}

const SEEDS: Record<GroupTemplateId, (lang: SeedLanguage, ctx: GroupSeedContext) => { files: SeedFile[]; rules: string }> = {
    blank: blankSeed,
    study: studySeed,
    gamejam: gamejamSeed,
    opensource: opensourceSeed,
    classroom: classroomSeed,
    hackathon: hackathonSeed,
};

/**
 * Starter content for a new group. Used server-side when the group is
 * created; `ctx.groupName`/`ownerName` must already be single-line text.
 */
export function buildGroupSeed(id: GroupTemplateId, lang: SeedLanguage, ctx: GroupSeedContext): GroupSeed {
    const template = getGroupTemplate(id);
    const seed = SEEDS[template.id](lang, ctx);
    return {
        files: seed.files.map((file) => ({ name: file.name, code: file.code.slice(0, GROUP_LIMITS.fileContentMax) })),
        rules: seed.rules.slice(0, GROUP_LIMITS.rulesMax),
        topics: [...template.topics[lang]],
        projectName: lang === "tr" ? template.name.TR : template.name.EN,
        welcomeText: fillVars(lang === "tr" ? template.welcome.TR : template.welcome.EN, { group: ctx.groupName }).slice(0, GROUP_LIMITS.messageMax),
    };
}
