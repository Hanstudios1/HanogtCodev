/**
 * The messaging settings of Hanogt Social (stored with the account's private
 * settings in users/{email}, edited in Hanogt Social's settings and in
 * Account Settings) and what they change on screen. Framework-free, so the
 * server, Account Settings and Hanogt Social read them the same way.
 */

export type MessageFontSize = "small" | "medium" | "large";
export type ChatBackground = "default" | "dark" | "gradient" | "pattern";
export type VoiceQuality = "low" | "normal" | "high";

export type SocialPrefs = {
    /** Enter sends (Shift+Enter: new line); off: Ctrl/⌘+Enter sends and Enter adds a line. */
    enterToSend: boolean;
    /** Off: nobody sees that you're typing, and you don't see others typing. */
    typingIndicator: boolean;
    /** Off: your partner doesn't see "Seen" on their messages, and you don't see it on yours. */
    readReceipts: boolean;
    /** Off: GIFs show a still frame and play while hovered or focused. */
    gifAutoplay: boolean;
    msgFontSize: MessageFontSize;
    chatBackground: ChatBackground;
    voiceMsgQuality: VoiceQuality;
    /** Bell notifications for direct messages, @mentions in groups and missed calls. */
    msgNotifications: boolean;
    mentionNotifications: boolean;
    callNotifications: boolean;
};

export const SOCIAL_PREF_KEYS = [
    "enterToSend", "typingIndicator", "readReceipts", "gifAutoplay", "msgFontSize", "chatBackground", "voiceMsgQuality",
    "msgNotifications", "mentionNotifications", "callNotifications",
] as const satisfies ReadonlyArray<keyof SocialPrefs>;

export const DEFAULT_SOCIAL_PREFS: SocialPrefs = {
    enterToSend: true,
    typingIndicator: true,
    readReceipts: true,
    gifAutoplay: true,
    msgFontSize: "medium",
    chatBackground: "default",
    voiceMsgQuality: "normal",
    msgNotifications: true,
    mentionNotifications: true,
    callNotifications: true,
};

const FONT_SIZES: readonly MessageFontSize[] = ["small", "medium", "large"];
const BACKGROUNDS: readonly ChatBackground[] = ["default", "dark", "gradient", "pattern"];
const QUALITIES: readonly VoiceQuality[] = ["low", "normal", "high"];

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? value as T : fallback);
/** Anything but an explicit false keeps a switch on (older accounts have no value yet). */
const on = (value: unknown) => value !== false;

/** The messaging settings from stored or served account fields; missing or odd values fall back to the defaults. */
export function readSocialPrefs(fields: unknown): SocialPrefs {
    const source = fields && typeof fields === "object" ? fields as Record<string, unknown> : {};
    return {
        enterToSend: on(source.enterToSend),
        typingIndicator: on(source.typingIndicator),
        readReceipts: on(source.readReceipts),
        gifAutoplay: on(source.gifAutoplay),
        msgFontSize: pick(source.msgFontSize, FONT_SIZES, DEFAULT_SOCIAL_PREFS.msgFontSize),
        chatBackground: pick(source.chatBackground, BACKGROUNDS, DEFAULT_SOCIAL_PREFS.chatBackground),
        voiceMsgQuality: pick(source.voiceMsgQuality, QUALITIES, DEFAULT_SOCIAL_PREFS.voiceMsgQuality),
        msgNotifications: on(source.msgNotifications),
        mentionNotifications: on(source.mentionNotifications),
        callNotifications: on(source.callNotifications),
    };
}

/** Text size and line height of message text. */
export const MESSAGE_FONT_CLASS: Record<MessageFontSize, string> = {
    small: "text-[13px] leading-5",
    medium: "text-[15px] leading-[1.375rem]",
    large: "text-[17px] leading-7",
};

/**
 * The message list's background: a plain surface, a darker one, a soft wash
 * of the brand blue at the top, or a faint dot pattern. Text colors stay the
 * same, so every option reads well in light and dark themes.
 */
export const CHAT_BACKGROUND_CLASS: Record<ChatBackground, string> = {
    default: "",
    dark: "bg-zinc-100 dark:bg-zinc-950",
    gradient: "bg-[linear-gradient(180deg,rgba(59,130,246,0.07),transparent_45%)] dark:bg-[linear-gradient(180deg,rgba(59,130,246,0.12),transparent_45%)]",
    pattern: "bg-[radial-gradient(rgba(113,113,122,0.16)_1px,transparent_1px)] [background-size:18px_18px] dark:bg-[radial-gradient(rgba(161,161,170,0.12)_1px,transparent_1px)]",
};

/** Bits per second of recorded voice messages (a minute is ~120 / 240 / 480 kB). */
export const VOICE_BITRATE: Record<VoiceQuality, number> = { low: 16_000, normal: 32_000, high: 64_000 };

/**
 * What a key press in the message box does: "send", "newline" (let the
 * textarea add it) or null (not Enter). On touch keyboards Enter always adds
 * a line; the send button sends.
 */
export function enterAction(input: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; isComposing: boolean }, enterToSend: boolean, coarsePointer: boolean): "send" | "newline" | null {
    if (input.key !== "Enter" || input.isComposing) return null;
    if (input.shiftKey) return "newline";
    if (input.ctrlKey || input.metaKey) return "send";
    if (coarsePointer) return "newline";
    return enterToSend ? "send" : "newline";
}
