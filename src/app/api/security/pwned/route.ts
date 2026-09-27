import { NextRequest, NextResponse } from "next/server";
import { getClientKey } from "@/lib/server/request-security";

export const runtime = "nodejs";

/**
 * k-anonymity proxy for the Have I Been Pwned "Pwned Passwords" range API.
 * The browser hashes the password with SHA-1 and sends only the first 5 hex characters;
 * the full hash and the password never reach this server. Matching happens in the browser.
 */

const WINDOW_MS = 10 * 60_000;
const LIMIT = 60;
const hits = new Map<string, { count: number; start: number }>();

function allow(key: string) {
    const now = Date.now();
    if (hits.size > 5000) for (const [entry, value] of hits) if (now - value.start > WINDOW_MS) hits.delete(entry);
    const current = hits.get(key);
    if (!current || now - current.start > WINDOW_MS) {
        hits.set(key, { count: 1, start: now });
        return true;
    }
    current.count += 1;
    return current.count <= LIMIT;
}

export async function GET(request: NextRequest) {
    const prefix = (request.nextUrl.searchParams.get("prefix") || "").toUpperCase();
    if (!/^[0-9A-F]{5}$/.test(prefix)) return NextResponse.json({ error: "Geçersiz önek." }, { status: 400 });
    if (!allow(getClientKey(request))) return NextResponse.json({ error: "Çok fazla istek. Biraz sonra tekrar deneyin." }, { status: 429 });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
        const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
            headers: { "Add-Padding": "true", "User-Agent": "HanogtSecurityCenter/1.0" },
            signal: controller.signal,
            cache: "no-store",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        const entries = text.split("\n").map((line) => line.trim().split(":")).filter(([suffix, count]) => /^[0-9A-F]{35}$/.test(suffix ?? "") && Number(count) > 0).map(([suffix, count]) => [suffix, Number(count)] as const);
        return NextResponse.json({ prefix, entries }, { headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400", "X-Content-Type-Options": "nosniff" } });
    } catch {
        return NextResponse.json({ error: "Sızıntı veritabanına şu anda ulaşılamıyor." }, { status: 503 });
    } finally {
        clearTimeout(timer);
    }
}
