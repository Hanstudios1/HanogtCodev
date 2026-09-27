import type { NewsCategory } from "@/lib/news/sources";

export interface NewsItemView {
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

export interface NewsSourceStatus {
    id: string;
    name: string;
    homepage: string;
    category: NewsCategory;
    language: "tr" | "en";
    ok: boolean;
    count: number;
}

export function timeAgo(iso: string, locale: "tr" | "en", now = Date.now()) {
    const time = Date.parse(iso);
    if (!Number.isFinite(time)) return "";
    const seconds = Math.round((time - now) / 1000);
    const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [["day", 86400], ["hour", 3600], ["minute", 60]];
    for (const [unit, size] of units) if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
    return locale === "tr" ? "az önce" : "just now";
}

const STOP_WORDS = new Set(("the a an and or of to in on for with from by at is are was were be been it its this that as how why what new now more your you our we they their has have had will can could just after over about into than out up not no yes all but his her its via vs " +
    "ve ile bir bu da de için ne mi mı mu mü olarak daha en çok gibi kadar sonra yeni ilk son var yok olan oldu olduğu diye ama ise hem şu o bunu buna ile göre karşı yeni nasıl neden hangi tüm bütün her yüzde milyon bin").split(" "));

/** Most frequent meaningful words in recent headlines (computed from the live feed). */
export function trendingTopics(items: NewsItemView[], limit = 12) {
    const counts = new Map<string, { word: string; count: number }>();
    for (const item of items.slice(0, 120)) {
        const words = item.title.match(/[\p{L}\p{N}][\p{L}\p{N}.+#-]{2,}/gu) ?? [];
        const seen = new Set<string>();
        for (const raw of words) {
            const key = raw.toLocaleLowerCase("tr").replace(/[.]+$/, "");
            if (key.length < 3 || STOP_WORDS.has(key) || /^\d+$/.test(key) || seen.has(key)) continue;
            seen.add(key);
            const entry = counts.get(key) ?? { word: raw.replace(/[.]+$/, ""), count: 0 };
            entry.count += 1;
            counts.set(key, entry);
        }
    }
    return [...counts.values()].filter((entry) => entry.count >= 2).sort((a, b) => b.count - a.count).slice(0, limit);
}

export interface NewsSnapshotView {
    items: NewsItemView[];
    fetchedAt: string;
    sources: NewsSourceStatus[];
}

/** Newest first, unique by id, capped. */
export function mergeNewsItems(incoming: NewsItemView[], current: NewsItemView[], cap = 240) {
    const seen = new Set<string>();
    const merged: NewsItemView[] = [];
    for (const item of [...incoming, ...current]) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        merged.push(item);
    }
    merged.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    return merged.slice(0, cap);
}
