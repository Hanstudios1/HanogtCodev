import "server-only";

import { readGiphyItem, readKlipyItem, type GifItem, type GifProvider, type GifSearchResult } from "@/lib/social/gif";

/*
 * GIF search for Hanogt Social through the server: KLIPY (KLIPY_API_KEY) or
 * GIPHY (GIPHY_API_KEY); GIF_PROVIDER picks one when both are set. Only the
 * search text, the page and the language go to the provider (no account or
 * address of the person), answers are cached for a while to stay within the
 * provider's limits, and only images on the provider's media hosts come back.
 * Tenor's API was shut down on 30 June 2026, so it isn't offered.
 */

export const GIF_PAGE_SIZE = 24;
const TIMEOUT_MS = 6_000;
const SEARCH_TTL_MS = 10 * 60_000;
const TRENDING_TTL_MS = 30 * 60_000;
const CACHE_MAX = 300;
const QUERY_MAX = 50;
export const GIF_MAX_PAGE = 20;

export type GifErrorCode = "not_configured" | "unavailable";

export class GifError extends Error {
    readonly code: GifErrorCode;
    constructor(code: GifErrorCode, message: string) {
        super(message);
        this.name = "GifError";
        this.code = code;
    }
}

export function gifProviderConfig(env: Record<string, string | undefined> = process.env): { provider: GifProvider; key: string } | null {
    const klipy = env.KLIPY_API_KEY?.trim();
    const giphy = env.GIPHY_API_KEY?.trim();
    const forced = env.GIF_PROVIDER?.trim().toLowerCase();
    if (forced === "giphy" && giphy) return { provider: "giphy", key: giphy };
    if (forced === "klipy" && klipy) return { provider: "klipy", key: klipy };
    if (klipy) return { provider: "klipy", key: klipy };
    if (giphy) return { provider: "giphy", key: giphy };
    return null;
}

/** The content rating asked for: GIF_RATING (g, pg or pg-13), "pg" by default. */
export function gifRating(env: Record<string, string | undefined> = process.env) {
    const value = env.GIF_RATING?.trim().toLowerCase();
    return value === "g" || value === "pg" || value === "pg-13" ? value : "pg";
}

/** The search text as it is sent and cached: trimmed, one space between words, lower case, at most 50 characters. */
export function normalizeGifQuery(value: unknown) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().toLocaleLowerCase("tr").slice(0, QUERY_MAX) : "";
}

/** The provider's address for a search (or the trending list when the text is empty). */
export function gifRequestUrl(config: { provider: GifProvider; key: string }, query: string, page: number, language: "tr" | "en", rating = gifRating()) {
    if (config.provider === "klipy") {
        const url = new URL(`https://api.klipy.com/api/v1/${encodeURIComponent(config.key)}/gifs/${query ? "search" : "trending"}`);
        if (query) url.searchParams.set("q", query);
        url.searchParams.set("page", String(page));
        url.searchParams.set("per_page", String(GIF_PAGE_SIZE));
        url.searchParams.set("rating", rating);
        url.searchParams.set("locale", language === "tr" ? "tr_TR" : "en_US");
        return url;
    }
    const url = new URL(`https://api.giphy.com/v1/gifs/${query ? "search" : "trending"}`);
    url.searchParams.set("api_key", config.key);
    if (query) url.searchParams.set("q", query);
    url.searchParams.set("limit", String(GIF_PAGE_SIZE));
    url.searchParams.set("offset", String((page - 1) * GIF_PAGE_SIZE));
    url.searchParams.set("rating", rating);
    if (query) url.searchParams.set("lang", language);
    url.searchParams.set("bundle", "messaging_non_clips");
    return url;
}

/** The items and the next page from a provider's answer. */
export function readGifAnswer(provider: GifProvider, body: unknown, page: number): Omit<GifSearchResult, "provider"> {
    const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    if (provider === "klipy") {
        const data = root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : {};
        const list = Array.isArray(data.data) ? data.data : [];
        const items = list.map(readKlipyItem).filter((item): item is GifItem => item !== null);
        return { items, next: data.has_next === true && page < GIF_MAX_PAGE ? page + 1 : null };
    }
    const list = Array.isArray(root.data) ? root.data : [];
    const items = list.map(readGiphyItem).filter((item): item is GifItem => item !== null);
    const pagination = root.pagination && typeof root.pagination === "object" ? (root.pagination as Record<string, unknown>) : {};
    const total = Number(pagination.total_count);
    const more = Number.isFinite(total) ? page * GIF_PAGE_SIZE < total : list.length >= GIF_PAGE_SIZE;
    return { items, next: more && page < GIF_MAX_PAGE ? page + 1 : null };
}

const cache = new Map<string, { at: number; ttl: number; value: GifSearchResult }>();

function cached(key: string) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.at > entry.ttl) {
        cache.delete(key);
        return null;
    }
    return entry.value;
}

function remember(key: string, value: GifSearchResult, ttl: number) {
    cache.set(key, { at: Date.now(), ttl, value });
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
}

/** A page of GIFs for a search (or the trending ones). */
export async function searchGifs(options: { query: unknown; page?: number; language: "tr" | "en" }): Promise<GifSearchResult> {
    const config = gifProviderConfig();
    if (!config) throw new GifError("not_configured", "GIF araması yapılandırılmadı.");
    const query = normalizeGifQuery(options.query);
    const page = Math.min(GIF_MAX_PAGE, Math.max(1, Math.floor(options.page ?? 1)));
    const key = `${config.provider}:${options.language}:${page}:${query}`;
    const hit = cached(key);
    if (hit) return hit;

    let response: Response;
    try {
        response = await fetch(gifRequestUrl(config, query, page, options.language), { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
        throw new GifError("unavailable", "GIF sağlayıcısına ulaşılamadı.");
    }
    if (!response.ok) {
        // The key never appears in logs; the status is enough to tell a bad key from an outage.
        console.error(`[social/gifs] ${config.provider} answered ${response.status}`);
        throw new GifError("unavailable", "GIF sağlayıcısı yanıt vermedi.");
    }
    const body = await response.json().catch(() => null);
    const value: GifSearchResult = { provider: config.provider, ...readGifAnswer(config.provider, body, page) };
    remember(key, value, query ? SEARCH_TTL_MS : TRENDING_TTL_MS);
    return value;
}
