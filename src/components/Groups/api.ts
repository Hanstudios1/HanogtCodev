"use client";

import { useCallback } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import type { AutoModConfig } from "@/lib/social/automod-config";
import type { EphemeralReply } from "@/lib/social/bots";
import type {
    GroupDetailResponse,
    GroupErrorCode,
    GroupInviteLinkInfo,
    GroupInvitesResponse,
    GroupJoinPreview,
    GroupListResponse,
} from "@/lib/groups";

/** Client-side failure codes (network, storage, editor hand-off…) next to the API's codes. */
export type GroupClientErrorCode =
    | GroupErrorCode
    | "network" | "files" | "chat" | "save_failed" | "file_deleted" | "file_too_large" | "file_exists" | "file_name"
    | "files_limit" | "voice_too_large" | "voice_format" | "voice_failed" | "voice_unavailable" | "mic_denied" | "mic_missing" | "mic_busy" | "zip_failed"
    | "editor_too_large" | "clipboard_failed" | "message_failed" | "offline";

type ModerationPerson = { email: string; name: string } | null;

/** GET /api/groups/moderation: what moderators see in the group's Safety settings. */
export type GroupModerationResponse = {
    automod: AutoModConfig;
    /** The group's own banned words (owners and admins only; null for moderators). */
    customWords: string[] | null;
    canEdit: boolean;
    reports: Array<{ id: string; reporter: ModerationPerson; target: ModerationPerson; reason: string; createdAt: string | null }>;
    mutes: Array<{ person: ModerationPerson; until: string | null; reason: string; byAutoMod: boolean }>;
    events: Array<{ person: ModerationPerson; rule: string; createdAt: string | null }>;
};

export class GroupRequestError extends Error {
    constructor(
        public readonly code: GroupClientErrorCode,
        message = "",
        public readonly status = 0,
        /** Numbers the server sent with the code (e.g. the plan's group limit), for the translated text. */
        public readonly vars: Record<string, string | number> = {},
    ) {
        super(message || code);
        this.name = "GroupRequestError";
    }
}

/**
 * Numbers an answer carried for its message: the plan limit ("∞" never comes:
 * unlimited plans aren't refused), how long a mute or slow mode lasts, and
 * which AutoMod rule stopped a message.
 */
function limitVars(data: { limit?: unknown; plan?: unknown; minutes?: unknown; seconds?: unknown; rule?: unknown }): Record<string, string | number> {
    const vars: Record<string, string | number> = {};
    if (typeof data.limit === "number") {
        vars.limit = data.limit;
        if (typeof data.plan === "string") vars.plan = data.plan;
    }
    if (typeof data.minutes === "number") vars.minutes = data.minutes;
    if (typeof data.seconds === "number") vars.seconds = data.seconds;
    if (typeof data.rule === "string") vars.rule = data.rule;
    return vars;
}

export const GROUP_ERROR_COPY: Record<GroupClientErrorCode, Copy> = {
    unauthorized: { TR: "Oturumunuzun süresi dolmuş olabilir; lütfen yeniden giriş yapın.", EN: "Your session may have expired; please sign in again." },
    forbidden_origin: { TR: "İstek doğrulanamadı. Sayfayı yenileyip tekrar deneyin.", EN: "The request couldn't be verified. Reload the page and try again." },
    rate_limited: { TR: "Çok fazla işlem yaptınız. Biraz bekleyip tekrar deneyin.", EN: "Too many actions. Wait a moment and try again." },
    invalid_request: { TR: "İstek geçersiz.", EN: "The request is invalid." },
    payload_too_large: { TR: "İstek çok büyük.", EN: "The request is too large." },
    invalid_id: { TR: "Geçersiz bağlantı veya kimlik.", EN: "Invalid link or id." },
    invalid_email: { TR: "Geçersiz kullanıcı.", EN: "Invalid user." },
    not_found: { TR: "Grup bulunamadı veya artık erişiminiz yok.", EN: "The group wasn't found or you no longer have access." },
    forbidden: { TR: "Bu işlem için yetkiniz yok.", EN: "You don't have permission to do that." },
    self_action: { TR: "Bu işlemi kendi hesabınıza uygulayamazsınız.", EN: "You can't do that to your own account." },
    name_too_short: { TR: "Grup adı en az 2 karakter olmalı.", EN: "The group name needs at least 2 characters." },
    name_too_long: { TR: "Grup adı en fazla 60 karakter olabilir.", EN: "The group name can be at most 60 characters." },
    description_too_long: { TR: "Açıklama en fazla 500 karakter olabilir.", EN: "The description can be at most 500 characters." },
    rules_too_long: { TR: "Kurallar en fazla 4000 karakter olabilir.", EN: "The rules can be at most 4000 characters." },
    invalid_template: { TR: "Geçersiz şablon.", EN: "Invalid template." },
    invalid_color: { TR: "Geçersiz renk.", EN: "Invalid color." },
    invalid_emoji: { TR: "Geçersiz simge.", EN: "Invalid icon." },
    invalid_topics: { TR: "Konular yalnızca harf, rakam, - ve _ içerebilir (en fazla 12 konu, her biri en fazla 24 karakter).", EN: "Topics may only contain letters, digits, - and _ (up to 12 topics, 24 characters each)." },
    project_not_found: { TR: "Başlangıç projesi bulunamadı.", EN: "The starting project wasn't found." },
    group_limit: { TR: "Planınla en fazla {limit} grubun sahibi olabilirsin. Yeni grup için bir grubu sil, sahipliğini devret ya da planını yükselt (Fiyatlandırma).", EN: "Your plan lets you own up to {limit} groups. To create another, delete one, hand one over or upgrade your plan (Pricing)." },
    target_group_limit: { TR: "Bu üyenin planı en fazla {limit} grubun sahibi olmasına izin veriyor; sahiplik devredilemedi.", EN: "This member's plan lets them own up to {limit} groups, so ownership couldn't be handed over." },
    group_full: { TR: "Grup {limit} üye sınırına ulaştı. Grup sahibinin planı yükseldikçe grup büyür (Fiyatlandırma).", EN: "The group has reached its {limit}-member limit. Groups grow with their owner's plan (Pricing)." },
    not_friend: { TR: "Yalnızca arkadaşlarınızı davet edebilirsiniz.", EN: "You can only invite your friends." },
    user_not_found: { TR: "Kullanıcı bulunamadı.", EN: "User not found." },
    invites_disabled: { TR: "Bu grupta yalnızca yöneticiler davet gönderebilir.", EN: "Only admins can send invitations in this group." },
    invite_not_found: { TR: "Davet bulunamadı veya artık geçerli değil.", EN: "The invitation wasn't found or is no longer valid." },
    banned: { TR: "Bu gruba katılmanız engellenmiş.", EN: "You've been blocked from joining this group." },
    target_banned: { TR: "Bu kullanıcının gruba katılması engellenmiş.", EN: "This user is blocked from joining the group." },
    target_not_member: { TR: "Bu kullanıcı grubun üyesi değil.", EN: "This user isn't a member of the group." },
    cannot_remove_owner: { TR: "Grup sahibi gruptan çıkarılamaz.", EN: "The group owner can't be removed." },
    cannot_remove_admin: { TR: "Yöneticileri yalnızca grup sahibi çıkarabilir.", EN: "Only the owner can remove admins." },
    owner_cannot_leave: { TR: "Ayrılmadan önce sahipliği devretmeli veya grubu silmelisiniz.", EN: "Transfer ownership or delete the group before leaving." },
    confirm_mismatch: { TR: "Onaylamak için grup adını aynen yazın.", EN: "Type the group name exactly to confirm." },
    link_not_found: { TR: "Davet bağlantısı bulunamadı veya iptal edildi.", EN: "The invite link wasn't found or was revoked." },
    link_expired: { TR: "Bu davet bağlantısının süresi doldu.", EN: "This invite link has expired." },
    link_exhausted: { TR: "Bu davet bağlantısının kullanım hakkı doldu.", EN: "This invite link has no uses left." },
    link_limit: { TR: "En fazla 20 etkin bağlantı olabilir; önce birini iptal edin.", EN: "You can have at most 20 active links; revoke one first." },
    invalid_expiry: { TR: "Geçersiz süre.", EN: "Invalid expiry." },
    invalid_max_uses: { TR: "Geçersiz kullanım sınırı.", EN: "Invalid use limit." },
    message_not_found: { TR: "Mesaj bulunamadı; silinmiş olabilir.", EN: "The message wasn't found; it may have been deleted." },
    pin_limit: { TR: "Bu grupta en fazla {limit} mesaj sabitlenebilir; önce bir mesajın sabitlemesini kaldırın.", EN: "This group can pin at most {limit} messages; unpin one first." },
    commands_limit: { TR: "Bu grupta en fazla {limit} özel komut olabilir. Grup sahibinin planı yükseldikçe sınır artar.", EN: "This group can have at most {limit} custom commands. The limit grows with the group owner's plan." },
    words_limit: { TR: "Bu grupta en fazla {limit} yasaklı kelime olabilir. Grup sahibinin planı yükseldikçe sınır artar.", EN: "This group can have at most {limit} banned words. The limit grows with the group owner's plan." },
    invalid_reaction: { TR: "Geçersiz tepki.", EN: "Invalid reaction." },
    conflict: { TR: "Grup başka bir yerde güncellendi; tekrar deneyin.", EN: "The group was updated elsewhere; please try again." },
    server_error: { TR: "Bir sorun oluştu. Lütfen tekrar deneyin.", EN: "Something went wrong. Please try again." },
    network: { TR: "Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.", EN: "Couldn't reach the server. Check your connection." },
    files: { TR: "Ortak dosyalara erişim kesildi.", EN: "Access to the shared files was lost." },
    chat: { TR: "Grup sohbetine erişim kesildi.", EN: "Access to the group chat was lost." },
    save_failed: { TR: "Dosya kaydedilemedi. Bağlantınızı kontrol edin; değişiklikleriniz bu sekmede duruyor.", EN: "The file couldn't be saved. Check your connection; your changes are still in this tab." },
    file_deleted: { TR: "Düzenlediğiniz dosya başka bir üye tarafından silindi.", EN: "The file you were editing was deleted by another member." },
    file_too_large: { TR: "Dosya 500.000 karakter sınırını aşıyor; kaydedilmedi.", EN: "The file exceeds the 500,000-character limit and wasn't saved." },
    file_exists: { TR: "Bu adda bir dosya zaten var.", EN: "A file with this name already exists." },
    file_name: { TR: "Dosya adı geçersiz. \\ : * ? \" < > | karakterlerini kullanmayın.", EN: "Invalid file name. Don't use \\ : * ? \" < > | characters." },
    files_limit: { TR: "Bir grupta en fazla 50 dosya olabilir.", EN: "A group can have at most 50 files." },
    voice_too_large: { TR: "Sesli mesaj 3 MB sınırını aşıyor.", EN: "The voice message exceeds the 3 MB limit." },
    voice_format: { TR: "Bu ses biçimi desteklenmiyor. Tarayıcınızı güncelleyip tekrar deneyin.", EN: "This audio format isn't supported. Update your browser and try again." },
    voice_failed: { TR: "Sesli mesaj gönderilemedi.", EN: "The voice message couldn't be sent." },
    voice_unavailable: { TR: "Sesli mesaj kullanılamıyor veya silinmiş.", EN: "The voice message is unavailable or was deleted." },
    mic_denied: { TR: "Mikrofon izni verilmedi.", EN: "Microphone permission was denied." },
    mic_missing: { TR: "Mikrofon bulunamadı. Bir mikrofon bağlayıp tekrar deneyin.", EN: "No microphone was found. Connect one and try again." },
    mic_busy: { TR: "Mikrofon başlatılamadı; başka bir uygulama kullanıyor olabilir. Onu kapatıp tekrar deneyin.", EN: "The microphone couldn't be started; another app may be using it. Close it and try again." },
    zip_failed: { TR: "ZIP dosyası oluşturulamadı.", EN: "The ZIP file couldn't be created." },
    editor_too_large: { TR: "Dosyalar Düzenleyici'ye aktarmak için çok büyük. Tek bir dosya açmayı deneyin.", EN: "The files are too large to open in the Editor. Try opening a single file." },
    clipboard_failed: { TR: "Panoya kopyalanamadı.", EN: "Couldn't copy to the clipboard." },
    message_failed: { TR: "Mesaj gönderilemedi.", EN: "The message couldn't be sent." },
    offline: { TR: "Bu özellik için bulut bağlantısı gerekiyor; bağlantı kurulunca tekrar dene.", EN: "This needs the cloud connection; try again once it's back." },
    muted: { TR: "Bu grupta susturuldun; {minutes} dakika sonra yeniden yazabilirsin.", EN: "You're muted in this group; you can write again in {minutes} minutes." },
    slowmode: { TR: "Bu kanalda yavaş mod açık; {seconds} saniye sonra yeniden yazabilirsin.", EN: "Slow mode is on in this channel; you can write again in {seconds} seconds." },
    automod_blocked: { TR: "Mesajın grubun AutoMod kurallarına takıldı ve gönderilmedi.", EN: "Your message hit the group's AutoMod rules and wasn't sent." },
    cannot_moderate: { TR: "Bu kişiye bu işlemi uygulayamazsın; rütbesi seninkiyle aynı ya da daha yüksek.", EN: "You can't do that to this person; their rank is the same as yours or higher." },
    invalid_command: { TR: "Komut anlaşılamadı. Kullanabileceğin komutları /yardim ile görebilirsin.", EN: "The command couldn't be read. See the commands you can use with /help." },
};

function isClientCode(value: unknown): value is GroupClientErrorCode {
    return typeof value === "string" && value in GROUP_ERROR_COPY;
}

async function request<T>(url: string, options: { body?: Record<string, unknown>; keepalive?: boolean } = {}): Promise<T> {
    let response: Response;
    try {
        response = await fetch(url, options.body
            ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(options.body), cache: "no-store", credentials: "same-origin", keepalive: options.keepalive }
            : { cache: "no-store", credentials: "same-origin" });
    } catch {
        throw new GroupRequestError("network");
    }
    const data = await response.json().catch(() => ({})) as T & { error?: unknown; code?: unknown; limit?: unknown; plan?: unknown; minutes?: unknown; seconds?: unknown; rule?: unknown };
    if (!response.ok) {
        const fallback: GroupClientErrorCode = response.status === 429 ? "rate_limited" : response.status === 401 ? "unauthorized" : "server_error";
        throw new GroupRequestError(isClientCode(data.code) ? data.code : fallback, typeof data.error === "string" ? data.error : "", response.status, limitVars(data));
    }
    return data;
}

type Success = { success: true };

export const groupsApi = {
    list: () => request<GroupListResponse>("/api/groups"),
    detail: (groupId: string) => request<GroupDetailResponse>(`/api/groups?id=${encodeURIComponent(groupId)}`),
    action: <T extends object = Success>(body: Record<string, unknown>) => request<T>("/api/groups", { body }),
    chat: (body: Record<string, unknown>, keepalive = false) => request<Success>("/api/groups/chat", { body, keepalive }),
    /** Sends a message or runs a command: the stored message and/or what only the sender sees. */
    send: (body: Record<string, unknown>) => request<{ success: true; message?: Record<string, unknown>; ephemeral?: EphemeralReply }>("/api/groups/chat", { body: { ...body, action: "send" } }),
    /** The group's safety screen (moderators): AutoMod, reports, mutes and AutoMod stops. */
    moderation: (groupId: string) => request<GroupModerationResponse>(`/api/groups/moderation?groupId=${encodeURIComponent(groupId)}`),
    moderate: <T extends object = Success>(body: Record<string, unknown>) => request<T>("/api/groups/moderation", { body }),
    invites: (groupId: string) => request<GroupInvitesResponse>(`/api/groups/invites?groupId=${encodeURIComponent(groupId)}`),
    createLink: (body: Record<string, unknown>) => request<{ success: true; link: GroupInviteLinkInfo }>("/api/groups/invites", { body: { ...body, action: "create-link" } }),
    revokeLink: (groupId: string, token: string) => request<Success>("/api/groups/invites", { body: { action: "revoke-link", groupId, token } }),
    joinPreview: (token: string) => request<{ preview: GroupJoinPreview }>(`/api/groups/join?token=${encodeURIComponent(token)}`),
    join: (token: string) => request<{ success: true; groupId: string; alreadyMember: boolean }>("/api/groups/join", { body: { token } }),
};

/** Limit messages for an answer without its number (an older server). */
const LIMIT_WITHOUT_NUMBER: Partial<Record<GroupClientErrorCode, Copy>> = {
    group_limit: GROUP_ERROR_COPY.server_error,
    target_group_limit: GROUP_ERROR_COPY.server_error,
    group_full: { TR: "Grup üye sınırına ulaştı.", EN: "The group has reached its member limit." },
    pin_limit: { TR: "Sabitlenebilecek mesaj sınırına ulaşıldı; önce bir mesajın sabitlemesini kaldırın.", EN: "The pin limit is reached; unpin a message first." },
    commands_limit: { TR: "Bu grubun özel komut sınırına ulaşıldı.", EN: "This group's custom command limit is reached." },
    words_limit: { TR: "Bu grubun yasaklı kelime sınırına ulaşıldı.", EN: "This group's banned word limit is reached." },
};

/** Turns any thrown value into localized text (API codes and client codes alike). */
export function useGroupErrorText() {
    const { tx } = useI18n();
    return useCallback((error: unknown, fallback: Copy = GROUP_ERROR_COPY.server_error) => {
        if (error instanceof GroupRequestError) {
            const withoutNumber = LIMIT_WITHOUT_NUMBER[error.code];
            if (withoutNumber && error.vars.limit === undefined) return tx(withoutNumber);
            return tx(GROUP_ERROR_COPY[error.code] ?? fallback, error.vars);
        }
        if (isClientCode(error)) return tx(GROUP_ERROR_COPY[error]);
        return tx(fallback);
    }, [tx]);
}
