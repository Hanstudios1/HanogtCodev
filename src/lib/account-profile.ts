/**
 * Shape and validation of the signed-in user's own profile and settings, as
 * served by /api/account/profile. Shared by the API route (server), Account
 * Settings and Hanogt AI (client), so it is dependency-free.
 *
 * Public fields are mirrored to public_profiles/{email}; private settings stay
 * in users/{email}. The validation mirrors validProfileFields() in
 * firestore.rules so a value accepted here is also valid for direct writes.
 */

import { STATUS_PREFERENCES, isStatusPreference, type PresenceStatus, type StatusPreference } from "@/lib/presence";

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
    /**
     * Mirrors "Do Not Disturb" for older readers. The status preference
     * decides it: a PATCH with dndMode alone sets statusPreference.
     */
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
    /** Online (with auto idle), Idle, Do Not Disturb or Invisible (lib/presence.ts). */
    statusPreference: StatusPreference;
}

export type EditableAccountFields = PublicProfileFields & PrivateSettingsFields;

/** Stable `code` of every error response of /api/account/profile. */
export type AccountProfileErrorCode =
    | "unauthorized"
    | "bad_origin"
    | "rate_limited"
    | "invalid_body"
    | "unknown_field"
    | "invalid_field"
    | "nickname_taken"
    | "unavailable";

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
    /** The status others see right now (effectiveStatus of the public profile). */
    presence: PresenceStatus;
    /** Small counters for the profile header and Hanogt AI ("how many projects do I have?"). */
    stats: { projects: number | null; gameProjects: number | null; groups: number | null; friends: number | null; mediaPosts: number | null };
}

/** PATCH body: any subset of the editable fields. */
export type AccountProfilePatch = Partial<EditableAccountFields>;

/** Error body: a Turkish message for logs plus the machine `code` the UI translates. */
export interface AccountProfileErrorBody {
    error: string;
    code: AccountProfileErrorCode;
    /** The offending field for unknown_field / invalid_field. */
    field?: string;
    reason?: ProfileFieldError["code"];
}

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
    statusPreference: "auto",
};

export const PUBLIC_PROFILE_KEYS: ReadonlyArray<keyof PublicProfileFields> = [
    "username", "nickname", "nicknameTag", "avatarUrl", "bannerUrl", "bio", "customStatus", "statusEmoji", "accentColor",
    "favoriteLangs", "socialGithub", "socialLinkedin", "socialTwitter", "socialWebsite", "socialYoutube", "socialTiktok",
    "socialInstagram", "socialFacebook", "publicProfile", "publicProjects", "dndMode",
];

export const EDITABLE_ACCOUNT_KEYS = Object.keys(DEFAULT_ACCOUNT_FIELDS) as ReadonlyArray<keyof EditableAccountFields>;

// Own-key lookups only: `key in object` is also true for "toString",
// "constructor" or "__proto__", which would slip past the unknown-field check.
const EDITABLE_KEY_SET: ReadonlySet<string> = new Set(EDITABLE_ACCOUNT_KEYS);
const PUBLIC_KEY_SET: ReadonlySet<string> = new Set(PUBLIC_PROFILE_KEYS);

export function isEditableAccountKey(key: string): key is keyof EditableAccountFields {
    return EDITABLE_KEY_SET.has(key);
}

export function isPublicProfileKey(key: string): key is keyof PublicProfileFields {
    return PUBLIC_KEY_SET.has(key);
}

const ENUMS: Partial<Record<keyof EditableAccountFields, readonly string[]>> = {
    msgFontSize: ["small", "medium", "large"],
    chatBackground: ["default", "dark", "gradient", "pattern"],
    voiceMsgQuality: ["low", "normal", "high"],
    whoCanAdd: ["everyone", "friends_of_friends", "nobody"],
    photoVisibility: ["everyone", "friends", "nobody"],
    bioVisibility: ["everyone", "friends", "nobody"],
    uiFontSize: ["small", "medium", "large"],
    emojiStyle: ["native", "twemoji", "noto"],
    statusPreference: STATUS_PREFERENCES,
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

const SOCIAL_KEYS: ReadonlySet<string> = new Set([
    "socialGithub", "socialLinkedin", "socialTwitter", "socialWebsite", "socialYoutube", "socialTiktok", "socialInstagram", "socialFacebook",
]);

const own = <T>(table: Partial<Record<string, T>>, key: string): T | undefined => (Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined);

export const MAX_FAVORITE_LANGS = 5;
const MAX_FAVORITE_LANG_LENGTH = 40;

/** Characters the nickname input accepts (friends type `nickname#tag`). */
export const NICKNAME_INPUT_PATTERN = /[^a-zA-Z0-9_çğıöşüÇĞİÖŞÜ]/g;
/** Length the forms suggest for nicknames; the server accepts up to PROFILE_TEXT_LIMITS.nickname. */
export const NICKNAME_INPUT_MAX = 20;

/** Plain https URL without spaces or characters that could break out of CSS url(). Empty is allowed. */
export function isSafeProfileUrl(value: string) {
    return value === "" || (value.length <= 2048 && /^https:\/\/[^\s"'()<>\\]+$/.test(value));
}

export function isHexColor(value: string) {
    return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value);
}

export function isNicknameTag(value: unknown): value is string {
    return typeof value === "string" && /^[0-9]{4}$/.test(value);
}

/** IANA time zone name such as "Europe/Istanbul", "America/Argentina/Buenos_Aires" or "UTC". */
export function isTimeZoneName(value: string) {
    return /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,3}$/.test(value);
}

/**
 * Social handles and links ("github.com/ada", "@ada", "https://…"). Profiles
 * render them as links, so other schemes (javascript:, data:) and characters
 * that break HTML attributes are refused. Empty is allowed.
 */
export function isSafeSocialLink(value: string) {
    if (value === "") return true;
    if (/[<>"'`\\]/.test(value)) return false;
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value);
    return !scheme || /^https?$/i.test(scheme[1]);
}

/** Case-insensitive nickname comparison that also folds the Turkish dotted/dotless i. */
export function sameNickname(a: string, b: string) {
    const left = a.trim();
    const right = b.trim();
    return left.toLowerCase() === right.toLowerCase() || left.toLocaleLowerCase("tr-TR") === right.toLocaleLowerCase("tr-TR");
}

/**
 * Nickname for accounts that never chose one: the username (as Google sign-up
 * does), else the e-mail name in the characters the nickname form accepts.
 */
export function defaultNickname(username: string, email: string) {
    const name = [...username.replace(/[<>]/g, "").trim()].slice(0, PROFILE_TEXT_LIMITS.nickname).join("").trim();
    return name || (email.split("@")[0] || "").replace(NICKNAME_INPUT_PATTERN, "").slice(0, NICKNAME_INPUT_MAX) || "Hanogt";
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
        if (!isEditableAccountKey(key)) return { ok: false, error: { field: key, code: "unknown_field" } };
        const field = key;
        const fallback = DEFAULT_ACCOUNT_FIELDS[field];
        if (typeof fallback === "boolean") {
            if (typeof raw !== "boolean") return { ok: false, error: { field, code: "type" } };
            patch[field] = raw;
            continue;
        }
        if (Array.isArray(fallback)) {
            if (!Array.isArray(raw) || raw.some((item) => typeof item !== "string")) return { ok: false, error: { field, code: "type" } };
            const unique = [...new Set((raw as string[]).map((item) => item.trim()).filter(Boolean))];
            if (unique.length > MAX_FAVORITE_LANGS || unique.some((item) => item.length > MAX_FAVORITE_LANG_LENGTH)) return { ok: false, error: { field, code: "too_long" } };
            patch[field] = unique;
            continue;
        }
        if (typeof raw !== "string") return { ok: false, error: { field, code: "type" } };
        const value = raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
        const allowed = own(ENUMS, field);
        if (allowed) {
            if (!allowed.includes(value)) return { ok: false, error: { field, code: "invalid" } };
            patch[field] = value;
            continue;
        }
        const limit = own(TEXT_LIMITS, field);
        if (limit !== undefined && [...value].length > limit) return { ok: false, error: { field, code: "too_long" } };
        if (field === "avatarUrl" || field === "bannerUrl") {
            if (!isSafeProfileUrl(value)) return { ok: false, error: { field, code: "invalid" } };
        } else if (field === "accentColor" || field === "bubbleColor") {
            if (!isHexColor(value)) return { ok: false, error: { field, code: "invalid" } };
        } else if (field === "nicknameTag") {
            if (!isNicknameTag(value)) return { ok: false, error: { field, code: "invalid" } };
        } else if (field === "username" || field === "nickname") {
            if (!value) return { ok: false, error: { field, code: "required" } };
            if (/[<>]/.test(value)) return { ok: false, error: { field, code: "invalid" } };
        } else if (field === "timezone") {
            if (!isTimeZoneName(value)) return { ok: false, error: { field, code: "invalid" } };
        } else if (SOCIAL_KEYS.has(field)) {
            if (!isSafeSocialLink(value)) return { ok: false, error: { field, code: "invalid" } };
        }
        patch[field] = value;
    }
    return { ok: true, patch: patch as AccountProfilePatch };
}

const storedValue = (raw: Record<string, unknown> | null | undefined, key: string) => (raw && Object.prototype.hasOwnProperty.call(raw, key) ? raw[key] : undefined);

/**
 * One stored value read leniently: over-long text is shortened instead of
 * dropped, "true"/"false" strings and numeric tags are converted and invalid
 * favourite languages are skipped one by one. Undefined when unusable.
 */
export function readStoredAccountValue<K extends keyof EditableAccountFields>(key: K, input: unknown): EditableAccountFields[K] | undefined {
    let value = input;
    if (value === undefined || value === null) return undefined;
    const fallback = DEFAULT_ACCOUNT_FIELDS[key];
    if (typeof fallback === "boolean" && (value === "true" || value === "false")) value = value === "true";
    if (key === "nicknameTag" && typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 9999) value = String(value).padStart(4, "0");
    if (typeof value === "string") {
        let text = key === "username" || key === "nickname" ? value.replace(/[<>]/g, "") : value;
        const limit = own(TEXT_LIMITS, key);
        if (limit !== undefined) text = [...text.trim()].slice(0, limit).join("");
        value = text;
    }
    if (key === "favoriteLangs" && Array.isArray(value)) {
        const names = value
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter((item) => item && item.length <= MAX_FAVORITE_LANG_LENGTH);
        value = [...new Set(names)].slice(0, MAX_FAVORITE_LANGS);
    }
    const single = sanitizeAccountPatch({ [key]: value });
    return single.ok ? single.patch[key] as EditableAccountFields[K] : undefined;
}

/**
 * Fills missing or invalid stored values with defaults (old documents have
 * gaps), reading every value leniently (see readStoredAccountValue) so an old
 * profile never shows up empty.
 */
export function normalizeStoredAccount(raw: Record<string, unknown> | null | undefined): EditableAccountFields {
    const result = { ...DEFAULT_ACCOUNT_FIELDS } as Record<string, unknown>;
    if (!raw) return result as unknown as EditableAccountFields;
    for (const key of EDITABLE_ACCOUNT_KEYS) {
        const value = readStoredAccountValue(key, storedValue(raw, key));
        if (value !== undefined) result[key] = value;
    }
    // Accounts from before the status menu kept "Do Not Disturb" in dndMode.
    if (!isStatusPreference(storedValue(raw, "statusPreference")) && result.dndMode === true) result.statusPreference = "dnd";
    result.dndMode = result.statusPreference === "dnd";
    return result as unknown as EditableAccountFields;
}

const filled = (value: unknown) => value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0);

/**
 * The account as stored across users/{email} and public_profiles/{email}: a
 * usable, non-empty value in the users document wins; public fields fall back
 * to the public profile (some accounts only have them there).
 */
export function mergeStoredAccount(user: Record<string, unknown> | null | undefined, publicProfile: Record<string, unknown> | null | undefined): EditableAccountFields {
    const result = normalizeStoredAccount(user) as unknown as Record<string, unknown>;
    if (!publicProfile) return result as unknown as EditableAccountFields;
    for (const key of PUBLIC_PROFILE_KEYS) {
        if (filled(readStoredAccountValue(key, storedValue(user, key)))) continue;
        const fromProfile = readStoredAccountValue(key, storedValue(publicProfile, key));
        if (filled(fromProfile)) result[key] = fromProfile;
    }
    // A legacy dndMode (public profile only) counts while no preference is stored.
    if (!isStatusPreference(storedValue(user, "statusPreference")) && result.dndMode === true) result.statusPreference = "dnd";
    result.dndMode = result.statusPreference === "dnd";
    return result as unknown as EditableAccountFields;
}

function sameValue(a: unknown, b: unknown) {
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, index) => item === b[index]);
    return a === b;
}

/** The fields of `next` that differ from `base` (what a PATCH has to send). */
export function diffAccountFields(base: EditableAccountFields, next: EditableAccountFields): AccountProfilePatch {
    const patch: Record<string, unknown> = {};
    for (const key of EDITABLE_ACCOUNT_KEYS) {
        if (!sameValue(base[key], next[key])) patch[key] = next[key];
    }
    return patch as AccountProfilePatch;
}

/** Splits a validated patch into the part mirrored to public_profiles and the rest. */
export function splitAccountPatch(patch: AccountProfilePatch): { publicPatch: Partial<PublicProfileFields>; privatePatch: Partial<PrivateSettingsFields> } {
    const publicPatch: Record<string, unknown> = {};
    const privatePatch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        if (isPublicProfileKey(key)) publicPatch[key] = value;
        else privatePatch[key] = value;
    }
    return { publicPatch: publicPatch as Partial<PublicProfileFields>, privatePatch: privatePatch as Partial<PrivateSettingsFields> };
}
