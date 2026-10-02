/**
 * Help center shared rules: support tickets ("Destek talepleri", a private
 * channel between a signed-in user and the Hanogt team), the public feedback
 * board and the sender record ("sicil") staff see next to a ticket.
 *
 * Client-safe and dependency-free (only types are imported), so the
 * Feedback/FAQ page, the API routes, the admin panel and the plain-Node tests
 * in scripts/tests share one set of limits, labels and validation rules.
 */
import type { FeedbackStatus } from "@/components/Admin/types";
import type { Copy } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Categories, statuses, priorities
// ---------------------------------------------------------------------------

/** Categories new tickets can use, in the order the form offers them. */
export const TICKET_CATEGORIES = ["complaint", "request", "security", "ban_appeal", "question", "feedback"] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

/**
 * Categories of tickets filed before the six above. They are still shown
 * (with an "(eski)" label) and can be filtered in the admin inbox, but new
 * tickets can't use them.
 */
export const LEGACY_TICKET_CATEGORIES = ["bug", "account", "other"] as const;
export type LegacyTicketCategory = (typeof LEGACY_TICKET_CATEGORIES)[number];
/** Any category a stored ticket can have. */
export type StoredTicketCategory = TicketCategory | LegacyTicketCategory;
export const STORED_TICKET_CATEGORIES: readonly StoredTicketCategory[] = [...TICKET_CATEGORIES, ...LEGACY_TICKET_CATEGORIES];

/** What a complaint is about (optional). */
export const COMPLAINT_SUBJECTS = ["user", "content", "group", "service", "other"] as const;
export type ComplaintSubject = (typeof COMPLAINT_SUBJECTS)[number];

/** What an unban request is about. */
export const BAN_SCOPES = ["account", "group", "other"] as const;
export type BanScope = (typeof BAN_SCOPES)[number];

export const TICKET_STATUSES = ["open", "in_progress", "answered", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** Tickets the team still works on (the admin inbox shows these by default). */
export const ACTIVE_TICKET_STATUSES: readonly TicketStatus[] = ["open", "in_progress", "answered"];

export const TICKET_PRIORITIES = ["low", "normal", "high", "critical"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

/** Severity the reporter assigns to a security report. */
export const TICKET_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type TicketSeverity = (typeof TICKET_SEVERITIES)[number];

export type TicketMessageFrom = "user" | "staff";

export const TICKET_LIMITS = {
    titleMin: 3,
    title: 120,
    descriptionMin: 10,
    description: 5_000,
    /** Steps of legacy bug reports (read only). */
    steps: 2_000,
    pageUrl: 500,
    userAgent: 400,
    /** Complaints: the person complained about (name or nickname#tag). */
    reportedUser: 100,
    /** Unban requests: the group's name or what else was banned. */
    banReference: 120,
    message: 3_000,
    /** Messages one thread keeps (staff replies and follow-ups). */
    messages: 100,
    /** Last-message excerpt stored for list views. */
    preview: 160,
} as const;

export const TICKET_RATE_LIMITS = {
    createPerHour: 5,
    createPerDay: 20,
    repliesPerHour: 30,
} as const;

/** Public feedback board (/api/feedback). */
export const BOARD_LIMITS = {
    content: 2_000,
    description: 5_000,
    comment: 1_000,
    /** Comments one post keeps. */
    comments: 200,
    /** Newest posts read for the board. */
    items: 300,
} as const;

/** Name shown for every staff message; a staff member's own name or e-mail is never stored. */
export const TEAM_AUTHOR_NAME = "Hanogt Ekibi";
export const TEAM_NAME: Copy = { TR: "Hanogt Ekibi", EN: "Hanogt Team" };

/** One of the six categories new tickets may use. */
export function isTicketCategory(value: unknown): value is TicketCategory {
    return typeof value === "string" && (TICKET_CATEGORIES as readonly string[]).includes(value);
}

export function isLegacyTicketCategory(value: unknown): value is LegacyTicketCategory {
    return typeof value === "string" && (LEGACY_TICKET_CATEGORIES as readonly string[]).includes(value);
}

/** A category a stored ticket may have (current or legacy). */
export function isStoredTicketCategory(value: unknown): value is StoredTicketCategory {
    return isTicketCategory(value) || isLegacyTicketCategory(value);
}

export function isComplaintSubject(value: unknown): value is ComplaintSubject {
    return typeof value === "string" && (COMPLAINT_SUBJECTS as readonly string[]).includes(value);
}

export function isBanScope(value: unknown): value is BanScope {
    return typeof value === "string" && (BAN_SCOPES as readonly string[]).includes(value);
}

export function isTicketStatus(value: unknown): value is TicketStatus {
    return typeof value === "string" && (TICKET_STATUSES as readonly string[]).includes(value);
}

export function isTicketPriority(value: unknown): value is TicketPriority {
    return typeof value === "string" && (TICKET_PRIORITIES as readonly string[]).includes(value);
}

export function isTicketSeverity(value: unknown): value is TicketSeverity {
    return typeof value === "string" && (TICKET_SEVERITIES as readonly string[]).includes(value);
}

/** Ticket ids are created by the server: 20 lower-case hex characters. */
export function isTicketId(value: unknown): value is string {
    return typeof value === "string" && /^[a-f0-9]{20}$/.test(value);
}

/** Short code people can quote ("#3FA9C2D1"), shown without the "#". */
export function ticketReference(id: string) {
    return id.slice(0, 8).toUpperCase();
}

/**
 * Security reports and unban requests start high (a security report the
 * reporter calls critical starts critical); everything else normal.
 */
export function defaultTicketPriority(category: TicketCategory, severity: TicketSeverity | null = null): TicketPriority {
    if (category === "security") return severity === "critical" ? "critical" : "high";
    return category === "ban_appeal" ? "high" : "normal";
}

/** A staff reply answers the ticket unless it was already resolved or closed. */
export function statusAfterStaffReply(status: TicketStatus): TicketStatus {
    return status === "resolved" || status === "closed" ? status : "answered";
}

/** A follow-up puts an answered or resolved ticket back in the team's queue; closed tickets must be reopened first (null). */
export function statusAfterUserReply(status: TicketStatus): TicketStatus | null {
    if (status === "closed") return null;
    return status === "answered" || status === "resolved" ? "open" : status;
}

export function canUserClose(status: TicketStatus) {
    return status !== "closed";
}

export function canUserReopen(status: TicketStatus) {
    return status === "resolved" || status === "closed";
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/**
 * lucide-react icon of a category. Kept as a name so this module stays free
 * of UI dependencies; the page and the admin panel map names to components.
 */
export type TicketCategoryIcon = "MessageSquareWarning" | "ClipboardList" | "ShieldAlert" | "Gavel" | "HelpCircle" | "MessageSquareText" | "Bug" | "UserCog" | "LifeBuoy";

export const TICKET_CATEGORY_COPY: Record<StoredTicketCategory, { label: Copy; hint: Copy; icon: TicketCategoryIcon }> = {
    complaint: {
        label: { TR: "Şikayet", EN: "Complaint" },
        hint: { TR: "Bir kullanıcı, içerik, grup ya da hizmetle ilgili sorun", EN: "A problem with a user, content, a group or the service" },
        icon: "MessageSquareWarning",
    },
    request: {
        label: { TR: "İstek", EN: "Request" },
        hint: { TR: "Yeni özellik ya da değişiklik isteği", EN: "A new feature or a change you'd like" },
        icon: "ClipboardList",
    },
    security: {
        label: { TR: "Güvenlik Açığı", EN: "Security vulnerability" },
        hint: { TR: "Sorumlu açıklama, yalnızca ekip görür", EN: "Responsible disclosure, team only" },
        icon: "ShieldAlert",
    },
    ban_appeal: {
        label: { TR: "Ban Kaldırma İsteği", EN: "Unban request" },
        hint: { TR: "Hesap, grup ya da başka bir yasağa itiraz", EN: "Appeal an account, group or other ban" },
        icon: "Gavel",
    },
    question: {
        label: { TR: "Soru", EN: "Question" },
        hint: { TR: "Bir özelliğin nasıl çalıştığını sorun", EN: "Ask how something works" },
        icon: "HelpCircle",
    },
    feedback: {
        label: { TR: "Geri Bildirim", EN: "Feedback" },
        hint: { TR: "Site hakkında görüş ve öneriler", EN: "Opinions and ideas about the site" },
        icon: "MessageSquareText",
    },
    bug: {
        label: { TR: "Hata bildirimi (eski)", EN: "Bug report (old)" },
        hint: { TR: "Önceki kategori; yeni talepler için kullanılmıyor", EN: "Former category; not used for new tickets" },
        icon: "Bug",
    },
    account: {
        label: { TR: "Hesap / KVKK (eski)", EN: "Account / KVKK (old)" },
        hint: { TR: "Önceki kategori; yeni talepler için kullanılmıyor", EN: "Former category; not used for new tickets" },
        icon: "UserCog",
    },
    other: {
        label: { TR: "Diğer (eski)", EN: "Other (old)" },
        hint: { TR: "Önceki kategori; yeni talepler için kullanılmıyor", EN: "Former category; not used for new tickets" },
        icon: "LifeBuoy",
    },
};

/** Shown on the "İstek" category: KVKK requests go there. */
export const KVKK_REQUEST_HINT: Copy = { TR: "KVKK başvuruları için bu kategoriyi seçin.", EN: "Choose this category for KVKK requests." };

export const COMPLAINT_SUBJECT_COPY: Record<ComplaintSubject, Copy> = {
    user: { TR: "Kullanıcı", EN: "User" },
    content: { TR: "İçerik", EN: "Content" },
    group: { TR: "Grup", EN: "Group" },
    service: { TR: "Hizmet / site", EN: "Service / site" },
    other: { TR: "Diğer", EN: "Other" },
};

export const BAN_SCOPE_COPY: Record<BanScope, { label: Copy; hint: Copy }> = {
    account: {
        label: { TR: "Hesap", EN: "Account" },
        hint: { TR: "Hesabınıza uygulanan bir yasak ya da kısıtlama", EN: "A ban or restriction on your account" },
    },
    group: {
        label: { TR: "Grup", EN: "Group" },
        hint: { TR: "Bir gruptan yasaklandınız", EN: "You were banned from a group" },
    },
    other: {
        label: { TR: "Diğer", EN: "Other" },
        hint: { TR: "Sitedeki başka bir yasak ya da kısıtlama", EN: "Another ban or restriction on the site" },
    },
};

export const TICKET_STATUS_COPY: Record<TicketStatus, { label: Copy; hint: Copy }> = {
    open: {
        label: { TR: "Açık", EN: "Open" },
        hint: { TR: "Ekip henüz yanıt vermedi.", EN: "The team hasn't replied yet." },
    },
    in_progress: {
        label: { TR: "İnceleniyor", EN: "In review" },
        hint: { TR: "Ekip talebinizle ilgileniyor.", EN: "The team is working on your ticket." },
    },
    answered: {
        label: { TR: "Yanıtlandı", EN: "Answered" },
        hint: { TR: "Ekip yanıt verdi. Ek sorunuz varsa yazabilirsiniz.", EN: "The team replied. You can write back if you have more questions." },
    },
    resolved: {
        label: { TR: "Çözüldü", EN: "Resolved" },
        hint: { TR: "Talep çözüldü. Sorun sürüyorsa yeniden açabilirsiniz.", EN: "The ticket is resolved. Reopen it if the problem persists." },
    },
    closed: {
        label: { TR: "Kapatıldı", EN: "Closed" },
        hint: { TR: "Talep kapatıldı. Yazmak için yeniden açın.", EN: "The ticket is closed. Reopen it to write again." },
    },
};

export const TICKET_PRIORITY_COPY: Record<TicketPriority, Copy> = {
    low: { TR: "Düşük", EN: "Low" },
    normal: { TR: "Normal", EN: "Normal" },
    high: { TR: "Yüksek", EN: "High" },
    critical: { TR: "Kritik", EN: "Critical" },
};

export const TICKET_SEVERITY_COPY: Record<TicketSeverity, { label: Copy; hint: Copy }> = {
    low: {
        label: { TR: "Düşük", EN: "Low" },
        hint: { TR: "Sınırlı etki; veri ya da hesap erişimi yok", EN: "Limited impact; no access to data or accounts" },
    },
    medium: {
        label: { TR: "Orta", EN: "Medium" },
        hint: { TR: "Bazı kullanıcıları ya da özellikleri etkiler", EN: "Affects some users or features" },
    },
    high: {
        label: { TR: "Yüksek", EN: "High" },
        hint: { TR: "Başka hesaplara veya kişisel verilere erişim", EN: "Access to other accounts or personal data" },
    },
    critical: {
        label: { TR: "Kritik", EN: "Critical" },
        hint: { TR: "Sunucuda kod çalıştırma, tüm hesapları etkiler", EN: "Code execution on servers, affects every account" },
    },
};

export type SupportErrorCode =
    | "auth_required"
    | "bad_origin"
    | "rate_limited"
    | "invalid_body"
    | "invalid_action"
    | "invalid_id"
    | "not_found"
    | "forbidden"
    | "invalid_category"
    | "title_required"
    | "title_too_short"
    | "title_too_long"
    | "description_required"
    | "description_too_short"
    | "description_too_long"
    | "invalid_severity"
    | "invalid_complaint_subject"
    | "reported_user_too_long"
    | "invalid_content_url"
    | "invalid_ban_scope"
    | "ban_reference_required"
    | "ban_reference_too_long"
    | "message_required"
    | "message_too_long"
    | "ticket_closed"
    | "already_closed"
    | "not_reopenable"
    | "thread_full"
    | "conflict"
    | "unavailable"
    // Public feedback board
    | "content_required"
    | "content_too_long"
    | "comment_required"
    | "comment_too_long"
    | "comment_not_found"
    | "too_many_comments"
    | "profanity"
    | "personal_data"
    | "links"
    | "spam";

/** Translated messages for the `code` of /api/support and /api/feedback errors. */
export const SUPPORT_ERROR_COPY: Record<SupportErrorCode | "network" | "unknown", Copy> = {
    auth_required: { TR: "Bu işlem için giriş yapın.", EN: "Sign in to do this." },
    bad_origin: { TR: "İstek güvenlik denetiminden geçemedi. Sayfayı yenileyip tekrar deneyin.", EN: "The request failed a security check. Reload the page and try again." },
    rate_limited: { TR: "Çok fazla istek gönderildi. Biraz bekleyip tekrar deneyin.", EN: "Too many requests. Wait a moment and try again." },
    invalid_body: { TR: "İstek okunamadı. Sayfayı yenileyip tekrar deneyin.", EN: "The request couldn't be read. Reload the page and try again." },
    invalid_action: { TR: "Geçersiz işlem.", EN: "Invalid action." },
    invalid_id: { TR: "Kayıt bulunamadı.", EN: "The record wasn't found." },
    not_found: { TR: "Kayıt bulunamadı ya da silinmiş.", EN: "The record wasn't found or was deleted." },
    forbidden: { TR: "Bu işlem için yetkiniz yok.", EN: "You aren't allowed to do this." },
    invalid_category: { TR: "Bir kategori seçin.", EN: "Choose a category." },
    title_required: { TR: "Bir başlık yazın.", EN: "Write a title." },
    title_too_short: { TR: "Başlık en az {min} karakter olmalı.", EN: "The title needs at least {min} characters.", vars: { min: TICKET_LIMITS.titleMin } },
    title_too_long: { TR: "Başlık en fazla {max} karakter olabilir.", EN: "The title can have at most {max} characters.", vars: { max: TICKET_LIMITS.title } },
    description_required: { TR: "Açıklama yazın.", EN: "Write a description." },
    description_too_short: { TR: "Açıklama en az {min} karakter olmalı.", EN: "The description needs at least {min} characters.", vars: { min: TICKET_LIMITS.descriptionMin } },
    description_too_long: { TR: "Açıklama en fazla {max} karakter olabilir.", EN: "The description can have at most {max} characters.", vars: { max: TICKET_LIMITS.description } },
    invalid_severity: { TR: "Geçerli bir önem derecesi seçin.", EN: "Choose a valid severity." },
    invalid_complaint_subject: { TR: "Geçerli bir şikayet konusu seçin.", EN: "Choose a valid complaint subject." },
    reported_user_too_long: { TR: "Kullanıcı adı en fazla {max} karakter olabilir.", EN: "The user name can have at most {max} characters.", vars: { max: TICKET_LIMITS.reportedUser } },
    invalid_content_url: { TR: "İçerik bağlantısı https:// ile başlayan bir adres ya da / ile başlayan bir yol olmalı.", EN: "The content link must be an address starting with https:// or a path starting with /." },
    invalid_ban_scope: { TR: "Neyden yasaklandığınızı seçin: hesap, grup ya da diğer.", EN: "Choose what you were banned from: account, group or other." },
    ban_reference_required: { TR: "Yasaklandığınız grubun adını yazın.", EN: "Write the name of the group that banned you." },
    ban_reference_too_long: { TR: "Bu alan en fazla {max} karakter olabilir.", EN: "This field can have at most {max} characters.", vars: { max: TICKET_LIMITS.banReference } },
    message_required: { TR: "Mesaj boş olamaz.", EN: "The message can't be empty." },
    message_too_long: { TR: "Mesaj en fazla {max} karakter olabilir.", EN: "The message can have at most {max} characters.", vars: { max: TICKET_LIMITS.message } },
    ticket_closed: { TR: "Talep kapatıldı. Yazmak için önce yeniden açın.", EN: "The ticket is closed. Reopen it to write again." },
    already_closed: { TR: "Talep zaten kapalı.", EN: "The ticket is already closed." },
    not_reopenable: { TR: "Yalnızca çözülen ya da kapatılan talepler yeniden açılabilir.", EN: "Only resolved or closed tickets can be reopened." },
    thread_full: { TR: "Bu konuşma mesaj sınırına ulaştı. Lütfen yeni bir talep oluşturun.", EN: "This conversation reached its message limit. Please open a new ticket." },
    conflict: { TR: "Kayıt aynı anda güncellendi. Tekrar deneyin.", EN: "The record changed at the same time. Try again." },
    unavailable: { TR: "Hizmete şu anda ulaşılamıyor. Biraz sonra tekrar deneyin.", EN: "The service is unavailable right now. Try again shortly." },
    content_required: { TR: "İçerik boş olamaz.", EN: "The content can't be empty." },
    content_too_long: { TR: "Metin izin verilen uzunluğu aşıyor.", EN: "The text is longer than allowed." },
    comment_required: { TR: "Yorum boş olamaz.", EN: "The comment can't be empty." },
    comment_too_long: { TR: "Yorum en fazla {max} karakter olabilir.", EN: "A comment can have at most {max} characters.", vars: { max: BOARD_LIMITS.comment } },
    comment_not_found: { TR: "Yorum bulunamadı ya da silinmiş.", EN: "The comment wasn't found or was deleted." },
    too_many_comments: { TR: "Bu gönderi yorum sınırına ulaştı.", EN: "This post reached its comment limit." },
    profanity: { TR: "Metin topluluk kurallarına aykırı ifadeler içeriyor.", EN: "The text contains language that breaks the community rules." },
    personal_data: { TR: "Herkese açık panoda e-posta, telefon veya kimlik numarası gibi kişisel veriler paylaşmayın. Bunlar için destek talebi oluşturun.", EN: "Don't share personal data such as e-mail addresses, phone or ID numbers on the public board. Open a support ticket for that." },
    links: { TR: "Metinde çok fazla bağlantı var.", EN: "The text contains too many links." },
    spam: { TR: "Metin spam gibi görünüyor.", EN: "The text looks like spam." },
    network: { TR: "Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.", EN: "Couldn't reach the server. Check your internet connection." },
    unknown: { TR: "Beklenmeyen bir hata oluştu.", EN: "Something unexpected went wrong." },
};

export const RATE_LIMIT_MINUTES: Copy = { TR: "Çok fazla istek gönderildi. {minutes} dakika sonra tekrar deneyin.", EN: "Too many requests. Try again in {minutes} minutes." };

// ---------------------------------------------------------------------------
// Text normalisation and validation
// ---------------------------------------------------------------------------

// C0 controls (except tab and newline), DEL, BOM and bidi overrides/isolates,
// which can disguise text. Zero-width joiners stay: emoji sequences need them.
const UNSAFE_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069\ufeff]/g;

/** NFC, unsafe characters removed, newlines unified; single-line text is collapsed to one line. */
export function sanitizeTicketText(value: string, multiline: boolean) {
    const text = value.normalize("NFC").replace(/\r\n?/g, "\n").replace(UNSAFE_TEXT, "");
    if (!multiline) return text.replace(/\s+/g, " ").trim();
    return text
        .replace(/\t/g, "    ")
        .replace(/[ \u00a0]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export type TicketField = "category" | "title" | "description" | "severity" | "complaintSubject" | "reportedUser" | "contentUrl" | "banScope" | "banReference";
export type TicketFieldError = { field: TicketField; code: SupportErrorCode };

export type TicketDraftInput = {
    category?: unknown;
    title?: unknown;
    description?: unknown;
    severity?: unknown;
    complaintSubject?: unknown;
    reportedUser?: unknown;
    contentUrl?: unknown;
    banScope?: unknown;
    banReference?: unknown;
};

export type TicketDraft = {
    category: TicketCategory;
    title: string;
    description: string;
    /** Security reports only. */
    severity: TicketSeverity | null;
    /** Complaints only (all optional): what it's about, who, and a link to the content. */
    complaintSubject: ComplaintSubject | null;
    reportedUser: string | null;
    contentUrl: string | null;
    /** Unban requests only: what was banned (required) and the group's name or other reference. */
    banScope: BanScope | null;
    banReference: string | null;
};

/**
 * Page the report is about: an http(s) URL without credentials or a
 * site-relative path. Empty → null; anything else → undefined (invalid).
 */
export function normalizePageUrl(value: unknown): string | null | undefined {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") return undefined;
    const text = value.trim();
    if (!text) return null;
    if (text.length > TICKET_LIMITS.pageUrl || /[\s"'<>`\\]|[\u0000-\u001f\u007f]/.test(text)) return undefined;
    if (text.startsWith("/")) return text.startsWith("//") ? undefined : text;
    try {
        const url = new URL(text);
        if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || !url.hostname) return undefined;
        return text;
    } catch {
        return undefined;
    }
}

/** Browser identification attached on request ("technical details"); single line, capped. */
export function normalizeUserAgent(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const text = sanitizeTicketText(value, false).slice(0, TICKET_LIMITS.userAgent);
    return text || null;
}

/** Optional one-line text; too long or not a string records an error. */
function optionalLine(value: unknown, max: number, code: SupportErrorCode, field: TicketField, errors: TicketFieldError[]) {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") {
        errors.push({ field, code: "invalid_body" });
        return null;
    }
    const text = sanitizeTicketText(value, false);
    if (text.length > max) errors.push({ field, code });
    return text || null;
}

/** Optional enum value; "" counts as absent. */
function optionalChoice<T extends string>(value: unknown, isValid: (value: unknown) => value is T, code: SupportErrorCode, field: TicketField, errors: TicketFieldError[]): T | null {
    if (value === undefined || value === null || value === "") return null;
    if (isValid(value)) return value;
    errors.push({ field, code });
    return null;
}

/**
 * Validates and normalises a new ticket. Only the six current categories are
 * accepted. Fields that don't belong to the category (severity, complaint or
 * ban details) are dropped instead of rejected, so a form that kept them
 * after a category change still submits.
 */
export function validateTicketDraft(input: TicketDraftInput): { ok: true; draft: TicketDraft } | { ok: false; errors: TicketFieldError[] } {
    const errors: TicketFieldError[] = [];
    const category = isTicketCategory(input.category) ? input.category : null;
    if (!category) errors.push({ field: "category", code: "invalid_category" });

    const title = typeof input.title === "string" ? sanitizeTicketText(input.title, false) : "";
    if (input.title !== undefined && input.title !== null && typeof input.title !== "string") errors.push({ field: "title", code: "invalid_body" });
    else if (!title) errors.push({ field: "title", code: "title_required" });
    else if (title.length < TICKET_LIMITS.titleMin) errors.push({ field: "title", code: "title_too_short" });
    else if (title.length > TICKET_LIMITS.title) errors.push({ field: "title", code: "title_too_long" });

    const description = typeof input.description === "string" ? sanitizeTicketText(input.description, true) : "";
    if (input.description !== undefined && input.description !== null && typeof input.description !== "string") errors.push({ field: "description", code: "invalid_body" });
    else if (!description) errors.push({ field: "description", code: "description_required" });
    else if (description.length < TICKET_LIMITS.descriptionMin) errors.push({ field: "description", code: "description_too_short" });
    else if (description.length > TICKET_LIMITS.description) errors.push({ field: "description", code: "description_too_long" });

    const draft: Omit<TicketDraft, "category" | "title" | "description"> = {
        severity: null, complaintSubject: null, reportedUser: null, contentUrl: null, banScope: null, banReference: null,
    };
    if (category === "security") {
        draft.severity = optionalChoice(input.severity, isTicketSeverity, "invalid_severity", "severity", errors);
    } else if (category === "complaint") {
        draft.complaintSubject = optionalChoice(input.complaintSubject, isComplaintSubject, "invalid_complaint_subject", "complaintSubject", errors);
        draft.reportedUser = optionalLine(input.reportedUser, TICKET_LIMITS.reportedUser, "reported_user_too_long", "reportedUser", errors);
        const link = normalizePageUrl(input.contentUrl);
        if (link === undefined) errors.push({ field: "contentUrl", code: "invalid_content_url" });
        else draft.contentUrl = link;
    } else if (category === "ban_appeal") {
        draft.banScope = isBanScope(input.banScope) ? input.banScope : null;
        if (!draft.banScope) errors.push({ field: "banScope", code: "invalid_ban_scope" });
        // The account itself needs no reference; for a group its name is required.
        if (draft.banScope !== "account") {
            draft.banReference = optionalLine(input.banReference, TICKET_LIMITS.banReference, "ban_reference_too_long", "banReference", errors);
            if (draft.banScope === "group" && !draft.banReference && !errors.some((error) => error.field === "banReference")) {
                errors.push({ field: "banReference", code: "ban_reference_required" });
            }
        }
    }

    if (errors.length || !category) return { ok: false, errors };
    return { ok: true, draft: { category, title, description, ...draft } };
}

/** A staff reply or a follow-up message. */
export function validateTicketMessage(value: unknown): { ok: true; text: string } | { ok: false; code: SupportErrorCode } {
    if (value !== undefined && value !== null && typeof value !== "string") return { ok: false, code: "invalid_body" };
    const text = typeof value === "string" ? sanitizeTicketText(value, true) : "";
    if (!text) return { ok: false, code: "message_required" };
    if (text.length > TICKET_LIMITS.message) return { ok: false, code: "message_too_long" };
    return { ok: true, text };
}

/** One-line excerpt stored for list views. */
export function messagePreview(text: string) {
    const line = text.replace(/\s+/g, " ").trim();
    return line.length > TICKET_LIMITS.preview ? `${line.slice(0, TICKET_LIMITS.preview - 1)}…` : line;
}

// ---------------------------------------------------------------------------
// Search (Turkish-insensitive)
// ---------------------------------------------------------------------------

const TURKISH_FOLD: Record<string, string> = { ı: "i", İ: "i", ş: "s", Ş: "s", ğ: "g", Ğ: "g", ü: "u", Ü: "u", ö: "o", Ö: "o", ç: "c", Ç: "c" };

/**
 * Lower-case text without diacritics where ı/I/İ/i, ş/s, ğ/g, ü/u, ö/o and
 * ç/c match each other, so "güvenlik", "GUVENLIK" and "Güvenlİk" are equal.
 */
export function foldSearchText(value: string) {
    return value
        .replace(/[ıİşŞğĞüÜöÖçÇ]/g, (char) => TURKISH_FOLD[char] ?? char)
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

/** Every word of `query` occurs somewhere in `haystack` (folded); an empty query matches everything. */
export function matchesSearch(haystack: string, query: string) {
    const words = foldSearchText(query).split(" ").filter(Boolean);
    if (!words.length) return true;
    const text = foldSearchText(haystack);
    return words.every((word) => text.includes(word));
}

// ---------------------------------------------------------------------------
// API shapes (user side)
// ---------------------------------------------------------------------------

export type SupportTicketMessage = {
    id: string;
    from: TicketMessageFrom;
    /** The author's name for user messages; always the team name for staff. */
    authorName: string;
    text: string;
    createdAt: string | null;
};

export type SupportTicketMeta = {
    /** Page from the technical details (legacy bug reports: the page of the bug). */
    pageUrl: string | null;
    userAgent: string | null;
    severity: TicketSeverity | null;
    /** Legacy bug reports only. */
    steps: string | null;
    complaintSubject: ComplaintSubject | null;
    reportedUser: string | null;
    contentUrl: string | null;
    banScope: BanScope | null;
    banReference: string | null;
    /** Appeal against a suspension, filed from the sign-in page. */
    appeal: boolean;
};

/** A ticket as its author sees it: no internal priority and no staff identities. */
export type SupportTicketSummary = {
    id: string;
    reference: string;
    /** Tickets filed before the current six categories keep their old one. */
    category: StoredTicketCategory;
    title: string;
    status: TicketStatus;
    createdAt: string | null;
    updatedAt: string | null;
    lastMessageAt: string | null;
    lastMessageFrom: TicketMessageFrom | null;
    messageCount: number;
    /** The team replied since the author last opened the ticket. */
    unread: boolean;
};

export type SupportTicketView = SupportTicketSummary & {
    description: string;
    meta: SupportTicketMeta;
    messages: SupportTicketMessage[];
};

export type SupportListResponse = { tickets: SupportTicketSummary[] };
export type SupportTicketResponse = { ticket: SupportTicketView };
export type SupportErrorBody = { error: string; code: SupportErrorCode; field?: TicketField; retryAfter?: number };

// ---------------------------------------------------------------------------
// Staff notifications (notifications/{staffEmail}/items/ticket_new_<ticketId>)
// ---------------------------------------------------------------------------

export type StaffTicketEvent = "created" | "reply";

/** Stored (Turkish) titles; NotificationCenter shows STAFF_TICKET_NOTIFICATION_COPY instead. */
export const STAFF_TICKET_NOTIFICATION_TITLES: Record<StaffTicketEvent, string> = {
    created: "Yeni destek talebi",
    reply: "Destek talebine yeni mesaj",
};

export const STAFF_TICKET_NOTIFICATION_COPY: Record<StaffTicketEvent, Copy> = {
    created: { TR: "Yeni destek talebi", EN: "New support ticket" },
    reply: { TR: "Destek talebine yeni mesaj", EN: "New message on a support ticket" },
};

/** One notification per ticket and staff member: new activity refreshes it instead of stacking up. */
export function staffTicketNotificationId(ticketId: string) {
    return `ticket_new_${ticketId}`;
}

/** The admin inbox with that ticket opened. */
export function staffTicketLink(ticketId: string) {
    return `/admin#tickets?id=${ticketId}`;
}

/** Which staff event a stored notification title stands for (unknown titles count as a new ticket). */
export function staffTicketEventOf(title: string): StaffTicketEvent {
    return title === STAFF_TICKET_NOTIFICATION_TITLES.reply ? "reply" : "created";
}

// ---------------------------------------------------------------------------
// Public feedback board (/api/feedback)
// ---------------------------------------------------------------------------

export type BoardStaffRole = "owner" | "admin" | "moderator";

/** Extra public-profile fields for the profile card (signed-in viewers, public profiles only). */
export type BoardAuthorProfile = {
    username: string;
    nickname?: string;
    nicknameTag?: string;
    avatarUrl?: string;
    bannerUrl?: string;
    bio?: string;
    customStatus?: string;
    statusEmoji?: string;
    accentColor?: string;
    favoriteLangs?: string[];
    socialGithub?: string;
    socialLinkedin?: string;
    socialTwitter?: string;
    socialWebsite?: string;
    badges?: string[];
    dndMode?: boolean;
};

/** Display data of a board author; `id` is an opaque hash, never the e-mail address. */
export type BoardAuthor = {
    id: string;
    name: string;
    avatarUrl: string | null;
    nickname: string | null;
    nicknameTag: string | null;
    staffRole: BoardStaffRole | null;
    profile: BoardAuthorProfile | null;
};

export type BoardComment = {
    id: string;
    /** null for official team replies. */
    authorId: string | null;
    official: boolean;
    content: string;
    replyTo: string | null;
    replyToAuthor: string | null;
    replyToContent: string | null;
    createdAt: string | null;
    editedAt: string | null;
    own: boolean;
};

export type BoardItem = {
    id: string;
    type: "question" | "feedback";
    content: string;
    description: string | null;
    authorId: string;
    createdAt: string | null;
    editedAt: string | null;
    likeCount: number;
    likedByMe: boolean;
    own: boolean;
    status: FeedbackStatus;
    comments: BoardComment[];
};

export type BoardResponse = {
    items: BoardItem[];
    authors: Record<string, BoardAuthor>;
    viewer: { signedIn: boolean };
};

// ---------------------------------------------------------------------------
// Sender record ("sicil") shown to staff next to a ticket
// ---------------------------------------------------------------------------

export const RECORD_LOOKBACK_DAYS = 90;
export const NEW_ACCOUNT_DAYS = 7;

export type RecordVerdict = "clean" | "notice" | "flagged";
export type RecordSeverity = "info" | "notice" | "flagged";
export type RecordReasonCode =
    | "account_missing"
    | "suspended_now"
    | "suspended_before"
    | "content_removed"
    | "posts_deleted"
    | "reports_upheld"
    | "reports_open"
    | "security_events"
    | "security_events_critical"
    | "group_bans"
    | "new_account"
    | "partial";

export type RecordReason = { code: RecordReasonCode; severity: RecordSeverity; count: number };

export type UserRecordFacts = {
    accountExists: boolean;
    accountAgeDays: number | null;
    suspendedNow: boolean;
    /** Earlier suspensions that were lifted. */
    previousSuspensions: number;
    /** Media posts or Arcade games the team removed. */
    contentRemovals: number;
    /** News comments or feedback posts the team deleted. */
    staffDeletions: number;
    /** Reports against their Media posts, by outcome. */
    reportsUpheld: number;
    reportsOpen: number;
    reportsDismissed: number;
    /** Blocked risky code runs in the last RECORD_LOOKBACK_DAYS days. */
    securityEvents: number;
    securityEventsCritical: number;
    groupBans: number;
    /** Some lookups failed, so the record may be incomplete. */
    incomplete: boolean;
};

export type UserRecordSummary = {
    verdict: RecordVerdict;
    reasons: RecordReason[];
    facts: UserRecordFacts;
    checkedAt: string;
};

const SEVERITY_RANK: Record<RecordSeverity, number> = { info: 0, notice: 1, flagged: 2 };

/**
 * Turns the counts into a verdict: "flagged" for suspensions and removed
 * content (or repeated smaller problems), "notice" for anything else worth a
 * look, "clean" otherwise. Info reasons (new account, partial data) are shown
 * but never change the verdict.
 */
export function evaluateUserRecord(facts: UserRecordFacts): { verdict: RecordVerdict; reasons: RecordReason[] } {
    const reasons: RecordReason[] = [];
    const add = (code: RecordReasonCode, severity: RecordSeverity, count = 1) => reasons.push({ code, severity, count: Math.max(0, Math.floor(count)) });
    const repeated = (count: number, threshold: number): RecordSeverity => (count >= threshold ? "flagged" : "notice");

    if (!facts.accountExists) add("account_missing", "notice");
    if (facts.suspendedNow) add("suspended_now", "flagged");
    if (facts.previousSuspensions > 0) add("suspended_before", "flagged", facts.previousSuspensions);
    if (facts.contentRemovals > 0) add("content_removed", "flagged", facts.contentRemovals);
    if (facts.reportsUpheld > 0) add("reports_upheld", repeated(facts.reportsUpheld, 3), facts.reportsUpheld);
    if (facts.staffDeletions > 0) add("posts_deleted", repeated(facts.staffDeletions, 3), facts.staffDeletions);
    if (facts.securityEvents > 0) add("security_events", repeated(facts.securityEvents, 5), facts.securityEvents);
    if (facts.securityEventsCritical > 0) add("security_events_critical", repeated(facts.securityEventsCritical, 3), facts.securityEventsCritical);
    if (facts.groupBans > 0) add("group_bans", repeated(facts.groupBans, 3), facts.groupBans);
    if (facts.reportsOpen > 0) add("reports_open", "notice", facts.reportsOpen);
    if (facts.accountExists && facts.accountAgeDays !== null && facts.accountAgeDays < NEW_ACCOUNT_DAYS) add("new_account", "info", facts.accountAgeDays);
    if (facts.incomplete) add("partial", "info");

    reasons.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
    const top = reasons.reduce((max, reason) => Math.max(max, SEVERITY_RANK[reason.severity]), 0);
    return { verdict: top >= 2 ? "flagged" : top === 1 ? "notice" : "clean", reasons };
}

/** Whole days since `createdAt` (null when unknown or in the future). */
export function accountAgeDays(createdAt: string | null | undefined, now = Date.now()) {
    const time = createdAt ? Date.parse(createdAt) : Number.NaN;
    if (!Number.isFinite(time) || time > now) return null;
    return Math.floor((now - time) / 86_400_000);
}

export const RECORD_VERDICT_COPY: Record<RecordVerdict, { label: Copy; hint: Copy }> = {
    clean: {
        label: { TR: "Sicil temiz", EN: "Clean record" },
        hint: { TR: "Askı, kaldırılan içerik veya güvenlik olayı yok.", EN: "No suspensions, removed content or security events." },
    },
    notice: {
        label: { TR: "Dikkat", EN: "Caution" },
        hint: { TR: "İncelemeye değer küçük kayıtlar var.", EN: "There are minor entries worth a look." },
    },
    flagged: {
        label: { TR: "Sicil kaydı var", EN: "Has a record" },
        hint: { TR: "Askı, kaldırılan içerik veya tekrarlanan ihlaller var.", EN: "Suspensions, removed content or repeated violations." },
    },
};

export const RECORD_REASON_COPY: Record<RecordReasonCode, Copy> = {
    account_missing: { TR: "Hesap artık mevcut değil", EN: "The account no longer exists" },
    suspended_now: { TR: "Hesap şu anda askıda", EN: "The account is suspended right now" },
    suspended_before: { TR: "Önceki askıya alma sayısı: {count}", EN: "Earlier suspensions: {count}" },
    content_removed: { TR: "Ekibin kaldırdığı içerik (Media/Arcade): {count}", EN: "Content removed by the team (Media/Arcade): {count}" },
    posts_deleted: { TR: "Ekibin sildiği yorum veya geri bildirim: {count}", EN: "Comments or feedback deleted by the team: {count}" },
    reports_upheld: { TR: "Media gönderileri için haklı bulunan bildirim: {count}", EN: "Upheld reports on their Media posts: {count}" },
    reports_open: { TR: "Media gönderileri için açık bildirim: {count}", EN: "Open reports on their Media posts: {count}" },
    security_events: { TR: "Son 90 günde güvenlik olayı (engellenen riskli kod): {count}", EN: "Security events in the last 90 days (blocked risky code): {count}" },
    security_events_critical: { TR: "Bunlardan kritik olan: {count}", EN: "Critical among them: {count}" },
    group_bans: { TR: "Yasaklandığı grup sayısı: {count}", EN: "Groups that banned them: {count}" },
    new_account: { TR: "Yeni hesap ({days} günden genç)", EN: "New account (less than {days} days old)", vars: { days: NEW_ACCOUNT_DAYS } },
    partial: { TR: "Bazı kayıtlar kontrol edilemedi; sonuç eksik olabilir", EN: "Some records couldn't be checked; the result may be incomplete" },
};
