/** Fuzzy matching for the command palette and language pickers (dependency-free). */

/** Lower-cases and strips accents so "kaydet" finds "Kaydet" and "calistir" finds "Çalıştır". */
export function searchKey(text: string): string {
    return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").replace(/İ/g, "i").toLowerCase();
}

/** 0 when nothing matches; higher is better (prefix > word start > substring > subsequence). */
export function matchScore(query: string, text: string): number {
    const needle = searchKey(query).trim();
    if (!needle) return 1;
    const haystack = searchKey(text);
    const index = haystack.indexOf(needle);
    if (index === 0) return 100 - Math.min(50, haystack.length / 10);
    if (index > 0) return (/[\s\-_./:]/.test(haystack[index - 1]) ? 80 : 60) - Math.min(40, index);
    // Subsequence match ("nwf" → "new file").
    let position = 0;
    let gaps = 0;
    for (const char of needle) {
        const found = haystack.indexOf(char, position);
        if (found < 0) return 0;
        gaps += found - position;
        position = found + 1;
    }
    return Math.max(1, 30 - gaps);
}
