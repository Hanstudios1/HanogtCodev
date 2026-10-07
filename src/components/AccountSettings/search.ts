import { searchKey } from "@/components/Editor/search";
import type { Copy } from "@/lib/i18n";
import { C, FIELD_LABELS } from "./copy";
import type { SectionId } from "./sections";

/** A setting's name: a locale key (t) or inline copy (tx), the same one its row shows. */
export type SettingLabel = { key: string } | Copy;

/**
 * A setting the search box finds. `target` is the id of the element to bring
 * into view (`field-<key>` for form fields); without one the section opens.
 */
export type SearchEntry = { section: SectionId; label: SettingLabel; target?: string; keywords?: Copy[] };

export function isKeyLabel(label: SettingLabel): label is { key: string } {
    return "key" in label;
}

const social = (key: keyof typeof FIELD_LABELS): SearchEntry => ({ section: "profile", label: FIELD_LABELS[key] as Copy, target: `field-${key}`, keywords: [{ TR: "bağlantı", EN: "link" }] });

export const SEARCH_ENTRIES: SearchEntry[] = [
    { section: "account", label: C.overview, keywords: [C.memberSince, C.lastSignIn, C.statsLabel] },
    { section: "account", label: { key: "username" }, target: "field-username", keywords: [{ TR: "görünen ad, isim", EN: "display name" }] },
    { section: "account", label: { key: "nickname_tag" }, target: "field-nickname", keywords: [C.tagLabel, C.newTag] },
    { section: "account", label: { key: "email" }, target: "account-email" },
    { section: "account", label: { key: "login_provider" }, target: "setting-sign-out", keywords: [C.session] },
    { section: "account", label: { key: "sign_out" }, target: "setting-sign-out", keywords: [{ TR: "oturumu kapat", EN: "log out" }] },

    { section: "profile", label: { key: "avatar_url" }, target: "field-avatarUrl", keywords: [{ TR: "profil fotoğrafı, avatar", EN: "profile photo, avatar" }] },
    { section: "profile", label: { key: "banner_url" }, target: "field-bannerUrl", keywords: [{ TR: "kapak görseli", EN: "cover image" }] },
    { section: "profile", label: { key: "accent_color" }, target: "field-accentColor", keywords: [{ TR: "renk", EN: "colour color" }] },
    { section: "profile", label: C.planBadgeTitle, target: "setting-plan-badge", keywords: [{ TR: "Plus Pro rozet", EN: "Plus Pro badge" }] },
    { section: "profile", label: { key: "bio" }, target: "field-bio", keywords: [C.about] },
    { section: "profile", label: { key: "favorite_langs" }, target: "field-favoriteLangs", keywords: [{ TR: "programlama dilleri", EN: "programming languages" }] },
    { section: "profile", label: { key: "social_links" }, target: "setting-social-links", keywords: [{ TR: "sosyal medya", EN: "social media" }] },
    social("socialGithub"),
    social("socialLinkedin"),
    social("socialTwitter"),
    social("socialWebsite"),
    social("socialYoutube"),
    social("socialTiktok"),
    social("socialInstagram"),
    social("socialFacebook"),

    { section: "status", label: C.statusTitle, target: "setting-status", keywords: [{ TR: "çevrimiçi, boşta, rahatsız etmeyin, görünmez", EN: "online, idle, do not disturb, invisible" }] },
    { section: "status", label: FIELD_LABELS.customStatus as Copy, target: "field-customStatus" },
    { section: "status", label: { key: "online_status" }, target: "field-showOnlineStatus", keywords: [C.visibility] },
    { section: "status", label: { key: "show_last_seen" }, target: "field-showLastSeen", keywords: [C.visibility] },

    { section: "privacy", label: C.security, target: "setting-security", keywords: [{ TR: "güvenlik durumu", EN: "security status" }] },
    { section: "privacy", label: C.passwordTitle, target: "security-password", keywords: [{ TR: "parola, şifre değiştir", EN: "password, change password" }] },
    { section: "privacy", label: C.twoFactor, target: "security-2fa", keywords: [{ TR: "2FA, doğrulama uygulaması, kurtarma kodları", EN: "2FA, authenticator, recovery codes" }] },
    { section: "privacy", label: C.sessionsTitle, target: "security-sessions", keywords: [C.signOutOthers, { TR: "son girişler, cihazlar", EN: "recent sign-ins, devices" }] },
    { section: "privacy", label: { key: "public_profile" }, target: "field-publicProfile", keywords: [C.profileVisibility] },
    { section: "privacy", label: { key: "public_projects_setting" }, target: "field-publicProjects", keywords: [C.profileVisibility] },
    { section: "privacy", label: { key: "bio_visibility" }, target: "field-bioVisibility", keywords: [C.profileVisibility] },
    { section: "privacy", label: { key: "who_can_add" }, target: "field-whoCanAdd", keywords: [C.friendRequests] },

    { section: "notifications", label: { key: "msg_notification" }, target: "field-msgNotifications" },
    { section: "notifications", label: C.mentionNotifications, target: "field-mentionNotifications", keywords: [{ TR: "bahsetme, @herkes", EN: "mention, @everyone" }] },
    { section: "notifications", label: { key: "call_notification" }, target: "field-callNotifications", keywords: [{ TR: "cevapsız arama", EN: "missed call" }] },
    { section: "notifications", label: { key: "friend_req_notification" }, target: "field-friendReqNotifications" },

    { section: "messaging", label: { key: "typing_indicator" }, target: "field-typingIndicator" },
    { section: "messaging", label: { key: "read_receipts_setting" }, target: "field-readReceipts", keywords: [{ TR: "görüldü", EN: "seen" }] },
    { section: "messaging", label: { key: "gif_autoplay" }, target: "field-gifAutoplay" },
    { section: "messaging", label: { key: "enter_to_send" }, target: "field-enterToSend" },
    { section: "messaging", label: { key: "msg_font_size" }, target: "field-msgFontSize" },
    { section: "messaging", label: { key: "chat_background" }, target: "field-chatBackground" },
    { section: "messaging", label: { key: "voice_msg_quality" }, target: "field-voiceMsgQuality", keywords: [{ TR: "sesli mesaj", EN: "voice message" }] },

    { section: "appearance", label: C.theme, target: "setting-theme", keywords: [C.themeLight, C.themeDark, { TR: "karanlık mod", EN: "dark mode" }] },
    { section: "appearance", label: C.language, target: "setting-language", keywords: [{ TR: "arayüz dili", EN: "interface language" }] },
    { section: "appearance", label: { key: "reduce_animations" }, target: "field-reduceAnimations", keywords: [C.accessibility, { TR: "hareket", EN: "motion" }] },
    { section: "appearance", label: { key: "high_contrast" }, target: "field-highContrast", keywords: [C.accessibility] },

    { section: "editor", label: C.openEditorSettings, target: "setting-editor", keywords: [C.editorTitle, { TR: "yazı tipi, kısayollar", EN: "font, shortcuts" }] },
    { section: "editor", label: { key: "reset_editor" }, target: "setting-reset-editor" },

    { section: "ai", label: C.aiTitle, target: "setting-ai", keywords: [{ TR: "talimatlar, üslup, yanıt", EN: "instructions, tone, answers" }] },
    { section: "ai", label: C.aiUsage, target: "setting-ai", keywords: [{ TR: "kullanım hakkı", EN: "allowance" }] },

    { section: "data", label: C.exportTitle, target: "setting-export", keywords: [{ TR: "yedek, JSON, dışa aktar", EN: "backup, JSON, export" }] },
    { section: "data", label: { key: "delete_account" }, target: "setting-delete", keywords: [{ TR: "hesabı kapat", EN: "close account" }] },
];

/** Search words: accents and case folded (the Turkish dotless i too), split on spaces. */
export function searchTerms(query: string) {
    return searchKey(query).split(/\s+/).filter(Boolean);
}

/** True when every search word appears somewhere in the texts. */
export function matchesAll(terms: string[], texts: string[]) {
    const haystack = searchKey(texts.join(" "));
    return terms.every((term) => haystack.includes(term));
}

/** Higher first: the name starts with the query (or a word in it does), then contains it, then only other words matched. */
export function matchRank(query: string, name: string) {
    const needle = searchKey(query).trim();
    const haystack = searchKey(name);
    if (haystack.startsWith(needle) || haystack.includes(` ${needle}`)) return 2;
    return haystack.includes(needle) ? 1 : 0;
}
