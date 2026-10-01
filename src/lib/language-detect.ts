import type { Language } from "@/lib/i18n";

/**
 * First-visit language: the visitor's country (from the hosting edge), then the
 * browser's preferred languages. Only used while no language was chosen yet.
 */

const COUNTRY_LANGUAGE: Record<string, Language> = {
    TR: "TR", CY: "EL", AZ: "AZ",
    DE: "DE", AT: "DE", CH: "DE", LI: "DE",
    FR: "FR", MC: "FR", LU: "FR", SN: "FR", CI: "FR", CM: "FR",
    ES: "ES", MX: "ES", AR: "ES", CO: "ES", CL: "ES", PE: "ES", VE: "ES", EC: "ES", GT: "ES", CU: "ES", BO: "ES", DO: "ES", HN: "ES", PY: "ES", SV: "ES", NI: "ES", CR: "ES", PA: "ES", UY: "ES",
    PT: "PT", BR: "PT", AO: "PT", MZ: "PT",
    IT: "IT", SM: "IT", VA: "IT",
    RU: "RU", BY: "RU",
    UA: "UK",
    SA: "AR", AE: "AR", EG: "AR", IQ: "AR", JO: "AR", KW: "AR", LB: "AR", LY: "AR", MA: "AR", OM: "AR", QA: "AR", SY: "AR", TN: "AR", YE: "AR", DZ: "AR", BH: "AR", SD: "AR", PS: "AR",
    IR: "FA", AF: "FA",
    IL: "HE",
    PK: "UR",
    KZ: "KZ", UZ: "UZ", TM: "TK", KG: "KY", GE: "KA",
    JP: "JP", CN: "CN", TW: "TW", HK: "TW", MO: "TW", KR: "KR",
    IN: "HI", BD: "BN", TH: "TH", ID: "ID", VN: "VI", MY: "MS", BN: "MS", PH: "TL",
    KE: "SW", TZ: "SW", UG: "SW", NG: "NG",
    NL: "NL", BE: "BE", PL: "PL", CZ: "CS", SK: "SK", RO: "RO", MD: "RO", HU: "HU", BG: "BG",
    RS: "SR", ME: "SR", BA: "HR", HR: "HR", AL: "SQ", XK: "SQ",
    NO: "NO", SE: "SV", DK: "DA", FI: "FI", GR: "EL", LT: "LT",
    US: "EN", GB: "EN", IE: "EN", CA: "EN", AU: "EN", NZ: "EN", ZA: "EN", SG: "EN",
};

/** BCP 47 primary subtag (or full tag) -> site language. */
const BROWSER_LANGUAGE: Record<string, Language> = {
    tr: "TR", en: "EN", de: "DE", fr: "FR", es: "ES", pt: "PT", it: "IT", ru: "RU", uk: "UK", ar: "AR", fa: "FA", he: "HE", iw: "HE", ur: "UR",
    az: "AZ", kk: "KZ", uz: "UZ", tk: "TK", ky: "KY", ka: "KA", ja: "JP", ko: "KR", hi: "HI", bn: "BN", ta: "TA", th: "TH", id: "ID", in: "ID",
    vi: "VI", ms: "MS", fil: "TL", tl: "TL", sw: "SW", pcm: "NG", nl: "NL", pl: "PL", cs: "CS", sk: "SK", ro: "RO", hu: "HU", bg: "BG",
    sr: "SR", hr: "HR", bs: "HR", sq: "SQ", nb: "NO", nn: "NO", no: "NO", sv: "SV", da: "DA", fi: "FI", el: "EL", lt: "LT",
};

export function languageForCountry(country: string | null | undefined): Language | null {
    return country ? COUNTRY_LANGUAGE[country.trim().toUpperCase()] ?? null : null;
}

export function languageForBrowserTag(tag: string): Language | null {
    const lower = tag.trim().toLowerCase();
    if (!lower) return null;
    if (lower === "nl-be") return "BE";
    if (lower.startsWith("zh")) return /hant|-tw|-hk|-mo/.test(lower) ? "TW" : "CN";
    return BROWSER_LANGUAGE[lower.split("-")[0]] ?? null;
}

export function languageForBrowser(tags: readonly string[]): Language | null {
    for (const tag of tags) {
        const match = languageForBrowserTag(tag);
        if (match) return match;
    }
    return null;
}

/** Country first (when known), then the browser's list, then English. */
export function detectLanguage(country: string | null | undefined, browserTags: readonly string[]): Language {
    return languageForCountry(country) ?? languageForBrowser(browserTags) ?? "EN";
}
