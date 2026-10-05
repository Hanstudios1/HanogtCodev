/**
 * GIFs in Hanogt Social: what the GIF picker gets from /api/social/gifs and
 * what a message stores. GIFs come from KLIPY or GIPHY through the server
 * (the API key never reaches the browser), and a message may only point at
 * those providers' media hosts, so nobody can make a chat load an image from
 * an address of their choosing.
 */

export type GifProvider = "klipy" | "giphy";

export interface GifItem {
    provider: GifProvider;
    id: string;
    title: string;
    /** The animation (animated WebP or GIF). */
    url: string;
    /** A still frame, for when GIFs don't play automatically; null when the provider has none. */
    still: string | null;
    width: number;
    height: number;
}

/** What a message stores for a GIF. */
export type MessageGif = GifItem;

export interface GifSearchResult {
    provider: GifProvider;
    items: GifItem[];
    /** The next page to ask for; null at the end. */
    next: number | null;
}

/** "Powered by …" as the providers ask for it. */
export const GIF_ATTRIBUTION: Record<GifProvider, string> = { klipy: "KLIPY", giphy: "GIPHY" };

const MEDIA_HOSTS: Record<GifProvider, RegExp> = {
    klipy: /^(?:[a-z0-9-]+\.)*klipy\.com$/,
    giphy: /^(?:media[0-9]?|i)\.giphy\.com$/,
};

const MAX_URL = 600;
const MAX_TITLE = 120;

/** An https address on the provider's media hosts, without credentials or an odd port. */
export function isAllowedGifUrl(value: unknown, provider: GifProvider): value is string {
    if (typeof value !== "string" || value.length > MAX_URL) return false;
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return false;
    }
    return url.protocol === "https:" && !url.username && !url.password && !url.port && MEDIA_HOSTS[provider].test(url.hostname);
}

const dimension = (value: unknown) => {
    const number = typeof value === "string" ? Number(value) : value;
    return typeof number === "number" && Number.isFinite(number) && number > 0 ? Math.min(Math.round(number), 4096) : 0;
};

/** A GIF from a message or a request, checked; null when anything is off. */
export function readMessageGif(value: unknown): MessageGif | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const gif = value as Record<string, unknown>;
    const provider = gif.provider === "klipy" || gif.provider === "giphy" ? gif.provider : null;
    if (!provider || !isAllowedGifUrl(gif.url, provider)) return null;
    const id = typeof gif.id === "string" ? gif.id.replace(/[^\w-]/g, "").slice(0, 80) : "";
    const width = dimension(gif.width);
    const height = dimension(gif.height);
    if (!id || !width || !height) return null;
    return {
        provider,
        id,
        title: typeof gif.title === "string" ? gif.title.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX_TITLE) : "",
        url: gif.url as string,
        still: isAllowedGifUrl(gif.still, provider) ? (gif.still as string) : null,
        width,
        height,
    };
}

type Rendition = { url?: unknown; width?: unknown; height?: unknown };

function pick(provider: GifProvider, ...candidates: Array<Rendition | undefined>) {
    for (const candidate of candidates) {
        if (candidate && isAllowedGifUrl(candidate.url, provider) && dimension(candidate.width) && dimension(candidate.height)) {
            return { url: candidate.url as string, width: dimension(candidate.width), height: dimension(candidate.height) };
        }
    }
    return null;
}

const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/**
 * One KLIPY item (`file.{hd,md,sm,xs}.{webp,gif,jpg,…}`); ads and anything
 * without a usable animation are dropped.
 */
export function readKlipyItem(value: unknown): GifItem | null {
    const item = record(value);
    if (item.type === "ad") return null;
    const files = record(item.file ?? item.files);
    const size = (name: string) => record(files[name]);
    const animation = pick("klipy",
        size("md").webp as Rendition, size("md").gif as Rendition,
        size("sm").webp as Rendition, size("sm").gif as Rendition,
        size("hd").webp as Rendition, size("hd").gif as Rendition,
        // Some answers list the formats directly.
        files.webp as Rendition, files.gif as Rendition,
    );
    if (!animation) return null;
    const still = pick("klipy", size("md").jpg as Rendition, size("sm").jpg as Rendition, size("md").png as Rendition, files.jpg as Rendition);
    const id = String(item.slug ?? item.id ?? "").replace(/[^\w-]/g, "").slice(0, 80);
    if (!id) return null;
    return { provider: "klipy", id, title: typeof item.title === "string" ? item.title.trim().slice(0, MAX_TITLE) : "", ...animation, still: still?.url ?? null };
}

/** One GIPHY item (`images.fixed_height.{webp,url}` and its still frame). */
export function readGiphyItem(value: unknown): GifItem | null {
    const item = record(value);
    const images = record(item.images);
    const fixed = record(images.fixed_height);
    const small = record(images.fixed_width);
    const animation = pick("giphy",
        { url: fixed.webp, width: fixed.width, height: fixed.height },
        { url: fixed.url, width: fixed.width, height: fixed.height },
        { url: small.webp, width: small.width, height: small.height },
        { url: small.url, width: small.width, height: small.height },
    );
    if (!animation) return null;
    const still = pick("giphy", images.fixed_height_still as Rendition, images.fixed_width_still as Rendition);
    const id = String(item.id ?? "").replace(/[^\w-]/g, "").slice(0, 80);
    if (!id) return null;
    return { provider: "giphy", id, title: typeof item.title === "string" ? item.title.trim().slice(0, MAX_TITLE) : "", ...animation, still: still?.url ?? null };
}
