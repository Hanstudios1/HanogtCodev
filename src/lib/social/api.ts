"use client";

import { useCallback } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import {
    dmMessageFromData,
    type DmConversationResponse,
    type DmListResponse,
    type DmMessage,
    type FriendsOverview,
    type SocialProfileResponse,
} from "./model";

/** Codes of the Social and friends APIs plus client-side failures. */
export type SocialErrorCode =
    | "unauthorized" | "forbidden_origin" | "rate_limited" | "invalid_request" | "payload_too_large"
    | "invalid_email" | "invalid_id" | "not_found" | "not_friend" | "blocked" | "forbidden"
    | "message_not_found" | "empty_message" | "message_too_long" | "invalid_tag" | "user_not_found"
    | "already_friends" | "request_exists" | "self_action" | "cannot_add" | "conflict" | "server_error"
    | "network" | "send_failed" | "voice_failed" | "voice_too_large" | "voice_unavailable" | "mic_denied" | "offline_voice";

export class SocialRequestError extends Error {
    readonly code: SocialErrorCode;
    readonly status: number;

    constructor(code: SocialErrorCode, message = "", status = 0) {
        super(message || code);
        this.name = "SocialRequestError";
        this.code = code;
        this.status = status;
    }
}

export const SOCIAL_ERROR_COPY: Record<SocialErrorCode, Copy> = {
    unauthorized: { TR: "Oturumunuzun süresi dolmuş olabilir; lütfen yeniden giriş yapın.", EN: "Your session may have expired; please sign in again." },
    forbidden_origin: { TR: "İstek doğrulanamadı. Sayfayı yenileyip tekrar deneyin.", EN: "The request couldn't be verified. Reload the page and try again." },
    rate_limited: { TR: "Çok hızlı gidiyorsun. Biraz bekleyip tekrar dene.", EN: "You're going a bit fast. Wait a moment and try again." },
    invalid_request: { TR: "İstek geçersiz.", EN: "The request is invalid." },
    payload_too_large: { TR: "İstek çok büyük.", EN: "The request is too large." },
    invalid_email: { TR: "Geçersiz kullanıcı.", EN: "Invalid user." },
    invalid_id: { TR: "Geçersiz bağlantı veya kimlik.", EN: "Invalid link or id." },
    not_found: { TR: "Bulunamadı ya da artık erişimin yok.", EN: "Not found, or you no longer have access." },
    not_friend: { TR: "Yalnızca arkadaşlarına mesaj gönderebilirsin.", EN: "You can only message your friends." },
    blocked: { TR: "Bu kişiyi engelledin. Mesaj göndermek için önce engeli kaldır.", EN: "You blocked this person. Unblock them to send messages." },
    forbidden: { TR: "Bu işlem için yetkin yok.", EN: "You don't have permission to do that." },
    message_not_found: { TR: "Mesaj bulunamadı; silinmiş olabilir.", EN: "The message wasn't found; it may have been deleted." },
    empty_message: { TR: "Boş mesaj gönderilemez.", EN: "You can't send an empty message." },
    message_too_long: { TR: "Mesaj en fazla 4000 karakter olabilir.", EN: "A message can be at most 4000 characters." },
    invalid_tag: { TR: "Biçim geçersiz. Örnek: Oyuncu#1234", EN: "Invalid format. Example: Player#1234" },
    user_not_found: { TR: "Bu takma ad ve etikete sahip bir kullanıcı bulunamadı.", EN: "No user with that nickname and tag was found." },
    already_friends: { TR: "Bu kişiyle zaten arkadaşsınız.", EN: "You're already friends with this person." },
    request_exists: { TR: "Bu kişiye zaten bir istek gönderdin.", EN: "You've already sent this person a request." },
    self_action: { TR: "Bunu kendi hesabına uygulayamazsın.", EN: "You can't do that to your own account." },
    cannot_add: { TR: "Bu kişiye arkadaşlık isteği gönderilemiyor.", EN: "You can't send this person a friend request." },
    conflict: { TR: "Veriler başka bir yerde güncellendi; tekrar dene.", EN: "The data changed elsewhere; please try again." },
    server_error: { TR: "Bir sorun oluştu. Lütfen tekrar dene.", EN: "Something went wrong. Please try again." },
    network: { TR: "Sunucuya ulaşılamadı. Bağlantını kontrol et.", EN: "Couldn't reach the server. Check your connection." },
    send_failed: { TR: "Mesaj gönderilemedi.", EN: "The message couldn't be sent." },
    voice_failed: { TR: "Sesli mesaj gönderilemedi.", EN: "The voice message couldn't be sent." },
    voice_too_large: { TR: "Sesli mesaj 3 MB sınırını aşıyor.", EN: "The voice message exceeds the 3 MB limit." },
    voice_unavailable: { TR: "Sesli mesaj açılamadı veya silinmiş.", EN: "The voice message couldn't be opened or was deleted." },
    mic_denied: { TR: "Mikrofon izni verilmedi.", EN: "Microphone permission was denied." },
    offline_voice: { TR: "Sesli mesajlar için bulut bağlantısı gerekiyor; bağlantı kurulunca tekrar dene.", EN: "Voice messages need the cloud connection; try again once it's back." },
};

function isCode(value: unknown): value is SocialErrorCode {
    return typeof value === "string" && value in SOCIAL_ERROR_COPY;
}

async function request<T>(url: string, body?: Record<string, unknown>, options: { keepalive?: boolean } = {}): Promise<T> {
    let response: Response;
    try {
        response = await fetch(url, body
            ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store", credentials: "same-origin", keepalive: options.keepalive }
            : { cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" } });
    } catch {
        throw new SocialRequestError("network");
    }
    const data = await response.json().catch(() => ({})) as T & { error?: unknown; code?: unknown };
    if (!response.ok) {
        const fallback: SocialErrorCode = response.status === 429 ? "rate_limited" : response.status === 401 ? "unauthorized" : response.status === 404 ? "not_found" : "server_error";
        throw new SocialRequestError(isCode(data.code) ? data.code : fallback, typeof data.error === "string" ? data.error : "", response.status);
    }
    return data;
}

function messages(value: unknown): DmMessage[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
        if (!entry || typeof entry !== "object" || typeof (entry as { id?: unknown }).id !== "string") return [];
        return [dmMessageFromData((entry as { id: string }).id, entry as Record<string, unknown>)];
    });
}

export type DmCursor = { since?: number; before?: number; limit?: number };

export const socialApi = {
    friends: () => request<FriendsOverview>("/api/social/friends"),
    dms: () => request<DmListResponse>("/api/social/dms"),
    profile: (email: string) => request<SocialProfileResponse>(`/api/social/profile?email=${encodeURIComponent(email)}`),
    conversation: async (email: string, cursor: DmCursor = {}) => {
        const query = new URLSearchParams({ with: email });
        if (cursor.since) query.set("since", String(Math.floor(cursor.since)));
        if (cursor.before) query.set("before", String(Math.floor(cursor.before)));
        if (cursor.limit) query.set("limit", String(cursor.limit));
        const data = await request<DmConversationResponse>(`/api/social/dm?${query.toString()}`);
        return { ...data, messages: messages(data.messages) };
    },
    send: async (email: string, body: { text: string; type?: "text" | "sticker"; replyTo?: { id: string } | null }) => {
        const data = await request<{ message?: unknown }>("/api/social/dm", { action: "send", with: email, ...body });
        return messages([data.message])[0] ?? null;
    },
    dmAction: (body: Record<string, unknown>, keepalive = false) => request<{ success: true }>("/api/social/dm", body, { keepalive }),
    friendAction: (body: Record<string, unknown>) => request<{ success: true; accepted?: boolean; sent?: boolean }>("/api/friends", body),
};

/** Localized text for any thrown value (API codes and client codes alike). */
export function useSocialErrorText() {
    const { tx } = useI18n();
    return useCallback((error: unknown, fallback: Copy = SOCIAL_ERROR_COPY.server_error) => {
        if (error instanceof SocialRequestError) return tx(SOCIAL_ERROR_COPY[error.code] ?? fallback);
        if (isCode(error)) return tx(SOCIAL_ERROR_COPY[error]);
        return tx(fallback);
    }, [tx]);
}
