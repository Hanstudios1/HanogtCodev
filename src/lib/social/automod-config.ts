/**
 * A group's AutoMod settings (Hanogt Social › group settings › Safety): what
 * the Hanogt Security Bot stops before a message is sent, what it does then
 * and who it leaves alone. Shared by the settings screen and the server; the
 * word lists themselves stay on the server (src/lib/server/automod.ts), and
 * a group's own banned words are kept where members can't read them.
 */
import type { Copy } from "@/lib/i18n";
import { GROUP_FEATURES_MAX } from "@/lib/plans";
import type { GroupRank } from "./commands";

export type AutoModLinks = "allow" | "block" | "allowlist";
export type AutoModAction = "block" | "block_warn";

export interface AutoModConfig {
    enabled: boolean;
    /** Swearing in Turkish and English (also written as "s1kt1r", "siiiktir"). */
    profanity: boolean;
    /** Milder insults and slang ("salak", "aptal", "stupid"…). */
    slang: boolean;
    /** The same message over and over, or many messages in a few seconds. */
    spam: boolean;
    /** Most @mentions one message may have; 0 turns the check off. */
    maxMentions: number;
    links: AutoModLinks;
    /** Sites allowed when `links` is "allowlist" (e.g. "github.com"). */
    linkAllowlist: string[];
    /** Messages written mostly in capitals. */
    caps: boolean;
    /** E-mail addresses, phone numbers, T.C. kimlik, card numbers and IBANs. */
    personalData: boolean;
    action: AutoModAction;
    /** Warnings (in 30 days) after which the person is muted; 0 turns it off. */
    muteAfterWarnings: number;
    muteMinutes: number;
    /** Ranks AutoMod leaves alone (the owner always is). */
    exempt: GroupRank[];
}

export const AUTOMOD_LIMITS = {
    /** The most any plan allows (Pro); a group's own limit is its owner's plan's (PLAN_GROUP_FEATURES). */
    customWords: GROUP_FEATURES_MAX.bannedWords,
    customWordLength: 40,
    allowlist: 20,
    maxMentions: 25,
    muteAfterWarnings: 10,
    muteMinutes: 40_320,
} as const;

export const DEFAULT_AUTOMOD: AutoModConfig = {
    enabled: true,
    profanity: true,
    slang: false,
    spam: true,
    maxMentions: 5,
    links: "allow",
    linkAllowlist: [],
    caps: false,
    personalData: true,
    action: "block",
    muteAfterWarnings: 0,
    muteMinutes: 10,
    exempt: ["admin", "owner"],
};

const integer = (value: unknown, min: number, max: number, fallback: number) => {
    const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
};

/** "https://www.GitHub.com/x" → "github.com"; null for anything that isn't a host name. */
export function normalizeDomain(value: unknown): string | null {
    if (typeof value !== "string") return null;
    let host = value.trim().toLowerCase();
    try {
        if (/^[a-z][a-z0-9+.-]*:\/\//.test(host)) host = new URL(host).hostname;
    } catch {
        return null;
    }
    host = host.replace(/^www\./, "").replace(/\/.*$/, "");
    return /^(?=.{3,100}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(host) ? host : null;
}

/** Stored or sent settings, checked; anything missing or wrong takes the default. */
export function sanitizeAutoMod(value: unknown): AutoModConfig {
    const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    const bool = (key: keyof AutoModConfig) => (typeof raw[key] === "boolean" ? (raw[key] as boolean) : (DEFAULT_AUTOMOD[key] as boolean));
    const allowlist = Array.isArray(raw.linkAllowlist)
        ? [...new Set(raw.linkAllowlist.map(normalizeDomain).filter((domain): domain is string => Boolean(domain)))].slice(0, AUTOMOD_LIMITS.allowlist)
        : [];
    const exempt = Array.isArray(raw.exempt) ? raw.exempt.filter((rank): rank is GroupRank => rank === "moderator" || rank === "admin") : DEFAULT_AUTOMOD.exempt.filter((rank) => rank !== "owner");
    return {
        enabled: bool("enabled"),
        profanity: bool("profanity"),
        slang: bool("slang"),
        spam: bool("spam"),
        maxMentions: integer(raw.maxMentions, 0, AUTOMOD_LIMITS.maxMentions, DEFAULT_AUTOMOD.maxMentions),
        links: raw.links === "block" || raw.links === "allowlist" ? raw.links : "allow",
        linkAllowlist: allowlist,
        caps: bool("caps"),
        personalData: bool("personalData"),
        action: raw.action === "block_warn" ? "block_warn" : "block",
        muteAfterWarnings: integer(raw.muteAfterWarnings, 0, AUTOMOD_LIMITS.muteAfterWarnings, DEFAULT_AUTOMOD.muteAfterWarnings),
        muteMinutes: integer(raw.muteMinutes, 1, AUTOMOD_LIMITS.muteMinutes, DEFAULT_AUTOMOD.muteMinutes),
        // The owner is never stopped by AutoMod.
        exempt: [...new Set<GroupRank>([...exempt, "owner"])],
    };
}

/** A group's own banned words: trimmed, lower case, no duplicates, at most 1,000 (the most any plan allows) of at most 40 characters. */
export function sanitizeCustomWords(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const words = new Set<string>();
    for (const entry of value) {
        if (typeof entry !== "string") continue;
        const word = entry.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().toLocaleLowerCase("tr").slice(0, AUTOMOD_LIMITS.customWordLength);
        if (word.length >= 2) words.add(word);
        if (words.size >= AUTOMOD_LIMITS.customWords) break;
    }
    return [...words];
}

/** Why AutoMod stopped a message (shown to its writer, logged for moderators). */
export type AutoModRule = "profanity" | "slang" | "custom" | "spam" | "mentions" | "links" | "caps" | "personal";

export const AUTOMOD_RULE_COPY: Record<AutoModRule, Copy> = {
    profanity: { TR: "küfür", EN: "swearing" },
    slang: { TR: "argo ve hakaret", EN: "slang and insults" },
    custom: { TR: "grubun yasaklı kelimeleri", EN: "the group's banned words" },
    spam: { TR: "spam", EN: "spam" },
    mentions: { TR: "çok fazla bahsetme", EN: "too many mentions" },
    links: { TR: "bağlantılar", EN: "links" },
    caps: { TR: "büyük harfle yazma", EN: "writing in capitals" },
    personal: { TR: "kişisel veri", EN: "personal data" },
};

export const AUTOMOD_BLOCKED_COPY: Copy = {
    TR: "Mesajın grubun AutoMod kuralına takıldı ({rule}) ve gönderilmedi.",
    EN: "Your message hit the group's AutoMod rule ({rule}) and wasn't sent.",
};

export function isAutoModRule(value: unknown): value is AutoModRule {
    return typeof value === "string" && Object.prototype.hasOwnProperty.call(AUTOMOD_RULE_COPY, value);
}
