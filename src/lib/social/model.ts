/**
 * Hanogt Social — shared, framework-free building blocks.
 *
 * Friends, direct messages and groups are one product with a Discord-style
 * interface. This module is imported by the Social API routes (server), the
 * data hooks and components (client) and the plain-Node tests, so it must stay
 * free of React, Firebase and Node imports (type-only imports are fine).
 */
import { GROUP_REACTIONS, isReactionKey, mentionsUser, tokenizeMessage, type GroupReactionKey } from "@/lib/groups";
import { readMessageAttachment, type MessageAttachment } from "./attachments";
import { readMessageGif, type MessageGif } from "./gif";
import { markdownToPlain } from "./markdown";
import type { PlanBadge } from "@/lib/plan-badge";
import type { PresenceStatus } from "@/lib/presence";

/* -------------------------------------------------------------------------- */
/* Limits and timings                                                         */
/* -------------------------------------------------------------------------- */

export const SOCIAL_LIMITS = {
    messageMax: 4000,
    /** Last-message preview stored on chats/{chatId}. */
    previewMax: 200,
    replyExcerptMax: 100,
    /** Messages per page of a direct conversation. */
    dmPage: 60,
    dmWindowMax: 600,
    nicknameMax: 100,
} as const;

/**
 * Polling cadence. With a working Firebase connection the lists only poll as
 * a safety net (realtime listeners do the work); without it ("fallback")
 * Social polls the server APIs while the tab is visible.
 */
export const SOCIAL_POLL = {
    conversationMs: 4_000,
    /** Edits, deletions and read receipts don't move the cursor: the newest page is re-read now and then. */
    conversationFullMs: 30_000,
    dmListMs: 10_000,
    groupMessagesMs: 4_000,
    groupDetailMs: 30_000,
    groupsLiveMs: 60_000,
    groupsFallbackMs: 20_000,
    friendsLiveMs: 120_000,
    friendsFallbackMs: 30_000,
    /** How long the Firebase bridge may take before Social switches to the server APIs. */
    bridgeGraceMs: 4_000,
} as const;

/** One-tap stickers of direct messages (stored as the emoji itself, type "sticker"). */
export const DM_STICKERS = [
    "😀", "😂", "🤣", "😍", "🥰", "😎", "🤩", "😤",
    "😭", "🥺", "😱", "🤔", "💀", "🔥", "❤️", "💯",
    "👋", "👍", "👎", "🙌", "🎉", "🎊", "✨", "💪",
    "🚀", "⭐", "🌟", "💡", "🎮", "💻", "📱", "🎵",
    "☕", "🍕", "🎂", "🌈", "🐱", "🐶", "🦊", "🐼",
] as const;

export function isSticker(value: unknown): value is string {
    return typeof value === "string" && (DM_STICKERS as readonly string[]).includes(value);
}

/* -------------------------------------------------------------------------- */
/* Types shared by the API routes and the interface                           */
/* -------------------------------------------------------------------------- */

/** "live": realtime through the client SDK; "fallback": server APIs with polling; "connecting": not decided yet. */
export type SocialMode = "live" | "fallback" | "connecting";

export type StaffRoleBadge = "owner" | "admin" | "moderator";
export type { PlanBadge };

/** Name card of a person without presence (friend requests, blocked people). */
export type PersonCard = {
    username: string;
    avatarUrl: string | null;
    nickname: string;
    nicknameTag: string;
    staffRole: StaffRoleBadge | null;
    /** The Plus / Pro badge while it lasts (src/lib/plan-badge.ts); written by the server only. */
    planBadge: PlanBadge | null;
};

/** A person Social shows with presence; `status` is effectiveStatus() of their public profile. */
export type SocialPerson = PersonCard & {
    email: string;
    customStatus: string;
    status: PresenceStatus;
    lastSeenAt: string | null;
};

export type FriendRequestItem = { id: string; createdAt: string | null; person: PersonCard };
export type BlockedItem = PersonCard & { email: string };

export type FriendsOverview = {
    friends: SocialPerson[];
    incoming: FriendRequestItem[];
    outgoing: FriendRequestItem[];
    blocked: BlockedItem[];
};

export type DmMessageType = "text" | "sticker" | "voice" | "gif" | "file";
/** The quoted message; `deleted` once it has been deleted (the quote is emptied then). */
export type DmReply = { id: string; text: string; fromEmail: string; deleted?: boolean };
/** Who reacted with what (e-mails of the two participants). */
export type DmReactions = Partial<Record<GroupReactionKey, string[]>>;

export type DmMessage = {
    id: string;
    fromEmail: string;
    text: string;
    type: DmMessageType;
    voicePath: string | null;
    voiceDuration: number;
    createdAt: number;
    read: boolean;
    edited: boolean;
    deleted: boolean;
    replyTo: DmReply | null;
    /** A GIF from the picker (type "gif"); its title is the text. */
    gif: MessageGif | null;
    /** A file (type "file"); the text is its caption. */
    file: MessageAttachment | null;
    reactions: DmReactions;
    /** Sent on from another conversation. */
    forwarded: boolean;
    /** Written locally, not confirmed by the server yet. */
    pending: boolean;
    /** A file still on its way up (only on the sender's local copy). */
    upload?: MessageUpload | null;
};

/** A file being sent: how much has gone up (0–1) and a local picture to show meanwhile. */
export type MessageUpload = { progress: number; preview: string | null };

export type DmSummary = {
    chatId: string;
    partner: SocialPerson;
    isFriend: boolean;
    lastMessage: string;
    lastMessageAt: number;
    lastFromMe: boolean;
    unread: number;
    typing: boolean;
};

export type DmListResponse = { dms: DmSummary[] };

export type DmConversationResponse = {
    exists: boolean;
    messages: DmMessage[];
    hasMore: boolean;
    typing: boolean;
    canSend: boolean;
    isFriend: boolean;
    /** The signed-in user blocked the partner. */
    blocked: boolean;
    /** Pinned messages of the conversation, newest first. */
    pinnedMessageIds: string[];
    now: number;
};

/** public_profiles/{email}.presence as stored (lib/presence.ts); ProfileModal derives the status from it. */
export type StoredPresence = { status: string; updatedAt: string | null; expiresAt: string | null };

export type SocialProfile = SocialPerson & {
    /** Raw presence for effectiveStatus(); null when the caller may not see it. */
    presence: StoredPresence | null;
    bio: string;
    bannerUrl: string;
    accentColor: string;
    favoriteLangs: string[];
    socialGithub: string;
    socialLinkedin: string;
    socialTwitter: string;
    socialWebsite: string;
    badges: string[];
    publicProjects: boolean;
};

export type MutualGroup = { id: string; name: string; emoji: string; color: string };

export type SocialProfileResponse = { person: SocialProfile; isFriend: boolean; mutualGroups: MutualGroup[] };

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

/** Document id of the direct conversation of two people (the existing chats/{a_b} convention). */
export function dmChatId(a: string, b: string) {
    return [a.toLowerCase(), b.toLowerCase()].sort().join("_");
}

/**
 * Milliseconds of a stored time: Firestore Timestamp ({ toMillis() } or
 * { seconds, nanoseconds }), ISO string, Date or number; 0 when unusable.
 */
export function timeOf(value: unknown): number {
    let time = Number.NaN;
    if (typeof value === "number") time = value;
    else if (typeof value === "string") time = Date.parse(value);
    else if (value instanceof Date) time = value.getTime();
    else if (value && typeof value === "object") {
        const stamp = value as { toMillis?: unknown; seconds?: unknown; nanoseconds?: unknown };
        if (typeof stamp.toMillis === "function") time = Number((stamp.toMillis as () => unknown).call(value));
        else if (typeof stamp.seconds === "number") time = stamp.seconds * 1000 + Math.floor(Number(stamp.nanoseconds || 0) / 1e6);
    }
    return Number.isFinite(time) && time > 0 ? time : 0;
}

const CONTROL_EXCEPT_BREAKS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;

/** Multi-line message text: line breaks unified, control and bidi-override characters removed, at most `max`. */
export function cleanMessageText(value: unknown, max: number = SOCIAL_LIMITS.messageMax): string {
    if (typeof value !== "string") return "";
    const text = cutText(value, max * 4)
        .replace(/\r\n?/g, "\n")
        .replace(CONTROL_EXCEPT_BREAKS, "")
        .replace(/\n{4,}/g, "\n\n\n")
        .trim();
    return text.length <= max ? text : cutText(text, max).trim();
}

/** At most `max` UTF-16 units, never ending in half of a surrogate pair. */
export function cutText(text: string, max: number) {
    if (text.length <= max) return text;
    const end = Math.max(0, max);
    const last = text.charCodeAt(end - 1);
    return text.slice(0, last >= 0xd800 && last <= 0xdbff ? end - 1 : end);
}

/** One-line preview: whitespace collapsed, at most `max` characters. */
export function previewText(value: unknown, max: number = SOCIAL_LIMITS.previewMax): string {
    if (typeof value !== "string") return "";
    const line = value.replace(CONTROL_EXCEPT_BREAKS, "").replace(/\s+/g, " ").trim();
    return line.length <= max ? line : `${cutText(line, max - 1).trimEnd()}…`;
}

/** A message's text for lists, replies and notifications: Markdown markers removed, spoilers hidden. */
export function messagePreview(value: unknown, max: number = SOCIAL_LIMITS.previewMax): string {
    return typeof value === "string" ? previewText(markdownToPlain(value.slice(0, max * 4 + 200)), max) : "";
}

/**
 * Splits "nickname#1234" into its parts (the last "#" separates them, so a
 * nickname may contain "#" itself). Returns null when the tag isn't four digits.
 */
export function parseFriendTag(input: unknown): { nickname: string; tag: string } | null {
    if (typeof input !== "string") return null;
    const value = input.trim();
    const index = value.lastIndexOf("#");
    if (index <= 0) return null;
    const nickname = value.slice(0, index).trim();
    const tag = value.slice(index + 1).trim();
    if (!/^[0-9]{4}$/.test(tag) || !nickname || nickname.length > SOCIAL_LIMITS.nicknameMax || /[\u0000-\u001f\u007f]/.test(nickname)) return null;
    return { nickname, tag };
}

export function formatFriendTag(nickname: string, tag: string) {
    return nickname && /^[0-9]{4}$/.test(tag) ? `${nickname}#${tag}` : "";
}

/** Case- and accent-insensitive form for searching (Turkish dotless/dotted i included). */
export function foldText(value: string) {
    return value
        .replace(/[İIı]/g, "i")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

/* -------------------------------------------------------------------------- */
/* Direct messages                                                            */
/* -------------------------------------------------------------------------- */

const MESSAGE_TYPES: readonly DmMessageType[] = ["text", "sticker", "voice", "gif", "file"];
const DOC_ID = /^[A-Za-z0-9_-]{1,128}$/;
const EMAIL_LIKE = /^[^\s@/]{1,64}@[^\s@/]{1,190}$/;

/** Stored reactions, checked: known keys, e-mail-like entries, at most two people each. */
export function readDmReactions(value: unknown): DmReactions {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const reactions: DmReactions = {};
    for (const [key, people] of Object.entries(value as Record<string, unknown>)) {
        if (!isReactionKey(key) || !Array.isArray(people)) continue;
        const list = [...new Set(people.filter((person): person is string => typeof person === "string" && EMAIL_LIKE.test(person)).map((person) => person.toLowerCase()))].slice(0, 2);
        if (list.length) reactions[key] = list;
    }
    return reactions;
}

/** Reactions in display order with counts and whether `me` reacted. */
export function reactionSummary(reactions: Partial<Record<GroupReactionKey, readonly string[]>>, me: string) {
    return GROUP_REACTIONS.flatMap((reaction) => {
        const people = reactions[reaction.key] ?? [];
        return people.length ? [{ ...reaction, count: people.length, mine: people.includes(me) }] : [];
    });
}

/** Pinned ids from a chat document: valid ids only, at most 25. */
export function readPinnedIds(value: unknown, max = 25) {
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && DOC_ID.test(id)))].slice(0, max) : [];
}

function str(value: unknown, max: number) {
    return typeof value === "string" ? value.slice(0, max) : "";
}

/**
 * A direct message from Firestore data (client snapshot) or an API payload;
 * unknown fields are dropped and every value is checked.
 */
export function dmMessageFromData(id: string, data: Record<string, unknown>, pending = false, fallbackTime = 0): DmMessage {
    const type = MESSAGE_TYPES.find((entry) => entry === data.type) ?? "text";
    const reply = data.replyTo && typeof data.replyTo === "object" ? data.replyTo as Record<string, unknown> : null;
    const duration = typeof data.voiceDuration === "number" && Number.isFinite(data.voiceDuration) ? Math.max(0, Math.min(600, Math.round(data.voiceDuration))) : 0;
    const deleted = data.deleted === true;
    return {
        id,
        fromEmail: str(data.fromEmail, 254).toLowerCase(),
        text: deleted ? "" : str(data.text, SOCIAL_LIMITS.messageMax),
        type,
        voicePath: !deleted && typeof data.voicePath === "string" && data.voicePath ? data.voicePath.slice(0, 400) : null,
        voiceDuration: duration,
        createdAt: timeOf(data.createdAt) || fallbackTime,
        read: data.read === true,
        edited: data.edited === true,
        deleted,
        replyTo: reply && typeof reply.id === "string" && DOC_ID.test(reply.id)
            ? { id: reply.id, text: reply.deleted === true ? "" : str(reply.text, SOCIAL_LIMITS.replyExcerptMax), fromEmail: str(reply.fromEmail, 254).toLowerCase(), deleted: reply.deleted === true }
            : null,
        gif: !deleted && type === "gif" ? readMessageGif(data.gif) : null,
        file: !deleted && type === "file" ? readMessageAttachment(data.file) : null,
        reactions: deleted ? {} : readDmReactions(data.reactions),
        forwarded: data.forwarded === true,
        pending,
    };
}

/**
 * Voice messages may only point into the conversation's own Storage folder
 * (`voice-messages/<chatId>/<file>`, as storage.rules require); anything else
 * is ignored.
 */
export function isDmVoicePath(value: unknown, chatId: string): value is string {
    if (typeof value !== "string" || !chatId) return false;
    const parts = value.split("/");
    return parts.length === 3 && parts[0] === "voice-messages" && parts[1] === chatId && /^[A-Za-z0-9._-]{1,200}$/.test(parts[2]) && parts[2] !== "." && parts[2] !== "..";
}

/** Oldest first; ties keep a stable order by id. */
export function compareMessages(a: { createdAt: number; id: string }, b: { createdAt: number; id: string }) {
    return a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Merges a fetched page into the list: same ids are replaced, the result is sorted and capped (newest kept). */
export function mergeMessages<T extends { id: string; createdAt: number }>(current: readonly T[], incoming: readonly T[], max: number = SOCIAL_LIMITS.dmWindowMax): T[] {
    if (!incoming.length) return current as T[];
    const byId = new Map(current.map((message) => [message.id, message]));
    for (const message of incoming) byId.set(message.id, message);
    const merged = [...byId.values()].sort(compareMessages);
    return merged.length > max ? merged.slice(merged.length - max) : merged;
}

/** Messages from the partner the signed-in user hasn't read yet. */
export function dmUnreadCount(messages: readonly DmMessage[], partnerEmail: string) {
    const partner = partnerEmail.toLowerCase();
    return messages.filter((message) => message.fromEmail === partner && !message.read && !message.deleted).length;
}

/** Most recent conversation first; equal times by name. */
export function sortDms<T extends { lastMessageAt: number; partner: { username: string } }>(list: readonly T[]): T[] {
    return [...list].sort((a, b) => b.lastMessageAt - a.lastMessageAt || a.partner.username.localeCompare(b.partner.username, "tr"));
}

/** Conversations the user closed stay hidden until a newer message arrives. */
export function visibleDms<T extends { chatId: string; lastMessageAt: number }>(list: readonly T[], hidden: Readonly<Record<string, number>>, keepChatId = ""): T[] {
    return list.filter((dm) => dm.chatId === keepChatId || !(hidden[dm.chatId] >= dm.lastMessageAt));
}

export function dmUnreadTotal(list: ReadonlyArray<{ unread: number }>) {
    return list.reduce((sum, dm) => sum + Math.max(0, dm.unread), 0);
}

/** The Home button's badge: unread direct messages, incoming friend requests and group invitations. */
export function homeBadgeCount(dmUnread: number, incomingRequests: number, groupInvites: number) {
    return Math.max(0, dmUnread) + Math.max(0, incomingRequests) + Math.max(0, groupInvites);
}

/** "9+" style label for badges. */
export function badgeLabel(count: number, max = 99) {
    return count > max ? `${max}+` : String(Math.max(0, count));
}

/* -------------------------------------------------------------------------- */
/* Groups                                                                     */
/* -------------------------------------------------------------------------- */

/** Per-group notification setting ("Bildirimler" in the group menu), kept in the browser. */
export type GroupNotifyLevel = "all" | "mentions" | "none";
export const GROUP_NOTIFY_LEVELS: readonly GroupNotifyLevel[] = ["all", "mentions", "none"];

export function isGroupNotifyLevel(value: unknown): value is GroupNotifyLevel {
    return typeof value === "string" && (GROUP_NOTIFY_LEVELS as readonly string[]).includes(value);
}

export type RecentGroupMessage = { createdAt: number; fromEmail: string; system: boolean; mentionsMe: boolean };
export type GroupUnread = { unread: number; mentions: number };

/** Unread messages after `lastReadAt` (own and platform messages don't count) and how many mention the user. */
export function groupUnreadState(recent: readonly RecentGroupMessage[], lastReadAt: number, me: string): GroupUnread {
    const own = me.toLowerCase();
    let unread = 0;
    let mentions = 0;
    for (const message of recent) {
        if (message.createdAt <= lastReadAt || message.system || message.fromEmail.toLowerCase() === own) continue;
        unread += 1;
        if (message.mentionsMe) mentions += 1;
    }
    return { unread, mentions };
}

/** What the server rail shows for a group: a white pill for unread messages and a red mention count. */
export function railBadge(state: GroupUnread | undefined, level: GroupNotifyLevel = "all") {
    if (!state || level === "none") return { dot: false, count: 0 };
    return { dot: level === "all" && state.unread > 0, count: state.mentions };
}

export type ChannelMessage = { createdAt: number; fromEmail: string; type: string; text: string; pending?: boolean };
export type ChannelUnread = { unread: boolean; mentions: number };

/**
 * Unread state of a group's channels for the channel list (Discord's bold
 * name with a pill, and a red mention count). "" is the main channel, which
 * shows every message; the others are #topics. A topic counts as read up to
 * the later of its own read time and the main channel's; `lastReadAt` (when
 * the group was last read) stands in for channels not opened yet.
 */
export function channelUnreadState(
    messages: readonly ChannelMessage[],
    options: { me: string; myName: string; usernames: readonly string[]; lastReadAt: number; readAt: Readonly<Record<string, number>> },
): Record<string, ChannelUnread> {
    const own = options.me.toLowerCase();
    const mainRead = options.readAt[""] ?? options.lastReadAt;
    const result: Record<string, ChannelUnread> = {};
    const bump = (channel: string, mention: boolean) => {
        const entry = result[channel] ?? { unread: false, mentions: 0 };
        entry.unread = true;
        if (mention) entry.mentions += 1;
        result[channel] = entry;
    };
    for (const message of messages) {
        if (message.type === "system" || message.pending || message.fromEmail.toLowerCase() === own) continue;
        const mention = message.type === "text" && Boolean(options.myName) && mentionsUser(message.text, options.myName, options.usernames);
        if (message.createdAt > mainRead) bump("", mention);
        if (!message.text.includes("#")) continue;
        const topics = new Set(tokenizeMessage(message.text, []).flatMap((segment) => (segment.kind === "topic" ? [segment.topic] : [])));
        for (const topic of topics) {
            if (message.createdAt > Math.max(options.readAt[topic] ?? options.lastReadAt, mainRead)) bump(topic, mention);
        }
    }
    return result;
}

export type MemberLike = { email: string; username: string; role: "owner" | "admin" | "moderator" | "member"; status: PresenceStatus };
export type MemberSectionId = "owner" | "admin" | "moderator" | "member" | "offline";
export type MemberSection<T> = { id: MemberSectionId; members: T[] };

export const STATUS_RANK: Record<PresenceStatus, number> = { online: 0, idle: 1, dnd: 2, offline: 3 };

/**
 * Discord-style member list: people who are around grouped by role (owner,
 * admins, moderators, members), then everyone offline. Within a section: online before
 * idle before do-not-disturb, then by name.
 */
export function sectionMembers<T extends MemberLike>(members: readonly T[], locale = "tr"): Array<MemberSection<T>> {
    const byName = (a: T, b: T) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.username.localeCompare(b.username, locale);
    const sections: Array<MemberSection<T>> = [];
    for (const role of ["owner", "admin", "moderator", "member"] as const) {
        const list = members.filter((member) => member.role === role && member.status !== "offline").sort(byName);
        if (list.length) sections.push({ id: role, members: list });
    }
    const offline = members.filter((member) => member.status === "offline").sort(byName);
    if (offline.length) sections.push({ id: "offline", members: offline });
    return sections;
}

/* -------------------------------------------------------------------------- */
/* Friends                                                                    */
/* -------------------------------------------------------------------------- */

export type FriendsTab = "online" | "all" | "pending" | "blocked";
export const FRIENDS_TABS: readonly FriendsTab[] = ["online", "all", "pending", "blocked"];

export function isFriendsTab(value: unknown): value is FriendsTab {
    return typeof value === "string" && (FRIENDS_TABS as readonly string[]).includes(value);
}

type FriendLike = { username: string; nickname: string; status: PresenceStatus };

export function personMatches(person: { username: string; nickname: string }, query: string) {
    const needle = foldText(query);
    if (!needle) return true;
    return foldText(person.username).includes(needle) || foldText(person.nickname).includes(needle);
}

/** Friends for the "Çevrimiçi" (anyone not offline) or "Tümü" tab, filtered by the search box. */
export function filterFriends<T extends FriendLike>(friends: readonly T[], tab: "online" | "all", query = "", locale = "tr"): T[] {
    return friends
        .filter((friend) => (tab === "all" || friend.status !== "offline") && personMatches(friend, query))
        .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.username.localeCompare(b.username, locale));
}

/* -------------------------------------------------------------------------- */
/* Quick switcher (Ctrl/⌘+K)                                                  */
/* -------------------------------------------------------------------------- */

export type SwitcherItem = {
    id: string;
    kind: "dm" | "friend" | "group";
    label: string;
    /** Second line (nickname#tag, member count…). */
    hint: string;
    href: string;
    /** Last activity in ms, for ordering. */
    recent: number;
    unread: number;
};

function matchScore(label: string, hint: string, needle: string) {
    const text = foldText(label);
    if (text === needle) return 0;
    if (text.startsWith(needle)) return 1;
    if (text.split(/[\s._-]+/).some((word) => word.startsWith(needle))) return 2;
    if (text.includes(needle)) return 3;
    if (foldText(hint).includes(needle)) return 4;
    return -1;
}

/** Best matches first; without a query the most recent conversations and groups. */
export function rankSwitcher(items: readonly SwitcherItem[], query: string, limit = 12): SwitcherItem[] {
    const needle = foldText(query);
    // The first entry for a destination wins (conversations come before friends).
    const seen = new Set<string>();
    const unique: SwitcherItem[] = [];
    for (const item of items) {
        if (seen.has(item.href)) continue;
        seen.add(item.href);
        unique.push(item);
    }
    const scored = unique
        .map((item) => ({ item, score: needle ? matchScore(item.label, item.hint, needle) : 0 }))
        .filter((entry) => entry.score >= 0);
    scored.sort((a, b) => a.score - b.score
        || Number(b.item.unread > 0) - Number(a.item.unread > 0)
        || b.item.recent - a.item.recent
        || a.item.label.localeCompare(b.item.label, "tr"));
    return scored.slice(0, limit).map((entry) => entry.item);
}

/* -------------------------------------------------------------------------- */
/* Routes                                                                     */
/* -------------------------------------------------------------------------- */

export type SocialRoute =
    | { kind: "home" }
    | { kind: "dm"; email: string }
    | { kind: "group"; groupId: string }
    | { kind: "other" };

function safeDecode(value: string) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

/** Which Social screen a pathname shows (the shell picks the sidebar from it). */
export function parseSocialRoute(pathname: string | null | undefined): SocialRoute {
    const path = (pathname || "").replace(/\/+$/, "");
    if (path === "/social") return { kind: "home" };
    const dm = /^\/social\/dm\/([^/]+)$/.exec(path);
    if (dm) return { kind: "dm", email: safeDecode(dm[1]).trim().toLowerCase() };
    const group = /^\/social\/g\/([A-Za-z0-9_-]{1,128})$/.exec(path);
    if (group) return { kind: "group", groupId: group[1] };
    return { kind: "other" };
}

export function dmHref(email: string) {
    return `/social/dm/${encodeURIComponent(email)}`;
}

/** A group's screen: a channel (all messages or one #topic), the shared files or the Rules section. */
export type GroupViewParams = { topic?: string; view?: "files" | "rules"; file?: string };

/** The screen a group address asks for (`?view=`); anything else is the chat. */
export function groupViewOf(value: string | null | undefined): "chat" | "files" | "rules" {
    return value === "files" || value === "rules" ? value : "chat";
}

export function groupHref(groupId: string, params: GroupViewParams = {}) {
    const query = new URLSearchParams();
    if (params.view === "files") {
        query.set("view", "files");
        if (params.file) query.set("file", params.file);
    } else if (params.view === "rules") {
        query.set("view", "rules");
    } else if (params.topic) {
        query.set("topic", params.topic);
    }
    const suffix = query.toString();
    return `/social/g/${groupId}${suffix ? `?${suffix}` : ""}`;
}
