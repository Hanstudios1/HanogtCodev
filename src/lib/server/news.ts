import "server-only";

import { createHash } from "node:crypto";
import { decodeFeedBytes, parseFeed } from "@/lib/news/feed-parser";
import {
    collectMarkets, createMarketsMemo, failedMarketIds, MARKET_ORDER,
    type MarketId, type MarketItem, type MarketsSnapshot,
} from "@/lib/news/markets";
import { dropExpiredStories, NEWS_RETENTION_MS, parseUndated, resolveUndated, serializeUndated, type UndatedSighting } from "@/lib/news/retention";
import { selectItems } from "@/lib/news/select";
import { inferTags, NEWS_SOURCES, type NewsCategory, type NewsSource } from "@/lib/news/sources";
import { SITE_URL } from "@/lib/site";
import { getServerDocument, patchServerDocument } from "./firebase-rest";
import { maybePurgeOldNews } from "./news-retention";

export interface NewsItem {
    id: string;
    title: string;
    link: string;
    summary: string;
    image: string | null;
    publishedAt: string;
    source: { id: string; name: string; homepage: string };
    category: NewsCategory;
    tags: NewsCategory[];
    language: "tr" | "en";
}

export interface NewsSnapshot {
    items: NewsItem[];
    fetchedAt: string;
    sources: Array<{ id: string; name: string; homepage: string; category: NewsCategory; language: "tr" | "en"; ok: boolean; count: number }>;
}

const CACHE_TTL_MS = 3 * 60_000;
const FETCH_TIMEOUT_MS = 7_000;
/**
 * Live feed size. The feed is all there is: stories older than a day
 * (NEWS_RETENTION_MS) are dropped and nothing is archived, so busy sources
 * contribute more of their day than the 14 newest stories.
 */
const MAX_ITEMS = 300;
const PER_SOURCE = 25;
/** Busy wire services must not push the slower feeds out of the snapshot. */
const PER_CATEGORY = 60;
/** The shared fallback snapshot stays well below Firestore's 1 MiB document limit. */
const STORED_ITEMS = 150;
const STORED_MAX_BYTES = 700_000;
/** Turkey has no daylight saving time: timestamps without a zone in Turkish feeds are UTC+3. */
const TURKEY_OFFSET = "+03:00";

let memoryCache: { at: number; snapshot: NewsSnapshot } | null = null;
let inflight: Promise<NewsSnapshot> | null = null;
/** First and last sighting of each story whose feed gives no date (seeded from the stored snapshot). */
let undatedMemory: Map<string, UndatedSighting> | null = null;

export function newsId(link: string) {
    return createHash("sha1").update(link.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase()).digest("hex").slice(0, 20);
}

/** A story as read from its feed; `publishedAt` is null when the feed gives no usable date. */
type FetchedItem = Omit<NewsItem, "publishedAt"> & { publishedAt: string | null };

async function fetchSource(source: NewsSource): Promise<FetchedItem[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(source.url, {
            signal: controller.signal,
            headers: {
                // Header values must be ASCII (ByteString); non-Latin-1 characters make fetch throw.
                "User-Agent": `HanogtNewsBot/1.0 (+${SITE_URL}/news)`,
                Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
            },
            cache: "no-store",
            redirect: "follow",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const length = Number(response.headers.get("content-length") || 0);
        if (length > 5_000_000) throw new Error("too large");
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > 5_000_000) throw new Error("too large");
        // Older Turkish feeds are still served as windows-1254 / ISO-8859-9.
        const xml = decodeFeedBytes(bytes, response.headers.get("content-type"), source.language === "tr" ? "windows-1254" : "windows-1252");
        return parseFeed(xml, PER_SOURCE, { assumeOffset: source.language === "tr" ? TURKEY_OFFSET : undefined }).map((item) => {
            return {
                id: newsId(item.link),
                title: item.title,
                link: item.link,
                summary: item.summary,
                image: item.image,
                publishedAt: item.publishedAt,
                source: { id: source.id, name: source.name, homepage: source.homepage },
                category: source.category,
                tags: inferTags(item.title, item.summary, source.category),
                language: source.language,
            };
        });
    } finally {
        clearTimeout(timer);
    }
}

async function collect(): Promise<NewsSnapshot> {
    const results = await Promise.allSettled(NEWS_SOURCES.map((source) => fetchSource(source)));
    const sources = NEWS_SOURCES.map((source, index) => {
        const result = results[index];
        const list = result.status === "fulfilled" ? result.value : [];
        return { id: source.id, name: source.name, homepage: source.homepage, category: source.category, language: source.language, ok: result.status === "fulfilled", count: list.length };
    });
    const fetched = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
    const now = Date.now();
    const memory = fetched.some((item) => !item.publishedAt) ? await loadUndatedMemory() : (undatedMemory ?? new Map<string, UndatedSighting>());
    const all = resolveUndated(fetched, memory, now);
    const items = selectItems(all, { now, maxAgeMs: NEWS_RETENTION_MS, maxItems: MAX_ITEMS, perCategory: PER_CATEGORY });
    return { items, fetchedAt: new Date(now).toISOString(), sources };
}

/** Undated sightings survive restarts through the shared snapshot document. */
async function loadUndatedMemory() {
    if (undatedMemory) return undatedMemory;
    let stored: { undated?: unknown } | null = null;
    try {
        stored = await getServerDocument<{ undated?: unknown }>("news_cache/latest", { fields: ["undated"] });
    } catch {
        // Without the stored sightings undated stories start from now.
    }
    undatedMemory = parseUndated(stored?.undated);
    return undatedMemory;
}

async function readStoredSnapshot(): Promise<NewsSnapshot | null> {
    try {
        const stored = await getServerDocument<{ snapshot?: string }>("news_cache/latest", { fields: ["snapshot"] });
        if (!stored?.snapshot) return null;
        const parsed = JSON.parse(stored.snapshot) as NewsSnapshot;
        if (!Array.isArray(parsed.items)) return null;
        // The fallback never brings back stories older than a day.
        return { ...parsed, items: dropExpiredStories(parsed.items, Date.now()) };
    } catch {
        return null;
    }
}

async function storeSnapshot(snapshot: NewsSnapshot) {
    try {
        const trimmed = { ...snapshot, items: snapshot.items.slice(0, STORED_ITEMS) };
        const json = JSON.stringify(trimmed);
        const undated = serializeUndated(undatedMemory ?? new Map());
        if (Buffer.byteLength(json, "utf8") + Buffer.byteLength(undated, "utf8") > STORED_MAX_BYTES) return;
        await patchServerDocument("news_cache/latest", { snapshot: json, undated, fetchedAt: snapshot.fetchedAt });
    } catch {
        // The shared cache is best-effort (e.g. missing credentials in local development).
    }
}

/**
 * Returns the latest headlines. Feeds are refreshed at most every few minutes
 * per server instance; if every source fails the last stored snapshot is used.
 */
export async function getNewsSnapshot(): Promise<NewsSnapshot> {
    if (memoryCache && Date.now() - memoryCache.at < CACHE_TTL_MS) return memoryCache.snapshot;
    if (inflight) return inflight;
    inflight = (async () => {
        try {
            const fresh = await collect();
            if (fresh.items.length) {
                memoryCache = { at: Date.now(), snapshot: fresh };
                void storeSnapshot(fresh);
                maybePurgeOldNews();
                return fresh;
            }
            const stored = await readStoredSnapshot();
            const fallback = stored ?? fresh;
            memoryCache = { at: Date.now() - CACHE_TTL_MS + 30_000, snapshot: fallback };
            return fallback;
        } finally {
            inflight = null;
        }
    })();
    return inflight;
}

export async function findNewsItem(id: string): Promise<NewsItem | null> {
    const snapshot = await getNewsSnapshot();
    return snapshot.items.find((item) => item.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Markets strip (exchange rates, gold, BIST 100, Bitcoin)
// ---------------------------------------------------------------------------

const MARKETS_TTL_MS = 5 * 60_000;
/** After a total failure the next request tries again soon instead of waiting out the full TTL. */
const MARKETS_RETRY_MS = 60_000;
const MARKETS_FETCH_TIMEOUT_MS = 6_000;
const MARKETS_MAX_BYTES = 1_000_000;
/** A quote whose refresh failed is shown (with its own timestamp) for this long after its last good fetch. */
const LIVE_QUOTE_GRACE_MS = 45 * 60_000;
/** TCMB rates change once per business day, so a failed refresh can ride on the previous bulletin for hours. */
const DAILY_RATE_GRACE_MS = 12 * 3600_000;
const DAILY_IDS: ReadonlySet<MarketId> = new Set<MarketId>(["usd-try", "eur-try", "gbp-try"]);

let marketsCache: { at: number; ttl: number; snapshot: MarketsSnapshot } | null = null;
let marketsInflight: Promise<MarketsSnapshot> | null = null;
const lastGoodQuotes = new Map<MarketId, { item: MarketItem; fetchedAt: number }>();
const marketsMemo = createMarketsMemo();

/** Response body, null for HTTP 404/410 (e.g. a TCMB bulletin for a holiday), a thrown error otherwise. */
async function fetchMarketText(url: string): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MARKETS_FETCH_TIMEOUT_MS);
    try {
        const headers: Record<string, string> = {
            "User-Agent": `HanogtNewsBot/1.0 (+${SITE_URL}/news)`,
            Accept: "application/json, application/xml, text/xml;q=0.9, */*;q=0.5",
        };
        // CoinGecko's keyless endpoint is rate limited harder than its free "demo" plan; a key is optional.
        const coingeckoKey = process.env.COINGECKO_API_KEY?.trim();
        if (coingeckoKey && /^[\w.-]{8,128}$/.test(coingeckoKey) && new URL(url).hostname === "api.coingecko.com") headers["x-cg-demo-api-key"] = coingeckoKey;
        const response = await fetch(url, { signal: controller.signal, headers, cache: "no-store", redirect: "follow" });
        if (response.status === 404 || response.status === 410) return null;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (Number(response.headers.get("content-length") || 0) > MARKETS_MAX_BYTES) throw new Error("too large");
        const text = await response.text();
        if (text.length > MARKETS_MAX_BYTES) throw new Error("too large");
        return text;
    } finally {
        clearTimeout(timer);
    }
}

async function collectMarketsSnapshot(): Promise<MarketsSnapshot> {
    const result = await collectMarkets({ fetchText: fetchMarketText, memo: marketsMemo });
    const now = Date.now();
    for (const item of result.items) lastGoodQuotes.set(item.id, { item, fetchedAt: now });
    if (result.failures.length) {
        console.warn("[markets] unavailable:", result.failures.map((failure) => `${failure.provider} (${failure.reason})`).join(", "));
    }
    const byId = new Map<MarketId, MarketItem>(result.items.map((item) => [item.id, item]));
    for (const id of failedMarketIds(result)) {
        const previous = lastGoodQuotes.get(id);
        if (previous && now - previous.fetchedAt <= (DAILY_IDS.has(id) ? DAILY_RATE_GRACE_MS : LIVE_QUOTE_GRACE_MS)) byId.set(id, previous.item);
    }
    return { items: MARKET_ORDER.flatMap((id) => byId.get(id) ?? []), generatedAt: new Date(now).toISOString() };
}

/**
 * The markets strip data. Every provider is fetched server-side (no visitor data leaves the site),
 * at most once per five minutes per server instance; one failing provider only removes its own items.
 */
export async function getMarketsSnapshot(): Promise<MarketsSnapshot> {
    if (marketsCache && Date.now() - marketsCache.at < marketsCache.ttl) return marketsCache.snapshot;
    if (marketsInflight) return marketsInflight;
    marketsInflight = (async () => {
        try {
            const snapshot = await collectMarketsSnapshot();
            marketsCache = { at: Date.now(), ttl: snapshot.items.length ? MARKETS_TTL_MS : MARKETS_RETRY_MS, snapshot };
            return snapshot;
        } finally {
            marketsInflight = null;
        }
    })();
    return marketsInflight;
}
