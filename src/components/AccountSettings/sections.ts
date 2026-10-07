import { Bell, CircleDot, Code2, Database, MessageCircle, Paintbrush, Palette, Shield, Sparkles, UserRound, type LucideIcon } from "lucide-react";
import type { EditableAccountFields } from "@/lib/account-profile";
import type { Copy } from "@/lib/i18n";
import { C } from "./copy";

export type SectionId = "account" | "profile" | "status" | "privacy" | "notifications" | "messaging" | "appearance" | "editor" | "ai" | "data";
export type SectionGroup = "user" | "app" | "data";
export type SectionDefinition = { id: SectionId; icon: LucideIcon; label: Copy; hint: Copy; group: SectionGroup };

export const SECTIONS: SectionDefinition[] = [
    { id: "account", icon: UserRound, label: { TR: "Hesabım", EN: "My Account" }, hint: { TR: "Kullanıcı adı, takma ad, oturum", EN: "Username, nickname, session" }, group: "user" },
    { id: "profile", icon: Paintbrush, label: { TR: "Profil", EN: "Profile" }, hint: { TR: "Resim, kapak, hakkında, bağlantılar", EN: "Picture, banner, about, links" }, group: "user" },
    { id: "status", icon: CircleDot, label: { TR: "Durum", EN: "Status" }, hint: { TR: "Çevrimiçi, Boşta, Rahatsız Etmeyin, Görünmez", EN: "Online, Idle, Do Not Disturb, Invisible" }, group: "user" },
    { id: "privacy", icon: Shield, label: { TR: "Gizlilik ve Güvenlik", EN: "Privacy & Security" }, hint: { TR: "Görünürlük, iki adımlı doğrulama, şifre, oturumlar", EN: "Visibility, two-step verification, password, sessions" }, group: "user" },
    { id: "notifications", icon: Bell, label: { TR: "Bildirimler", EN: "Notifications" }, hint: { TR: "Mesaj, bahsetme, arama ve istek bildirimleri", EN: "Message, mention, call and request notifications" }, group: "app" },
    { id: "messaging", icon: MessageCircle, label: { TR: "Mesajlaşma", EN: "Messaging" }, hint: { TR: "Yazıyor göstergesi, okundu bilgisi, sohbet görünümü", EN: "Typing indicator, read receipts, chat look" }, group: "app" },
    { id: "appearance", icon: Palette, label: { TR: "Görünüm", EN: "Appearance" }, hint: { TR: "Tema, dil, erişilebilirlik", EN: "Theme, language, accessibility" }, group: "app" },
    { id: "editor", icon: Code2, label: { TR: "Editör", EN: "Editor" }, hint: { TR: "Kod editörü ayarları", EN: "Code editor settings" }, group: "app" },
    { id: "ai", icon: Sparkles, label: { TR: "Hanogt AI", EN: "Hanogt AI" }, hint: { TR: "Talimatlar, üslup, varsayılanlar, kullanım", EN: "Instructions, tone, defaults, usage" }, group: "app" },
    { id: "data", icon: Database, label: { TR: "Veri", EN: "Data" }, hint: { TR: "Verileri indirme, hesabı silme", EN: "Download data, delete account" }, group: "data" },
];

export const GROUPS: Array<{ id: SectionGroup; label: Copy }> = [
    { id: "user", label: C.groupUser },
    { id: "app", label: C.groupApp },
    { id: "data", label: C.groupData },
];

export function sectionInfo(id: SectionId) {
    return SECTIONS.find((section) => section.id === id) ?? SECTIONS[0];
}

/** The section that holds a form field, so a save error can open it. */
export const FIELD_SECTIONS: Partial<Record<keyof EditableAccountFields, SectionId>> = {
    username: "account", nickname: "account", nicknameTag: "account",
    avatarUrl: "profile", bannerUrl: "profile", bio: "profile", accentColor: "profile", favoriteLangs: "profile",
    socialGithub: "profile", socialLinkedin: "profile", socialTwitter: "profile", socialWebsite: "profile",
    socialYoutube: "profile", socialTiktok: "profile", socialInstagram: "profile", socialFacebook: "profile",
    customStatus: "status", statusPreference: "status", showOnlineStatus: "status", showLastSeen: "status",
    publicProfile: "privacy", publicProjects: "privacy", bioVisibility: "privacy", whoCanAdd: "privacy",
    msgNotifications: "notifications", mentionNotifications: "notifications", callNotifications: "notifications", friendReqNotifications: "notifications",
    typingIndicator: "messaging", readReceipts: "messaging", gifAutoplay: "messaging", enterToSend: "messaging",
    msgFontSize: "messaging", chatBackground: "messaging", voiceMsgQuality: "messaging",
    reduceAnimations: "appearance", highContrast: "appearance",
};

/** Fields the status menu and the visibility switches save on their own (outside the save bar). */
export const INSTANT_FIELDS: ReadonlyArray<keyof EditableAccountFields> = ["statusPreference", "customStatus", "dndMode", "showOnlineStatus", "showLastSeen"];

// The open section lives in the URL hash (#profile), so reloads and the back button keep it.
export function subscribeHash(callback: () => void) {
    window.addEventListener("hashchange", callback);
    return () => window.removeEventListener("hashchange", callback);
}

export function hashSnapshot() {
    return window.location.hash.slice(1);
}

export function serverHash() {
    return "";
}

/** Assigning the hash adds a history entry and notifies the subscription above ("" goes back to the list). */
export function openSection(id: SectionId | "") {
    if (window.location.hash.slice(1) !== id) window.location.hash = id;
}
