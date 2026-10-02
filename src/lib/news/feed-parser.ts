/**
 * Minimal, dependency-free RSS 2.0 / Atom parser for the news aggregator.
 * Output is plain text only (no HTML is ever passed to the browser).
 */

export interface ParsedFeedItem {
    title: string;
    link: string;
    publishedAt: string | null;
    summary: string;
    image: string | null;
}

const NAMED_ENTITIES: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘",
    rdquo: "”", ldquo: "“", laquo: "«", raquo: "»", bull: "•", middot: "·", copy: "©", reg: "®", trade: "™", deg: "°", euro: "€",
    ccedil: "ç", Ccedil: "Ç", ouml: "ö", Ouml: "Ö", uuml: "ü", Uuml: "Ü", scaron: "š", eacute: "é", egrave: "è", aacute: "á",
    agrave: "à", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", auml: "ä", Auml: "Ä", szlig: "ß", times: "×", divide: "÷",
};

export function decodeEntities(text: string): string {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, entity: string) => {
        if (entity[0] === "#") {
            const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
            if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return "";
            try {
                return String.fromCodePoint(code);
            } catch {
                return "";
            }
        }
        return NAMED_ENTITIES[entity] ?? NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    });
}

function unwrapCdata(text: string) {
    return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

/** HTML/XML fragment → plain text. */
export function toPlainText(fragment: string, maxLength = 320): string {
    let text = unwrapCdata(fragment);
    // Some feeds double-encode their HTML.
    if (/&lt;[a-z/!]/i.test(text)) text = decodeEntities(text);
    text = text
        .replace(/<(script|style|iframe|noscript)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/(p|div|li|h\d)>/gi, " ")
        .replace(/<[^>]+>/g, " ");
    text = decodeEntities(text);
    // Double-encoded entities ("&amp;amp;") are common in feeds.
    if (/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/i.test(text)) text = decodeEntities(text);
    text = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length > maxLength) {
        const cut = text.slice(0, maxLength);
        const lastSpace = cut.lastIndexOf(" ");
        text = `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
    }
    return text;
}

function tagContent(block: string, names: string[]): string | null {
    for (const name of names) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const match = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i").exec(block);
        if (match && match[1].trim()) return match[1];
    }
    return null;
}

function attribute(tag: string, name: string): string | null {
    const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
    return match ? decodeEntities(match[2] ?? match[3] ?? "").trim() : null;
}

export function safeUrl(value: string | null | undefined, allowHttp = true): string | null {
    if (!value) return null;
    const trimmed = decodeEntities(unwrapCdata(value)).trim();
    try {
        const url = new URL(trimmed);
        if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) return null;
        if (url.username || url.password) return null;
        return url.toString();
    } catch {
        return null;
    }
}

/** Images must be https; "//cdn.example/x.jpg" (protocol-relative) is common in Turkish feeds. */
function imageUrl(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return safeUrl(trimmed?.startsWith("//") ? `https:${trimmed}` : trimmed, false);
}

/** Non-standard item-level image elements some publishers use instead of media:* / enclosure. */
const IMAGE_ELEMENTS = ["image", "imageurl", "image_url", "thumbnail", "thumb", "picture", "photo", "resim", "ipimage"];
const IMAGE_EXTENSION = /\.(?:jpe?g|png|webp|gif|avif)(?:\?|#|$)/i;

function findImage(block: string): string | null {
    const tagPatterns = [
        /<media:thumbnail\b[^>]*>/i,
        /<media:content\b[^>]*(?:medium\s*=\s*["']image["']|type\s*=\s*["']image\/[^"']+["'])[^>]*>/i,
        /<media:content\b[^>]*>/i,
        /<enclosure\b[^>]*type\s*=\s*["']image\/[^"']+["'][^>]*>/i,
        /<itunes:image\b[^>]*>/i,
    ];
    for (const pattern of tagPatterns) {
        const match = pattern.exec(block);
        if (!match) continue;
        const url = imageUrl(attribute(match[0], "url") ?? attribute(match[0], "href"));
        if (url && !/\.(mp4|mp3|webm|m4a)(\?|$)/i.test(url)) return url;
    }
    // Enclosures without a MIME type: trust the file extension.
    for (const tag of block.match(/<enclosure\b[^>]*>/gi) ?? []) {
        if (/\stype\s*=/i.test(tag)) continue;
        const url = imageUrl(attribute(tag, "url"));
        if (url && IMAGE_EXTENSION.test(url)) return url;
    }
    for (const name of IMAGE_ELEMENTS) {
        const match = new RegExp(`<${name}\\b[^>]*>([^<]*)</${name}>`, "i").exec(block);
        const url = match ? imageUrl(decodeEntities(unwrapCdata(match[1]))) : null;
        if (url) return url;
    }
    const html = decodeEntities(unwrapCdata(tagContent(block, ["content:encoded", "description", "content", "summary"]) ?? ""));
    const img = /<img\b[^>]*\ssrc\s*=\s*("([^"]+)"|'([^']+)')/i.exec(html);
    if (img) return imageUrl(img[2] ?? img[3]);
    return null;
}

// Timestamps without a zone ("2026-10-02 15:30:00", "02.10.2026 15:30") are common in Turkish feeds.
// Left to Date.parse they would be read in the server's zone (UTC), shifting stories by three hours
// and, for "dd.MM.yyyy", swapping day and month.
const LOCAL_ISO = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;
const LOCAL_DMY = /^(\d{1,2})[./](\d{1,2})[./](\d{4})[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const LOCAL_RFC = /^[A-Za-z]{3},?\s+\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?$/;

function parseLocalTime(text: string, offset: string): number {
    const pad = (value: string) => value.padStart(2, "0");
    const iso = LOCAL_ISO.exec(text);
    if (iso) return Date.parse(`${iso[1]}-${iso[2]}-${iso[3]}T${iso[4]}:${iso[5]}:${iso[6] ?? "00"}${offset}`);
    const dmy = LOCAL_DMY.exec(text);
    if (dmy) return Date.parse(`${dmy[3]}-${pad(dmy[2])}-${pad(dmy[1])}T${pad(dmy[4])}:${dmy[5]}:${dmy[6] ?? "00"}${offset}`);
    if (LOCAL_RFC.test(text)) return Date.parse(`${text} ${offset.replace(":", "")}`);
    return Number.NaN;
}

function parseDate(value: string | null, assumeOffset?: string): string | null {
    if (!value) return null;
    const text = toPlainText(value, 100);
    let time = assumeOffset ? parseLocalTime(text, assumeOffset) : Number.NaN;
    if (!Number.isFinite(time)) time = Date.parse(text);
    if (!Number.isFinite(time)) return null;
    // Ignore dates far in the future (broken feeds).
    if (time > Date.now() + 36 * 3600 * 1000) return null;
    return new Date(time).toISOString();
}

/**
 * Feed bytes → text. Valid UTF-8 always wins (some Turkish feeds declare windows-1254 but ship
 * UTF-8). Otherwise the XML declaration, the HTTP charset and finally `fallbackCharset` pick a
 * legacy decoder, so ISO-8859-9 / windows-1254 feeds do not turn "ş", "ğ" and "ı" into mojibake.
 */
export function decodeFeedBytes(bytes: Uint8Array, contentType?: string | null, fallbackCharset = "windows-1252"): string {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
        // Not valid UTF-8: look for a legacy charset below.
    }
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 300));
    const declared = /<\?xml[^>]*\sencoding\s*=\s*["']([\w.:-]+)["']/i.exec(head)?.[1];
    const header = /charset\s*=\s*["']?([\w.:-]+)/i.exec(contentType ?? "")?.[1];
    const claimed = (declared ?? header ?? "").toLowerCase();
    // A UTF-8 feed with a few bad bytes is still UTF-8; replacement characters beat shifted letters.
    if (/^utf-?8$/.test(claimed)) return new TextDecoder("utf-8").decode(bytes);
    for (const label of [claimed, fallbackCharset]) {
        if (!label) continue;
        try {
            return new TextDecoder(label).decode(bytes);
        } catch {
            // Unknown charset label: try the next candidate.
        }
    }
    return new TextDecoder("utf-8").decode(bytes);
}

export interface ParseFeedOptions {
    /**
     * UTC offset ("+03:00") to assume for timestamps that carry no zone of their own; leave unset
     * for feeds that publish proper RFC 822 / ISO 8601 dates.
     */
    assumeOffset?: string;
}

export function parseFeed(xml: string, limit = 25, options: ParseFeedOptions = {}): ParsedFeedItem[] {
    const source = xml.length > 3_000_000 ? xml.slice(0, 3_000_000) : xml;
    const isAtom = /<feed[\s>]/i.test(source) && !/<rss[\s>]/i.test(source);
    const blocks = source.match(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) ?? [];
    const items: ParsedFeedItem[] = [];
    for (const block of blocks.slice(0, limit * 2)) {
        const title = toPlainText(tagContent(block, ["title"]) ?? "", 200);
        let link: string | null = null;
        if (isAtom) {
            const links = block.match(/<link\b[^>]*>/gi) ?? [];
            const preferred = links.find((tag) => /rel\s*=\s*["']alternate["']/i.test(tag)) ?? links.find((tag) => !/rel\s*=/i.test(tag)) ?? links[0];
            link = preferred ? safeUrl(attribute(preferred, "href")) : null;
        } else {
            link = safeUrl(tagContent(block, ["link"]));
            if (!link) {
                const guid = /<guid\b[^>]*>([\s\S]*?)<\/guid>/i.exec(block);
                if (guid && !/isPermaLink\s*=\s*["']false["']/i.test(guid[0])) link = safeUrl(guid[1]);
            }
        }
        if (!title || !link) continue;
        const summary = toPlainText(tagContent(block, ["description", "summary", "content:encoded", "content", "media:description"]) ?? "", 300);
        items.push({
            title,
            link,
            publishedAt: parseDate(tagContent(block, ["pubDate", "published", "updated", "dc:date", "a10:updated"]), options.assumeOffset),
            summary: summary === title ? "" : summary,
            image: findImage(block),
        });
        if (items.length >= limit) break;
    }
    return items;
}
