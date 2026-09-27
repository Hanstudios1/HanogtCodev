import "server-only";

import { createHash } from "node:crypto";
import { parseFeed } from "@/lib/news/feed-parser";
import { inferTags, NEWS_SOURCES, type NewsCategory, type NewsSource } from "@/lib/news/sources";
import { SITE_URL } from "@/lib/site";
import { getServerDocument, patchServerDocument } from "./firebase-rest";

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
const MAX_ITEMS = 180;
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
