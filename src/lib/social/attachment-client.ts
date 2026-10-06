"use client";

/**
 * Sending files in Hanogt Social messages from the browser
 * (/api/social/files): photos are made smaller first when they are big (the
 * server removes what cameras store in them either way), the upload reports
 * how far it got, and a failure carries a code the views translate.
 */
import type { Copy } from "@/lib/i18n";
import { ATTACHMENT_LIMITS, extensionOf, formatBytes, type AttachmentKind, type MessageAttachment } from "./attachments";

export type AttachmentErrorCode =
    | "attachment_empty" | "attachment_too_large" | "attachment_type" | "attachment_image" | "attachment_storage"
    | "attachment_unavailable" | "attachment_failed";

export const ATTACHMENT_ERROR_COPY: Record<AttachmentErrorCode, Copy> = {
    attachment_empty: { TR: "Dosya boş.", EN: "The file is empty." },
    attachment_too_large: { TR: "Bu dosya çok büyük: planında bir dosya en fazla {limit} olabilir.", EN: "This file is too big: your plan allows files up to {limit}." },
    attachment_type: { TR: "Bu dosya türü gönderilemez. Görsel, video, ses, PDF, arşiv, ofis belgesi ya da metin ve kod dosyası gönderebilirsin.", EN: "This kind of file can't be sent. You can send pictures, video, sound, PDFs, archives, office documents and text or code files." },
    attachment_image: { TR: "Görselin boyutları çok büyük.", EN: "The picture's dimensions are too large." },
    attachment_storage: { TR: "Gönderdiğin dosyalar için ayrılan alan doldu ({limit}). Dosyalı eski mesajlarını silerek yer açabilir ya da planını yükseltebilirsin.", EN: "The space for files you send is full ({limit}). Delete old messages with files to make room, or upgrade your plan." },
    attachment_unavailable: { TR: "Dosya bulunamadı veya silinmiş.", EN: "The file wasn't found or was deleted." },
    attachment_failed: { TR: "Dosya gönderilemedi. Lütfen tekrar dene.", EN: "The file couldn't be sent. Please try again." },
};

/** Refusals that sending the same file again can't change (the box doesn't keep the file for them). */
const FINAL_CODES = new Set(["attachment_type", "attachment_too_large", "attachment_image", "attachment_empty", "invalid_request", "muted", "not_found", "not_friend", "blocked", "forbidden"]);

/** Whether a failed file is worth keeping in the box to send again (no connection, too fast, full space…). */
export function isRetryableFileError(error: unknown) {
    const code = error instanceof FileUploadError ? error.code : "";
    return !FINAL_CODES.has(code);
}

export function isAttachmentErrorCode(value: unknown): value is AttachmentErrorCode {
    return typeof value === "string" && value in ATTACHMENT_ERROR_COPY;
}

/** A failed upload: the server's code (an attachment code, or the Social or group one) and its numbers. */
export class FileUploadError extends Error {
    readonly code: string;
    readonly status: number;
    readonly vars: Record<string, string | number>;

    constructor(code: string, status = 0, message = "", vars: Record<string, string | number> = {}) {
        super(message || code);
        this.name = "FileUploadError";
        this.code = code;
        this.status = status;
        this.vars = vars;
    }
}

/** What a picked file probably is (the server decides from its bytes); for the "sending" copy. */
export function guessKind(file: Pick<File, "type" | "name">): AttachmentKind {
    const type = file.type.toLowerCase();
    if (/^image\/(png|jpeg|gif|webp)$/.test(type)) return "image";
    if (type.startsWith("video/")) return "video";
    if (type.startsWith("audio/")) return "audio";
    if (type === "application/pdf") return "pdf";
    if (/zip|gzip|7z|officedocument|opendocument|epub/.test(type) || ["zip", "gz", "tgz", "7z"].includes(extensionOf(file.name))) return "archive";
    return "text";
}

/** The local copy shown while a file goes up (its picture from the file itself). */
export function pendingAttachment(file: File, id: string): MessageAttachment {
    const kind = guessKind(file);
    return { id, name: file.name || "dosya", size: file.size, contentType: file.type || "application/octet-stream", kind, width: null, height: null };
}

const SHRINKABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

function encode(canvas: HTMLCanvasElement, type: string, quality: number) {
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * A big photo (over 1.5 MB or 2,560 px) drawn again at most 2,560 px wide,
 * turned the right way up: JPEG for photos, WebP for pictures with
 * transparency. GIFs keep their animation and small files go as they are;
 * when drawing again doesn't make it smaller, the original goes.
 */
export async function prepareUpload(file: File): Promise<File> {
    if (!SHRINKABLE.has(file.type) || typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
        return file;
    }
    try {
        const longest = Math.max(bitmap.width, bitmap.height);
        if (file.size <= ATTACHMENT_LIMITS.imageCompressBytes && longest <= ATTACHMENT_LIMITS.imageEdge) return file;
        const scale = Math.min(1, ATTACHMENT_LIMITS.imageEdge / longest);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext("2d");
        if (!context) return file;
        const photo = file.type === "image/jpeg";
        if (photo) {
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
        }
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        let blob = await encode(canvas, photo ? "image/jpeg" : "image/webp", photo ? 0.86 : 0.9);
        // Browsers that can't write WebP hand back a PNG: a photo-like JPEG on white is the fallback.
        if (!photo && (!blob || blob.type !== "image/webp")) {
            const flat = document.createElement("canvas");
            flat.width = canvas.width;
            flat.height = canvas.height;
            const flatContext = flat.getContext("2d");
            if (flatContext) {
                flatContext.fillStyle = "#ffffff";
                flatContext.fillRect(0, 0, flat.width, flat.height);
                flatContext.drawImage(canvas, 0, 0);
                blob = await encode(flat, "image/jpeg", 0.88);
            }
        }
        if (!blob || blob.size >= file.size) return file;
        const extension = blob.type === "image/webp" ? "webp" : "jpg";
        const base = file.name.replace(/\.[A-Za-z0-9]{1,8}$/, "") || "foto";
        return new File([blob], `${base}.${extension}`, { type: blob.type, lastModified: file.lastModified });
    } finally {
        bitmap.close();
    }
}

export type FileTarget = { with: string } | { group: string };

function failure(status: number, data: Record<string, unknown>) {
    const code = typeof data.code === "string" && /^[a-z_]{2,40}$/.test(data.code)
        ? data.code
        : status === 413 ? "attachment_too_large" : status === 415 ? "attachment_type" : status === 429 ? "rate_limited" : status === 401 ? "unauthorized" : "attachment_failed";
    const vars: Record<string, string | number> = {};
    // Sizes come in bytes; the message shows them for people.
    if (typeof data.limit === "number") vars.limit = code.startsWith("attachment_") ? formatBytes(data.limit) : data.limit;
    for (const key of ["minutes", "seconds", "rule", "plan"] as const) {
        const value = data[key];
        if (typeof value === "number" || typeof value === "string") vars[key] = value;
    }
    return new FileUploadError(code, status, typeof data.error === "string" ? data.error : "", vars);
}

/**
 * Sends one file (and its caption) as a message; `onProgress` hears how much
 * has gone up (0–1). Resolves with the message as the server stored it.
 */
export function uploadMessageFile(
    target: FileTarget,
    file: File,
    options: { caption: string; replyTo: string | null; language: "TR" | "EN" },
    onProgress?: (fraction: number) => void,
): Promise<Record<string, unknown>> {
    if (!file.size) return Promise.reject(new FileUploadError("attachment_empty"));
    if (file.size > ATTACHMENT_LIMITS.maxBytes) return Promise.reject(new FileUploadError("attachment_too_large", 413, "", { limit: formatBytes(ATTACHMENT_LIMITS.maxBytes) }));
    return new Promise((resolve, reject) => {
        const form = new FormData();
        form.append("file", file, file.name || "dosya");
        if ("with" in target) form.append("with", target.with);
        else form.append("group", target.group);
        if (options.caption) form.append("text", options.caption.slice(0, ATTACHMENT_LIMITS.captionMax));
        if (options.replyTo) form.append("replyTo", options.replyTo);
        form.append("language", options.language);
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/social/files");
        xhr.responseType = "json";
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && event.total > 0) onProgress?.(Math.min(1, event.loaded / event.total));
        };
        xhr.onload = () => {
            const data = xhr.response && typeof xhr.response === "object" ? xhr.response as Record<string, unknown> : {};
            if (xhr.status >= 200 && xhr.status < 300 && data.message && typeof data.message === "object") {
                resolve(data.message as Record<string, unknown>);
                return;
            }
            reject(failure(xhr.status, data));
        };
        xhr.onerror = () => reject(new FileUploadError("network"));
        xhr.onabort = () => reject(new FileUploadError("network"));
        xhr.send(form);
    });
}
