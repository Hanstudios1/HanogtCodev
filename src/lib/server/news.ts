import "server-only";

import { createHash } from "node:crypto";
import { parseFeed } from "@/lib/news/feed-parser";
import { inferTags, NEWS_SOURCES, type NewsCategory, type NewsSource } from "@/lib/news/sources";
import { SITE_URL } from "@/lib/site";
import { commitServerPatches, getServerDocument, patchServerDocument, runServerQuery } from "./firebase-rest";

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
/** Live feed size; older headlines stay readable through the archive (news_items). */
const MAX_ITEMS = 240;
const PER_SOURCE = 14;

let memoryCache: { at: number; snapshot: NewsSnapshot } | null = null;
let inflight: Promise<NewsSnapshot> | null = null;

export function newsId(link: string) {
    return createHash("sha1").update(link.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase()).digest("hex").slice(0, 20);
}

async function fetchSource(source: NewsSource): Promise<NewsItem[]> {
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
        const xml = await response.text();
        const now = Date.now();
        return parseFeed(xml, PER_SOURCE).map((item) => {
            const published = item.publishedAt ?? new Date(now).toISOString();
            return {
                id: newsId(item.link),
                title: item.title,
                link: item.link,
                summary: item.summary,
                image: item.image,
                publishedAt: published,
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

function normalizeTitle(title: string) {
    return title.toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 90);
}

async function collect(): Promise<NewsSnapshot> {
    const results = await Promise.allSettled(NEWS_SOURCES.map((source) => fetchSource(source)));
    const seenIds = new Set<string>();
    const seenTitles = new Set<string>();
    const items: NewsItem[] = [];
    const sources = NEWS_SOURCES.map((source, index) => {
        const result = results[index];
        const list = result.status === "fulfilled" ? result.value : [];
        return { id: source.id, name: source.name, homepage: source.homepage, category: source.category, language: source.language, ok: result.status === "fulfilled", count: list.length };
    });
    const all = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
    all.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    const cutoff = Date.now() - 21 * 24 * 3600 * 1000;
    for (const item of all) {
        if (Date.parse(item.publishedAt) < cutoff) continue;
        const titleKey = normalizeTitle(item.title);
        if (seenIds.has(item.id) || seenTitles.has(titleKey)) continue;
        seenIds.add(item.id);
        seenTitles.add(titleKey);
        items.push(item);
        if (items.length >= MAX_ITEMS) break;
    }
    return { items, fetchedAt: new Date().toISOString(), sources };
}

async function readStoredSnapshot(): Promise<NewsSnapshot | null> {
    try {
        const stored = await getServerDocument<{ snapshot?: string }>("news_cache/latest");
        if (!stored?.snapshot) return null;
        const parsed = JSON.parse(stored.snapshot) as NewsSnapshot;
        return Array.isArray(parsed.items) ? parsed : null;
    } catch {
        return null;
    }
}

async function storeSnapshot(snapshot: NewsSnapshot) {
    try {
        const trimmed = { ...snapshot, items: snapshot.items.slice(0, 150) };
        const json = JSON.stringify(trimmed);
        if (json.length > 900_000) return;
        await patchServerDocument("news_cache/latest", { snapshot: json, fetchedAt: snapshot.fetchedAt });
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
                void archiveItems(fresh.items);
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
// Archive: every headline is kept in news_items, so the feed is never capped
// at a fixed number of stories; the News page pages through older ones.
// ---------------------------------------------------------------------------

const ARCHIVE_STATE = "news_cache/archive_state";
const ARCHIVE_PAGE = 100;
let archivedUpTo: string | null = null;

async function archiveItems(items: NewsItem[]) {
    try {
        if (archivedUpTo === null) {
            const state = await getServerDocument<{ upTo?: string }>(ARCHIVE_STATE);
            archivedUpTo = typeof state?.upTo === "string" ? state.upTo : "";
        }
        const since = archivedUpTo;
        const fresh = items.filter((item) => item.publishedAt > since).slice(0, 200);
        if (!fresh.length) return;
        await commitServerPatches(fresh.map((item) => ({
            path: `news_items/${item.id}`,
            data: { ...item, archivedAt: new Date() },
        })));
        const newest = fresh.reduce((max, item) => (item.publishedAt > max ? item.publishedAt : max), since);
        archivedUpTo = newest;
        await patchServerDocument(ARCHIVE_STATE, { upTo: newest, updatedAt: new Date() });
    } catch {
        // Best effort, like the shared snapshot (e.g. no credentials in local development).
        archivedUpTo = null;
    }
}

function archivedItem(record: Record<string, unknown>): NewsItem | null {
    const source = record.source as NewsItem["source"] | undefined;
    if (typeof record.id !== "string" || typeof record.title !== "string" || typeof record.link !== "string" || typeof record.publishedAt !== "string" || !source?.id) return null;
    return {
        id: record.id,
        title: record.title,
        link: record.link,
        summary: typeof record.summary === "string" ? record.summary : "",
        image: typeof record.image === "string" ? record.image : null,
        publishedAt: record.publishedAt,
        source: { id: String(source.id), name: String(source.name ?? ""), homepage: String(source.homepage ?? "") },
        category: record.category as NewsCategory,
        tags: Array.isArray(record.tags) ? record.tags as NewsCategory[] : [record.category as NewsCategory],
        language: record.language === "tr" ? "tr" : "en",
    };
}

/**
 * Headlines published before `before` (ISO time), newest first. Filtering by
 * category happens here so the query needs only the automatic single-field
 * index on publishedAt.
 */
export async function getArchivedNews(before: string, limit: number, category: NewsCategory | null): Promise<{ items: NewsItem[]; done: boolean }> {
    const items: NewsItem[] = [];
    let cursor = before;
    let done = false;
    for (let round = 0; round < 4 && items.length < limit; round += 1) {
        const page = await runServerQuery<Record<string, unknown>>({
            collectionId: "news_items",
            where: [{ field: "publishedAt", op: "LESS_THAN", value: cursor }],
            orderBy: [{ field: "publishedAt", direction: "DESCENDING" }],
            limit: ARCHIVE_PAGE,
        });
        for (const record of page) {
            const item = archivedItem(record);
            if (item && (!category || item.category === category || item.tags.includes(category))) items.push(item);
        }
        if (page.length < ARCHIVE_PAGE) {
            done = true;
            break;
        }
        cursor = String(page[page.length - 1].publishedAt);
    }
    return { items: items.slice(0, limit), done: done && items.length <= limit };
}
