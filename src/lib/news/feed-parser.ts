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
        const url = safeUrl(attribute(match[0], "url") ?? attribute(match[0], "href"), false);
        if (url && !/\.(mp4|mp3|webm|m4a)(\?|$)/i.test(url)) return url;
    }
    const html = decodeEntities(unwrapCdata(tagContent(block, ["content:encoded", "description", "content", "summary"]) ?? ""));
    const img = /<img\b[^>]*\ssrc\s*=\s*("([^"]+)"|'([^']+)')/i.exec(html);
    if (img) return safeUrl(img[2] ?? img[3], false);
    return null;
}

function parseDate(value: string | null): string | null {
    if (!value) return null;
    const time = Date.parse(toPlainText(value, 100));
    if (!Number.isFinite(time)) return null;
    // Ignore dates far in the future (broken feeds).
    if (time > Date.now() + 36 * 3600 * 1000) return null;
    return new Date(time).toISOString();
}

export function parseFeed(xml: string, limit = 25): ParsedFeedItem[] {
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
            publishedAt: parseDate(tagContent(block, ["pubDate", "published", "updated", "dc:date", "a10:updated"])),
            summary: summary === title ? "" : summary,
            image: findImage(block),
        });
        if (items.length >= limit) break;
    }
    return items;
}
