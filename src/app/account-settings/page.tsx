"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useEffectEvent, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { signOut } from "next-auth/react";
import { prepareSignOut } from "@/lib/ai/sign-out";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Bell, ChevronRight, CircleDot, Clock, Code2, Copy as CopyIcon, Database, Download, ExternalLink, Eye, EyeOff, Gem, Github, Globe2, Hash, Image as ImageIcon, KeyRound, Laptop, Link2, Linkedin, LoaderCircle, Lock, LogOut, Mail, Megaphone, MessageCircle, Monitor, Moon, Paintbrush, Palette, RefreshCw, Save, Shield, Shuffle, Sparkles, Star, Sun, Trash2, Twitter, Undo2, User, UserRound, Users, type LucideIcon } from "lucide-react";
import Header from "@/components/Header";
import TwoFactorSettings from "@/components/Account/TwoFactorSettings";
import { ToastViewport, useToasts } from "@/components/Editor/Toasts";
import PlanBadge from "@/components/PlanBadge";
import PlanBadgeSetting from "@/components/Plans/PlanBadgeSetting";
import PresenceAvatar from "@/components/PresenceAvatar";
import { useRawSession } from "@/components/Provider";
import StaffBadge, { parseStaffRole } from "@/components/StaffBadge";
import StatusMenu, { announceOwnProfile, saveOwnProfile } from "@/components/StatusMenu";
import {
    EDITABLE_ACCOUNT_KEYS, NICKNAME_INPUT_MAX, NICKNAME_INPUT_PATTERN, PROFILE_TEXT_LIMITS, diffAccountFields, isSafeProfileUrl, sanitizeAccountPatch,
    type AccountFacts, type AccountProfileErrorBody, type AccountProfileResponse, type EditableAccountFields,
} from "@/lib/account-profile";
import { reportPresenceOffline, useOwnStatus } from "@/lib/account-profile-client";
import { DEFAULT_EDITOR_SETTINGS, readEditorSettings, resetEditorSettings } from "@/lib/editor-settings";
import { LANGUAGES, useI18n, type Copy } from "@/lib/i18n";
import { visiblePlanBadge, type PlanBadgeState } from "@/lib/plan-badge";
import { PRESENCE_STATUS_COPY, STATUS_PREFERENCE_COPY, resolvePresence, type PresenceStatus } from "@/lib/presence";
import { POPULAR_LANGUAGE_IDS, getLanguage } from "@/lib/runtimes/languages";
import { useTheme, type ThemePreference } from "@/lib/theme";

// Names people can mark as favourites. The runnable languages come from the
// editor's single source of truth; framework/library names are kept as before
// so previously saved favourites still match.
const PROGRAMMING_LANGUAGES = [...new Set([
    ...POPULAR_LANGUAGE_IDS.map((id) => (id === "sql" ? "SQL" : getLanguage(id)?.name ?? id)),
    "Ruby", "PHP", "Swift", "Dart", "Scala", "R", "Lua", "Scheme",
    "CSS", "React", "Vue", "Angular", "Node.js", "Next.js", "Flutter",
])];

const ACCENT_COLORS = [
    "#3B82F6", "#8B5CF6", "#EC4899", "#EF4444", "#F97316", "#EAB308",
    "#22C55E", "#06B6D4", "#6366F1", "#D946EF", "#14B8A6", "#F43F5E",
];

const BUBBLE_COLORS = ["#3B82F6", "#22C55E", "#EF4444", "#F97316", "#8B5CF6", "#EC4899"];

const TIMEZONES = [
    "Europe/Istanbul", "Europe/London", "Europe/Berlin", "Europe/Moscow",
    "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
    "Asia/Tokyo", "Asia/Shanghai", "Asia/Dubai", "Asia/Kolkata",
    "Australia/Sydney", "Pacific/Auckland",
];

const C = {
    title: { TR: "Hesap Ayarları", EN: "Account Settings" },
    settings: { TR: "Ayarlar", EN: "Settings" },
    groupUser: { TR: "Kullanıcı ayarları", EN: "User settings" },
    groupApp: { TR: "Uygulama ayarları", EN: "App settings" },
    groupData: { TR: "Hesap", EN: "Account" },
    loading: { TR: "Hesap bilgileriniz yükleniyor…", EN: "Loading your account…" },
    loadErrorTitle: { TR: "Profiliniz yüklenemedi", EN: "Your profile couldn't be loaded" },
    retry: { TR: "Tekrar dene", EN: "Try again" },
    signInAgain: { TR: "Yeniden giriş yap", EN: "Sign in again" },
    otherSettingsStillWork: { TR: "Dil, tema, güvenlik ve hesap işlemleri kullanılmaya devam eder.", EN: "Language, theme, security and account actions keep working." },
    needsProfile: { TR: "Bu bölüm profiliniz yüklendiğinde açılır.", EN: "This section opens once your profile has loaded." },
    unsaved: { TR: "Kaydedilmemiş değişiklikleriniz var", EN: "You have unsaved changes" },
    unsavedCount: { TR: "{count} alan değişti", EN: "{count} fields changed" },
    save: { TR: "Değişiklikleri kaydet", EN: "Save changes" },
    saveHint: { TR: "Kaydet (Ctrl/⌘+S)", EN: "Save (Ctrl/⌘+S)" },
    saving: { TR: "Kaydediliyor…", EN: "Saving…" },
    discard: { TR: "Sıfırla", EN: "Reset" },
    discardHint: { TR: "Kaydedilmemiş değişiklikleri geri al", EN: "Undo the unsaved changes" },
    saved: { TR: "Değişiklikleriniz kaydedildi.", EN: "Your changes were saved." },
    discarded: { TR: "Değişiklikler geri alındı.", EN: "The changes were discarded." },
    nothingToSave: { TR: "Kaydedilecek değişiklik yok.", EN: "There's nothing to save." },
    copyTag: { TR: "Takma adı ve etiketi kopyala", EN: "Copy nickname and tag" },
    tagCopied: { TR: "{tag} panoya kopyalandı.", EN: "{tag} was copied to the clipboard." },
    copyFailed: { TR: "Panoya kopyalanamadı.", EN: "Couldn't copy to the clipboard." },
    newTag: { TR: "Yeni etiket", EN: "New tag" },
    newTagHint: { TR: "Rastgele yeni bir 4 haneli etiket seçer; kaydettiğinizde arkadaşlarınız sizi yeni etiketle bulur.", EN: "Picks a new random 4-digit tag; once you save, friends find you with the new tag." },
    tagLabel: { TR: "Etiket", EN: "Tag" },
    memberSince: { TR: "Üyelik", EN: "Member since" },
    statsLabel: { TR: "Hesap istatistikleri", EN: "Account statistics" },
    statProjects: { TR: "Proje", EN: "Projects" },
    statGameProjects: { TR: "Oyun projesi", EN: "Game projects" },
    statGroups: { TR: "Grup", EN: "Groups" },
    statFriends: { TR: "Arkadaş", EN: "Friends" },
    statPosts: { TR: "Paylaşım", EN: "Posts" },
    urlInvalid: { TR: "https:// ile başlayan, boşluk içermeyen bir resim adresi girin.", EN: "Enter an image address that starts with https:// and has no spaces." },
    accentOption: { TR: "Vurgu rengi {color}", EN: "Accent colour {color}" },
    bubbleOption: { TR: "Baloncuk rengi {color}", EN: "Bubble colour {color}" },
    theme: { TR: "Tema", EN: "Theme" },
    themeDescription: { TR: "Bu cihazda hemen uygulanır.", EN: "Applies on this device right away." },
    themeLight: { TR: "Açık", EN: "Light" },
    themeDark: { TR: "Koyu", EN: "Dark" },
    themeSystem: { TR: "Sistem", EN: "System" },
    instantChoices: { TR: "Dil ve tema seçimleri bu cihazda hemen uygulanır; kaydetmeniz gerekmez.", EN: "Language and theme choices apply on this device right away; you don't need to save them." },
    providerPassword: { TR: "E-posta ve şifre", EN: "E-mail and password" },
    editorResetFailed: { TR: "Editör ayarları bu cihazda sıfırlandı ancak hesabınıza kaydedilemedi.", EN: "The editor settings were reset on this device but couldn't be saved to your account." },
    fieldProblem: { TR: "{field}: {problem}", EN: "{field}: {problem}" },
    currentPassword: { TR: "Mevcut şifre", EN: "Current password" },
    newPassword: { TR: "Yeni şifre", EN: "New password" },
    confirmPassword: { TR: "Yeni şifre (tekrar)", EN: "New password (again)" },
    preview: { TR: "Önizleme", EN: "Preview" },
    previewHint: { TR: "Başkalarının profil kartınızda göreceği hâli; kaydetmeden önce de güncellenir.", EN: "What others see on your profile card; it updates before you save." },
    editProfile: { TR: "Profili düzenle", EN: "Edit profile" },
    identity: { TR: "Kimlik", EN: "Identity" },
    identityHint: { TR: "Arkadaşlarınız sizi takma ad ve etiketle bulur.", EN: "Friends find you by nickname and tag." },
    session: { TR: "Oturum", EN: "Session" },
    picture: { TR: "Profil resmi ve kapak", EN: "Picture and banner" },
    about: { TR: "Hakkınızda", EN: "About you" },
    statusTitle: { TR: "Durumunuz", EN: "Your status" },
    statusHint: { TR: "Profil resminizin sağ altındaki işaret: seçtiğiniz anda kaydedilir.", EN: "The mark at the bottom right of your picture; saved as soon as you pick it." },
    statusNow: { TR: "Şu an görünen: {status}", EN: "Shown right now: {status}" },
    statusLegend: { TR: "İşaretler", EN: "Marks" },
    visibility: { TR: "Görünürlük", EN: "Visibility" },
    visibilityHint: { TR: "Bu iki ayar da hemen kaydedilir.", EN: "These two settings are saved right away too." },
    onlineHidden: { TR: "Kapalıyken herkes sizi çevrimdışı görür (Görünmez gibi).", EN: "While off, everyone sees you as offline (like Invisible)." },
    lastSeenHint: { TR: "Kapalıyken çevrimdışıyken ne zaman görüldüğünüz gösterilmez.", EN: "While off, nobody sees when you were last online." },
    settingSaved: { TR: "Ayar kaydedildi.", EN: "Setting saved." },
    settingFailed: { TR: "Ayar kaydedilemedi. Tekrar deneyin.", EN: "Couldn't save the setting. Try again." },
    profileVisibility: { TR: "Profil ve içerik görünürlüğü", EN: "Profile and content visibility" },
    whoSees: { TR: "Kimler neyi görebilir", EN: "Who can see what" },
    twoFactor: { TR: "İki adımlı doğrulama", EN: "Two-step verification" },
    passwordTitle: { TR: "Şifre", EN: "Password" },
    inApp: { TR: "Site içi bildirimler", EN: "In-app notifications" },
    emailTitle: { TR: "E-posta", EN: "E-mail" },
    quietHours: { TR: "Sessiz saatler", EN: "Quiet hours" },
    quietHoursHint: { TR: "Örn. 22:00 - 08:00", EN: "e.g. 22:00 - 08:00" },
    chat: { TR: "Sohbet", EN: "Chat" },
    chatLook: { TR: "Sohbet görünümü", EN: "Chat look" },
    language: { TR: "Dil", EN: "Language" },
    accessibility: { TR: "Erişilebilirlik ve yoğunluk", EN: "Accessibility and density" },
    region: { TR: "Bölge", EN: "Region" },
    editorTitle: { TR: "Kod editörü", EN: "Code editor" },
    editorHint: { TR: "Yazı tipi, tema, kısayollar ve çalıştırma ayarları editörün kendi sayfasında.", EN: "Font, theme, shortcuts and run settings are on the editor's own page." },
    openEditorSettings: { TR: "Editör ayarlarını aç", EN: "Open editor settings" },
    aiTitle: { TR: "Hanogt AI ayarları", EN: "Hanogt AI settings" },
    aiHint: { TR: "Hanogt AI'ın seni nasıl yanıtlayacağını (talimatlar, üslup, uzunluk, dil), yeni sohbetlerin varsayılanlarını ve sohbet geçmişini yönet.", EN: "Choose how Hanogt AI answers you (instructions, tone, length, language), how new chats start, and manage your chat history." },
    openAiSettings: { TR: "Hanogt AI ayarlarını aç", EN: "Open Hanogt AI settings" },
    aiUsage: { TR: "Kullanımım", EN: "My usage" },
    planBadgeTitle: { TR: "Plan rozeti", EN: "Plan badge" },
    planBadgeTeaser: { TR: "Plus ya da Pro aboneliğinle adının yanında bir rozet görünür.", EN: "With a Plus or Pro subscription, a badge appears next to your name." },
    seePlans: { TR: "Planları gör", EN: "See the plans" },
    exportTitle: { TR: "Verilerinizi indirin", EN: "Download your data" },
    dangerTitle: { TR: "Tehlikeli bölge", EN: "Danger zone" },
    signOutTitle: { TR: "Oturumu kapat", EN: "Sign out" },
    backToList: { TR: "Ayarlara dön", EN: "Back to settings" },
} satisfies Record<string, Copy>;

/** Messages for the `code` of /api/account/profile errors (and network failures). */
const SAVE_ERRORS: Record<string, Copy> = {
    unauthorized: { TR: "Oturumunuz sona ermiş. Değişikliklerinizi kaybetmemek için yeni bir sekmede giriş yapıp tekrar kaydedin.", EN: "Your session has ended. Sign in in a new tab, then save again so your changes aren't lost." },
    bad_origin: { TR: "İstek güvenlik denetiminden geçemedi. Sayfayı yenileyip tekrar deneyin.", EN: "The request failed a security check. Reload the page and try again." },
    rate_limited: { TR: "Çok sık kaydettiniz. Biraz bekleyip tekrar deneyin.", EN: "You saved too often. Wait a moment and try again." },
    invalid_body: { TR: "Değişiklikler gönderilemedi. Sayfayı yenileyip tekrar deneyin.", EN: "The changes couldn't be sent. Reload the page and try again." },
    unknown_field: { TR: "Değişiklikler gönderilemedi. Sayfayı yenileyip tekrar deneyin.", EN: "The changes couldn't be sent. Reload the page and try again." },
    nickname_taken: { TR: "Bu takma ad ve etiket başka bir hesapta kullanılıyor. Takma adınızı değiştirin veya “Yeni etiket” ile başka bir etiket alın.", EN: "This nickname and tag are used by another account. Change your nickname or get another tag with “New tag”." },
    unavailable: { TR: "Profil hizmeti şu anda kullanılamıyor. Değişiklikleriniz bu sayfada duruyor; biraz sonra tekrar kaydedin.", EN: "The profile service is unavailable right now. Your changes are still on this page; save again in a moment." },
    network: { TR: "Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edip tekrar kaydedin.", EN: "Couldn't reach the server. Check your internet connection and save again." },
    unknown: { TR: "Kaydedilemedi. Lütfen tekrar deneyin.", EN: "Couldn't save. Please try again." },
};

const LOAD_ERRORS: Record<string, Copy> = {
    unauthorized: { TR: "Oturumunuz doğrulanamadı. Lütfen yeniden giriş yapın.", EN: "Your session couldn't be verified. Please sign in again." },
    rate_limited: { TR: "Kısa sürede çok fazla istek yapıldı. Biraz bekleyip tekrar deneyin.", EN: "Too many requests in a short time. Wait a moment and try again." },
    network: { TR: "Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.", EN: "Couldn't reach the server. Check your internet connection." },
    unknown: { TR: "Profil bilgileriniz şu anda alınamadı. Bu genellikle geçici bir sunucu sorunudur; verileriniz güvende.", EN: "Your profile details couldn't be fetched right now. This is usually a temporary server problem; your data is safe." },
};

const PROBLEMS: Record<string, Copy> = {
    type: { TR: "değer biçimi hatalı", EN: "the value has the wrong format" },
    too_long: { TR: "çok uzun", EN: "too long" },
    invalid: { TR: "geçersiz", EN: "invalid" },
    required: { TR: "boş bırakılamaz", EN: "can't be empty" },
};

const FIELD_LABELS: Partial<Record<keyof EditableAccountFields, Copy>> = {
    username: { TR: "Kullanıcı adı", EN: "Username" },
    nickname: { TR: "Takma ad", EN: "Nickname" },
    nicknameTag: { TR: "Etiket", EN: "Tag" },
    avatarUrl: { TR: "Profil resmi adresi", EN: "Profile picture URL" },
    bannerUrl: { TR: "Kapak görseli adresi", EN: "Banner URL" },
    bio: { TR: "Hakkında", EN: "About" },
    customStatus: { TR: "Özel durum", EN: "Custom status" },
    statusEmoji: { TR: "Durum emojisi", EN: "Status emoji" },
    accentColor: { TR: "Vurgu rengi", EN: "Accent colour" },
    bubbleColor: { TR: "Baloncuk rengi", EN: "Bubble colour" },
    favoriteLangs: { TR: "Favori diller", EN: "Favourite languages" },
    socialGithub: { TR: "GitHub", EN: "GitHub" },
    socialLinkedin: { TR: "LinkedIn", EN: "LinkedIn" },
    socialTwitter: { TR: "Twitter / X", EN: "Twitter / X" },
    socialWebsite: { TR: "Web sitesi", EN: "Website" },
    socialYoutube: { TR: "YouTube", EN: "YouTube" },
    socialTiktok: { TR: "TikTok", EN: "TikTok" },
    socialInstagram: { TR: "Instagram", EN: "Instagram" },
    socialFacebook: { TR: "Facebook", EN: "Facebook" },
    timezone: { TR: "Saat dilimi", EN: "Time zone" },
    dndSchedule: { TR: "Sessiz saatler", EN: "Quiet hours" },
};

// ------------------------------------------------------------------ sections

type SectionId = "account" | "profile" | "status" | "privacy" | "notifications" | "messaging" | "appearance" | "editor" | "ai" | "data";

type SectionDefinition = { id: SectionId; icon: LucideIcon; label: Copy; hint: Copy; group: "user" | "app" | "data"; tint: string };

const SECTIONS: SectionDefinition[] = [
    { id: "account", icon: UserRound, label: { TR: "Hesabım", EN: "My Account" }, hint: { TR: "Kullanıcı adı, takma ad, oturum", EN: "Username, nickname, session" }, group: "user", tint: "from-indigo-500 to-violet-500" },
    { id: "profile", icon: Paintbrush, label: { TR: "Profil", EN: "Profile" }, hint: { TR: "Resim, kapak, hakkında, bağlantılar", EN: "Picture, banner, about, links" }, group: "user", tint: "from-fuchsia-500 to-pink-500" },
    { id: "status", icon: CircleDot, label: { TR: "Durum", EN: "Status" }, hint: { TR: "Çevrimiçi, Boşta, Rahatsız Etmeyin, Görünmez", EN: "Online, Idle, Do Not Disturb, Invisible" }, group: "user", tint: "from-emerald-500 to-teal-500" },
    { id: "privacy", icon: Shield, label: { TR: "Gizlilik ve Güvenlik", EN: "Privacy & Security" }, hint: { TR: "Görünürlük, iki adımlı doğrulama, şifre", EN: "Visibility, two-step verification, password" }, group: "user", tint: "from-sky-500 to-blue-600" },
    { id: "notifications", icon: Bell, label: { TR: "Bildirimler", EN: "Notifications" }, hint: { TR: "Mesaj, arama, istek ve e-posta bildirimleri", EN: "Message, call, request and e-mail notifications" }, group: "app", tint: "from-amber-500 to-orange-500" },
    { id: "messaging", icon: MessageCircle, label: { TR: "Mesajlaşma", EN: "Messaging" }, hint: { TR: "Yazıyor göstergesi, okundu bilgisi, sohbet görünümü", EN: "Typing indicator, read receipts, chat look" }, group: "app", tint: "from-blue-500 to-cyan-500" },
    { id: "appearance", icon: Palette, label: { TR: "Görünüm", EN: "Appearance" }, hint: { TR: "Tema, dil, yazı boyutu, erişilebilirlik", EN: "Theme, language, text size, accessibility" }, group: "app", tint: "from-rose-500 to-fuchsia-500" },
    { id: "editor", icon: Code2, label: { TR: "Editör", EN: "Editor" }, hint: { TR: "Kod editörü ayarları", EN: "Code editor settings" }, group: "app", tint: "from-zinc-600 to-zinc-800" },
    { id: "ai", icon: Sparkles, label: { TR: "Hanogt AI", EN: "Hanogt AI" }, hint: { TR: "Talimatlar, üslup, varsayılanlar, kullanım", EN: "Instructions, tone, defaults, usage" }, group: "app", tint: "from-violet-500 to-fuchsia-500" },
    { id: "data", icon: Database, label: { TR: "Veri", EN: "Data" }, hint: { TR: "Verileri indirme, hesabı silme", EN: "Download data, delete account" }, group: "data", tint: "from-cyan-600 to-teal-600" },
];

const GROUPS: Array<{ id: SectionDefinition["group"]; label: Copy }> = [
    { id: "user", label: C.groupUser },
    { id: "app", label: C.groupApp },
    { id: "data", label: C.groupData },
];

/** The section that holds a form field, so a save error can open it. */
const FIELD_SECTIONS: Partial<Record<keyof EditableAccountFields, SectionId>> = {
    username: "account", nickname: "account", nicknameTag: "account",
    avatarUrl: "profile", bannerUrl: "profile", bio: "profile", accentColor: "profile", favoriteLangs: "profile",
    socialGithub: "profile", socialLinkedin: "profile", socialTwitter: "profile", socialWebsite: "profile",
    socialYoutube: "profile", socialTiktok: "profile", socialInstagram: "profile", socialFacebook: "profile",
    customStatus: "status", statusEmoji: "status", statusPreference: "status",
    dndSchedule: "notifications", bubbleColor: "messaging", timezone: "appearance",
};

/** Fields the status menu and the visibility switches save on their own (outside the save bar). */
const INSTANT_FIELDS: ReadonlyArray<keyof EditableAccountFields> = ["statusPreference", "customStatus", "statusEmoji", "dndMode", "showOnlineStatus", "showLastSeen"];

// The open section lives in the URL hash (#profile), so reloads and the back button keep it.
function subscribeHash(callback: () => void) {
    window.addEventListener("hashchange", callback);
    return () => window.removeEventListener("hashchange", callback);
}

function hashSnapshot() {
    return window.location.hash.slice(1);
}

function serverHash() {
    return "";
}

/** Assigning the hash adds a history entry and notifies the subscription above ("" goes back to the list). */
function openSection(id: SectionId | "") {
    if (window.location.hash.slice(1) !== id) window.location.hash = id;
}

// ------------------------------------------------------------------ data helpers

type ProfileError = { code: string; status: number; field?: string; reason?: string };
type ProfileResult = { ok: true; data: AccountProfileResponse } | { ok: false; error: ProfileError };
type EditState = { key: string; base: EditableAccountFields; form: EditableAccountFields };

const INPUT = "w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/25 aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-red-500/30 dark:border-white/10 dark:bg-zinc-950";
const SELECT = "max-w-[220px] rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:border-white/10 dark:bg-zinc-950";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900";

function isProfileResponse(value: unknown): value is AccountProfileResponse {
    if (!value || typeof value !== "object") return false;
    const record = value as Partial<AccountProfileResponse>;
    return Boolean(record.account && typeof record.account.email === "string" && record.fields && typeof record.fields === "object" && record.stats);
}

async function requestProfile(init: RequestInit = {}): Promise<ProfileResult> {
    let response: Response;
    try {
        response = await fetch("/api/account/profile", { cache: "no-store", credentials: "same-origin", ...init });
    } catch {
        return { ok: false, error: { code: "network", status: 0 } };
    }
    const payload = await response.json().catch(() => null) as unknown;
    if (response.ok && isProfileResponse(payload)) return { ok: true, data: payload };
    const body = (payload && typeof payload === "object" ? payload : {}) as Partial<AccountProfileErrorBody>;
    return {
        ok: false,
        error: {
            code: typeof body.code === "string" ? body.code : "unknown",
            status: response.status,
            field: typeof body.field === "string" ? body.field : undefined,
            reason: typeof body.reason === "string" ? body.reason : undefined,
        },
    };
}

function sameField(a: unknown, b: unknown) {
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, index) => item === b[index]);
    return a === b;
}

function formatDate(iso: string | null | undefined, locale: string, options: Intl.DateTimeFormatOptions) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    try {
        return new Intl.DateTimeFormat(locale, options).format(date);
    } catch {
        return date.toISOString().slice(0, 10);
    }
}

/** Profile values are user-written: only plain https URLs reach CSS url(). */
function bannerStyle(form: EditableAccountFields) {
    const banner = form.bannerUrl.trim();
    return banner && isSafeProfileUrl(banner) && /^https:\/\//.test(banner)
        ? { background: `url("${banner}") center/cover no-repeat` }
        : { background: `linear-gradient(135deg, ${form.accentColor}, ${form.accentColor}55)` };
}

// ------------------------------------------------------------------ small controls

function ToggleSwitch({ checked, onChange, label, busy = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; busy?: boolean }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            aria-busy={busy || undefined}
            onClick={() => { if (!busy) onChange(!checked); }}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${FOCUS} ${checked ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-700"} ${busy ? "opacity-60" : ""}`}
        >
            <span className={`absolute top-0.5 block h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "start-[1.375rem]" : "start-0.5"}`} />
        </button>
    );
}

function ToggleRow({ label, description, icon: Icon, checked, onChange, busy }: { label: string; description?: string; icon?: LucideIcon; checked: boolean; onChange: (value: boolean) => void; busy?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-4 border-b border-zinc-100 py-3.5 last:border-b-0 dark:border-white/[0.06]">
            <div className="min-w-0">
                <div className="flex items-center gap-2 text-[14px] font-medium">
                    {Icon ? <Icon className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" /> : null}
                    <span>{label}</span>
                </div>
                {description ? <span className="mt-0.5 block text-[12.5px] text-zinc-500 dark:text-zinc-400">{description}</span> : null}
            </div>
            <ToggleSwitch checked={checked} onChange={onChange} label={label} busy={busy} />
        </div>
    );
}

function SelectRow<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (value: T) => void }) {
    const id = useId();
    return (
        <div className="flex items-center justify-between gap-4 border-b border-zinc-100 py-3.5 last:border-b-0 dark:border-white/[0.06]">
            <label htmlFor={id} className="min-w-0 text-[14px] font-medium">{label}</label>
            <select id={id} value={value} onChange={(event) => onChange(event.target.value as T)} className={SELECT}>
                {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
        </div>
    );
}

function Card({ title, description, icon: Icon, tone = "default", children }: { title?: string; description?: string; icon?: LucideIcon; tone?: "default" | "danger"; children: ReactNode }) {
    const titleId = useId();
    return (
        <section aria-labelledby={title ? titleId : undefined} className={`rounded-2xl border bg-white p-5 shadow-sm shadow-zinc-900/[0.03] dark:bg-zinc-900 ${tone === "danger" ? "border-red-200 dark:border-red-500/30" : "border-zinc-200 dark:border-white/[0.08]"}`}>
            {title ? (
                <div className="mb-2 flex items-start gap-3">
                    {Icon ? (
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone === "danger" ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400" : "bg-zinc-100 text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-300"}`}>
                            <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                        </span>
                    ) : null}
                    <div className="min-w-0 pt-0.5">
                        <h3 id={titleId} className={`text-[15px] font-bold ${tone === "danger" ? "text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-white"}`}>{title}</h3>
                        {description ? <p className="mt-0.5 text-[12.5px] text-zinc-500 dark:text-zinc-400">{description}</p> : null}
                    </div>
                </div>
            ) : null}
            {children}
        </section>
    );
}

function Skeleton({ rows = 2 }: { rows?: number }) {
    const { tx } = useI18n();
    return (
        <div className="space-y-4" role="status" aria-live="polite">
            <span className="sr-only">{tx(C.loading)}</span>
            {Array.from({ length: rows }, (_, index) => (
                <div key={index} className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/[0.08] dark:bg-zinc-900">
                    <div className="h-5 w-1/3 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
                    <div className="h-10 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/70" />
                    <div className="h-10 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/70" />
                </div>
            ))}
        </div>
    );
}

/** The live profile card: banner, picture with status, name, nickname#tag, custom status, about, badges. */
function ProfilePreview({ form, email, facts, status }: { form: EditableAccountFields; email: string; facts: AccountFacts | null; status: PresenceStatus | null }) {
    const { t, tx } = useI18n();
    const avatar = form.avatarUrl.trim();
    const name = form.username.trim() || email.split("@")[0];
    const custom = [form.statusEmoji, form.customStatus.trim()].filter(Boolean).join(" ");
    return (
        <article aria-label={tx(C.preview)} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-zinc-900">
            <div className="h-24" style={bannerStyle(form)} />
            <div className="px-4 pb-4">
                <div className="-mt-12 flex items-end justify-between gap-3">
                    <span className="inline-block rounded-full border-4 border-white bg-white dark:border-zinc-900 dark:bg-zinc-900">
                        <PresenceAvatar src={isSafeProfileUrl(avatar) ? avatar : null} name={name} status={status} size="xl" ring="bg-white dark:bg-zinc-900" />
                    </span>
                    <span className="mb-2 flex flex-wrap items-center justify-end gap-1.5">
                        <StaffBadge role={parseStaffRole(facts?.staffRole)} size="sm" />
                        <PlanBadge plan={visiblePlanBadge(facts?.planBadge)} size="sm" />
                    </span>
                </div>
                <p className="mt-2 break-words text-lg font-black text-zinc-900 dark:text-white">{name}</p>
                {form.nickname ? <p className="font-mono text-[13px] text-zinc-500">{form.nickname}#{form.nicknameTag || "0000"}</p> : null}
                {status ? <p className="mt-0.5 text-[12.5px] text-zinc-500 dark:text-zinc-400">{tx(PRESENCE_STATUS_COPY[status])}</p> : null}
                {custom ? <p className="mt-2 rounded-xl bg-zinc-50 px-3 py-2 text-[13px] text-zinc-700 dark:bg-white/[0.04] dark:text-zinc-200" dir="auto">{custom}</p> : null}
                <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-white/[0.06]">
                    <p className="text-[11px] font-black uppercase tracking-wider text-zinc-500">{t("bio") || "Hakkında"}</p>
                    <p className="mt-1 line-clamp-5 whitespace-pre-wrap break-words text-[13px] text-zinc-700 dark:text-zinc-300" dir="auto">{form.bio.trim() || t("no_bio") || "—"}</p>
                </div>
                {form.favoriteLangs.length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {form.favoriteLangs.map((lang) => (
                            <span key={lang} className="rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold text-white" style={{ backgroundColor: form.accentColor }}>{lang}</span>
                        ))}
                    </div>
                ) : null}
            </div>
        </article>
    );
}

// ------------------------------------------------------------------ page

export default function AccountSettingsPage() {
    const auth = useRawSession();
    const router = useRouter();
    const { t, tx, language, setLanguage, locale } = useI18n();
    const { preference: themePreference, setPreference: setThemePreference } = useTheme();
    const { toasts, push: toast, dismiss } = useToasts();
    const email = auth.status === "authenticated" ? auth.data?.user?.email?.toLowerCase() || null : null;
    const hash = useSyncExternalStore(subscribeHash, hashSnapshot, serverHash);
    const selected = SECTIONS.find((section) => section.id === hash)?.id ?? null;
    // Wide screens always show a section; narrow ones show the list until one is picked.
    const active: SectionId = selected ?? "account";
    const headingRef = useRef<HTMLHeadingElement>(null);
    const focusHeading = useRef(false);
    const reportedStatus = useOwnStatus(email);

    // Profile and settings come from /api/account/profile (server-side
    // Firestore), so they load and save even when the browser's Firebase
    // connection is broken.
    const [reloadVersion, setReloadVersion] = useState(0);
    const loadKey = email ? `${reloadVersion}|${email}` : null;
    const [loaded, setLoaded] = useState<{ key: string; profile: AccountProfileResponse | null; error: ProfileError | null } | null>(null);
    const [edit, setEdit] = useState<EditState | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<ProfileError | null>(null);
    const [instantBusy, setInstantBusy] = useState<keyof EditableAccountFields | null>(null);

    const [busyAction, setBusyAction] = useState<"export" | "delete" | "password" | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordSet, setPasswordSet] = useState(false);

    // Only a confirmed signed-out state redirects; the session is still loading on the first render.
    useEffect(() => {
        if (auth.status === "unauthenticated") router.replace("/login?callbackUrl=%2Faccount-settings");
    }, [auth.status, router]);

    useEffect(() => {
        if (!loadKey) return;
        const controller = new AbortController();
        void requestProfile({ signal: controller.signal }).then((result) => {
            if (controller.signal.aborted) return;
            if (result.ok) {
                setLoaded({ key: loadKey, profile: result.data, error: null });
                setEdit({ key: loadKey, base: result.data.fields, form: result.data.fields });
            } else {
                setLoaded({ key: loadKey, profile: null, error: result.error });
            }
        });
        return () => controller.abort();
    }, [loadKey]);

    // After picking a section, its heading takes the focus (screen readers announce it).
    useEffect(() => {
        if (!focusHeading.current) return;
        focusHeading.current = false;
        headingRef.current?.focus({ preventScroll: true });
    }, [selected]);

    const current = loaded && loaded.key === loadKey ? loaded : null;
    const profile = current?.profile ?? null;
    const loadError = current?.error ?? null;
    const form = edit && edit.key === loadKey ? edit.form : null;
    const base = edit && edit.key === loadKey ? edit.base : null;
    const patch = useMemo(() => (form && base ? diffAccountFields(base, form) : {}), [base, form]);
    const changedCount = Object.keys(patch).length;
    const dirty = changedCount > 0;
    const invalidField = saveError?.code === "invalid_field" ? saveError.field ?? null : saveError?.code === "nickname_taken" ? saveError.field ?? "nickname" : null;
    const ownStatus = reportedStatus ?? (form ? resolvePresence(form.statusPreference, "active", form.showOnlineStatus) : null);

    const setField = useCallback(<K extends keyof EditableAccountFields>(key: K, value: EditableAccountFields[K]) => {
        setEdit((state) => (state ? { ...state, form: { ...state.form, [key]: value } } : state));
        setSaveError((error) => (error && (error.field === key || (error.code === "nickname_taken" && (key === "nickname" || key === "nicknameTag"))) ? null : error));
    }, []);

    /** A save outside the save bar (status menu, visibility switches): those fields follow the server, other edits stay. */
    const applyInstantSave = useCallback((data: AccountProfileResponse) => {
        setLoaded((state) => (state?.profile ? { ...state, profile: { ...state.profile, fields: data.fields, presence: data.presence } } : state));
        setEdit((state) => {
            if (!state) return state;
            const nextBase = { ...state.base } as Record<string, unknown>;
            const nextForm = { ...state.form } as Record<string, unknown>;
            for (const key of INSTANT_FIELDS) {
                nextBase[key] = data.fields[key];
                nextForm[key] = data.fields[key];
            }
            return { ...state, base: nextBase as unknown as EditableAccountFields, form: nextForm as unknown as EditableAccountFields };
        });
    }, []);

    // Leaving with unsaved changes asks first.
    useEffect(() => {
        if (!dirty) return;
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [dirty]);

    const go = (id: SectionId) => {
        focusHeading.current = true;
        openSection(id);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const backToList = () => {
        focusHeading.current = false;
        openSection("");
        window.scrollTo({ top: 0 });
    };

    const errorMessage = (error: ProfileError, table: Record<string, Copy>) => {
        if (error.code === "invalid_field" && error.field) {
            const label = FIELD_LABELS[error.field as keyof EditableAccountFields];
            return tx(C.fieldProblem, { field: label ? tx(label) : error.field, problem: tx(PROBLEMS[error.reason ?? "invalid"] ?? PROBLEMS.invalid) });
        }
        return tx(table[error.code] ?? table.unknown);
    };

    // Opens the section of the field, then scrolls to it.
    const focusField = (field: string | undefined) => {
        if (!field) return;
        const section = FIELD_SECTIONS[field as keyof EditableAccountFields];
        if (section && section !== active) {
            focusHeading.current = false;
            openSection(section);
        }
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
            const element = document.getElementById(`field-${field}`);
            element?.scrollIntoView({ behavior: "smooth", block: "center" });
            element?.focus({ preventScroll: true });
        }));
    };

    const save = async () => {
        if (!edit || !form || !base || saving || !email) return;
        if (!dirty) {
            toast({ tone: "info", message: tx(C.nothingToSave) });
            return;
        }
        const sentForm = form;
        const changes = diffAccountFields(base, sentForm);
        // Same validation as the server, so mistakes are shown without a round trip.
        const checked = sanitizeAccountPatch(changes);
        if (!checked.ok) {
            const error: ProfileError = checked.error.code === "unknown_field"
                ? { code: "unknown_field", status: 0, field: checked.error.field }
                : { code: "invalid_field", status: 0, field: checked.error.field, reason: checked.error.code };
            setSaveError(error);
            focusField(error.field);
            return;
        }
        setSaving(true);
        setSaveError(null);
        const result = await requestProfile({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(checked.patch) });
        setSaving(false);
        if (!result.ok) {
            setSaveError(result.error);
            if (result.error.code === "invalid_field" || result.error.code === "nickname_taken") focusField(result.error.field ?? "nickname");
            return;
        }
        const fresh = result.data;
        setLoaded((state) => (state && state.key === edit.key ? { ...state, profile: fresh } : state));
        setEdit((state) => {
            if (!state || state.key !== edit.key) return state;
            const next = { ...state.form } as Record<string, unknown>;
            // Keep what was typed while the request was running.
            for (const key of EDITABLE_ACCOUNT_KEYS) {
                if (sameField(state.form[key], sentForm[key])) next[key] = fresh.fields[key];
            }
            return { ...state, base: fresh.fields, form: next as unknown as EditableAccountFields };
        });
        // The header, the status menu and the presence heartbeat pick the changes up.
        announceOwnProfile(email, fresh);
        toast({ tone: "success", message: tx(C.saved) });
    };

    const signOutNow = () => {
        reportPresenceOffline();
        prepareSignOut();
        void signOut({ callbackUrl: "/" });
    };

    const discard = () => {
        if (!dirty) return;
        setEdit((state) => (state ? { ...state, form: state.base } : state));
        setSaveError(null);
        toast({ tone: "info", message: tx(C.discarded) });
    };

    const onSaveShortcut = useEffectEvent(() => {
        void save();
    });
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "s") return;
            event.preventDefault();
            onSaveShortcut();
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, []);

    /** "Show online status" and "Show last seen" are saved at once: they change what others see right now. */
    const saveInstant = async (key: "showOnlineStatus" | "showLastSeen", value: boolean) => {
        if (!email || instantBusy) return;
        setInstantBusy(key);
        const result = await saveOwnProfile({ [key]: value });
        setInstantBusy(null);
        if (!result.ok) {
            toast({ tone: "error", message: tx(SAVE_ERRORS[result.code] ?? C.settingFailed) });
            return;
        }
        announceOwnProfile(email, result.data);
        applyInstantSave(result.data);
        toast({ tone: "success", message: tx(C.settingSaved) });
    };

    /** The badge switch saved: the facts follow (the preview and the header show it at once). */
    const applyPlanBadge = (planBadge: PlanBadgeState) => {
        setLoaded((state) => (state?.profile ? { ...state, profile: { ...state.profile, account: { ...state.profile.account, planBadge } } } : state));
    };

    const copyTag = async () => {
        if (!base) return;
        const handle = [base.nickname, base.nicknameTag].join("#");
        try {
            await navigator.clipboard.writeText(handle);
            toast({ tone: "success", message: tx(C.tagCopied, { tag: handle }) });
        } catch {
            toast({ tone: "error", message: tx(C.copyFailed) });
        }
    };

    const newTag = () => {
        if (!form) return;
        let tag = form.nicknameTag;
        while (tag === form.nicknameTag) tag = String(1000 + Math.floor(Math.random() * 9000));
        setField("nicknameTag", tag);
    };

    const toggleFavoriteLang = (lang: string) => {
        if (!form) return;
        const list = form.favoriteLangs;
        if (list.includes(lang)) setField("favoriteLangs", list.filter((item) => item !== lang));
        else if (list.length < 5) setField("favoriteLangs", [...list, lang]);
    };

    const handleDeleteAccount = async () => {
        setBusyAction("delete");
        try {
            const response = await fetch("/api/account/data", { method: "DELETE", credentials: "same-origin" });
            if (!response.ok) throw new Error(String(response.status));
            try {
                localStorage.clear();
            } catch {
                // Storage blocked: nothing to clear.
            }
            prepareSignOut();
            await signOut({ redirect: false });
            router.push("/");
        } catch {
            toast({ tone: "error", message: t("delete_error") });
        } finally {
            setBusyAction(null);
        }
    };

    const handleExportData = async () => {
        setBusyAction("export");
        try {
            const response = await fetch("/api/account/data", { cache: "no-store", credentials: "same-origin" });
            const serverData = await response.json() as Record<string, unknown>;
            if (!response.ok) throw new Error(String(response.status));
            const exportData = { ...serverData, editorSettings: readEditorSettings() };
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = ["hanogt_backup_", new Date().toISOString().slice(0, 10), ".json"].join("");
            anchor.click();
            URL.revokeObjectURL(url);
            toast({ tone: "success", message: t("export_success") });
        } catch {
            toast({ tone: "error", message: t("error_occurred") });
        } finally {
            setBusyAction(null);
        }
    };

    const handleResetEditorSettings = async () => {
        resetEditorSettings();
        toast({ tone: "success", message: t("editor_settings_reset") });
        // Keep the account copy in step, so other devices don't bring the old settings back.
        try {
            const response = await fetch("/api/account/preferences", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ editorSettings: DEFAULT_EDITOR_SETTINGS }),
            });
            if (!response.ok) throw new Error(String(response.status));
        } catch {
            toast({ tone: "warning", message: tx(C.editorResetFailed) });
        }
    };

    const hasPassword = passwordSet || Boolean(profile?.account.hasPassword);

    const handleSetPassword = async () => {
        if (newPassword.length < 10) {
            toast({ tone: "error", message: t("password_too_short") });
            return;
        }
        if (newPassword !== confirmPassword) {
            toast({ tone: "error", message: t("passwords_not_match") });
            return;
        }
        setBusyAction("password");
        try {
            const response = await fetch("/api/account/password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            const result = await response.json().catch(() => ({})) as { error?: string };
            // The password route answers in Turkish only.
            if (!response.ok) throw new Error(language === "TR" && result.error ? result.error : t("error_occurred"));
            setPasswordSet(true);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            toast({ tone: "success", message: t("password_set_success") });
        } catch (error) {
            toast({ tone: "error", message: error instanceof Error ? error.message : t("error_occurred") });
        } finally {
            setBusyAction(null);
        }
    };

    // Delete dialog: Escape closes it.
    useEffect(() => {
        if (!showDeleteConfirm) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape" && busyAction !== "delete") setShowDeleteConfirm(false);
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [busyAction, showDeleteConfirm]);

    const timezoneLabel = (zone: string) => {
        try {
            const parts = new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: "short" }).formatToParts(new Date());
            const name = parts.find((part) => part.type === "timeZoneName")?.value || "";
            return [zone.split("/").pop()?.replace(/_/g, " ") ?? zone, name ? ["(", name, ")"].join("") : ""].filter(Boolean).join(" ");
        } catch {
            return zone;
        }
    };
    const timezoneOptions = form && !TIMEZONES.includes(form.timezone) ? [form.timezone, ...TIMEZONES] : TIMEZONES;

    if (auth.status !== "authenticated" || !email) {
        return (
            <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-white">
                <Header />
                <main id="main-content" className="mx-auto max-w-6xl px-4 pb-12 pt-24 sm:px-6">
                    <Skeleton />
                </main>
            </div>
        );
    }

    const facts = profile?.account ?? null;
    const stats = profile?.stats ?? null;
    const memberSince = formatDate(facts?.createdAt, locale, { year: "numeric", month: "long" });
    const lastLogin = formatDate(facts?.lastLoginAt, locale, { dateStyle: "long", timeStyle: "short" });
    const providerLabel = facts?.provider === "google" ? "Google" : facts?.provider === "credentials" ? tx(C.providerPassword) : facts?.provider || "—";
    const number = new Intl.NumberFormat(locale);
    const statItems: Array<{ label: Copy; value: number | null }> = stats ? [
        { label: C.statProjects, value: stats.projects },
        { label: C.statGameProjects, value: stats.gameProjects },
        { label: C.statGroups, value: stats.groups },
        { label: C.statFriends, value: stats.friends },
        { label: C.statPosts, value: stats.mediaPosts },
    ] : [];
    const avatarValid = form ? isSafeProfileUrl(form.avatarUrl.trim()) : true;
    const bannerValid = form ? isSafeProfileUrl(form.bannerUrl.trim()) : true;
    const fieldInvalid = (key: keyof EditableAccountFields) => invalidField === key || undefined;
    const displayName = form?.username.trim() || auth.data?.user?.name || email.split("@")[0];
    const sectionInfo = SECTIONS.find((section) => section.id === active) ?? SECTIONS[0];
    const SectionIcon = sectionInfo.icon;
    const socialFields: Array<{ key: keyof EditableAccountFields & `social${string}`; label: string; placeholder: string; badge: string; icon: ReactNode; type?: string }> = [
        { key: "socialGithub", label: "GitHub", placeholder: "github.com/kullaniciadi", badge: "bg-zinc-900 dark:bg-white", icon: <Github className="h-5 w-5 text-white dark:text-zinc-900" aria-hidden="true" /> },
        { key: "socialLinkedin", label: "LinkedIn", placeholder: "linkedin.com/in/kullaniciadi", badge: "bg-blue-700", icon: <Linkedin className="h-5 w-5 text-white" aria-hidden="true" /> },
        { key: "socialTwitter", label: "Twitter / X", placeholder: "x.com/kullaniciadi", badge: "bg-black", icon: <Twitter className="h-5 w-5 text-white" aria-hidden="true" /> },
        { key: "socialWebsite", label: t("website"), placeholder: "https://example.com", badge: "bg-emerald-600", icon: <Globe2 className="h-5 w-5 text-white" aria-hidden="true" />, type: "url" },
        { key: "socialYoutube", label: "YouTube", placeholder: "youtube.com/@kanaliniz", badge: "bg-red-600", icon: <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.499 6.203a3.008 3.008 0 00-2.089-2.089C19.518 3.5 12 3.5 12 3.5s-7.518 0-9.41.614A3.008 3.008 0 00.501 6.203C0 8.08 0 12 0 12s0 3.92.501 5.797a3.008 3.008 0 002.089 2.089c1.892.614 9.41.614 9.41.614s7.518 0 9.41-.614a3.008 3.008 0 002.089-2.089C24 15.92 24 12 24 12s0-3.92-.501-5.797zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg> },
        { key: "socialTiktok", label: "TikTok", placeholder: "tiktok.com/@kullaniciadi", badge: "bg-black", icon: <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" /></svg> },
        { key: "socialInstagram", label: "Instagram", placeholder: "instagram.com/kullaniciadi", badge: "bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400", icon: <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg> },
        { key: "socialFacebook", label: "Facebook", placeholder: "facebook.com/kullaniciadi", badge: "bg-blue-600", icon: <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg> },
    ];
    const themeOptions: Array<{ value: ThemePreference; label: Copy; icon: LucideIcon }> = [
        { value: "light", label: C.themeLight, icon: Sun },
        { value: "dark", label: C.themeDark, icon: Moon },
        { value: "system", label: C.themeSystem, icon: Laptop },
    ];

    // The profile could not be loaded: sections that need it say so; the rest keeps working.
    const profileGate = (content: ReactNode) => {
        if (form && base) return content;
        if (loadError) {
            return (
                <section role="alert" className="rounded-2xl border border-red-200 bg-white p-5 dark:border-red-500/30 dark:bg-zinc-900">
                    <h3 className="flex items-center gap-2 text-[15px] font-bold text-red-600 dark:text-red-400"><AlertTriangle className="h-5 w-5" aria-hidden="true" />{tx(C.loadErrorTitle)}</h3>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{errorMessage(loadError, LOAD_ERRORS)}</p>
                    <p className="mt-1 text-xs text-zinc-500">{tx(C.otherSettingsStillWork)}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <button type="button" onClick={() => setReloadVersion((value) => value + 1)} className={`inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 ${FOCUS}`}>
                            <RefreshCw className="h-4 w-4" aria-hidden="true" />
                            {tx(C.retry)}
                        </button>
                        {loadError.code === "unauthorized" ? (
                            <button type="button" onClick={() => {
                                prepareSignOut();
                                void signOut({ callbackUrl: "/login?callbackUrl=%2Faccount-settings" });
                            }} className={`inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold dark:border-zinc-700 ${FOCUS}`}>
                                <LogOut className="h-4 w-4" aria-hidden="true" />
                                {tx(C.signInAgain)}
                            </button>
                        ) : null}
                    </div>
                </section>
            );
        }
        return <Skeleton />;
    };

    const sectionContent = (id: SectionId): ReactNode => {
        switch (id) {
            case "account":
                return profileGate(form && base ? (
                    <div className="space-y-4">
                        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-zinc-900">
                            <div className="h-20" style={bannerStyle(form)} />
                            <div className="px-5 pb-5">
                                <div className="-mt-10 flex flex-wrap items-end gap-3">
                                    <span className="inline-block rounded-full border-4 border-white bg-white dark:border-zinc-900 dark:bg-zinc-900">
                                        <PresenceAvatar src={avatarValid ? form.avatarUrl.trim() : null} name={displayName} status={ownStatus} size="lg" ring="bg-white dark:bg-zinc-900" />
                                    </span>
                                    <div className="min-w-0 flex-1 pb-1">
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            <p className="truncate text-lg font-black">{displayName}</p>
                                            <StaffBadge role={parseStaffRole(facts?.staffRole)} size="sm" />
                                            <PlanBadge plan={visiblePlanBadge(facts?.planBadge)} size="sm" />
                                        </div>
                                        <p className="truncate text-[13px] text-zinc-500" dir="ltr">{email}</p>
                                    </div>
                                    <button type="button" onClick={() => go("profile")} className={`mb-1 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-[13px] font-bold text-white transition hover:bg-indigo-500 ${FOCUS}`}>
                                        <Paintbrush className="h-4 w-4" aria-hidden="true" />{tx(C.editProfile)}
                                    </button>
                                </div>
                                {statItems.length ? (
                                    <dl aria-label={tx(C.statsLabel)} className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
                                        {statItems.map((item) => (
                                            <div key={item.label.EN} className="rounded-xl bg-zinc-50 px-2 py-2 text-center dark:bg-white/[0.04]">
                                                <dd className="text-lg font-bold tabular-nums">{item.value === null ? "—" : number.format(item.value)}</dd>
                                                <dt className="truncate text-[11px] text-zinc-500">{tx(item.label)}</dt>
                                            </div>
                                        ))}
                                    </dl>
                                ) : null}
                            </div>
                        </section>

                        <Card icon={Hash} title={tx(C.identity)} description={tx(C.identityHint)}>
                            <div className="space-y-4 pt-2">
                                <div>
                                    <label htmlFor="field-username" className="mb-1 block text-[13px] font-semibold text-zinc-600 dark:text-zinc-300">{t("username")}</label>
                                    <input id="field-username" type="text" value={form.username} maxLength={PROFILE_TEXT_LIMITS.username} onChange={(event) => setField("username", event.target.value)} aria-invalid={fieldInvalid("username")} className={INPUT} autoComplete="nickname" />
                                </div>
                                <div>
                                    <label htmlFor="field-nickname" className="mb-1 block text-[13px] font-semibold text-zinc-600 dark:text-zinc-300">{t("nickname_tag")}</label>
                                    <p id="nickname-hint" className="mb-2 text-xs text-zinc-500">{t("nickname_tag_desc")}</p>
                                    <div className="flex flex-wrap gap-2">
                                        <input
                                            id="field-nickname"
                                            type="text"
                                            value={form.nickname}
                                            onChange={(event) => setField("nickname", event.target.value.replace(NICKNAME_INPUT_PATTERN, ""))}
                                            placeholder={t("nickname")}
                                            maxLength={Math.max(NICKNAME_INPUT_MAX, form.nickname.length)}
                                            aria-describedby="nickname-hint"
                                            aria-invalid={fieldInvalid("nickname")}
                                            className={`${INPUT} min-w-0 flex-1 basis-40`}
                                        />
                                        <div className="flex items-center gap-1">
                                            <span id="field-nicknameTag" tabIndex={-1} aria-label={tx(C.tagLabel)} aria-invalid={fieldInvalid("nicknameTag")} className="flex items-center gap-1 rounded-xl border border-zinc-300 bg-zinc-100 px-3.5 py-2.5 font-mono text-zinc-600 aria-[invalid=true]:border-red-500 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-300">
                                                <span aria-hidden="true">#</span>
                                                <span>{form.nicknameTag || "0000"}</span>
                                            </span>
                                            <button type="button" onClick={newTag} title={tx(C.newTagHint)} className={`inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 px-3 py-2.5 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-zinc-800 ${FOCUS}`}>
                                                <Shuffle className="h-4 w-4" aria-hidden="true" />
                                                {tx(C.newTag)}
                                            </button>
                                            <button type="button" onClick={() => void copyTag()} aria-label={tx(C.copyTag)} title={tx(C.copyTag)} className={`rounded-xl p-2.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 ${FOCUS}`}>
                                                <CopyIcon className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="account-email" className="mb-1 block text-[13px] font-semibold text-zinc-600 dark:text-zinc-300">{t("email")}</label>
                                    <input id="account-email" type="email" value={email} disabled dir="ltr" className="w-full cursor-not-allowed rounded-xl border border-zinc-200 bg-zinc-100 px-3.5 py-2.5 text-sm text-zinc-500 dark:border-white/10 dark:bg-zinc-800" />
                                </div>
                            </div>
                        </Card>

                        <Card icon={KeyRound} title={tx(C.session)}>
                            <dl className="mt-2 space-y-2 rounded-xl bg-zinc-50 p-4 text-sm dark:bg-white/[0.04]">
                                <div className="flex items-center justify-between gap-3">
                                    <dt className="text-zinc-500">{t("login_provider")}</dt>
                                    <dd className="flex items-center gap-1.5 font-medium"><span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />{providerLabel}</dd>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <dt className="text-zinc-500">{t("session_status")}</dt>
                                    <dd className="font-medium text-emerald-600 dark:text-emerald-400">{t("active")}</dd>
                                </div>
                                {memberSince ? (
                                    <div className="flex items-center justify-between gap-3">
                                        <dt className="text-zinc-500">{tx(C.memberSince)}</dt>
                                        <dd className="text-end font-medium">{memberSince}</dd>
                                    </div>
                                ) : null}
                                {lastLogin ? (
                                    <div className="flex items-center justify-between gap-3">
                                        <dt className="text-zinc-500">{t("last_login")}</dt>
                                        <dd className="text-end font-medium">{lastLogin}</dd>
                                    </div>
                                ) : null}
                            </dl>
                        </Card>
                    </div>
                ) : null);

            case "profile":
                return profileGate(form && base ? (
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
                        <div className="order-2 space-y-4 xl:order-1">
                            <Card icon={ImageIcon} title={tx(C.picture)}>
                                <div className="space-y-4 pt-2">
                                    <div>
                                        <label htmlFor="field-avatarUrl" className="mb-1 block text-[13px] font-semibold text-zinc-600 dark:text-zinc-300">{t("avatar_url")}</label>
                                        <input id="field-avatarUrl" type="url" inputMode="url" dir="ltr" value={form.avatarUrl} maxLength={2048} onChange={(event) => setField("avatarUrl", event.target.value)} placeholder="https://example.com/avatar.jpg" aria-invalid={fieldInvalid("avatarUrl") ?? (!avatarValid || undefined)} aria-describedby={avatarValid ? undefined : "avatar-hint"} className={INPUT} />
                                        {!avatarValid ? <p id="avatar-hint" className="mt-1 text-xs text-red-600 dark:text-red-400">{tx(C.urlInvalid)}</p> : null}
                                    </div>
                                    <div>
                                        <label htmlFor="field-bannerUrl" className="mb-1 block text-[13px] font-semibold text-zinc-600 dark:text-zinc-300">{t("banner_url")}</label>
                                        <input id="field-bannerUrl" type="url" inputMode="url" dir="ltr" value={form.bannerUrl} maxLength={2048} onChange={(event) => setField("bannerUrl", event.target.value)} placeholder="https://example.com/banner.jpg" aria-invalid={fieldInvalid("bannerUrl") ?? (!bannerValid || undefined)} aria-describedby={bannerValid ? undefined : "banner-hint"} className={INPUT} />
                                        {!bannerValid ? <p id="banner-hint" className="mt-1 text-xs text-red-600 dark:text-red-400">{tx(C.urlInvalid)}</p> : null}
                                    </div>
                                    <fieldset>
                                        <legend className="mb-2 block text-[13px] font-semibold text-zinc-600 dark:text-zinc-300">{t("accent_color")}</legend>
                                        <div id="field-accentColor" tabIndex={-1} className="flex flex-wrap gap-2">
                                            {ACCENT_COLORS.map((color) => (
                                                <button
                                                    key={color}
                                                    type="button"
                                                    onClick={() => setField("accentColor", color)}
                                                    aria-pressed={form.accentColor.toUpperCase() === color}
                                                    aria-label={tx(C.accentOption, { color })}
                                                    className={`h-8 w-8 rounded-full transition-all ${FOCUS} ${form.accentColor.toUpperCase() === color ? "scale-110 ring-2 ring-zinc-900 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-zinc-900" : "hover:scale-110"}`}
                                                    style={{ backgroundColor: color }}
                                                />
                                            ))}
                                        </div>
                                    </fieldset>
                                </div>
                            </Card>

                            {facts?.planBadge?.plan ? (
                                <Card icon={Gem} title={tx(C.planBadgeTitle)}>
                                    <PlanBadgeSetting state={facts.planBadge} onChange={applyPlanBadge} className="pt-2" />
                                </Card>
                            ) : facts?.planBadge?.allowed ? (
                                <Card icon={Gem} title={tx(C.planBadgeTitle)} description={tx(C.planBadgeTeaser)}>
                                    <Link href="/plans" className={`mt-1 inline-flex items-center gap-1.5 text-[13px] font-bold text-indigo-600 hover:underline dark:text-indigo-300 ${FOCUS}`} data-plan-badge-teaser>
                                        {tx(C.seePlans)}<ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                                    </Link>
                                </Card>
                            ) : null}

                            <Card icon={User} title={tx(C.about)}>
                                <div className="space-y-4 pt-2">
                                    <div>
                                        <label htmlFor="field-bio" className="mb-1 block text-[13px] font-semibold text-zinc-600 dark:text-zinc-300">{t("bio")}</label>
                                        <textarea id="field-bio" value={form.bio} onChange={(event) => setField("bio", event.target.value)} placeholder={t("bio_placeholder")} maxLength={PROFILE_TEXT_LIMITS.bio} rows={4} aria-invalid={fieldInvalid("bio")} className={`${INPUT} resize-y`} />
                                        <div className="mt-1 text-end text-xs tabular-nums text-zinc-400">{[...form.bio].length}/{PROFILE_TEXT_LIMITS.bio}</div>
                                    </div>
                                    <fieldset>
                                        <legend className="mb-1 block text-[13px] font-semibold text-zinc-600 dark:text-zinc-300">
                                            <Star className="me-1 inline h-3.5 w-3.5" aria-hidden="true" />
                                            {t("favorite_langs")} ({form.favoriteLangs.length}/5)
                                        </legend>
                                        <p className="mb-2 text-xs text-zinc-500">{t("favorite_langs_desc")}</p>
                                        <div id="field-favoriteLangs" tabIndex={-1} className="flex flex-wrap gap-2">
                                            {PROGRAMMING_LANGUAGES.map((lang) => {
                                                const isSelected = form.favoriteLangs.includes(lang);
                                                const full = form.favoriteLangs.length >= 5 && !isSelected;
                                                return (
                                                    <button
                                                        key={lang}
                                                        type="button"
                                                        onClick={() => toggleFavoriteLang(lang)}
                                                        aria-pressed={isSelected}
                                                        disabled={full}
                                                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${FOCUS} ${isSelected ? "text-white shadow-md" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"} ${full ? "cursor-not-allowed opacity-40" : ""}`}
                                                        style={isSelected ? { backgroundColor: form.accentColor } : undefined}
                                                    >
                                                        {lang}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </fieldset>
                                </div>
                            </Card>

                            <Card icon={Link2} title={t("social_links")} description={t("social_links_desc")}>
                                <div className="space-y-3 pt-2">
                                    {socialFields.map((field) => (
                                        <div key={field.key} className="flex items-center gap-3">
                                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${field.badge}`}>{field.icon}</div>
                                            <div className="min-w-0 flex-1">
                                                <label htmlFor={`field-${field.key}`} className="mb-0.5 block text-xs font-semibold text-zinc-500">{field.label}</label>
                                                <input
                                                    id={`field-${field.key}`}
                                                    type={field.type ?? "text"}
                                                    dir="ltr"
                                                    value={form[field.key]}
                                                    maxLength={PROFILE_TEXT_LIMITS.social}
                                                    onChange={(event) => setField(field.key, event.target.value)}
                                                    placeholder={field.placeholder}
                                                    aria-invalid={fieldInvalid(field.key)}
                                                    className={`${INPUT} px-3 py-2`}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </div>
                        <div className="order-1 xl:sticky xl:top-24 xl:order-2">
                            <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-zinc-500">{tx(C.preview)}</p>
                            <ProfilePreview form={form} email={email} facts={facts} status={ownStatus} />
                            <p className="mt-2 text-[12px] text-zinc-500">{tx(C.previewHint)}</p>
                        </div>
                    </div>
                ) : null);

            case "status":
                return (
                    <div className="space-y-4">
                        <Card icon={CircleDot} title={tx(C.statusTitle)} description={tx(C.statusHint)}>
                            <div className="mt-3 flex items-center gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-white/[0.04]">
                                <PresenceAvatar src={form && avatarValid ? form.avatarUrl.trim() : auth.data?.user?.image} name={displayName} status={ownStatus} size="md" ring="bg-zinc-50 dark:bg-zinc-900" />
                                <div className="min-w-0">
                                    <p className="truncate text-[14px] font-bold">{displayName}</p>
                                    <p className="text-[12.5px] text-zinc-500">
                                        {ownStatus ? tx(C.statusNow, { status: form?.statusPreference === "invisible" ? tx(STATUS_PREFERENCE_COPY.invisible.label) : tx(PRESENCE_STATUS_COPY[ownStatus]) }) : null}
                                    </p>
                                </div>
                            </div>
                            <StatusMenu email={email} onSaved={applyInstantSave} className="mt-4" />
                        </Card>
                        {profileGate(form ? (
                            <Card icon={Eye} title={tx(C.visibility)} description={tx(C.visibilityHint)}>
                                <ToggleRow label={t("online_status")} description={tx(C.onlineHidden)} checked={form.showOnlineStatus} busy={instantBusy === "showOnlineStatus"} onChange={(value) => void saveInstant("showOnlineStatus", value)} />
                                <ToggleRow label={t("show_last_seen")} description={tx(C.lastSeenHint)} checked={form.showLastSeen} busy={instantBusy === "showLastSeen"} onChange={(value) => void saveInstant("showLastSeen", value)} />
                            </Card>
                        ) : null)}
                    </div>
                );

            case "privacy":
                return (
                    <div className="space-y-4">
                        {profileGate(form ? (
                            <>
                                <Card icon={form.publicProfile ? Eye : EyeOff} title={tx(C.profileVisibility)}>
                                    <ToggleRow label={t("public_profile")} description={t("public_profile_desc")} checked={form.publicProfile} onChange={(value) => setField("publicProfile", value)} />
                                    <ToggleRow label={t("public_projects_setting")} checked={form.publicProjects} onChange={(value) => setField("publicProjects", value)} />
                                    <ToggleRow label={t("hide_friend_list")} checked={form.hideFriendList} onChange={(value) => setField("hideFriendList", value)} />
                                </Card>
                                <Card icon={Users} title={tx(C.whoSees)}>
                                    <SelectRow label={t("who_can_add")} value={form.whoCanAdd} onChange={(value) => setField("whoCanAdd", value)} options={[{ value: "everyone", label: t("everyone") }, { value: "friends_of_friends", label: t("friends_of_friends") }, { value: "nobody", label: t("nobody") }]} />
                                    <SelectRow label={t("photo_visibility")} value={form.photoVisibility} onChange={(value) => setField("photoVisibility", value)} options={[{ value: "everyone", label: t("everyone") }, { value: "friends", label: t("friends_only") }, { value: "nobody", label: t("nobody") }]} />
                                    <SelectRow label={t("bio_visibility")} value={form.bioVisibility} onChange={(value) => setField("bioVisibility", value)} options={[{ value: "everyone", label: t("everyone") }, { value: "friends", label: t("friends_only") }, { value: "nobody", label: t("nobody") }]} />
                                </Card>
                            </>
                        ) : null)}
                        <Card icon={Shield} title={tx(C.twoFactor)}>
                            <div className="pt-2"><TwoFactorSettings /></div>
                        </Card>
                        <Card icon={Lock} title={tx(C.passwordTitle)}>
                            {hasPassword ? (
                                <p className="pt-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">✅ {t("password_already_set")}</p>
                            ) : (
                                <p className="pt-1 text-sm text-zinc-500">{t("password_google_info")}</p>
                            )}
                            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {hasPassword ? (
                                    <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" aria-label={tx(C.currentPassword)} placeholder={t("current_password")} className={`${INPUT} sm:col-span-2`} />
                                ) : null}
                                <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" aria-label={tx(C.newPassword)} placeholder={t("new_password")} className={INPUT} />
                                <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" aria-label={tx(C.confirmPassword)} placeholder={t("confirm_password")} className={INPUT} />
                            </div>
                            <button type="button" onClick={() => void handleSetPassword()} disabled={busyAction === "password"} className={`mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-amber-700 disabled:opacity-50 ${FOCUS}`}>
                                {busyAction === "password" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                                {hasPassword ? t("change_password") : t("set_password")}
                            </button>
                        </Card>
                    </div>
                );

            case "notifications":
                return profileGate(form ? (
                    <div className="space-y-4">
                        <Card icon={Bell} title={tx(C.inApp)}>
                            <ToggleRow label={t("msg_notification")} checked={form.msgNotifications} onChange={(value) => setField("msgNotifications", value)} />
                            <ToggleRow label={t("call_notification")} checked={form.callNotifications} onChange={(value) => setField("callNotifications", value)} />
                            <ToggleRow label={t("friend_req_notification")} checked={form.friendReqNotifications} onChange={(value) => setField("friendReqNotifications", value)} />
                            <ToggleRow label={t("like_notification")} checked={form.likeNotifications} onChange={(value) => setField("likeNotifications", value)} />
                            <ToggleRow label={t("notification_sound")} checked={form.notifSound} onChange={(value) => setField("notifSound", value)} />
                        </Card>
                        <Card icon={Mail} title={tx(C.emailTitle)}>
                            <ToggleRow icon={Mail} label={t("email_notifications")} description={t("email_notifications_desc")} checked={form.emailNotifications} onChange={(value) => setField("emailNotifications", value)} />
                            <ToggleRow icon={Megaphone} label={t("new_feature_alerts")} description={t("new_feature_alerts_desc")} checked={form.newFeatureAlerts} onChange={(value) => setField("newFeatureAlerts", value)} />
                        </Card>
                        <Card icon={Clock} title={tx(C.quietHours)}>
                            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                                <label htmlFor="field-dndSchedule" className="text-[14px] font-medium">{t("dnd_schedule")}</label>
                                <input id="field-dndSchedule" type="text" dir="ltr" value={form.dndSchedule} maxLength={PROFILE_TEXT_LIMITS.dndSchedule} onChange={(event) => setField("dndSchedule", event.target.value)} placeholder={tx(C.quietHoursHint)} aria-invalid={fieldInvalid("dndSchedule")} className="w-40 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-center text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:border-white/10 dark:bg-zinc-950" />
                            </div>
                        </Card>
                    </div>
                ) : null);

            case "messaging":
                return profileGate(form ? (
                    <div className="space-y-4">
                        <Card icon={MessageCircle} title={tx(C.chat)}>
                            <ToggleRow label={t("typing_indicator")} checked={form.typingIndicator} onChange={(value) => setField("typingIndicator", value)} />
                            <ToggleRow label={t("read_receipts_setting")} checked={form.readReceipts} onChange={(value) => setField("readReceipts", value)} />
                            <ToggleRow label={t("link_preview_setting")} checked={form.linkPreview} onChange={(value) => setField("linkPreview", value)} />
                            <ToggleRow label={t("gif_autoplay")} checked={form.gifAutoplay} onChange={(value) => setField("gifAutoplay", value)} />
                            <ToggleRow label={t("enter_to_send")} checked={form.enterToSend} onChange={(value) => setField("enterToSend", value)} />
                            <ToggleRow label={t("sticker_suggestions")} checked={form.stickerSuggestions} onChange={(value) => setField("stickerSuggestions", value)} />
                        </Card>
                        <Card icon={Paintbrush} title={tx(C.chatLook)}>
                            <SelectRow label={t("msg_font_size")} value={form.msgFontSize} onChange={(value) => setField("msgFontSize", value)} options={[{ value: "small", label: t("small") }, { value: "medium", label: t("medium") }, { value: "large", label: t("large") }]} />
                            <SelectRow label={t("voice_msg_quality")} value={form.voiceMsgQuality} onChange={(value) => setField("voiceMsgQuality", value)} options={[{ value: "low", label: t("low") }, { value: "normal", label: t("normal_quality") }, { value: "high", label: t("high") }]} />
                            <SelectRow label={t("chat_background")} value={form.chatBackground} onChange={(value) => setField("chatBackground", value)} options={[{ value: "default", label: t("default_bg") }, { value: "dark", label: t("dark_bg") }, { value: "gradient", label: t("gradient_bg") }, { value: "pattern", label: t("pattern_bg") }]} />
                            <fieldset className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                                <legend className="float-start text-[14px] font-medium">{t("bubble_color")}</legend>
                                <div id="field-bubbleColor" tabIndex={-1} className="flex gap-1.5">
                                    {BUBBLE_COLORS.map((color) => (
                                        <button
                                            key={color}
                                            type="button"
                                            onClick={() => setField("bubbleColor", color)}
                                            aria-pressed={form.bubbleColor.toUpperCase() === color}
                                            aria-label={tx(C.bubbleOption, { color })}
                                            className={`h-7 w-7 rounded-full transition-all ${FOCUS} ${form.bubbleColor.toUpperCase() === color ? "scale-110 ring-2 ring-indigo-500 ring-offset-2 ring-offset-white dark:ring-offset-zinc-900" : ""}`}
                                            style={{ backgroundColor: color }}
                                        />
                                    ))}
                                </div>
                            </fieldset>
                        </Card>
                    </div>
                ) : null);

            case "appearance":
                return (
                    <div className="space-y-4">
                        <Card icon={Monitor} title={tx(C.theme)} description={tx(C.instantChoices)}>
                            <div role="group" aria-label={tx(C.theme)} className="mt-3 grid grid-cols-3 gap-2">
                                {themeOptions.map((option) => {
                                    const Icon = option.icon;
                                    const isSelected = themePreference === option.value;
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            aria-pressed={isSelected}
                                            onClick={() => setThemePreference(option.value)}
                                            className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-[13px] font-semibold transition ${FOCUS} ${isSelected ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300" : "border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-white/10 dark:text-zinc-300 dark:hover:border-white/20"}`}
                                        >
                                            <Icon className="h-5 w-5" aria-hidden="true" />
                                            {tx(option.label)}
                                        </button>
                                    );
                                })}
                            </div>
                        </Card>
                        <Card icon={Globe2} title={tx(C.language)} description={t("app_language_desc")}>
                            {/* Every interface language, including right-to-left ones. */}
                            <div className="mt-3 grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pe-1 sm:grid-cols-3">
                                {LANGUAGES.map((lang) => (
                                    <button
                                        key={lang.code}
                                        type="button"
                                        onClick={() => setLanguage(lang.code)}
                                        aria-pressed={language === lang.code}
                                        title={lang.english}
                                        className={`flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${FOCUS} ${language === lang.code ? "bg-indigo-600 text-white shadow-md" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"}`}
                                    >
                                        <span className="text-base" aria-hidden="true">{lang.flag}</span>
                                        <span className="truncate" lang={lang.locale}>{lang.name}</span>
                                    </button>
                                ))}
                            </div>
                        </Card>
                        {profileGate(form ? (
                            <>
                                <Card icon={Clock} title={tx(C.region)}>
                                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                                        <div className="min-w-0">
                                            <label htmlFor="field-timezone" className="text-[14px] font-medium">{t("timezone")}</label>
                                            <span className="block text-[12.5px] text-zinc-500">{t("timezone_desc")}</span>
                                        </div>
                                        <select id="field-timezone" value={form.timezone} onChange={(event) => setField("timezone", event.target.value)} aria-invalid={fieldInvalid("timezone")} className={SELECT}>
                                            {timezoneOptions.map((zone) => <option key={zone} value={zone}>{timezoneLabel(zone)}</option>)}
                                        </select>
                                    </div>
                                </Card>
                                <Card icon={Paintbrush} title={tx(C.accessibility)}>
                                    <ToggleRow label={t("compact_mode")} checked={form.compactMode} onChange={(value) => setField("compactMode", value)} />
                                    <ToggleRow label={t("reduce_animations")} checked={form.reduceAnimations} onChange={(value) => setField("reduceAnimations", value)} />
                                    <ToggleRow label={t("high_contrast")} checked={form.highContrast} onChange={(value) => setField("highContrast", value)} />
                                    <SelectRow label={t("ui_font_size")} value={form.uiFontSize} onChange={(value) => setField("uiFontSize", value)} options={[{ value: "small", label: t("small") }, { value: "medium", label: t("medium") }, { value: "large", label: t("large") }]} />
                                    <SelectRow label={t("emoji_style")} value={form.emojiStyle} onChange={(value) => setField("emojiStyle", value)} options={[{ value: "native", label: t("native") }, { value: "twemoji", label: "Twemoji" }, { value: "noto", label: "Noto" }]} />
                                </Card>
                            </>
                        ) : null)}
                    </div>
                );

            case "editor":
                return (
                    <div className="space-y-4">
                        <Card icon={Code2} title={tx(C.editorTitle)} description={tx(C.editorHint)}>
                            <Link href="/settings" className={`mt-3 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-500 ${FOCUS}`}>
                                <ExternalLink className="h-4 w-4" aria-hidden="true" />{tx(C.openEditorSettings)}
                            </Link>
                        </Card>
                        <Card icon={RefreshCw} title={t("reset_editor")} description={t("reset_editor_desc")}>
                            <button type="button" onClick={() => void handleResetEditorSettings()} className={`mt-3 rounded-xl bg-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600 ${FOCUS}`}>
                                {t("reset")}
                            </button>
                        </Card>
                    </div>
                );

            case "ai":
                return (
                    <div className="space-y-4">
                        <Card icon={Sparkles} title={tx(C.aiTitle)} description={tx(C.aiHint)}>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <Link href="/ai/settings" className={`inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-violet-500 ${FOCUS}`} data-account-ai-settings>
                                    <ExternalLink className="h-4 w-4" aria-hidden="true" />{tx(C.openAiSettings)}
                                </Link>
                                <Link href="/plans#usage" className={`inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-semibold dark:border-zinc-700 ${FOCUS}`}>
                                    {tx(C.aiUsage)}
                                </Link>
                            </div>
                        </Card>
                    </div>
                );

            case "data":
                return (
                    <div className="space-y-4">
                        <Card icon={Download} title={tx(C.exportTitle)} description={t("data_export_desc")}>
                            <p className="mt-1 text-[12.5px] text-zinc-500">{t("export_data_desc")}</p>
                            <button type="button" onClick={() => void handleExportData()} disabled={busyAction === "export"} className={`mt-3 inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-cyan-700 disabled:opacity-50 ${FOCUS}`}>
                                {busyAction === "export" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                                {t("download_my_data")}
                            </button>
                        </Card>
                        <Card icon={LogOut} title={tx(C.signOutTitle)} description={t("sign_out_desc")}>
                            <button type="button" onClick={signOutNow} className={`mt-3 inline-flex items-center gap-2 rounded-xl bg-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600 ${FOCUS}`}>
                                <LogOut className="h-4 w-4" aria-hidden="true" />
                                {t("sign_out")}
                            </button>
                        </Card>
                        <Card icon={Trash2} title={tx(C.dangerTitle)} description={t("delete_account_warning")} tone="danger">
                            <button type="button" onClick={() => setShowDeleteConfirm(true)} className={`mt-3 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 ${FOCUS}`}>
                                {t("delete_account")}
                            </button>
                        </Card>
                    </div>
                );
        }
    };

    const navButton = (section: SectionDefinition, variant: "side" | "list") => {
        const Icon = section.icon;
        const isCurrent = variant === "side" && section.id === active;
        return (
            <button
                key={section.id}
                type="button"
                onClick={() => go(section.id)}
                aria-current={isCurrent ? "page" : undefined}
                className={variant === "side"
                    ? `flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start text-[14px] font-semibold transition ${FOCUS} ${isCurrent ? "bg-zinc-900/[0.06] text-zinc-950 dark:bg-white/[0.08] dark:text-white" : "text-zinc-600 hover:bg-zinc-900/[0.04] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-white"}`
                    : `flex w-full items-center gap-3 border-b border-zinc-100 px-4 py-3.5 text-start last:border-b-0 hover:bg-zinc-50 dark:border-white/[0.06] dark:hover:bg-white/[0.03] ${FOCUS}`}
            >
                <span className={`grid shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white shadow-sm ${section.tint} ${variant === "side" ? "h-7 w-7" : "h-9 w-9 rounded-xl"}`}>
                    <Icon className={variant === "side" ? "h-4 w-4" : "h-4.5 w-4.5"} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate">{tx(section.label)}</span>
                    {variant === "list" ? <span className="block truncate text-[12px] font-normal text-zinc-500">{tx(section.hint)}</span> : null}
                </span>
                {variant === "list" ? <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 rtl:rotate-180" aria-hidden="true" /> : null}
            </button>
        );
    };

    return (
        <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-white">
            <Header />

            <main id="main-content" className={`mx-auto max-w-6xl px-4 pt-20 sm:px-6 lg:pt-24 ${form && (dirty || saveError) ? "pb-40" : "pb-16"}`}>
                <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
                    {/* Category menu (wide screens) */}
                    <aside className="hidden lg:block">
                        <div className="sticky top-24 space-y-5">
                            <h1 className="px-2.5 text-xl font-black tracking-tight">{tx(C.title)}</h1>
                            {GROUPS.map((group) => (
                                <nav key={group.id} aria-label={tx(group.label)}>
                                    <p className="px-2.5 pb-1 text-[11px] font-black uppercase tracking-wider text-zinc-500">{tx(group.label)}</p>
                                    <div className="space-y-0.5">{SECTIONS.filter((section) => section.group === group.id).map((section) => navButton(section, "side"))}</div>
                                </nav>
                            ))}
                            <button type="button" onClick={signOutNow} className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start text-[14px] font-semibold text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 ${FOCUS}`}>
                                <LogOut className="h-4 w-4" aria-hidden="true" />{t("sign_out")}
                            </button>
                        </div>
                    </aside>

                    {/* Category list (narrow screens, before a section is picked) */}
                    {selected === null ? (
                        <div className="space-y-5 lg:hidden">
                            <h1 className="text-2xl font-black tracking-tight">{tx(C.title)}</h1>
                            <button type="button" onClick={() => go("account")} className={`flex w-full items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-start shadow-sm dark:border-white/[0.08] dark:bg-zinc-900 ${FOCUS}`}>
                                <PresenceAvatar src={form && avatarValid ? form.avatarUrl.trim() : auth.data?.user?.image} name={displayName} status={ownStatus} size="lg" ring="bg-white dark:bg-zinc-900" />
                                <span className="min-w-0 flex-1">
                                    <span className="flex min-w-0 items-center gap-1.5">
                                        <span className="truncate text-[16px] font-black">{displayName}</span>
                                        <StaffBadge role={parseStaffRole(facts?.staffRole)} size="sm" compactOnMobile />
                                        <PlanBadge plan={visiblePlanBadge(facts?.planBadge)} size="sm" compactOnMobile />
                                    </span>
                                    {form?.nickname ? <span className="block truncate font-mono text-[12.5px] text-zinc-500">{form.nickname}#{form.nicknameTag}</span> : null}
                                    <span className="block truncate text-[12.5px] text-zinc-500" dir="ltr">{email}</span>
                                </span>
                                <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 rtl:rotate-180" aria-hidden="true" />
                            </button>
                            {GROUPS.map((group) => (
                                <nav key={group.id} aria-label={tx(group.label)}>
                                    <p className="px-1 pb-1.5 text-[11px] font-black uppercase tracking-wider text-zinc-500">{tx(group.label)}</p>
                                    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-white/[0.08] dark:bg-zinc-900">
                                        {SECTIONS.filter((section) => section.group === group.id).map((section) => navButton(section, "list"))}
                                    </div>
                                </nav>
                            ))}
                            <button type="button" onClick={signOutNow} className={`flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white px-4 py-3 text-[14px] font-bold text-red-600 dark:border-red-500/30 dark:bg-zinc-900 dark:text-red-400 ${FOCUS}`}>
                                <LogOut className="h-4 w-4" aria-hidden="true" />{t("sign_out")}
                            </button>
                        </div>
                    ) : null}

                    {/* Section content */}
                    <div className={selected === null ? "hidden lg:block" : ""}>
                        {selected !== null ? <h1 className="sr-only lg:hidden">{tx(C.title)}</h1> : null}
                        <button type="button" onClick={backToList} className={`mb-4 inline-flex items-center gap-1.5 rounded-lg text-[14px] font-semibold text-zinc-500 transition hover:text-zinc-900 lg:hidden dark:hover:text-white ${FOCUS}`}>
                            <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />{tx(C.backToList)}
                        </button>
                        <div className="mb-5 flex items-center gap-3">
                            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-md ${sectionInfo.tint}`}>
                                <SectionIcon className="h-5 w-5" aria-hidden="true" />
                            </span>
                            <div className="min-w-0">
                                <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-black tracking-tight outline-none">{tx(sectionInfo.label)}</h2>
                                <p className="truncate text-[13px] text-zinc-500">{tx(sectionInfo.hint)}</p>
                            </div>
                        </div>
                        <motion.div key={active} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                            {sectionContent(active)}
                        </motion.div>
                    </div>
                </div>

                {/* Unsaved changes: a bar at the bottom of the screen, like Discord. */}
                <AnimatePresence>
                    {form && (dirty || saveError) ? (
                        <motion.div
                            key="save-bar"
                            initial={{ opacity: 0, y: 24 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 24 }}
                            transition={{ duration: 0.18 }}
                            role="region"
                            aria-label={tx(C.unsaved)}
                            className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-3xl rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-2xl shadow-black/15 backdrop-blur-xl sm:inset-x-6 dark:border-white/10 dark:bg-zinc-900/95"
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex min-w-0 flex-1 items-center gap-2 ps-1" aria-live="polite">
                                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                                    <span className="truncate text-sm font-semibold">{tx(C.unsaved)}</span>
                                    {dirty ? <span className="hidden shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-800 sm:inline dark:text-amber-300">{tx(C.unsavedCount, { count: changedCount })}</span> : null}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button type="button" onClick={discard} disabled={!dirty || saving} title={tx(C.discardHint)} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-white/[0.06] ${FOCUS}`}>
                                        <Undo2 className="h-4 w-4" aria-hidden="true" />
                                        {tx(C.discard)}
                                    </button>
                                    <button type="button" onClick={() => void save()} disabled={!dirty || saving} title={tx(C.saveHint)} aria-keyshortcuts="Control+S Meta+S" className={`inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}>
                                        {saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                                        {saving ? tx(C.saving) : tx(C.save)}
                                    </button>
                                </div>
                            </div>
                            {saveError ? (
                                <p role="alert" className="mt-2 flex items-start gap-2 rounded-xl bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                    {errorMessage(saveError, SAVE_ERRORS)}
                                </p>
                            ) : null}
                        </motion.div>
                    ) : null}
                </AnimatePresence>

                {/* Delete confirmation */}
                {showDeleteConfirm ? (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && busyAction !== "delete") setShowDeleteConfirm(false); }}>
                        <div role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-text" className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
                            <h3 id="delete-title" className="mb-4 text-xl font-bold text-red-600">{t("confirm_delete_account")}</h3>
                            <p id="delete-text" className="mb-6 text-zinc-500">{t("delete_account_permanent")}</p>
                            <div className="flex flex-col gap-3">
                                {/* Starts on "Cancel": deleting is permanent. */}
                                <button type="button" autoFocus onClick={() => setShowDeleteConfirm(false)} disabled={busyAction === "delete"} className={`w-full rounded-2xl border border-zinc-300 bg-white px-6 py-3 font-bold text-black transition-all dark:border-zinc-600 dark:bg-zinc-800 dark:text-white ${FOCUS}`}>
                                    {t("cancel")}
                                </button>
                                <button type="button" onClick={() => void handleDeleteAccount()} disabled={busyAction === "delete"} className={`flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-6 py-3 font-bold text-white transition-all hover:bg-red-700 disabled:opacity-60 ${FOCUS}`}>
                                    {busyAction === "delete" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                                    {t("confirm_delete")}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}
            </main>

            <ToastViewport toasts={toasts} onDismiss={dismiss} />
        </div>
    );
}
