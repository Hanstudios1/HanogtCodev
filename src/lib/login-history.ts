/**
 * The account's recent sign-ins, shown only to its owner (Account Settings
 * and the Security page): when, how (password or Google), on what kind of
 * device and from which country. Kept small on purpose: the browser and
 * system family instead of the user agent, the country instead of the IP
 * address, and only the last ten.
 */

export type LoginMethod = "password" | "google";

export interface LoginRecord {
    /** ISO time of the sign-in. */
    at: string;
    method: LoginMethod;
    /** "Chrome · Windows"; empty when the browser couldn't be told. */
    device: string;
    /** Two-letter country code from the edge network; null when unknown. */
    country: string | null;
}

export const LOGIN_HISTORY_MAX = 10;
const DEVICE_MAX = 60;

const BROWSERS: Array<[RegExp, string]> = [
    [/HanogtCodev|Electron\//i, "Hanogt Codev"],
    [/Edg(?:e|A|iOS)?\//, "Edge"],
    [/OPR\/|Opera/, "Opera"],
    [/SamsungBrowser\//, "Samsung Internet"],
    [/YaBrowser\//, "Yandex"],
    [/Firefox\/|FxiOS\//, "Firefox"],
    [/CriOS\/|Chrome\//, "Chrome"],
    [/Version\/[\d.]+.*Safari\//, "Safari"],
];
const SYSTEMS: Array<[RegExp, string]> = [
    [/iPhone/, "iPhone"],
    [/iPad/, "iPad"],
    [/Android/, "Android"],
    [/CrOS/, "ChromeOS"],
    [/Windows/, "Windows"],
    [/Mac OS X|Macintosh/, "macOS"],
    [/Linux/, "Linux"],
];

/** "Chrome · Windows" from a user agent; empty when neither can be told. */
export function deviceLabel(userAgent: string | null | undefined): string {
    const agent = typeof userAgent === "string" ? userAgent.slice(0, 512) : "";
    if (!agent) return "";
    const browser = BROWSERS.find(([pattern]) => pattern.test(agent))?.[1] ?? "";
    const system = SYSTEMS.find(([pattern]) => pattern.test(agent))?.[1] ?? "";
    return [browser, system].filter(Boolean).join(" · ");
}

type HeaderSource = Headers | Record<string, string | string[] | undefined> | null | undefined;

function header(headers: HeaderSource, name: string): string {
    if (!headers) return "";
    if (typeof (headers as Headers).get === "function") return (headers as Headers).get(name) ?? "";
    const value = (headers as Record<string, string | string[] | undefined>)[name];
    return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

/** The visitor's country from Cloudflare or Vercel; null when unknown, Tor or unlisted. */
export function countryFromHeaders(headers: HeaderSource): string | null {
    const value = (header(headers, "cf-ipcountry") || header(headers, "x-vercel-ip-country")).trim().toUpperCase();
    return /^[A-Z]{2}$/.test(value) && value !== "XX" && value !== "T1" ? value : null;
}

const toIso = (value: unknown): string | null => {
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
    if (typeof value === "string" && Number.isFinite(Date.parse(value))) return new Date(Date.parse(value)).toISOString();
    return null;
};

/** Stored or received records, checked: valid entries only, newest first, at most ten. */
export function readLoginHistory(value: unknown): LoginRecord[] {
    if (!Array.isArray(value)) return [];
    const records: LoginRecord[] = [];
    for (const entry of value) {
        if (!entry || typeof entry !== "object") continue;
        const record = entry as Record<string, unknown>;
        const at = toIso(record.at);
        if (!at || (record.method !== "password" && record.method !== "google")) continue;
        records.push({
            at,
            method: record.method,
            device: typeof record.device === "string" ? record.device.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, DEVICE_MAX) : "",
            country: typeof record.country === "string" && /^[A-Z]{2}$/.test(record.country) ? record.country : null,
        });
    }
    return records.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, LOGIN_HISTORY_MAX);
}

/** The history with a new sign-in in front (what the users document stores; dates as Dates). */
export function withLogin(history: unknown, login: { at: Date; method: LoginMethod; userAgent?: string | null; headers?: HeaderSource }) {
    const record: LoginRecord = {
        at: login.at.toISOString(),
        method: login.method,
        device: deviceLabel(login.userAgent ?? header(login.headers, "user-agent")).slice(0, DEVICE_MAX),
        country: countryFromHeaders(login.headers),
    };
    return readLoginHistory([record, ...readLoginHistory(history)]).map((entry) => ({ ...entry, at: new Date(entry.at) }));
}
