import type { Copy } from "@/lib/i18n";
import {
    MAX_ACTIVE_ANNOUNCEMENTS,
    type AdminAuditAction,
    type AnnouncementLevel,
    type FeedbackStatus,
    type ReportCategory,
    type SecurityRisk,
    type UserRole,
} from "./types";

/** Translated messages for the `code` field of admin API errors. */
export const ERROR_COPY: Record<string, Copy> = {
    not_found: { TR: "Kayıt bulunamadı ya da bu işlem için yetkiniz yok.", EN: "Not found, or you don't have access to this action." },
    forbidden: { TR: "Rolünüz bu işleme izin vermiyor.", EN: "Your role doesn't allow this action." },
    bad_origin: { TR: "İstek güvenlik denetiminden geçemedi. Sayfayı yenileyip tekrar deneyin.", EN: "The request failed a security check. Reload the page and try again." },
    rate_limited: { TR: "Çok fazla istek gönderildi. Biraz bekleyip tekrar deneyin.", EN: "Too many requests. Wait a moment and try again." },
    unsupported_media_type: { TR: "İstek biçimi geçersiz. Sayfayı yenileyin.", EN: "Invalid request format. Reload the page." },
    payload_too_large: { TR: "Gönderilen içerik çok büyük.", EN: "The submitted content is too large." },
    invalid_json: { TR: "İstek okunamadı. Sayfayı yenileyip tekrar deneyin.", EN: "The request couldn't be read. Reload the page and try again." },
    unknown_field: { TR: "İstek beklenmeyen bir alan içeriyor. Sayfayı yenileyin.", EN: "The request contains an unexpected field. Reload the page." },
    invalid_action: { TR: "Geçersiz işlem.", EN: "Invalid action." },
    invalid_id: { TR: "Kayıt kimliği geçersiz.", EN: "Invalid record id." },
    invalid_email: { TR: "Geçerli bir e-posta adresi girin.", EN: "Enter a valid e-mail address." },
    invalid_role: { TR: "Geçersiz rol.", EN: "Invalid role." },
    invalid_status: { TR: "Geçersiz durum.", EN: "Invalid status." },
    invalid_text: { TR: "Metin geçersiz.", EN: "The text is invalid." },
    text_required: { TR: "Metin boş olamaz.", EN: "The text can't be empty." },
    too_long: { TR: "Metin izin verilen uzunluğu aşıyor.", EN: "The text is longer than allowed." },
    invalid_level: { TR: "Geçersiz duyuru seviyesi.", EN: "Invalid announcement level." },
    invalid_link: { TR: "Bağlantı / ile başlayan bir yol veya https adresi olmalıdır.", EN: "The link must be a path starting with / or an https URL." },
    invalid_dates: { TR: "Tarihler geçersiz: bitiş, başlangıçtan sonra ve etkin duyurularda gelecekte olmalıdır.", EN: "Invalid dates: the end must follow the start and, for active announcements, lie in the future." },
    invalid_query: { TR: "Arama ifadesi geçersiz.", EN: "Invalid search." },
    invalid_cursor: { TR: "Sayfa bilgisi geçersiz; aramayı yenileyin.", EN: "Invalid page cursor; refresh the search." },
    invalid_boolean: { TR: "Açık/kapalı değeri geçersiz.", EN: "Invalid on/off value." },
    user_not_found: { TR: "Kullanıcı bulunamadı.", EN: "User not found." },
    cannot_target_self: { TR: "Bu işlemi kendi hesabınıza uygulayamazsınız.", EN: "You can't do this to your own account." },
    cannot_modify_owner: { TR: "Sahip hesapları panelden değiştirilemez.", EN: "Owner accounts can't be changed from the panel." },
    insufficient_role: { TR: "Yöneticileri yalnızca sahipler yönetebilir.", EN: "Only owners can manage admins." },
    already_suspended: { TR: "Hesap zaten askıya alınmış.", EN: "The account is already suspended." },
    not_suspended: { TR: "Hesap zaten etkin.", EN: "The account is already active." },
    no_change: { TR: "Değişiklik yok.", EN: "Nothing changed." },
    already_handled: { TR: "Bu kayıt başka bir ekip üyesi tarafından zaten işlendi.", EN: "Another team member already handled this." },
    conflict: { TR: "Kayıt aynı anda değişti. Listeyi yenileyip tekrar deneyin.", EN: "The record changed at the same time. Refresh and try again." },
    too_many_active: {
        TR: "Aynı anda en fazla {count} etkin duyuru olabilir. Önce birini kapatın.",
        EN: "At most {count} announcements can be active at once. Turn one off first.",
        vars: { count: MAX_ACTIVE_ANNOUNCEMENTS },
    },
    unavailable: { TR: "Yönetim hizmetine şu anda ulaşılamıyor.", EN: "The admin service is unavailable right now." },
    network: { TR: "Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.", EN: "Couldn't reach the server. Check your internet connection." },
    unknown: { TR: "Beklenmeyen bir hata oluştu.", EN: "Something unexpected went wrong." },
};

export const RATE_LIMIT_WAIT: Copy = { TR: "Çok fazla istek gönderildi. {seconds} saniye sonra tekrar deneyin.", EN: "Too many requests. Try again in {seconds} seconds." };

export const COMMON = {
    retry: { TR: "Tekrar dene", EN: "Try again" },
    refresh: { TR: "Yenile", EN: "Refresh" },
    cancel: { TR: "Vazgeç", EN: "Cancel" },
    close: { TR: "Kapat", EN: "Close" },
    save: { TR: "Kaydet", EN: "Save" },
    delete: { TR: "Sil", EN: "Delete" },
    loading: { TR: "Yükleniyor…", EN: "Loading…" },
    loadMore: { TR: "Daha fazla yükle", EN: "Load more" },
    optional: { TR: "(isteğe bağlı)", EN: "(optional)" },
    unavailable: { TR: "Alınamadı", EN: "Unavailable" },
    you: { TR: "Siz", EN: "You" },
    all: { TR: "Tümü", EN: "All" },
    search: { TR: "Ara", EN: "Search" },
    noResults: { TR: "Filtrelerle eşleşen kayıt yok.", EN: "No records match the filters." },
    clearFilters: { TR: "Filtreleri temizle", EN: "Clear filters" },
    characters: { TR: "{count}/{max} karakter", EN: "{count}/{max} characters" },
    updatedAgo: { TR: "Güncellendi: {time}", EN: "Updated {time}" },
} satisfies Record<string, Copy>;

export const ROLE_COPY: Record<UserRole, Copy> = {
    owner: { TR: "Sahip", EN: "Owner" },
    admin: { TR: "Yönetici", EN: "Admin" },
    moderator: { TR: "Moderatör", EN: "Moderator" },
    user: { TR: "Kullanıcı", EN: "User" },
};

export const ROLE_DESCRIPTION_COPY: Record<UserRole, Copy> = {
    owner: { TR: "ADMIN_EMAILS ile tanımlanır; her şeye erişir ve panelden değiştirilemez.", EN: "Defined by ADMIN_EMAILS; full access and can't be changed from the panel." },
    admin: { TR: "Moderasyona ek olarak kullanıcıları ve duyuruları yönetir.", EN: "Manages users and announcements in addition to moderation." },
    moderator: { TR: "Bildirimleri, yorumları, Arcade oyunlarını ve geri bildirimleri yönetir.", EN: "Handles reports, comments, Arcade games and feedback." },
    user: { TR: "Ekip yetkisi yok.", EN: "No staff access." },
};

export const FEEDBACK_STATUS_COPY: Record<FeedbackStatus, Copy> = {
    open: { TR: "Açık", EN: "Open" },
    planned: { TR: "Planlandı", EN: "Planned" },
    "in-progress": { TR: "Üzerinde çalışılıyor", EN: "In progress" },
    done: { TR: "Tamamlandı", EN: "Done" },
    closed: { TR: "Kapatıldı", EN: "Closed" },
};

export const LEVEL_COPY: Record<AnnouncementLevel, Copy> = {
    info: { TR: "Bilgi", EN: "Info" },
    success: { TR: "Başarı", EN: "Success" },
    warning: { TR: "Uyarı", EN: "Warning" },
    danger: { TR: "Kritik", EN: "Critical" },
};

export const CATEGORY_COPY: Record<ReportCategory, Copy> = {
    malware: { TR: "Zararlı kod", EN: "Malware" },
    copyright: { TR: "Telif hakkı", EN: "Copyright" },
    personal_data: { TR: "Kişisel veri", EN: "Personal data" },
    spam: { TR: "Spam", EN: "Spam" },
    other: { TR: "Diğer", EN: "Other" },
};

export const RISK_COPY: Record<SecurityRisk, Copy> = {
    critical: { TR: "Kritik", EN: "Critical" },
    high: { TR: "Yüksek", EN: "High" },
    medium: { TR: "Orta", EN: "Medium" },
    low: { TR: "Düşük", EN: "Low" },
    unknown: { TR: "Bilinmiyor", EN: "Unknown" },
};

export const SECURITY_ACTION_COPY: Record<string, Copy> = {
    execution_blocked: { TR: "Kod çalıştırma engellendi", EN: "Code run blocked" },
};

export const AUDIT_ACTION_COPY: Record<AdminAuditAction, Copy> = {
    "user.suspend": { TR: "Hesap askıya alındı", EN: "Account suspended" },
    "user.unsuspend": { TR: "Askı kaldırıldı", EN: "Suspension lifted" },
    "user.set_role": { TR: "Rol değiştirildi", EN: "Role changed" },
    "user.reset_2fa": { TR: "İki adımlı doğrulama sıfırlandı", EN: "Two-step verification reset" },
    "report.resolve": { TR: "Bildirim çözüldü", EN: "Report resolved" },
    "report.dismiss": { TR: "Bildirim reddedildi", EN: "Report dismissed" },
    "report.remove_content": { TR: "İçerik kaldırıldı", EN: "Content removed" },
    "media.cleanup_incomplete": { TR: "Media temizliği yarım kaldı", EN: "Media cleanup incomplete" },
    "news_comment.delete": { TR: "Haber yorumu silindi", EN: "News comment deleted" },
    "arcade.unpublish": { TR: "Oyun yayından kaldırıldı", EN: "Game unpublished" },
    "arcade.feature": { TR: "Oyun öne çıkarıldı", EN: "Game featured" },
    "arcade.unfeature": { TR: "Öne çıkarma kaldırıldı", EN: "Game unfeatured" },
    "feedback.set_status": { TR: "Geri bildirim durumu değişti", EN: "Feedback status changed" },
    "feedback.reply": { TR: "Resmî yanıt gönderildi", EN: "Official reply posted" },
    "feedback.delete": { TR: "Geri bildirim silindi", EN: "Feedback deleted" },
    "announcement.create": { TR: "Duyuru oluşturuldu", EN: "Announcement created" },
    "announcement.update": { TR: "Duyuru güncellendi", EN: "Announcement updated" },
    "announcement.set_active": { TR: "Duyuru açıldı veya kapatıldı", EN: "Announcement switched on or off" },
    "announcement.delete": { TR: "Duyuru silindi", EN: "Announcement deleted" },
};

/** Labels for common audit detail keys; other keys are shown as they are. */
export const DETAIL_KEY_COPY: Record<string, Copy> = {
    email: { TR: "E-posta", EN: "E-mail" },
    role: { TR: "Rol", EN: "Role" },
    reason: { TR: "Gerekçe", EN: "Reason" },
    from: { TR: "Önceki", EN: "From" },
    to: { TR: "Yeni", EN: "To" },
    note: { TR: "Not", EN: "Note" },
    title: { TR: "Başlık", EN: "Title" },
    ownerEmail: { TR: "Sahibi", EN: "Owner" },
    authorEmail: { TR: "Yazar", EN: "Author" },
    excerpt: { TR: "Alıntı", EN: "Excerpt" },
    category: { TR: "Kategori", EN: "Category" },
    postId: { TR: "Gönderi", EN: "Post" },
    reportId: { TR: "Bildirim", EN: "Report" },
    reportsClosed: { TR: "Kapatılan bildirim", EN: "Reports closed" },
    postMissing: { TR: "Gönderi zaten yoktu", EN: "Post already gone" },
    newsId: { TR: "Haber", EN: "Story" },
    plays: { TR: "Oynanma", EN: "Plays" },
    likes: { TR: "Beğeni", EN: "Likes" },
    level: { TR: "Seviye", EN: "Level" },
    active: { TR: "Etkin", EN: "Active" },
    link: { TR: "Bağlantı", EN: "Link" },
    textTR: { TR: "Metin (TR)", EN: "Text (TR)" },
    textEN: { TR: "Metin (EN)", EN: "Text (EN)" },
    type: { TR: "Tür", EN: "Type" },
    commentId: { TR: "Yorum", EN: "Comment" },
    clearedLegacyBan: { TR: "Eski yasak kaldırıldı", EN: "Legacy ban cleared" },
};
