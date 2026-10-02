/**
 * Market data behind the News page strip: parsing and derivation only.
 *
 * Nothing in this module opens a connection. `collectMarkets` receives a `fetchText` function, so
 * the server can add timeouts, a user agent and caching, and the tests can replay recorded samples.
 *
 * Nothing is ever estimated. A number is either read from a provider response or computed from two
 * such numbers (gram gold), and an item whose inputs are missing or malformed is left out instead of
 * being guessed.
 */

export const MARKET_ORDER = ["usd-try", "eur-try", "gbp-try", "gram-gold", "ounce-gold", "bist-100", "sp-500", "bitcoin"] as const;
export type MarketId = (typeof MARKET_ORDER)[number];
export type MarketUnit = "TRY" | "USD" | "pts";
/** What `change` is measured against. */
export type ChangeBasis = "previous-business-day" | "previous-close" | "24h";

export interface MarketItem {
    id: MarketId;
    /** Language-neutral short label; the UI localises names such as "Gram altın". */
    label: string;
    value: number;
    /** Absolute change in `unit`, or null when the provider gives no comparison. */
    change: number | null;
    /** Change in percent (1.25 means +1.25 %), or null. */
    changePercent: number | null;
    unit: MarketUnit;
    /** Human readable provider ("TCMB", "gold-api.com + TCMB"…). */
    source: string;
    /** When the underlying quote was published (ISO 8601). */
    updatedAt: string;
    changeBasis: ChangeBasis | null;
    /** Figures behind the headline value, shown in the tooltip. */
    details?: MarketDetails;
}

export interface MarketDetails {
    /** TCMB "Döviz Alış" / "Döviz Satış" per one unit of foreign currency. */
    buying?: number;
    selling?: number;
    /** Inputs of the derived gram-gold price. */
    ounceUsd?: number;
    usdTry?: number;
    /** Bitcoin in Turkish lira, as quoted by the provider. */
    valueTry?: number;
}

export interface MarketsSnapshot {
    items: MarketItem[];
    generatedAt: string;
}

export const TCMB_TODAY_URL = "https://www.tcmb.gov.tr/kurlar/today.xml";
export const GOLD_API_URL = "https://api.gold-api.com/price/XAU";
export const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,try&include_24hr_change=true&include_last_updated_at=true";
export const YAHOO_BIST_URL = "https://query1.finance.yahoo.com/v8/finance/chart/XU100.IS?range=5d&interval=1d";
export const YAHOO_SP500_URL = "https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=5d&interval=1d";
/** Grams in one troy ounce (the price of gold is quoted per troy ounce). */
export const GRAMS_PER_TROY_OUNCE = 31.1034768;

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------

function finiteNumber(value: unknown): number | null {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value.trim());
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function positiveNumber(value: unknown): number | null {
    const parsed = finiteNumber(value);
    return parsed !== null && parsed > 0 ? parsed : null;
}

function round(value: number, digits: number) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function parseJson(text: string | null): unknown {
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

/** An ISO timestamp from a provider value, or `fallback` when it is missing or implausible. */
function isoOr(value: unknown, fallback: Date): string {
    const time = typeof value === "number" ? value * 1000 : typeof value === "string" ? Date.parse(value) : Number.NaN;
    // A quote stamped in the future is a broken clock, not news.
    if (Number.isFinite(time) && time > 0 && time <= fallback.getTime() + 10 * 60_000) return new Date(time).toISOString();
    return fallback.toISOString();
}

/** Change and percent change against a previous value; null/null when there is nothing to compare with. */
export function computeChange(value: number, previous: number | null | undefined): { change: number | null; changePercent: number | null } {
    if (previous === null || previous === undefined || !Number.isFinite(previous) || previous <= 0 || !Number.isFinite(value)) {
        return { change: null, changePercent: null };
    }
    return { change: round(value - previous, 6), changePercent: round(((value - previous) / previous) * 100, 4) };
}

// ---------------------------------------------------------------------------
// TCMB (Central Bank of the Republic of Türkiye) daily indicative rates
// ---------------------------------------------------------------------------

export interface TcmbRate {
    /** "Döviz Alış" per one unit of currency. */
    buying: number | null;
    /** "Döviz Satış" per one unit of currency. */
    selling: number | null;
}

export interface TcmbBulletin {
    /** Bulletin date as YYYY-MM-DD. */
    date: string;
    rates: Record<string, TcmbRate>;
}

function xmlAttribute(tag: string, name: string): string | null {
    const match = new RegExp(`(?:^|[\\s<])${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);
    return match ? (match[1] ?? match[2] ?? "").trim() : null;
}

function xmlText(block: string, tag: string): string | null {
    const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, "i").exec(block);
    return match ? match[1].trim() : null;
}

function isoDate(year: number, month: number, day: number): string | null {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "02.10.2026" (Tarih) or "10/02/2026" (Date) → "2026-10-02". */
function parseBulletinDate(turkish: string | null, american: string | null): string | null {
    const tr = turkish ? /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(turkish) : null;
    if (tr) return isoDate(Number(tr[3]), Number(tr[2]), Number(tr[1]));
    const us = american ? /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(american) : null;
    if (us) return isoDate(Number(us[3]), Number(us[1]), Number(us[2]));
    return null;
}

/**
 * Parses https://www.tcmb.gov.tr/kurlar/today.xml (or an archived bulletin). Rates are normalised
 * to one unit of currency (the file quotes JPY and a few others per 100). Returns null when the
 * document is not a readable bulletin.
 */
export function parseTcmbBulletin(xml: string | null): TcmbBulletin | null {
    if (!xml) return null;
    const header = /<Tarih_Date\b[^>]*>/i.exec(xml);
    if (!header) return null;
    const date = parseBulletinDate(xmlAttribute(header[0], "Tarih"), xmlAttribute(header[0], "Date"));
    if (!date) return null;
    const rates: Record<string, TcmbRate> = {};
    for (const match of xml.matchAll(/<Currency\b([^>]*)>([\s\S]*?)<\/Currency>/gi)) {
        const code = (xmlAttribute(match[1], "Kod") ?? xmlAttribute(match[1], "CurrencyCode") ?? "").toUpperCase();
        if (!/^[A-Z]{3}$/.test(code)) continue;
        const unit = positiveNumber(xmlText(match[2], "Unit")) ?? 1;
        const buying = positiveNumber(xmlText(match[2], "ForexBuying"));
        const selling = positiveNumber(xmlText(match[2], "ForexSelling"));
        if (buying === null && selling === null) continue;
        rates[code] = {
            buying: buying === null ? null : round(buying / unit, 6),
            selling: selling === null ? null : round(selling / unit, 6),
        };
    }
    return Object.keys(rates).length ? { date, rates } : null;
}

/** URL of an archived bulletin: https://www.tcmb.gov.tr/kurlar/202610/01102026.xml for 2026-10-01. */
export function tcmbArchiveUrl(date: string): string {
    const [year, month, day] = date.split("-");
    return `https://www.tcmb.gov.tr/kurlar/${year}${month}/${day}${month}${year}.xml`;
}

/** The `count` weekdays before `date` (YYYY-MM-DD), nearest first. TCMB publishes on business days only. */
export function previousWeekdays(date: string, count: number): string[] {
    const [year, month, day] = date.split("-").map(Number);
    const cursor = new Date(Date.UTC(year, month - 1, day));
    const days: string[] = [];
    while (days.length < count) {
        cursor.setUTCDate(cursor.getUTCDate() - 1);
        const weekday = cursor.getUTCDay();
        if (weekday === 0 || weekday === 6) continue;
        days.push(cursor.toISOString().slice(0, 10));
    }
    return days;
}

/** Rates are announced at 15:30 Turkey time (UTC+3 all year) on every business day. */
export function tcmbPublishedAt(date: string): string {
    return new Date(`${date}T15:30:00+03:00`).toISOString();
}

const FX_PAIRS: ReadonlyArray<{ id: MarketId; code: string; label: string }> = [
    { id: "usd-try", code: "USD", label: "USD/TRY" },
    { id: "eur-try", code: "EUR", label: "EUR/TRY" },
    { id: "gbp-try", code: "GBP", label: "GBP/TRY" },
];

/**
 * USD, EUR and GBP against the lira from the TCMB bulletin: the "Döviz Satış" rate (the "Döviz Alış"
 * one when no selling rate is published), compared with the previous business day's bulletin.
 */
export function buildFxItems(current: TcmbBulletin, previous: TcmbBulletin | null): MarketItem[] {
    const updatedAt = tcmbPublishedAt(current.date);
    const items: MarketItem[] = [];
    for (const pair of FX_PAIRS) {
        const rate = current.rates[pair.code];
        if (!rate) continue;
        const field: "selling" | "buying" | null = rate.selling !== null ? "selling" : rate.buying !== null ? "buying" : null;
        if (!field) continue;
        const value = rate[field] as number;
        const { change, changePercent } = computeChange(value, previous?.rates[pair.code]?.[field]);
        items.push({
            id: pair.id,
            label: pair.label,
            value,
            change,
            changePercent,
            unit: "TRY",
            source: "TCMB",
            updatedAt,
            changeBasis: change === null ? null : "previous-business-day",
            details: { ...(rate.buying !== null ? { buying: rate.buying } : {}), ...(rate.selling !== null ? { selling: rate.selling } : {}) },
        });
    }
    return items;
}

// ---------------------------------------------------------------------------
// Gold (spot ounce in USD → gram in TRY)
// ---------------------------------------------------------------------------

export interface GoldQuote {
    ounceUsd: number;
    updatedAt: string;
}

/** gold-api.com `GET /price/XAU` → `{ "symbol": "XAU", "price": 3345.1, "updatedAt": "2025-06-02T10:55:09Z", … }`. */
export function parseGoldQuote(text: string | null, now: Date): GoldQuote | null {
    const data = asRecord(parseJson(text));
    if (!data) return null;
    if (typeof data.symbol === "string" && data.symbol.toUpperCase() !== "XAU") return null;
    const ounceUsd = positiveNumber(data.price);
    if (ounceUsd === null) return null;
    return { ounceUsd, updatedAt: isoOr(data.updatedAt, now) };
}

/** Gram price in lira: ounce price in USD ÷ 31.1035 grams × USD/TRY. */
export function deriveGramGold(ounceUsd: number, usdTry: number): number {
    return (ounceUsd / GRAMS_PER_TROY_OUNCE) * usdTry;
}

export function buildGramGoldItem(quote: GoldQuote, usdTry: number): MarketItem {
    return {
        id: "gram-gold",
        label: "Gram gold",
        value: round(deriveGramGold(quote.ounceUsd, usdTry), 2),
        change: null,
        changePercent: null,
        unit: "TRY",
        source: "gold-api.com + TCMB",
        updatedAt: quote.updatedAt,
        changeBasis: null,
        details: { ounceUsd: quote.ounceUsd, usdTry },
    };
}

/** The spot price itself, in dollars per troy ounce. */
export function buildOunceGoldItem(quote: GoldQuote): MarketItem {
    return {
        id: "ounce-gold",
        label: "Gold (oz)",
        value: round(quote.ounceUsd, 2),
        change: null,
        changePercent: null,
        unit: "USD",
        source: "gold-api.com",
        updatedAt: quote.updatedAt,
        changeBasis: null,
    };
}

// ---------------------------------------------------------------------------
// Bitcoin (CoinGecko simple price)
// ---------------------------------------------------------------------------

export interface BitcoinQuote {
    usd: number;
    try: number | null;
    /** 24-hour change of the USD price in percent. */
    changePercent: number | null;
    updatedAt: string;
}

/** CoinGecko `/simple/price?ids=bitcoin&vs_currencies=usd,try&include_24hr_change=true&include_last_updated_at=true`. */
export function parseBitcoinQuote(text: string | null, now: Date): BitcoinQuote | null {
    const bitcoin = asRecord(asRecord(parseJson(text))?.bitcoin);
    if (!bitcoin) return null;
    const usd = positiveNumber(bitcoin.usd);
    if (usd === null) return null;
    return {
        usd,
        try: positiveNumber(bitcoin.try),
        changePercent: finiteNumber(bitcoin.usd_24h_change),
        updatedAt: isoOr(bitcoin.last_updated_at, now),
    };
}

export function buildBitcoinItem(quote: BitcoinQuote): MarketItem {
    const pct = quote.changePercent;
    // The provider reports a percentage; the absolute move is that percentage of the price 24 hours ago.
    const comparable = pct !== null && pct > -100;
    return {
        id: "bitcoin",
        label: "Bitcoin",
        value: quote.usd,
        change: comparable ? round(quote.usd - quote.usd / (1 + pct / 100), 2) : null,
        changePercent: comparable ? round(pct, 2) : null,
        unit: "USD",
        source: "CoinGecko",
        updatedAt: quote.updatedAt,
        changeBasis: comparable ? "24h" : null,
        ...(quote.try !== null ? { details: { valueTry: quote.try } } : {}),
    };
}

// ---------------------------------------------------------------------------
// Stock indices (Yahoo Finance chart endpoint): BIST 100 (XU100.IS) and the S&P 500 (^GSPC)
// ---------------------------------------------------------------------------

export interface IndexQuote {
    value: number;
    /** Close of the session before the one `value` belongs to. */
    previousClose: number | null;
    updatedAt: string;
}
export type BistQuote = IndexQuote;

/** Calendar day at the exchange for a Unix timestamp in seconds. */
function exchangeDay(seconds: number, offsetSeconds: number) {
    return new Date((seconds + offsetSeconds) * 1000).toISOString().slice(0, 10);
}

/**
 * Yahoo Finance `v8/finance/chart/<symbol>?range=5d&interval=1d` for one index. The previous close is
 * read from the daily bars (`chartPreviousClose` of a 5-day range is the close *before the whole
 * range*, which is not yesterday). Sessions are told apart by the exchange's own calendar day: the
 * response's `gmtoffset`, or `defaultOffsetSeconds` when it is missing.
 */
export function parseIndexQuote(text: string | null, now: Date, symbol: string, defaultOffsetSeconds: number): IndexQuote | null {
    const result = asRecord((asRecord(asRecord(parseJson(text))?.chart)?.result as unknown[] | undefined)?.[0]);
    const meta = asRecord(result?.meta);
    if (!result || !meta) return null;
    if (typeof meta.symbol === "string" && meta.symbol.toUpperCase() !== symbol.toUpperCase()) return null;
    const offset = finiteNumber(meta.gmtoffset) ?? defaultOffsetSeconds;

    const times = result.timestamp;
    const quote = asRecord((asRecord(result.indicators)?.quote as unknown[] | undefined)?.[0]);
    const closes = quote?.close;
    const bars: Array<{ time: number; close: number }> = [];
    if (Array.isArray(times) && Array.isArray(closes)) {
        for (let index = 0; index < Math.min(times.length, closes.length); index += 1) {
            const time = finiteNumber(times[index]);
            const close = positiveNumber(closes[index]);
            if (time !== null && close !== null) bars.push({ time, close });
        }
    }

    const last = bars[bars.length - 1];
    const value = positiveNumber(meta.regularMarketPrice) ?? last?.close ?? null;
    if (value === null) return null;
    const marketTime = finiteNumber(meta.regularMarketTime) ?? last?.time ?? null;

    let previousClose: number | null = null;
    if (last) {
        // When the newest bar is the session of the quote, yesterday is the bar before it; when the
        // daily bar for the quote's session is missing, the newest bar already is yesterday.
        const sameSession = marketTime === null || exchangeDay(last.time, offset) === exchangeDay(marketTime, offset);
        previousClose = sameSession ? (bars[bars.length - 2]?.close ?? null) : last.close;
    } else {
        previousClose = positiveNumber(meta.previousClose);
    }
    return { value, previousClose, updatedAt: marketTime !== null ? isoOr(marketTime, now) : now.toISOString() };
}

/** BIST 100: Borsa Istanbul, UTC+3 all year. */
export function parseBistQuote(text: string | null, now: Date): IndexQuote | null {
    return parseIndexQuote(text, now, "XU100.IS", 3 * 3600);
}

/** S&P 500: New York; the response's gmtoffset follows daylight saving, UTC-5 is the fallback. */
export function parseSp500Quote(text: string | null, now: Date): IndexQuote | null {
    return parseIndexQuote(text, now, "^GSPC", -5 * 3600);
}

function buildIndexItem(id: "bist-100" | "sp-500", label: string, quote: IndexQuote): MarketItem {
    const { change, changePercent } = computeChange(quote.value, quote.previousClose);
    return {
        id,
        label,
        value: quote.value,
        change: change === null ? null : round(change, 2),
        changePercent: changePercent === null ? null : round(changePercent, 2),
        unit: "pts",
        source: "Yahoo Finance",
        updatedAt: quote.updatedAt,
        changeBasis: change === null ? null : "previous-close",
    };
}

export function buildBistItem(quote: IndexQuote): MarketItem {
    return buildIndexItem("bist-100", "BIST 100", quote);
}

export function buildSp500Item(quote: IndexQuote): MarketItem {
    return buildIndexItem("sp-500", "S&P 500", quote);
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export type MarketProvider = "tcmb" | "gold" | "bitcoin" | "bist" | "sp500";

export interface MarketFailure {
    provider: MarketProvider;
    reason: string;
    /** Items that could not be produced because of this failure. */
    ids: MarketId[];
}

export interface CollectResult {
    /** In display order. */
    items: MarketItem[];
    failures: MarketFailure[];
}

/** Archived bulletins never change, so the previous business day is looked up once per bulletin date. */
export interface MarketsMemo {
    previousBulletins: Map<string, TcmbBulletin>;
}

export function createMarketsMemo(): MarketsMemo {
    return { previousBulletins: new Map() };
}

export interface CollectOptions {
    /** Returns the response body, null for "not found" (HTTP 404/410), and throws for anything else. */
    fetchText: (url: string) => Promise<string | null>;
    now?: Date;
    memo?: MarketsMemo;
}

type FetchText = CollectOptions["fetchText"];

async function requireText(fetchText: FetchText, url: string) {
    const body = await fetchText(url);
    if (body === null) throw new Error("not found");
    return body;
}

/**
 * The bulletin of the business day before `date`. Nearby weekdays are tried first (two at once), then
 * progressively further back, so a public holiday or a long bayram break still resolves.
 */
async function findPreviousBulletin(date: string, fetchText: FetchText, memo: MarketsMemo): Promise<TcmbBulletin | null> {
    const known = memo.previousBulletins.get(date);
    if (known) return known;
    const candidates = previousWeekdays(date, 8);
    for (const group of [candidates.slice(0, 2), candidates.slice(2, 5), candidates.slice(5)]) {
        const found = await Promise.all(group.map(async (candidate) => {
            try {
                const bulletin = parseTcmbBulletin(await fetchText(tcmbArchiveUrl(candidate)));
                return bulletin && bulletin.date === candidate ? bulletin : null;
            } catch {
                return null;
            }
        }));
        const nearest = found.find((bulletin): bulletin is TcmbBulletin => bulletin !== null);
        if (nearest) {
            memo.previousBulletins.set(date, nearest);
            while (memo.previousBulletins.size > 8) {
                const oldest = memo.previousBulletins.keys().next().value;
                if (oldest === undefined) break;
                memo.previousBulletins.delete(oldest);
            }
            return nearest;
        }
    }
    return null;
}

function reasonOf(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Fetches and parses every provider independently: a failing provider only removes its own items.
 * Gram gold needs both the gold quote and the TCMB dollar rate; ounce gold only the gold quote.
 */
export async function collectMarkets(options: CollectOptions): Promise<CollectResult> {
    const { fetchText } = options;
    const now = options.now ?? new Date();
    const memo = options.memo ?? createMarketsMemo();

    const tcmb = async () => {
        const bulletin = parseTcmbBulletin(await requireText(fetchText, TCMB_TODAY_URL));
        if (!bulletin) throw new Error("unreadable bulletin");
        // The comparison is optional: without it the rates are shown with no change.
        const previous = await findPreviousBulletin(bulletin.date, fetchText, memo).catch(() => null);
        return buildFxItems(bulletin, previous && previous.date < bulletin.date ? previous : null);
    };
    const gold = async () => {
        const quote = parseGoldQuote(await requireText(fetchText, GOLD_API_URL), now);
        if (!quote) throw new Error("unreadable quote");
        return quote;
    };
    const bitcoin = async () => {
        const quote = parseBitcoinQuote(await requireText(fetchText, COINGECKO_URL), now);
        if (!quote) throw new Error("unreadable quote");
        return buildBitcoinItem(quote);
    };
    const bist = async () => {
        const quote = parseBistQuote(await requireText(fetchText, YAHOO_BIST_URL), now);
        if (!quote) throw new Error("unreadable quote");
        return buildBistItem(quote);
    };
    const sp500 = async () => {
        const quote = parseSp500Quote(await requireText(fetchText, YAHOO_SP500_URL), now);
        if (!quote) throw new Error("unreadable quote");
        return buildSp500Item(quote);
    };

    const [fxResult, goldResult, bitcoinResult, bistResult, sp500Result] = await Promise.allSettled([tcmb(), gold(), bitcoin(), bist(), sp500()]);
    const items: MarketItem[] = [];
    const failures: MarketFailure[] = [];

    let usdTry: number | null = null;
    if (fxResult.status === "fulfilled") {
        items.push(...fxResult.value);
        usdTry = fxResult.value.find((item) => item.id === "usd-try")?.value ?? null;
        const missing = FX_PAIRS.filter((pair) => !fxResult.value.some((item) => item.id === pair.id)).map((pair) => pair.id);
        if (missing.length) failures.push({ provider: "tcmb", reason: "currency missing from bulletin", ids: missing });
    } else {
        failures.push({ provider: "tcmb", reason: reasonOf(fxResult.reason), ids: [...FX_PAIRS.map((pair) => pair.id), "gram-gold"] });
    }

    if (goldResult.status === "rejected") {
        failures.push({ provider: "gold", reason: reasonOf(goldResult.reason), ids: ["gram-gold", "ounce-gold"] });
    } else {
        items.push(buildOunceGoldItem(goldResult.value));
        if (usdTry !== null) items.push(buildGramGoldItem(goldResult.value, usdTry));
        else if (fxResult.status === "fulfilled") failures.push({ provider: "tcmb", reason: "no USD rate to price gold in lira", ids: ["gram-gold"] });
    }

    if (bistResult.status === "fulfilled") items.push(bistResult.value);
    else failures.push({ provider: "bist", reason: reasonOf(bistResult.reason), ids: ["bist-100"] });

    if (sp500Result.status === "fulfilled") items.push(sp500Result.value);
    else failures.push({ provider: "sp500", reason: reasonOf(sp500Result.reason), ids: ["sp-500"] });

    if (bitcoinResult.status === "fulfilled") items.push(bitcoinResult.value);
    else failures.push({ provider: "bitcoin", reason: reasonOf(bitcoinResult.reason), ids: ["bitcoin"] });

    items.sort((a, b) => MARKET_ORDER.indexOf(a.id) - MARKET_ORDER.indexOf(b.id));
    return { items, failures };
}

/** Ids that could not be produced in a collection run. */
export function failedMarketIds(result: CollectResult): MarketId[] {
    const present = new Set(result.items.map((item) => item.id));
    return [...new Set(result.failures.flatMap((failure) => failure.ids))].filter((id) => !present.has(id));
}
