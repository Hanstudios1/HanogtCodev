import type { MarketItem } from "@/lib/news/markets";

/** Number/date formatting for the markets strip (pure, so it can be tested without a browser). */

export type MarketDirection = "up" | "down" | "flat";

type Formattable = Pick<MarketItem, "id" | "value" | "unit">;

/** Exchange rates are quoted to four decimals, gold and indices to two, bitcoin to whole dollars. */
function fractionDigits(item: Formattable) {
    if (item.id === "usd-try" || item.id === "eur-try" || item.id === "gbp-try") return 4;
    if (item.unit === "USD") return item.value >= 1000 ? 0 : 2;
    return 2;
}

function numberFormat(locale: string, options: Intl.NumberFormatOptions) {
    try {
        return new Intl.NumberFormat(locale, options);
    } catch {
        return new Intl.NumberFormat("en-US", options);
    }
}

/** "₺41,5761", "$67,234" or "10.250,50" depending on the unit and locale. */
export function formatMarketValue(item: Formattable, locale: string): string {
    const digits = fractionDigits(item);
    if (item.unit === "pts") return numberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(item.value);
    return numberFormat(locale, { style: "currency", currency: item.unit, currencyDisplay: "narrowSymbol", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(item.value);
}

/** A plain figure in the item's precision, without currency symbol ("41,5000"). */
export function formatMarketNumber(item: Formattable, value: number, locale: string): string {
    const digits = fractionDigits(item);
    return numberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/** A money amount with a fixed number of decimals ("$3,345.10"). */
export function formatCurrency(value: number, currency: "TRY" | "USD", digits: number, locale: string): string {
    return numberFormat(locale, { style: "currency", currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/** Direction of the move, or null when the provider gave nothing to compare with. */
export function marketDirection(item: Pick<MarketItem, "change" | "changePercent">): MarketDirection | null {
    if (item.changePercent !== null) {
        // Anything that would print as 0.00 % is "unchanged".
        if (Math.abs(item.changePercent) < 0.005) return "flat";
        return item.changePercent > 0 ? "up" : "down";
    }
    if (item.change !== null) return item.change === 0 ? "flat" : item.change > 0 ? "up" : "down";
    return null;
}

/** "+0,26%" / "−1,20%" (signed, two decimals); empty when there is no change. */
export function formatChangePercent(item: Pick<MarketItem, "changePercent">, locale: string): string {
    if (item.changePercent === null) return "";
    return numberFormat(locale, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(item.changePercent / 100);
}

/** "+0,1093" / "−70,50" in the item's precision; empty when there is no change. */
export function formatChangeAmount(item: Formattable & Pick<MarketItem, "change">, locale: string): string {
    if (item.change === null) return "";
    const digits = fractionDigits(item);
    return numberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay: "exceptZero" }).format(item.change);
}

/** "02.10.2026 15:30" in the viewer's locale and time zone. */
export function formatMarketTime(iso: string, locale: string): string {
    const time = Date.parse(iso);
    if (!Number.isFinite(time)) return "";
    const options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" };
    try {
        return new Date(time).toLocaleString(locale, options);
    } catch {
        return new Date(time).toLocaleString("en-US", options);
    }
}
