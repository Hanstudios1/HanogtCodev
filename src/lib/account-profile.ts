/**
 * Shape and validation of the signed-in user's own profile and settings, as
 * served by /api/account/profile. Shared by the API route (server), Account
 * Settings and Hanogt AI (client), so it is dependency-free.
 *
 * Public fields are mirrored to public_profiles/{email}; private settings stay
 * in users/{email}. The validation mirrors validProfileFields() in
 * firestore.rules so a value accepted here is also valid for direct writes.
 */

export type StaffRoleBadge = "owner" | "admin" | "moderator";

export const PROFILE_TEXT_LIMITS = {
    /** Mirrors firestore.rules (100); the forms suggest shorter names. */
    username: 100,
    nickname: 100,
    bio: 600,
    customStatus: 120,
    statusEmoji: 16,
    social: 200,
    timezone: 64,
    dndSchedule: 40,
} as const;

/** Profile fields other people can see (mirrored to public_profiles). */
export interface PublicProfileFields {
    username: string;
    nickname: string;
    /** Four digits; friends find each other with `nickname#tag`. */
    nicknameTag: string;
    avatarUrl: string;
    bannerUrl: string;
    bio: string;
    customStatus: string;
    statusEmoji: string;
    accentColor: string;
    favoriteLangs: string[];
    socialGithub: string;
    socialLinkedin: string;
    socialTwitter: string;
    socialWebsite: string;
    socialYoutube: string;
    socialTiktok: string;
    socialInstagram: string;
    socialFacebook: string;
    publicProfile: boolean;
    publicProjects: boolean;
    dndMode: boolean;
}

/** Private preferences (users/{email} only). */
export interface PrivateSettingsFields {
    emailNotifications: boolean;
    newFeatureAlerts: boolean;
    showOnlineStatus: boolean;
    timezone: string;
    typingIndicator: boolean;
    readReceipts: boolean;
    msgFontSize: "small" | "medium" | "large";
    chatBackground: "default" | "dark" | "gradient" | "pattern";
    voiceMsgQuality: "low" | "normal" | "high";
    linkPreview: boolean;
    gifAutoplay: boolean;
    enterToSend: boolean;
    stickerSuggestions: boolean;
    whoCanAdd: "everyone" | "friends_of_friends" | "nobody";
    hideFriendList: boolean;
    showLastSeen: boolean;
    photoVisibility: "everyone" | "friends" | "nobody";
    bioVisibility: "everyone" | "friends" | "nobody";
    msgNotifications: boolean;
    callNotifications: boolean;
    friendReqNotifications: boolean;
    likeNotifications: boolean;
    notifSound: boolean;
    dndSchedule: string;
    bubbleColor: string;
    compactMode: boolean;
    reduceAnimations: boolean;
    highContrast: boolean;
    uiFontSize: "small" | "medium" | "large";
    emojiStyle: "native" | "twemoji" | "noto";
}

export type EditableAccountFields = PublicProfileFields & PrivateSettingsFields;

/** Read-only facts about the account returned with the profile. */
export interface AccountFacts {
    email: string;
    provider: string | null;
    hasPassword: boolean;
    createdAt: string | null;
    lastLoginAt: string | null;
    /** Hanogt team role shown as a badge; null for everyone else. */
    staffRole: StaffRoleBadge | null;
}

export interface AccountProfileResponse {
    account: AccountFacts;
    fields: EditableAccountFields;
    /** Small counters for the profile header and Hanogt AI ("how many projects do I have?"). */
    stats: { projects: number | null; gameProjects: number | null; groups: number | null; friends: number | null; mediaPosts: number | null };
}

/** PATCH body: any subset of the editable fields. */
export type AccountProfilePatch = Partial<EditableAccountFields>;

export const DEFAULT_ACCOUNT_FIELDS: EditableAccountFields = {
    username: "",
    nickname: "",
    nicknameTag: "",
    avatarUrl: "",
    bannerUrl: "",
    bio: "",
    customStatus: "",
    statusEmoji: "😊",
    accentColor: "#3B82F6",
    favoriteLangs: [],
    socialGithub: "",
    socialLinkedin: "",
    socialTwitter: "",
    socialWebsite: "",
    socialYoutube: "",
    socialTiktok: "",
    socialInstagram: "",
    socialFacebook: "",
    publicProfile: true,
    publicProjects: true,
    dndMode: false,
    emailNotifications: true,
    newFeatureAlerts: true,
    showOnlineStatus: true,
    timezone: "Europe/Istanbul",
    typingIndicator: true,
    readReceipts: true,
    msgFontSize: "medium",
    chatBackground: "default",
    voiceMsgQuality: "normal",
    linkPreview: true,
    gifAutoplay: true,
    enterToSend: true,
    stickerSuggestions: true,
    whoCanAdd: "everyone",
    hideFriendList: false,
    showLastSeen: true,
    photoVisibility: "everyone",
    bioVisibility: "everyone",
    msgNotifications: true,
    callNotifications: true,
    friendReqNotifications: true,
    likeNotifications: true,
    notifSound: true,
    dndSchedule: "",
    bubbleColor: "#3B82F6",
    compactMode: false,
    reduceAnimations: false,
    highContrast: false,
    uiFontSize: "medium",
    emojiStyle: "native",
};

export const PUBLIC_PROFILE_KEYS: ReadonlyArray<keyof PublicProfileFields> = [
    "username", "nickname", "nicknameTag", "avatarUrl", "bannerUrl", "bio", "customStatus", "statusEmoji", "accentColor",
    "favoriteLangs", "socialGithub", "socialLinkedin", "socialTwitter", "socialWebsite", "socialYoutube", "socialTiktok",
    "socialInstagram", "socialFacebook", "publicProfile", "publicProjects", "dndMode",
];

export const EDITABLE_ACCOUNT_KEYS = Object.keys(DEFAULT_ACCOUNT_FIELDS) as ReadonlyArray<keyof EditableAccountFields>;

const ENUMS: Partial<Record<keyof EditableAccountFields, readonly string[]>> = {
    msgFontSize: ["small", "medium", "large"],
    chatBackground: ["default", "dark", "gradient", "pattern"],
    voiceMsgQuality: ["low", "normal", "high"],
    whoCanAdd: ["everyone", "friends_of_friends", "nobody"],
    photoVisibility: ["everyone", "friends", "nobody"],
    bioVisibility: ["everyone", "friends", "nobody"],
    uiFontSize: ["small", "medium", "large"],
    emojiStyle: ["native", "twemoji", "noto"],
};

const TEXT_LIMITS: Partial<Record<keyof EditableAccountFields, number>> = {
    username: PROFILE_TEXT_LIMITS.username,
    nickname: PROFILE_TEXT_LIMITS.nickname,
    bio: PROFILE_TEXT_LIMITS.bio,
    customStatus: PROFILE_TEXT_LIMITS.customStatus,
    statusEmoji: PROFILE_TEXT_LIMITS.statusEmoji,
    socialGithub: PROFILE_TEXT_LIMITS.social,
    socialLinkedin: PROFILE_TEXT_LIMITS.social,
    socialTwitter: PROFILE_TEXT_LIMITS.social,
    socialWebsite: PROFILE_TEXT_LIMITS.social,
    socialYoutube: PROFILE_TEXT_LIMITS.social,
    socialTiktok: PROFILE_TEXT_LIMITS.social,
    socialInstagram: PROFILE_TEXT_LIMITS.social,
    socialFacebook: PROFILE_TEXT_LIMITS.social,
    timezone: PROFILE_TEXT_LIMITS.timezone,
    dndSchedule: PROFILE_TEXT_LIMITS.dndSchedule,
};

export const MAX_FAVORITE_LANGS = 5;

/** Plain https URL without spaces or characters that could break out of CSS url(). Empty is allowed. */
export function isSafeProfileUrl(value: string) {
    return value === "" || (value.length <= 2048 && /^https:\/\/[^\s"'()<>\\]+$/.test(value));
}

export function isHexColor(value: string) {
    return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value);
}

export type ProfileFieldError = { field: keyof EditableAccountFields; code: "type" | "too_long" | "invalid" | "required" };

/**
 * Validates and normalizes a PATCH body. Unknown keys are reported as errors
 * (never silently written). Returns the cleaned patch or the first error.
 */
export function sanitizeAccountPatch(input: unknown): { ok: true; patch: AccountProfilePatch } | { ok: false; error: ProfileFieldError | { field: string; code: "unknown_field" } } {
    if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: { field: "", code: "unknown_field" } };
    const patch: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
        if (!(key in DEFAULT_ACCOUNT_FIELDS)) return { ok: false, error: { field: key, code: "unknown_field" } };
        const field = key as keyof EditableAccountFields;
        const fallback = DEFAULT_ACCOUNT_FIELDS[field];
        if (typeof fallback === "boolean") {
            if (typeof raw !== "boolean") return { ok: false, error: { field, code: "type" } };
            patch[field] = raw;
            continue;
        }
        if (Array.isArray(fallback)) {
            if (!Array.isArray(raw) || raw.some((item) => typeof item !== "string")) return { ok: false, error: { field, code: "type" } };
            const unique = [...new Set((raw as string[]).map((item) => item.trim()).filter(Boolean))];
            if (unique.length > MAX_FAVORITE_LANGS || unique.some((item) => item.length > 40)) return { ok: false, error: { field, code: "too_long" } };
            patch[field] = unique;
            continue;
        }
        if (typeof raw !== "string") return { ok: false, error: { field, code: "type" } };
        // eslint-disable-next-line no-control-regex
        const value = raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
        const allowed = ENUMS[field];
        if (allowed) {
            if (!allowed.includes(value)) return { ok: false, error: { field, code: "invalid" } };
            patch[field] = value;
            continue;
        }
        if (field === "avatarUrl" || field === "bannerUrl") {
            if (!isSafeProfileUrl(value)) return { ok: false, error: { field, code: "invalid" } };
        } else if (field === "accentColor" || field === "bubbleColor") {
            if (!isHexColor(value)) return { ok: false, error: { field, code: "invalid" } };
        } else if (field === "nicknameTag") {
            if (!/^[0-9]{4}$/.test(value)) return { ok: false, error: { field, code: "invalid" } };
        } else if (field === "username" || field === "nickname") {
            if (!value) return { ok: false, error: { field, code: "required" } };
            if (/[<>]/.test(value)) return { ok: false, error: { field, code: "invalid" } };
        }
        const limit = TEXT_LIMITS[field];
        if (limit !== undefined && [...value].length > limit) return { ok: false, error: { field, code: "too_long" } };
        patch[field] = value;
    }
    return { ok: true, patch: patch as AccountProfilePatch };
}

/**
 * Fills missing or invalid stored values with defaults (old documents have
 * gaps). Over-long legacy text is shortened instead of dropped, so an old
 * profile never shows up empty.
 */
export function normalizeStoredAccount(raw: Record<string, unknown> | null | undefined): EditableAccountFields {
    const result = { ...DEFAULT_ACCOUNT_FIELDS } as Record<string, unknown>;
    if (!raw) return result as unknown as EditableAccountFields;
    for (const key of EDITABLE_ACCOUNT_KEYS) {
        let value = raw[key];
        if (value === undefined || value === null) continue;
        const limit = TEXT_LIMITS[key];
        if (typeof value === "string" && limit !== undefined) value = [...value.trim()].slice(0, limit).join("");
        if (Array.isArray(value) && key === "favoriteLangs") value = value.filter((item) => typeof item === "string").slice(0, MAX_FAVORITE_LANGS);
        const single = sanitizeAccountPatch({ [key]: value });
        if (single.ok) Object.assign(result, single.patch);
    }
    return result as unknown as EditableAccountFields;
}
