/**
 * Browser client for /api/media used by the editor's publish dialog and the
 * Media page. The API answers errors with a Turkish message and a stable
 * `code`; {@link mediaErrorText} turns the code into the visitor's language.
 */
import type { Copy } from "@/lib/i18n";
import type { MediaLicense } from "@/components/Editor/media-publish";

export type MediaFindingDetail = { id: string; severity: string; message: string; line: number | null };

export class MediaApiError extends Error {
    readonly code: string;
    readonly status: number;
    /** Guard findings of a blocked publication, as Turkish text ("… (satır 3)"). */
    readonly findings: string[];
    /** The same findings with lines of the scanned text (see mediaScanText). */
    readonly details: MediaFindingDetail[];
    /** The file that broke a limit. */
    readonly file: string | null;
    /** Why a comment was refused ("profanity", "personal-data", "links", "spam", "too-long", "empty"). */
    readonly reason: string | null;
    /** The tag that doesn't fit the tag rules. */
    readonly tag: string | null;

    constructor(code: string, status: number, message = "", extra: { findings?: string[]; details?: MediaFindingDetail[]; file?: string | null; reason?: string | null; tag?: string | null } = {}) {
        super(message || code);
        this.name = "MediaApiError";
        this.code = code;
        this.status = status;
        this.findings = extra.findings ?? [];
        this.details = extra.details ?? [];
        this.file = extra.file ?? null;
        this.reason = extra.reason ?? null;
        this.tag = extra.tag ?? null;
    }
}

export const MEDIA_ERRORS: Record<string, Copy> = {
    unauthenticated: { TR: "Bu işlem için giriş yapmanız gerekiyor.", EN: "You need to sign in to do this." },
    invalid_origin: { TR: "İstek reddedildi. Sayfayı yenileyip tekrar deneyin.", EN: "The request was rejected. Reload the page and try again." },
    rate_limited: { TR: "Kısa sürede çok fazla işlem yapıldı. Biraz sonra tekrar deneyin.", EN: "Too many actions in a short time. Please try again in a moment." },
    invalid_request: { TR: "İstek okunamadı.", EN: "The request couldn't be read." },
    payload_too_large: { TR: "Gönderilen veri çok büyük.", EN: "The upload is too large." },
    title_required: { TR: "Başlık gereklidir.", EN: "A title is required." },
    invalid_files: { TR: "Dosyalar okunamadı.", EN: "The files couldn't be read." },
    no_files: { TR: "Yayınlamak için en az bir dosya seçin.", EN: "Select at least one file to publish." },
    too_many_files: { TR: "Bir yayında en fazla 50 dosya olabilir.", EN: "A post can contain at most 50 files." },
    file_too_large: { TR: "{name} dosyası 500.000 karakter sınırını aşıyor.", EN: "{name} is over the 500,000-character limit." },
    total_too_large: { TR: "Yayın, toplam 1.000.000 karakter sınırını aşıyor.", EN: "The post is over the 1,000,000-character total limit." },
    blocked: { TR: "Kod, herkese açık paylaşım için güvenlik incelemesine takıldı.", EN: "The code didn't pass the security review for public sharing." },
    not_found: { TR: "Yayın bulunamadı; kaldırılmış olabilir.", EN: "The post wasn't found; it may have been removed." },
    invalid_id: { TR: "Yayın bulunamadı; kaldırılmış olabilir.", EN: "The post wasn't found; it may have been removed." },
    forbidden: { TR: "Bu yayını yalnızca sahibi değiştirebilir.", EN: "Only the owner can change this post." },
    conflict: { TR: "İşlem başka bir güncellemeyle çakıştı. Tekrar deneyin.", EN: "The action clashed with another update. Please try again." },
    nothing_to_update: { TR: "Güncellenecek bir değişiklik yok.", EN: "There's nothing to update." },
    unavailable: { TR: "Hanogt Media şu anda yanıt vermiyor. Biraz sonra tekrar deneyin.", EN: "Hanogt Media isn't responding right now. Please try again later." },
    too_many_tags: { TR: "Bir yayında en fazla 5 etiket olabilir.", EN: "A post can have at most 5 tags." },
    invalid_tag: { TR: "“{tag}” etiketi kullanılamaz. Küçük harf, rakam ve kısa çizgi kullanın (en fazla 24 karakter).", EN: "The tag “{tag}” can't be used. Use lowercase letters, digits and hyphens (up to 24 characters)." },
    invalid_filter: { TR: "Bu filtre kullanılamıyor.", EN: "This filter can't be used." },
    invalid_cursor: { TR: "Liste yenilendi; devamını görmek için sayfayı yenileyin.", EN: "The list has changed; reload the page to see more." },
    empty_comment: { TR: "Yorum çok kısa.", EN: "The comment is too short." },
    comment_rejected: { TR: "Yorum topluluk kurallarına uymuyor.", EN: "The comment doesn't follow the community rules." },
    comment_limit: { TR: "Bu yayın yorum sınırına ulaştı.", EN: "This post has reached its comment limit." },
    comment_not_found: { TR: "Yorum bulunamadı; silinmiş olabilir.", EN: "The comment wasn't found; it may have been deleted." },
    comment_forbidden: { TR: "Bu yorumu yalnızca yazarı veya yayının sahibi silebilir.", EN: "Only the comment's author or the post's owner can delete it." },
    empty_report: { TR: "Bildirim için kısa bir açıklama yazın.", EN: "Write a short description for the report." },
    network: { TR: "Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.", EN: "Couldn't reach the server. Check your connection and try again." },
    failed: { TR: "Media işlemi tamamlanamadı.", EN: "The Media action couldn't be completed." },
};

/** Why the moderation check refused a comment, in the visitor's language. */
export const COMMENT_REJECTIONS: Record<string, Copy> = {
    empty: { TR: "Yorum çok kısa.", EN: "The comment is too short." },
    "too-long": { TR: "Yorum en fazla 500 karakter olabilir.", EN: "A comment can be at most 500 characters." },
    links: { TR: "Bir yorumda en fazla 2 bağlantı olabilir.", EN: "A comment can contain at most 2 links." },
    profanity: { TR: "Yorum, topluluk kurallarına aykırı ifadeler içeriyor.", EN: "The comment contains language that breaks the community rules." },
    "personal-data": { TR: "Güvenliğin için yorumlarda e-posta, telefon, kimlik veya kart numarası paylaşma.", EN: "For your safety, don't share e-mail addresses, phone, ID or card numbers in comments." },
    spam: { TR: "Yorum spam gibi görünüyor.", EN: "The comment looks like spam." },
};

/** The visitor-language message of an error thrown by {@link mediaAction} or {@link fetchMediaViewer}. */
export function mediaErrorText(error: unknown, tx: (copy: Copy, vars?: Record<string, string | number>) => string, fallback: Copy = MEDIA_ERRORS.failed): string {
    if (!(error instanceof MediaApiError)) return tx(fallback);
    if (error.code === "comment_rejected" && error.reason && COMMENT_REJECTIONS[error.reason]) return tx(COMMENT_REJECTIONS[error.reason]);
    const copy = MEDIA_ERRORS[error.code];
    return copy ? tx(copy, { name: error.file ?? "", tag: error.tag ?? "" }) : tx(fallback);
}

async function readResponse<T>(response: Response): Promise<T> {
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
        throw new MediaApiError(typeof data.code === "string" ? data.code : "failed", response.status, typeof data.error === "string" ? data.error : "", {
            findings: Array.isArray(data.findings) ? data.findings.filter((item): item is string => typeof item === "string") : [],
            details: Array.isArray(data.details) ? data.details.filter((item): item is MediaFindingDetail => Boolean(item) && typeof item === "object") : [],
            file: typeof data.file === "string" ? data.file : null,
            reason: typeof data.reason === "string" ? data.reason : null,
            tag: typeof data.tag === "string" ? data.tag : null,
        });
    }
    return data as T;
}

/** POST /api/media with an action body; throws {@link MediaApiError}. */
export async function mediaAction<T = { success: boolean }>(body: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
        response = await fetch("/api/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch {
        throw new MediaApiError("network", 0);
    }
    return readResponse<T>(response);
}

export interface MediaPostSummary {
    id: string;
    title: string;
    description: string;
    tags: string[];
    license: MediaLicense | string;
    showAuthor: boolean;
    owned: boolean;
    fileCount: number;
    updatedAt?: string;
}

export interface MediaViewerInfo {
    viewer: { signedIn: boolean; securityResearchConsent: boolean };
    /** The requested post, or null when it no longer exists. */
    post: MediaPostSummary | null;
}

/** The viewer's research consent and, optionally, one post's details (no files). */
export async function fetchMediaViewer(postId?: string | null, signal?: AbortSignal): Promise<MediaViewerInfo> {
    const query = new URLSearchParams({ scope: "viewer" });
    if (postId) query.set("postId", postId);
    let response: Response;
    try {
        response = await fetch(`/api/media?${query.toString()}`, { cache: "no-store", signal });
    } catch (error) {
        if (signal?.aborted) throw error;
        throw new MediaApiError("network", 0);
    }
    const data = await readResponse<Partial<MediaViewerInfo>>(response);
    return {
        viewer: { signedIn: Boolean(data.viewer?.signedIn), securityResearchConsent: Boolean(data.viewer?.securityResearchConsent) },
        post: data.post ?? null,
    };
}
