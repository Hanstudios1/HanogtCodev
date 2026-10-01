import "server-only";

/**
 * Market strip for Hanogt News: exchange rates, gold, BIST 100, S&P 500 and
 * Bitcoin. Prices come from Yahoo Finance's public chart endpoint (exchange
 * rates fall back to the ECB reference rates via Frankfurter), are cached for
 * five minutes and may be delayed; any instrument that can't be read is left
 * out instead of failing the whole strip.
 */

export type MarketQuote = { id: string; value: number; change: number | null; currency: "TRY" | "USD" | null; decimals: number };
export type MarketSnapshot = { quotes: MarketQuote[]; updatedAt: string; source: string };

type Instrument = { id: string; symbol: string; currency: MarketQuote["currency"]; decimals: number };

const INSTRUMENTS: Instrument[] = [
    { id: "usdtry", symbol: "USDTRY=X", currency: "TRY", decimals: 4 },
    { id: "eurtry", symbol: "EURTRY=X", currency: "TRY", decimals: 4 },
    { id: "gbptry", symbol: "GBPTRY=X", currency: "TRY", decimals: 4 },
    { id: "gold-oz", symbol: "GC=F", currency: "USD", decimals: 2 },
    { id: "bist100", symbol: "XU100.IS", currency: null, decimals: 2 },
    { id: "sp500", symbol: "^GSPC", currency: null, decimals: 2 },
    { id: "btc", symbol: "BTC-USD", currency: "USD", decimals: 0 },
];

const TROY_OUNCE_GRAMS = 31.1034768;
const CACHE_MS = 5 * 60_000;
const TIMEOUT_MS = 5_000;
const USER_AGENT = "Mozilla/5.0 (compatible; HanogtNewsBot/1.0; +https://hanogtcodev.com/news)";

let cache: { at: number; snapshot: MarketSnapshot } | null = null;
let inflight: Promise<MarketSnapshot> | null = null;

type ChartMeta = { regularMarketPrice?: unknown; chartPreviousClose?: unknown; previousClose?: unknown };

async function yahooQuote(symbol: string): Promise<{ value: number; change: number | null } | null> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return null;
    const data = await response.json() as { chart?: { result?: Array<{ meta?: ChartMeta }> } };
    const meta = data.chart?.result?.[0]?.meta;
    const value = typeof meta?.regularMarketPrice === "number" ? meta.regularMarketPrice : Number.NaN;
    if (!Number.isFinite(value) || value <= 0) return null;
    const previous = typeof meta?.chartPreviousClose === "number" ? meta.chartPreviousClose : typeof meta?.previousClose === "number" ? meta.previousClose : Number.NaN;
    return { value, change: Number.isFinite(previous) && previous > 0 ? (value - previous) / previous : null };
}

/** ECB reference rates (daily, no change figure) when Yahoo can't be reached. */
async function frankfurterRates(): Promise<Record<string, number>> {
    for (const host of ["https://api.frankfurter.dev/v1", "https://api.frankfurter.app"]) {
        try {
            const [usd, eur, gbp] = await Promise.all(["USD", "EUR", "GBP"].map(async (base) => {
                const response = await fetch(`${host}/latest?from=${base}&to=TRY`, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
                const data = response.ok ? await response.json() as { rates?: { TRY?: unknown } } : null;
                return typeof data?.rates?.TRY === "number" ? data.rates.TRY : Number.NaN;
            }));
            const rates = { usdtry: usd, eurtry: eur, gbptry: gbp };
            if (Object.values(rates).some(Number.isFinite)) return rates;
        } catch {
            // Try the next host.
        }
    }
    return {};
}

async function collect(): Promise<MarketSnapshot> {
    const results = await Promise.allSettled(INSTRUMENTS.map((instrument) => yahooQuote(instrument.symbol)));
    const quotes = new Map<string, MarketQuote>();
    INSTRUMENTS.forEach((instrument, index) => {
        const result = results[index];
        if (result.status === "fulfilled" && result.value) {
            quotes.set(instrument.id, { id: instrument.id, value: result.value.value, change: result.value.change, currency: instrument.currency, decimals: instrument.decimals });
        }
    });
    let source = "Yahoo Finance";
    if (!quotes.has("usdtry") || !quotes.has("eurtry")) {
        const rates = await frankfurterRates();
        for (const id of ["usdtry", "eurtry", "gbptry"] as const) {
            if (!quotes.has(id) && Number.isFinite(rates[id])) quotes.set(id, { id, value: rates[id], change: null, currency: "TRY", decimals: 4 });
        }
        if (Object.keys(rates).length) source = quotes.size > 3 ? "Yahoo Finance, ECB" : "ECB";
    }
    // Gram gold in lira = ounce price × USD/TRY ÷ grams per troy ounce.
    const ounce = quotes.get("gold-oz");
    const usd = quotes.get("usdtry");
    if (ounce && usd) {
        const change = ounce.change !== null && usd.change !== null ? (1 + ounce.change) * (1 + usd.change) - 1 : null;
        quotes.set("gold-gram", { id: "gold-gram", value: (ounce.value * usd.value) / TROY_OUNCE_GRAMS, change, currency: "TRY", decimals: 2 });
    }
    const order = ["usdtry", "eurtry", "gbptry", "gold-gram", "gold-oz", "bist100", "sp500", "btc"];
    return {
        quotes: order.map((id) => quotes.get(id)).filter((quote): quote is MarketQuote => Boolean(quote)),
        updatedAt: new Date().toISOString(),
        source,
    };
}

export async function getMarketSnapshot(): Promise<MarketSnapshot> {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.snapshot;
    if (inflight) return inflight;
    inflight = collect()
        .then((snapshot) => {
            // Keep the last good strip when every source fails for a moment.
            if (snapshot.quotes.length || !cache) cache = { at: Date.now(), snapshot };
            else cache = { at: Date.now() - CACHE_MS + 60_000, snapshot: cache.snapshot };
            return cache.snapshot;
        })
        .finally(() => {
            inflight = null;
        });
    return inflight;
}
