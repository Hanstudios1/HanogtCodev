"use client";

import { useCallback } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
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
    | "files_limit" | "voice_too_large" | "voice_failed" | "voice_unavailable" | "mic_denied" | "zip_failed"
    | "editor_too_large" | "clipboard_failed" | "message_failed" | "offline";

export class GroupRequestError extends Error {
    constructor(
        public readonly code: GroupClientErrorCode,
        message = "",
        public readonly status = 0,
    ) {
        super(message || code);
        this.name = "GroupRequestError";
    }
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
    group_limit: { TR: "En fazla 30 grubun sahibi olabilirsiniz.", EN: "You can own at most 30 groups." },
    group_full: { TR: "Grup 25 üye sınırına ulaştı.", EN: "The group has reached its 25-member limit." },
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
    pin_limit: { TR: "En fazla 25 mesaj sabitlenebilir.", EN: "You can pin at most 25 messages." },
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
    voice_failed: { TR: "Sesli mesaj gönderilemedi.", EN: "The voice message couldn't be sent." },
    voice_unavailable: { TR: "Sesli mesaj kullanılamıyor veya silinmiş.", EN: "The voice message is unavailable or was deleted." },
    mic_denied: { TR: "Mikrofon izni verilmedi.", EN: "Microphone permission was denied." },
    zip_failed: { TR: "ZIP dosyası oluşturulamadı.", EN: "The ZIP file couldn't be created." },
    editor_too_large: { TR: "Dosyalar Düzenleyici'ye aktarmak için çok büyük. Tek bir dosya açmayı deneyin.", EN: "The files are too large to open in the Editor. Try opening a single file." },
    clipboard_failed: { TR: "Panoya kopyalanamadı.", EN: "Couldn't copy to the clipboard." },
    message_failed: { TR: "Mesaj gönderilemedi.", EN: "The message couldn't be sent." },
    offline: { TR: "Bu özellik için bulut bağlantısı gerekiyor; bağlantı kurulunca tekrar dene.", EN: "This needs the cloud connection; try again once it's back." },
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
    const data = await response.json().catch(() => ({})) as T & { error?: unknown; code?: unknown };
    if (!response.ok) {
        const fallback: GroupClientErrorCode = response.status === 429 ? "rate_limited" : response.status === 401 ? "unauthorized" : "server_error";
        throw new GroupRequestError(isClientCode(data.code) ? data.code : fallback, typeof data.error === "string" ? data.error : "", response.status);
    }
    return data;
}

type Success = { success: true };

export const groupsApi = {
    list: () => request<GroupListResponse>("/api/groups"),
    detail: (groupId: string) => request<GroupDetailResponse>(`/api/groups?id=${encodeURIComponent(groupId)}`),
    action: <T extends object = Success>(body: Record<string, unknown>) => request<T>("/api/groups", { body }),
    chat: (body: Record<string, unknown>, keepalive = false) => request<Success>("/api/groups/chat", { body, keepalive }),
    invites: (groupId: string) => request<GroupInvitesResponse>(`/api/groups/invites?groupId=${encodeURIComponent(groupId)}`),
    createLink: (body: Record<string, unknown>) => request<{ success: true; link: GroupInviteLinkInfo }>("/api/groups/invites", { body: { ...body, action: "create-link" } }),
    revokeLink: (groupId: string, token: string) => request<Success>("/api/groups/invites", { body: { action: "revoke-link", groupId, token } }),
    joinPreview: (token: string) => request<{ preview: GroupJoinPreview }>(`/api/groups/join?token=${encodeURIComponent(token)}`),
    join: (token: string) => request<{ success: true; groupId: string; alreadyMember: boolean }>("/api/groups/join", { body: { token } }),
};

/** Turns any thrown value into localized text (API codes and client codes alike). */
export function useGroupErrorText() {
    const { tx } = useI18n();
    return useCallback((error: unknown, fallback: Copy = GROUP_ERROR_COPY.server_error) => {
        if (error instanceof GroupRequestError) return tx(GROUP_ERROR_COPY[error.code] ?? fallback);
        if (isClientCode(error)) return tx(GROUP_ERROR_COPY[error]);
        return tx(fallback);
    }, [tx]);
}
