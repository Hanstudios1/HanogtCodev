/**
 * File attachments of Hanogt Social messages (direct messages and group
 * chats) — shared, framework-free pieces: what a file is from its first
 * bytes, a safe file name, an image's size, removing what photos carry
 * besides the picture (location and camera details), the attachment as a
 * message stores it, and sizes for people.
 *
 * One message carries one file with an optional caption, like WhatsApp:
 * files picked together go as one message each. The bytes live in Firestore
 * (message_files, split into parts like voice messages) and
 * /api/social/files serves them after the same access check as the message.
 * Imported by the API routes, the browser and the plain-Node tests: no
 * React, Firebase or Node imports here.
 */

export type AttachmentKind = "image" | "video" | "audio" | "pdf" | "archive" | "text";
export const ATTACHMENT_KINDS: readonly AttachmentKind[] = ["image", "video", "audio", "pdf", "archive", "text"];

/** The file as its message stores it (`file` on a message of type "file"). */
export type MessageAttachment = {
    /** message_files/{id} */
    id: string;
    name: string;
    size: number;
    contentType: string;
    kind: AttachmentKind;
    /** Images: their size in pixels (the chat keeps their place while they load). */
    width: number | null;
    height: number | null;
};

export const ATTACHMENT_LIMITS = {
    /** The most any plan allows for one file: a request has to stay under the hosting's 4.5 MB. */
    maxBytes: 4 * 1024 * 1024,
    nameMax: 120,
    captionMax: 2_000,
    /** Files picked at once (each goes as its own message). */
    pickMax: 10,
    /** Photos are scaled down in the browser to this edge before sending… */
    imageEdge: 2_560,
    /** …when they are bigger than this or their edge is longer. */
    imageCompressBytes: 1_500_000,
    /** A small file must not unpack into a giant picture. */
    imagePixels: 40_000_000,
    imageEdgeMax: 16_384,
} as const;

export type SniffedFile = { kind: AttachmentKind; contentType: string; extension: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isFileId(value: unknown): value is string {
    return typeof value === "string" && UUID.test(value);
}

/**
 * Programs and scripts that run when opened (on Windows mostly): never
 * accepted, whatever they contain. Code files (.js, .py, .sh…) are fine on a
 * coding site; they are always served as downloads.
 */
const BLOCKED_EXTENSIONS = new Set([
    "exe", "dll", "com", "cpl", "msi", "msp", "mst", "scr", "pif", "hta", "bat", "cmd", "vbs", "vbe", "jse", "wsf", "wsh", "ws",
    "ps1", "psm1", "psd1", "reg", "lnk", "inf", "gadget", "application", "appref-ms", "msc", "sys", "drv", "ocx",
    "jar", "apk", "aab", "ipa", "appx", "appxbundle", "msix", "msixbundle", "xap", "dmg", "pkg", "mpkg", "app", "command", "deb", "rpm",
    "xpi", "crx", "vsix", "iso", "img", "vhd", "vhdx",
]);

/** The lowercase extension of a file name ("" without one). */
export function extensionOf(name: string) {
    const match = /\.([A-Za-z0-9]{1,12})$/.exec(name.trim());
    return match ? match[1].toLowerCase() : "";
}

/**
 * A file name that is safe to show and to download with: no folders,
 * control or invisible characters, at most `nameMax` characters with the
 * extension kept; "dosya" when nothing is left.
 */
export function cleanFileName(value: unknown, fallback = "dosya") {
    let name = typeof value === "string" ? value : "";
    name = name.split(/[\\/]/).pop() ?? "";
    // Control characters and the direction and zero-width marks that can disguise an extension.
    name = name.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g, "").replace(/\s+/g, " ").trim();
    name = name.replace(/^\.+/, "").replace(/[<>:"|?*]/g, "_");
    if (!name) return fallback;
    if (name.length <= ATTACHMENT_LIMITS.nameMax) return name;
    const extension = extensionOf(name);
    const keep = extension ? ATTACHMENT_LIMITS.nameMax - extension.length - 1 : ATTACHMENT_LIMITS.nameMax;
    return extension ? `${name.slice(0, keep).trimEnd()}.${extension}` : name.slice(0, keep).trimEnd();
}

/** The name with the extension the contents call for (a PNG called "x.pdf" becomes "x.png"). */
export function nameForType(name: string, sniffed: SniffedFile) {
    if (sniffed.kind === "text") return name;
    const extension = extensionOf(name);
    const fits = extension === sniffed.extension
        || (sniffed.extension === "jpg" && extension === "jpeg")
        || (sniffed.extension === "ogg" && (extension === "oga" || extension === "opus"))
        || (sniffed.extension === "gz" && extension === "tgz");
    if (fits) return name;
    const base = extension ? name.slice(0, -(extension.length + 1)) : name;
    return cleanFileName(`${base || "dosya"}.${sniffed.extension}`);
}

const ascii = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));

const OFFICE: Record<string, string> = {
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    odt: "application/vnd.oasis.opendocument.text",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    odp: "application/vnd.oasis.opendocument.presentation",
    epub: "application/epub+zip",
};

function isUtf8Text(bytes: Uint8Array) {
    if (bytes.includes(0)) return false;
    try {
        new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        return true;
    } catch {
        return false;
    }
}

/**
 * What a file is from its first bytes (never from its name or the browser's
 * guess): pictures, video and sound the chat can play, PDFs, archives and
 * office documents, and plain text such as code. Programs, disk images and
 * anything else are refused (null).
 */
export function sniffFile(bytes: Uint8Array, name: string): SniffedFile | null {
    const extension = extensionOf(name);
    if (BLOCKED_EXTENSIONS.has(extension) || bytes.length === 0) return null;
    const b = bytes;
    // Linux programs, whatever their name (Windows and macOS ones fail the text check below).
    if (b.length >= 4 && b[0] === 0x7f && ascii(b, 1, 3) === "ELF") return null;
    if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG" && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return { kind: "image", contentType: "image/png", extension: "png" };
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { kind: "image", contentType: "image/jpeg", extension: "jpg" };
    if (b.length >= 6 && (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a")) return { kind: "image", contentType: "image/gif", extension: "gif" };
    if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return { kind: "image", contentType: "image/webp", extension: "webp" };
    if (b.length >= 5 && ascii(b, 0, 5) === "%PDF-") return { kind: "pdf", contentType: "application/pdf", extension: "pdf" };
    if (b.length >= 12 && ascii(b, 4, 4) === "ftyp") {
        const brand = ascii(b, 8, 4);
        if (brand === "M4A " || brand === "M4B ") return { kind: "audio", contentType: "audio/mp4", extension: "m4a" };
        if (brand === "qt  ") return { kind: "video", contentType: "video/quicktime", extension: "mov" };
        return { kind: "video", contentType: "video/mp4", extension: "mp4" };
    }
    if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
        return extension === "weba" ? { kind: "audio", contentType: "audio/webm", extension: "weba" } : { kind: "video", contentType: "video/webm", extension: "webm" };
    }
    if (b.length >= 4 && ascii(b, 0, 4) === "OggS") return { kind: "audio", contentType: "audio/ogg", extension: "ogg" };
    if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WAVE") return { kind: "audio", contentType: "audio/wav", extension: "wav" };
    if (b.length >= 4 && ascii(b, 0, 4) === "fLaC") return { kind: "audio", contentType: "audio/flac", extension: "flac" };
    // MP3: an ID3 tag, or (named .mp3) a bare frame header.
    if (b.length >= 3 && (ascii(b, 0, 3) === "ID3" || (extension === "mp3" && b[0] === 0xff && (b[1] & 0xe0) === 0xe0))) return { kind: "audio", contentType: "audio/mpeg", extension: "mp3" };
    if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && ((b[2] === 0x03 && b[3] === 0x04) || (b[2] === 0x05 && b[3] === 0x06))) {
        const office = OFFICE[extension];
        return office ? { kind: "archive", contentType: office, extension } : { kind: "archive", contentType: "application/zip", extension: "zip" };
    }
    if (b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b) return { kind: "archive", contentType: "application/gzip", extension: "gz" };
    if (b.length >= 6 && b[0] === 0x37 && b[1] === 0x7a && b[2] === 0xbc && b[3] === 0xaf && b[4] === 0x27 && b[5] === 0x1c) return { kind: "archive", contentType: "application/x-7z-compressed", extension: "7z" };
    if (isUtf8Text(bytes)) return { kind: "text", contentType: "text/plain; charset=utf-8", extension: extension || "txt" };
    return null;
}

const u16be = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1];
const u32be = (b: Uint8Array, at: number) => ((b[at] << 24) >>> 0) + (b[at + 1] << 16) + (b[at + 2] << 8) + b[at + 3];
const u16le = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u24le = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);

/** An image's size in pixels from its header (PNG, JPEG, GIF, WebP); null when it can't be read. */
export function imageSize(bytes: Uint8Array, contentType: string): { width: number; height: number } | null {
    const b = bytes;
    let width = 0;
    let height = 0;
    if (contentType === "image/png" && b.length >= 24 && ascii(b, 12, 4) === "IHDR") {
        width = u32be(b, 16);
        height = u32be(b, 20);
    } else if (contentType === "image/gif" && b.length >= 10) {
        width = u16le(b, 6);
        height = u16le(b, 8);
    } else if (contentType === "image/webp" && b.length >= 30) {
        const chunk = ascii(b, 12, 4);
        if (chunk === "VP8 ") {
            width = u16le(b, 26) & 0x3fff;
            height = u16le(b, 28) & 0x3fff;
        } else if (chunk === "VP8L") {
            width = 1 + (((b[22] & 0x3f) << 8) | b[21]);
            height = 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6));
        } else if (chunk === "VP8X") {
            width = 1 + u24le(b, 24);
            height = 1 + u24le(b, 27);
        }
    } else if (contentType === "image/jpeg") {
        let at = 2;
        while (at + 9 < b.length) {
            if (b[at] !== 0xff) return null;
            const marker = b[at + 1];
            if (marker === 0xff) {
                at += 1;
                continue;
            }
            // Start of frame (baseline, progressive…): height, then width.
            if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
                height = u16be(b, at + 5);
                width = u16be(b, at + 7);
                break;
            }
            if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
                at += 2;
                continue;
            }
            if (marker === 0xda || marker === 0xd9) return null;
            at += 2 + u16be(b, at + 2);
        }
    }
    return width > 0 && height > 0 ? { width, height } : null;
}

/* ------------------------------ photo metadata ------------------------------ */

/** The EXIF orientation (1–8) inside a JPEG APP1 "Exif" segment; 1 when there is none. */
function exifOrientation(segment: Uint8Array): number {
    // segment: "Exif\0\0" then a TIFF header.
    if (segment.length < 14 || ascii(segment, 0, 6) !== "Exif\u0000\u0000") return 1;
    const tiff = 6;
    const little = ascii(segment, tiff, 2) === "II";
    if (!little && ascii(segment, tiff, 2) !== "MM") return 1;
    const u16 = (at: number) => (little ? u16le(segment, at) : u16be(segment, at));
    const u32 = (at: number) => (little ? (u16le(segment, at) + u16le(segment, at + 2) * 65536) : u32be(segment, at));
    const ifd = tiff + u32(tiff + 4);
    if (ifd + 2 > segment.length) return 1;
    const entries = u16(ifd);
    for (let index = 0; index < entries; index += 1) {
        const entry = ifd + 2 + index * 12;
        if (entry + 12 > segment.length) break;
        if (u16(entry) === 0x0112) {
            const value = u16(entry + 8);
            return value >= 1 && value <= 8 ? value : 1;
        }
    }
    return 1;
}

/** A JPEG's EXIF orientation (1–8); 1 when it has none. */
export function jpegOrientation(b: Uint8Array): number {
    let at = 2;
    while (at + 4 <= b.length) {
        if (b[at] !== 0xff) return 1;
        const marker = b[at + 1];
        if (marker === 0xff) {
            at += 1;
            continue;
        }
        if (marker === 0xda || marker === 0xd9) return 1;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
            at += 2;
            continue;
        }
        const end = at + 2 + u16be(b, at + 2);
        if (end > b.length) return 1;
        if (marker === 0xe1) {
            const orientation = exifOrientation(b.subarray(at + 4, end));
            if (orientation !== 1) return orientation;
        }
        at = end;
    }
    return 1;
}

/** An APP1 segment holding only an EXIF orientation (so a turned photo still shows the right way up). */
function orientationSegment(orientation: number): Uint8Array {
    const payload = [
        ...[0x45, 0x78, 0x69, 0x66, 0x00, 0x00], // "Exif\0\0"
        ...[0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00], // little-endian TIFF, IFD0 at 8
        ...[0x01, 0x00], // one entry
        ...[0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00], // Orientation, SHORT, 1
        ...[0x00, 0x00, 0x00, 0x00], // no next IFD
    ];
    const length = payload.length + 2;
    return new Uint8Array([0xff, 0xe1, length >> 8, length & 0xff, ...payload]);
}

function concat(parts: Uint8Array[]) {
    const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.byteLength;
    }
    return result;
}

function stripJpeg(b: Uint8Array): Uint8Array {
    const kept: Uint8Array[] = [b.subarray(0, 2)];
    let orientation = 1;
    let at = 2;
    while (at + 4 <= b.length) {
        if (b[at] !== 0xff) return b;
        const marker = b[at + 1];
        if (marker === 0xff) {
            at += 1;
            continue;
        }
        if (marker === 0xda) {
            // Start of scan: the picture itself, kept as it is to the end.
            // After a JFIF header (APP0), which comes first by convention.
            if (orientation !== 1) kept.splice(kept.length > 1 && kept[1][1] === 0xe0 ? 2 : 1, 0, orientationSegment(orientation));
            kept.push(b.subarray(at));
            return concat(kept);
        }
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
            kept.push(b.subarray(at, at + 2));
            at += 2;
            continue;
        }
        const end = at + 2 + u16be(b, at + 2);
        if (end > b.length) return b;
        // APP1 (EXIF with location and camera, XMP), APP13 (IPTC) and comments go; JFIF, colour profiles and the rest stay.
        if (marker === 0xe1) orientation = Math.max(orientation, exifOrientation(b.subarray(at + 4, end)));
        else if (marker !== 0xed && marker !== 0xfe) kept.push(b.subarray(at, end));
        at = end;
    }
    return b;
}

function stripPng(b: Uint8Array): Uint8Array {
    const kept: Uint8Array[] = [b.subarray(0, 8)];
    let at = 8;
    while (at + 12 <= b.length) {
        const length = u32be(b, at);
        const type = ascii(b, at + 4, 4);
        const end = at + 12 + length;
        if (end > b.length) return b;
        // Text chunks and EXIF can hold location, names and dates; the picture doesn't need them.
        if (!["eXIf", "tEXt", "iTXt", "zTXt", "tIME"].includes(type)) kept.push(b.subarray(at, end));
        at = end;
        if (type === "IEND") break;
    }
    return concat(kept);
}

function stripWebp(b: Uint8Array): Uint8Array {
    if (b.length < 30 || ascii(b, 12, 4) !== "VP8X") return b;
    const kept: Uint8Array[] = [];
    let at = 12;
    while (at + 8 <= b.length) {
        const type = ascii(b, at, 4);
        const size = u16le(b, at + 4) + u16le(b, at + 6) * 65536;
        const end = at + 8 + size + (size % 2);
        if (end > b.length + 1) return b;
        if (type !== "EXIF" && type !== "XMP ") kept.push(b.subarray(at, Math.min(end, b.length)));
        at = end;
    }
    const body = concat(kept);
    // VP8X flags: no EXIF (0x08) and no XMP (0x04) any more.
    body[8] &= ~0x0c;
    const header = new Uint8Array(12);
    header.set(b.subarray(0, 12));
    const riff = body.byteLength + 4;
    header[4] = riff & 0xff;
    header[5] = (riff >> 8) & 0xff;
    header[6] = (riff >> 16) & 0xff;
    header[7] = (riff >>> 24) & 0xff;
    return concat([header, body]);
}

/**
 * The picture without what cameras and phones add to it (the place it was
 * taken, the device, dates, names): JPEG keeps only its orientation, PNG
 * loses its text and EXIF chunks, WebP its EXIF and XMP. Anything that
 * doesn't parse is returned unchanged.
 */
export function stripImageMetadata(bytes: Uint8Array, contentType: string): Uint8Array {
    try {
        if (contentType === "image/jpeg") return stripJpeg(bytes);
        if (contentType === "image/png") return stripPng(bytes);
        if (contentType === "image/webp") return stripWebp(bytes);
    } catch {
        // Unchanged below.
    }
    return bytes;
}

/* ------------------------------ messages ------------------------------ */

const SAFE_TYPE = /^(image\/(png|jpeg|gif|webp)|video\/(mp4|webm|quicktime)|audio\/(mp4|webm|ogg|wav|flac|mpeg)|application\/(pdf|zip|gzip|x-7z-compressed|epub\+zip|vnd\.[a-z0-9.+-]{1,80})|text\/plain; charset=utf-8)$/;

/** The `file` field of a stored message; null when it isn't a usable attachment. */
export function readMessageAttachment(value: unknown): MessageAttachment | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (!isFileId(record.id)) return null;
    const kind = ATTACHMENT_KINDS.find((entry) => entry === record.kind);
    const size = typeof record.size === "number" && Number.isInteger(record.size) && record.size > 0 && record.size <= ATTACHMENT_LIMITS.maxBytes ? record.size : 0;
    const contentType = typeof record.contentType === "string" && SAFE_TYPE.test(record.contentType) ? record.contentType : "";
    if (!kind || !size || !contentType) return null;
    const dimension = (entry: unknown) => (typeof entry === "number" && Number.isInteger(entry) && entry > 0 && entry <= ATTACHMENT_LIMITS.imageEdgeMax ? entry : null);
    const width = dimension(record.width);
    const height = dimension(record.height);
    return { id: record.id, name: cleanFileName(record.name), size, contentType, kind, width: width && height ? width : null, height: width && height ? height : null };
}

/** Previews (chat list, notifications, replies): "📎 name". */
export function attachmentPreview(attachment: Pick<MessageAttachment, "name">) {
    return `📎 ${attachment.name}`;
}

/** Where the browser loads the file from. */
export function attachmentUrl(id: string, download = false) {
    return `/api/social/files/${id}${download ? "?download=1" : ""}`;
}

/** A size for people: "820 KB", "3,4 MB" (Turkish decimal comma) or "3.4 MB". */
export function formatBytes(bytes: number, language: "TR" | "EN" | string = "TR") {
    const comma = language === "TR";
    const round = (value: number) => {
        const text = value >= 10 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, "");
        return comma ? text.replace(".", ",") : text;
    };
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${round(bytes / 1024)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${round(bytes / (1024 * 1024))} MB`;
    return `${round(bytes / (1024 * 1024 * 1024))} GB`;
}
