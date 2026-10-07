import type { Copy } from "@/lib/i18n";
import type { CollabErrorCode } from "./protocol";
import type { CollabNotice } from "./session-client";

/** Texts of the live-session interface shared by several components (each component keeps its own too). */
export const COLLAB_COPY = {
    button: { TR: "Ekiple düzenle", EN: "Edit with your team" },
    buttonLive: { TR: "Canlı oturum", EN: "Live session" },
    buttonHint: { TR: "Bu projeyi arkadaşlarınla aynı anda düzenle; yazışın ve sesli konuşun", EN: "Edit this project together with friends, chat and talk" },
    team: { TR: "Ekip", EN: "Team" },
    group: { TR: "Ekip", EN: "Team" },
    openPanel: { TR: "Ekip panelini aç", EN: "Open the team panel" },
    copyLink: { TR: "Davet bağlantısını kopyala", EN: "Copy the invite link" },
    linkCopied: { TR: "Davet bağlantısı kopyalandı. Yalnızca davet ettiğin arkadaşların katılabilir.", EN: "Invite link copied. Only friends you invited can join." },
    copyFailed: { TR: "Panoya kopyalanamadı.", EN: "Couldn't copy to the clipboard." },
    leave: { TR: "Oturumdan ayrıl", EN: "Leave the session" },
    end: { TR: "Oturumu bitir", EN: "End the session" },
    invite: { TR: "Arkadaş davet et", EN: "Invite friends" },
    joinCall: { TR: "Sesli sohbete katıl", EN: "Join voice chat" },
    leaveCall: { TR: "Sesli sohbetten ayrıl", EN: "Leave voice chat" },
    owner: { TR: "Sahip", EN: "Owner" },
    you: { TR: "sen", EN: "you" },
    readOnlyBadge: { TR: "Salt okunur", EN: "Read-only" },
    live: { TR: "Canlı", EN: "Live" },
    connecting: { TR: "Bağlanıyor…", EN: "Connecting…" },
    reconnecting: { TR: "Bağlantı koptu, yeniden deneniyor…", EN: "Connection lost, retrying…" },
    polling: { TR: "Yedek bağlantı (kısa aralıklarla güncellenir)", EN: "Fallback connection (updates every moment)" },
    realtime: { TR: "Anlık bağlantı", EN: "Realtime connection" },
    signInRequired: { TR: "Ekiple düzenlemek için giriş yapın.", EN: "Sign in to edit with your team." },
    gameMode: { TR: "Oyun scriptleri ekiple düzenlenemez.", EN: "Game scripts can't be edited with a team." },
} satisfies Record<string, Copy>;

/** Notices from a running session (toasts). */
export const COLLAB_NOTICE_COPY = {
    joined: { TR: "{name} oturuma katıldı.", EN: "{name} joined the session." },
    left: { TR: "{name} oturumdan ayrıldı.", EN: "{name} left the session." },
    readOnlyOn: { TR: "Oturum sahibi düzenlemeyi kapattı; şimdilik yalnızca izleyebilirsin.", EN: "The owner turned editing off; you can only watch for now." },
    readOnlyOff: { TR: "Oturum sahibi düzenlemeyi yeniden açtı.", EN: "The owner turned editing back on." },
    rejected: { TR: "Bu değişiklik uygulanmadı: oturum salt okunur ya da boyut sınırına ulaşıldı.", EN: "That change wasn't applied: the session is read-only or the size limit was reached." },
    fileTooLarge: { TR: "Bir dosya en fazla 500.000 karakter olabilir.", EN: "A file can be at most 500,000 characters." },
    contentTooLarge: { TR: "Oturumdaki kod toplam 1.000.000 karakteri aşamaz.", EN: "The session's code can't exceed 1,000,000 characters in total." },
    tooManyFiles: { TR: "Oturum, planına göre dosya sınırına ulaştı (Ücretsiz 20, Plus 40, Pro 100 dosya).", EN: "The session reached its file limit for the plan (Free 20, Plus 40, Pro 100 files)." },
    lastFile: { TR: "Oturumdaki son dosya silinemez.", EN: "The session's last file can't be deleted." },
    resynced: { TR: "Oturum sunucudaki son hâline göre yeniden yüklendi.", EN: "The session was reloaded from the server's latest state." },
    reconnected: { TR: "Bağlantı yeniden kuruldu.", EN: "Reconnected." },
    phoneFollow: { TR: "Telefonda oturumu izleme modunda görüntülüyorsun; düzenlemek için tablet veya bilgisayar kullan.", EN: "On a phone you watch the session; use a tablet or computer to edit." },
    removed: { TR: "Oturum sahibi seni oturumdan çıkardı.", EN: "The owner removed you from the session." },
    saveParticipant: { TR: "Oturumdaki kod, oturum sahibinin projesine kaydedilir. Bir kopya için oturum bitince “Kopyayı sakla”yı kullan.", EN: "The session's code is saved to the owner's project. To keep a copy, use “Keep a copy” when the session ends." },
} satisfies Record<string, Copy>;

export const COLLAB_ERROR_COPY: Record<CollabErrorCode, Copy> = {
    unauthorized: { TR: "Oturumunun süresi dolmuş olabilir; lütfen yeniden giriş yap.", EN: "Your sign-in may have expired; please sign in again." },
    bad_origin: { TR: "İstek doğrulanamadı. Sayfayı yenileyip tekrar dene.", EN: "The request couldn't be verified. Reload the page and try again." },
    rate_limited: { TR: "Çok hızlı gidiyorsun. Biraz bekleyip tekrar dene.", EN: "You're going a bit fast. Wait a moment and try again." },
    invalid_request: { TR: "İstek geçersiz.", EN: "The request is invalid." },
    payload_too_large: { TR: "Değişiklik çok büyük.", EN: "The change is too large." },
    not_found: { TR: "Canlı oturum bulunamadı ya da artık erişimin yok.", EN: "The live session wasn't found, or you no longer have access." },
    not_friend: { TR: "Yalnızca oturum sahibinin arkadaşları katılabilir veya davet edilebilir.", EN: "Only the owner's friends can join or be invited." },
    full: { TR: "Oturum dolu: oturum sahibinin planındaki kişi sınırına ulaşıldı (Ücretsiz 2, Plus 5, Pro 30).", EN: "The session is full: it has reached its owner's plan limit (Free 2, Plus 5, Pro 30)." },
    invite_limit: { TR: "Planın bu kadar davete izin vermiyor. Daha kalabalık oturumlar için Fiyatlandırma'dan planını yükseltebilirsin.", EN: "Your plan doesn't allow that many invitations. Upgrade on Pricing for bigger sessions." },
    ended: { TR: "Canlı oturum sona erdi.", EN: "The live session has ended." },
    read_only: { TR: "Oturum sahibi düzenlemeyi kapattı.", EN: "The owner turned editing off." },
    frozen: { TR: "Oturum boyut sınırını aştı; yeni değişiklikler kaydedilemiyor.", EN: "The session exceeded its size limit; new changes can't be saved." },
    forbidden: { TR: "Bu işlem için yetkin yok.", EN: "You don't have permission to do that." },
    invalid_file: { TR: "Dosyalardan biri geçersiz.", EN: "One of the files is invalid." },
    too_many_files: { TR: "Oturum, planına göre dosya sınırına ulaştı (Ücretsiz 20, Plus 40, Pro 100 dosya).", EN: "The session reached its file limit for the plan (Free 20, Plus 40, Pro 100 files)." },
    file_too_large: { TR: "Bir dosya en fazla 500.000 karakter olabilir.", EN: "A file can be at most 500,000 characters." },
    content_too_large: { TR: "Oturumdaki kod toplam 1.000.000 karakteri aşamaz.", EN: "The session's code can't exceed 1,000,000 characters in total." },
    invalid_update: { TR: "Değişiklik sunucuya iletilemedi; oturum yeniden yüklendi.", EN: "A change couldn't be delivered; the session was reloaded." },
    conflict: { TR: "Oturum aynı anda başka biri tarafından güncellendi; tekrar dene.", EN: "Someone updated the session at the same time; try again." },
    unavailable: { TR: "Canlı oturum hizmetine şu anda ulaşılamıyor.", EN: "The live session service is unavailable right now." },
    network: { TR: "Sunucuya ulaşılamadı. Bağlantını kontrol et.", EN: "Couldn't reach the server. Check your connection." },
};

type Translate = (copy: Copy, vars?: Record<string, string | number>) => string;
type NoticeToast = { tone: "success" | "error" | "warning" | "info"; message: string };

const LIMIT_COPY: Record<Extract<CollabNotice, { kind: "limit" }>["code"], Copy> = {
    too_many_files: COLLAB_NOTICE_COPY.tooManyFiles,
    file_too_large: COLLAB_NOTICE_COPY.fileTooLarge,
    content_too_large: COLLAB_NOTICE_COPY.contentTooLarge,
    invalid_file: COLLAB_ERROR_COPY.invalid_file,
    last_file: COLLAB_NOTICE_COPY.lastFile,
};

/** A session notice as an editor toast. */
export function collabNoticeToast(notice: CollabNotice, tx: Translate): NoticeToast {
    switch (notice.kind) {
        case "joined": return { tone: "info", message: tx(COLLAB_NOTICE_COPY.joined, { name: notice.name }) };
        case "left": return { tone: "info", message: tx(COLLAB_NOTICE_COPY.left, { name: notice.name }) };
        case "read_only_on": return { tone: "warning", message: tx(COLLAB_NOTICE_COPY.readOnlyOn) };
        case "read_only_off": return { tone: "success", message: tx(COLLAB_NOTICE_COPY.readOnlyOff) };
        case "rejected": return { tone: "warning", message: tx(COLLAB_NOTICE_COPY.rejected) };
        case "resynced": return { tone: "info", message: tx(COLLAB_NOTICE_COPY.resynced) };
        case "reconnected": return { tone: "success", message: tx(COLLAB_NOTICE_COPY.reconnected) };
        case "phone_follow": return { tone: "info", message: tx(COLLAB_NOTICE_COPY.phoneFollow) };
        case "limit": return { tone: "warning", message: tx(LIMIT_COPY[notice.code]) };
        default: return { tone: notice.code === "not_found" ? "warning" : "error", message: tx(notice.code === "not_found" ? COLLAB_NOTICE_COPY.removed : COLLAB_ERROR_COPY[notice.code]) };
    }
}
