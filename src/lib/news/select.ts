/**
 * Picks which collected stories make it into the shared snapshot. Pure so it can be tested:
 * newest first, de-duplicated by link id and by headline, with a ceiling per category so a busy
 * wire service (dozens of finance stories an hour) cannot push the slower tech feeds out.
 */

export interface SelectableItem {
    id: string;
    title: string;
    publishedAt: string;
    category: string;
}

export interface SelectOptions {
    /** Current time in ms. */
    now: number;
    /** Stories older than this are dropped. */
    maxAgeMs: number;
    maxItems: number;
    perCategory: number;
}

/**
 * Headline fingerprint: ignores case, punctuation and accents, first 90 characters. Turkish
 * lower-casing would turn "NVIDIA" into "nvıdıa" and never match "Nvidia", so "I", "İ" and "ı" are all
 * folded to "i" instead; the same wire story from two outlets then matches however it is capitalised.
 */
export function normalizeTitle(title: string) {
    return title.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/ı/g, "i").replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 90);
}

export function selectItems<T extends SelectableItem>(candidates: readonly T[], options: SelectOptions): T[] {
    const sorted = [...candidates].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    const cutoff = options.now - options.maxAgeMs;
    const seenIds = new Set<string>();
    const seenTitles = new Set<string>();
    const perCategory = new Map<string, number>();
    const items: T[] = [];
    for (const item of sorted) {
        if (Date.parse(item.publishedAt) < cutoff) continue;
        const titleKey = normalizeTitle(item.title);
        if (seenIds.has(item.id) || seenTitles.has(titleKey)) continue;
        const used = perCategory.get(item.category) ?? 0;
        if (used >= options.perCategory) continue;
        seenIds.add(item.id);
        seenTitles.add(titleKey);
        perCategory.set(item.category, used + 1);
        items.push(item);
        if (items.length >= options.maxItems) break;
    }
    return items;
}
