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

/** Topics a new ticket can be filed under, in the order the form shows them. */
export const TICKET_CATEGORIES = ["complaint", "request", "security", "ban_appeal", "question", "feedback"] as const;
/** Topics of tickets filed before the six-topic form; still shown and filterable, never offered for new tickets. */
export const LEGACY_TICKET_CATEGORIES = ["bug", "account", "other"] as const;
/** Every topic the admin inbox can filter by. */
export const ALL_TICKET_CATEGORIES = [...TICKET_CATEGORIES, ...LEGACY_TICKET_CATEGORIES] as const;
export type NewTicketCategory = (typeof TICKET_CATEGORIES)[number];
export type TicketCategory = (typeof ALL_TICKET_CATEGORIES)[number];

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
    steps: 2_000,
    pageUrl: 500,
    userAgent: 400,
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

/** Any stored topic, including the legacy ones. */
export function isTicketCategory(value: unknown): value is TicketCategory {
    return typeof value === "string" && (ALL_TICKET_CATEGORIES as readonly string[]).includes(value);
}

/** A topic a new ticket may use. */
export function isNewTicketCategory(value: unknown): value is NewTicketCategory {
    return typeof value === "string" && (TICKET_CATEGORIES as readonly string[]).includes(value);
}

/** Complaints carry the reproduction details the old bug reports had. */
export function ticketHasReportDetails(category: TicketCategory | null) {
    return category === "complaint" || category === "bug";
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

/** Security reports start high (critical when the reporter says so), ban appeals high, everything else normal. */
export function defaultTicketPriority(category: TicketCategory, severity: TicketSeverity | null = null): TicketPriority {
    if (category === "ban_appeal") return "high";
    if (category !== "security") return "normal";
    return severity === "critical" ? "critical" : "high";
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

export const TICKET_CATEGORY_COPY: Record<TicketCategory, { label: Copy; hint: Copy }> = {
    complaint: {
        label: { TR: "Şikayet", EN: "Complaint" },
        hint: { TR: "Bir hata, kullanıcı ya da içerik hakkında", EN: "About a bug, a user or some content" },
    },
    request: {
        label: { TR: "İstek", EN: "Request" },
        hint: { TR: "Özellik isteği, hesap ve KVKK başvuruları", EN: "Feature requests, account and privacy (KVKK) requests" },
    },
    security: {
        label: { TR: "Güvenlik açığı", EN: "Security vulnerability" },
        hint: { TR: "Sorumlu açıklama, yalnızca ekip görür", EN: "Responsible disclosure, team only" },
    },
    ban_appeal: {
        label: { TR: "Ban kaldırma isteği", EN: "Ban appeal" },
        hint: { TR: "Askıya alma veya kısıtlamaya itiraz", EN: "Appeal a suspension or a restriction" },
    },
    question: {
        label: { TR: "Soru", EN: "Question" },
        hint: { TR: "Bir özelliğin nasıl çalıştığını sorun", EN: "Ask how something works" },
    },
    feedback: {
        label: { TR: "Geri bildirim", EN: "Feedback" },
        hint: { TR: "Site hakkında görüş ve öneriler", EN: "Opinions and ideas about the site" },
    },
    bug: {
        label: { TR: "Hata bildirimi", EN: "Bug report" },
        hint: { TR: "Bir şey beklendiği gibi çalışmıyor", EN: "Something doesn't work as expected" },
    },
    account: {
        label: { TR: "Hesap / KVKK", EN: "Account / KVKK" },
        hint: { TR: "Hesap erişimi, veri ve KVKK başvuruları", EN: "Account access, data and privacy (KVKK) requests" },
    },
    other: {
        label: { TR: "Diğer", EN: "Other" },
        hint: { TR: "Başka bir konu", EN: "Anything else" },
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
    | "steps_too_long"
    | "invalid_page_url"
    | "invalid_severity"
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
    steps_too_long: { TR: "Adımlar en fazla {max} karakter olabilir.", EN: "The steps can have at most {max} characters.", vars: { max: TICKET_LIMITS.steps } },
    invalid_page_url: { TR: "Sayfa adresi https:// ile başlayan bir bağlantı ya da / ile başlayan bir yol olmalı.", EN: "The page must be a link starting with https:// or a path starting with /." },
    invalid_severity: { TR: "Geçerli bir önem derecesi seçin.", EN: "Choose a valid severity." },
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
const UNSAFE_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩﻿]/g;

/** NFC, unsafe characters removed, newlines unified; single-line text is collapsed to one line. */
export function sanitizeTicketText(value: string, multiline: boolean) {
    const text = value.normalize("NFC").replace(/\r\n?/g, "\n").replace(UNSAFE_TEXT, "");
    if (!multiline) return text.replace(/\s+/g, " ").trim();
    return text
        .replace(/\t/g, "    ")
        .replace(/[  ]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export type TicketField = "category" | "title" | "description" | "steps" | "pageUrl" | "severity";
export type TicketFieldError = { field: TicketField; code: SupportErrorCode };

export type TicketDraftInput = {
    category?: unknown;
    title?: unknown;
    description?: unknown;
    steps?: unknown;
    pageUrl?: unknown;
    severity?: unknown;
};

export type TicketDraft = {
    category: NewTicketCategory;
    title: string;
    description: string;
    /** Bug reports only. */
    steps: string | null;
    /** Bug reports only (the page where it happens). */
    pageUrl: string | null;
    /** Security reports only. */
    severity: TicketSeverity | null;
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

function optionalText(value: unknown, max: number, code: SupportErrorCode, field: TicketField, errors: TicketFieldError[]) {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") {
        errors.push({ field, code: "invalid_body" });
        return null;
    }
    const text = sanitizeTicketText(value, true);
    if (text.length > max) errors.push({ field, code });
    return text || null;
}

/**
 * Validates and normalises a new ticket. Fields that don't belong to the
 * category (steps, page or severity) are dropped instead of rejected, so a
 * form that kept them after a category change still submits.
 */
export function validateTicketDraft(input: TicketDraftInput): { ok: true; draft: TicketDraft } | { ok: false; errors: TicketFieldError[] } {
    const errors: TicketFieldError[] = [];
    const category = isNewTicketCategory(input.category) ? input.category : null;
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

    let steps: string | null = null;
    let pageUrl: string | null = null;
    let severity: TicketSeverity | null = null;
    if (ticketHasReportDetails(category)) {
        steps = optionalText(input.steps, TICKET_LIMITS.steps, "steps_too_long", "steps", errors);
        const page = normalizePageUrl(input.pageUrl);
        if (page === undefined) errors.push({ field: "pageUrl", code: "invalid_page_url" });
        else pageUrl = page;
    }
    if (category === "security" && input.severity !== undefined && input.severity !== null && input.severity !== "") {
        if (isTicketSeverity(input.severity)) severity = input.severity;
        else errors.push({ field: "severity", code: "invalid_severity" });
    }

    if (errors.length || !category) return { ok: false, errors };
    return { ok: true, draft: { category, title, description, steps, pageUrl, severity } };
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
        .replace(/[̀-ͯ]/g, "")
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
    pageUrl: string | null;
    userAgent: string | null;
    severity: TicketSeverity | null;
    steps: string | null;
};

/** A ticket as its author sees it: no internal priority and no staff identities. */
export type SupportTicketSummary = {
    id: string;
    reference: string;
    category: TicketCategory;
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
