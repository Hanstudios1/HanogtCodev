/**
 * Heuristic link checker (offline). It looks for common phishing signs; it cannot
 * know whether a site is actually malicious, so verdicts are advisory.
 */

import type { Copy } from "@/lib/i18n";

export type LinkVerdict = "safe" | "caution" | "danger" | "invalid";

export interface LinkSignal {
    id: string;
    weight: number;
    text: Copy;
}

export interface LinkReport {
    verdict: LinkVerdict;
    score: number;
    url: string | null;
    host: string | null;
    signals: LinkSignal[];
    positives: Copy[];
}

const BRANDS: Array<{ name: string; domains: string[] }> = [
    { name: "google", domains: ["google.com", "google.com.tr", "youtube.com", "gmail.com"] },
    { name: "microsoft", domains: ["microsoft.com", "live.com", "outlook.com", "office.com", "xbox.com"] },
    { name: "apple", domains: ["apple.com", "icloud.com"] },
    { name: "facebook", domains: ["facebook.com", "fb.com"] },
    { name: "instagram", domains: ["instagram.com"] },
    { name: "whatsapp", domains: ["whatsapp.com", "whatsapp.net", "wa.me"] },
    { name: "paypal", domains: ["paypal.com"] },
    { name: "netflix", domains: ["netflix.com"] },
    { name: "amazon", domains: ["amazon.com", "amazon.com.tr"] },
    { name: "steam", domains: ["steampowered.com", "steamcommunity.com"] },
    { name: "discord", domains: ["discord.com", "discord.gg", "discordapp.com"] },
    { name: "github", domains: ["github.com", "github.io", "githubusercontent.com"] },
    { name: "binance", domains: ["binance.com", "binance.tr"] },
    { name: "roblox", domains: ["roblox.com"] },
    { name: "epicgames", domains: ["epicgames.com"] },
    { name: "garanti", domains: ["garantibbva.com.tr"] },
    { name: "akbank", domains: ["akbank.com"] },
    { name: "ziraat", domains: ["ziraatbank.com.tr"] },
    { name: "isbank", domains: ["isbank.com.tr"] },
    { name: "yapikredi", domains: ["yapikredi.com.tr"] },
    { name: "turkcell", domains: ["turkcell.com.tr"] },
    { name: "edevlet", domains: ["turkiye.gov.tr"] },
    { name: "hepsiburada", domains: ["hepsiburada.com"] },
    { name: "trendyol", domains: ["trendyol.com"] },
    { name: "sahibinden", domains: ["sahibinden.com"] },
    { name: "papara", domains: ["papara.com"] },
    { name: "hanogt", domains: ["hanogtcodev.com"] },
];

const SHORTENERS = new Set(["bit.ly", "tinyurl.com", "t.co", "goo.gl", "cutt.ly", "is.gd", "rb.gy", "shorturl.at", "ow.ly", "buff.ly", "tiny.cc", "s.id", "t.ly", "v.gd"]);
const RISKY_TLDS = new Set(["zip", "mov", "xyz", "top", "tk", "ml", "ga", "cf", "gq", "click", "country", "kim", "work", "rest", "fit", "loan", "win", "bid", "review", "stream", "download", "support", "icu", "cfd", "sbs", "quest"]);
const EXECUTABLE = /\.(?:exe|scr|msi|bat|cmd|com|pif|vbs|jse?|jar|apk|dmg|pkg|ps1|hta|lnk)$/i;
const BAIT = /(?:login|log-in|signin|sign-in|verify|verification|secure|account|update|wallet|gift|free|bonus|prize|claim|nitro|airdrop|giris|giriş|dogrula|doğrula|hesap|guncelle|güncelle|odul|ödül|hediye|kampanya|bedava|cekilis|çekiliş|edevlet|e-devlet|sifre|şifre)/i;

function levenshtein(a: string, b: string) {
    if (a === b) return 0;
    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
        let diagonal = previous[0];
        previous[0] = i;
        for (let j = 1; j <= b.length; j += 1) {
            const temp = previous[j];
            previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
            diagonal = temp;
        }
    }
    return previous[b.length];
}

/** RFC 3492 punycode decoder for a single label (without the "xn--" prefix). */
function decodePunycode(input: string): string | null {
    const base = 36, tMin = 1, tMax = 26, skew = 38, damp = 700;
    let n = 128, i = 0, bias = 72;
    const output: number[] = [];
    const delimiter = input.lastIndexOf("-");
    for (let index = 0; index < Math.max(0, delimiter); index += 1) output.push(input.charCodeAt(index));
    let position = delimiter > 0 ? delimiter + 1 : 0;
    const adapt = (delta: number, points: number, first: boolean) => {
        delta = first ? Math.floor(delta / damp) : delta >> 1;
        delta += Math.floor(delta / points);
        let k = 0;
        while (delta > ((base - tMin) * tMax) >> 1) {
            delta = Math.floor(delta / (base - tMin));
            k += base;
        }
        return k + Math.floor(((base - tMin + 1) * delta) / (delta + skew));
    };
    while (position < input.length) {
        const oldI = i;
        let w = 1;
        for (let k = base; ; k += base) {
            if (position >= input.length) return null;
            const code = input.charCodeAt(position++);
            const digit = code - 48 < 10 ? code - 22 : code - 65 < 26 ? code - 65 : code - 97 < 26 ? code - 97 : base;
            if (digit >= base) return null;
            i += digit * w;
            const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
            if (digit < t) break;
            w *= base - t;
            if (w > 1e9) return null;
        }
        bias = adapt(i - oldI, output.length + 1, oldI === 0);
        n += Math.floor(i / (output.length + 1));
        i %= output.length + 1;
        output.splice(i, 0, n);
        i += 1;
        if (output.length > 256) return null;
    }
    try {
        return String.fromCodePoint(...output);
    } catch {
        return null;
    }
}

/** Maps look-alike Cyrillic/Greek letters and digits to the Latin letters they imitate. */
const CONFUSABLES: Record<string, string> = { "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ј": "j", "ԁ": "d", "ɡ": "g", "ո": "n", "ս": "u", "ѕ": "s", "ԛ": "q", "ԝ": "w", "ı": "i", "ο": "o", "α": "a", "ρ": "p", "ν": "v", "κ": "k", "τ": "t", "0": "o", "1": "l", "3": "e", "5": "s", "@": "a" };

function skeleton(label: string) {
    return [...label.toLowerCase()].map((char) => CONFUSABLES[char] ?? char).join("").replace(/rn/g, "m").replace(/vv/g, "w");
}

/** Very small "registrable domain" guess (handles common two-part TLDs like com.tr). */
function registrableDomain(host: string) {
    const parts = host.split(".");
    if (parts.length <= 2) return host;
    const twoPart = /^(?:com|net|org|gov|edu|co|gen|web|bel|k12|av|dr|pol|tsk)\.[a-z]{2}$/.test(parts.slice(-2).join("."));
    return parts.slice(twoPart ? -3 : -2).join(".");
}

export function checkLink(input: string): LinkReport {
    const raw = input.trim();
    const signals: LinkSignal[] = [];
    const positives: Copy[] = [];
    if (!raw) return { verdict: "invalid", score: 0, url: null, host: null, signals, positives };
    if (/^(?:javascript|data|vbscript|file):/i.test(raw)) {
        signals.push({ id: "dangerous-scheme", weight: 100, text: { TR: "Bağlantı bir web sitesi değil, tarayıcıda kod/dosya çalıştıran bir şema kullanıyor.", EN: "The link uses a scheme that runs code/files in the browser instead of a website." } });
        return { verdict: "danger", score: 100, url: raw, host: null, signals, positives };
    }
    let url: URL;
    try {
        url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
        return { verdict: "invalid", score: 0, url: null, host: null, signals, positives };
    }
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    const domain = registrableDomain(host);
    const tld = host.split(".").pop() ?? "";

    if (url.protocol === "http:") signals.push({ id: "http", weight: 15, text: { TR: "Şifresiz HTTP: girdiğin bilgiler ağda okunabilir.", EN: "Unencrypted HTTP: data you enter can be read on the network." } });
    else if (url.protocol === "https:") positives.push({ TR: "HTTPS kullanıyor (bu tek başına güvenli olduğu anlamına gelmez).", EN: "Uses HTTPS (this alone does not make it safe)." });
    if (url.username || url.password || /@/.test(raw.split("?")[0].replace(/^[a-z]+:\/\//i, "").split("/")[0])) {
        signals.push({ id: "userinfo", weight: 45, text: { TR: "Adreste @ işareti var: tarayıcı @'den sonraki alana gider, öncesi sadece göz boyamadır.", EN: "The address contains @: the browser goes to the part after @, the rest is a disguise." } });
    }
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) signals.push({ id: "ip-host", weight: 35, text: { TR: "Alan adı yerine çıplak IP adresi kullanılıyor.", EN: "Uses a bare IP address instead of a domain name." } });
    if (host.split(".").some((part) => part.startsWith("xn--")) || /[^\x00-\x7F]/.test(raw.split("/")[2] ?? "")) {
        signals.push({ id: "punycode", weight: 40, text: { TR: "Uluslararası karakterli (punycode) alan adı: harfleri taklit eden sahte bir adres olabilir.", EN: "Internationalized (punycode) domain: it may imitate letters of a real brand." } });
    }
    if (RISKY_TLDS.has(tld)) signals.push({ id: "risky-tld", weight: 20, text: { TR: ".{tld} uzantısı oltalama sitelerinde sık görülür.", EN: "The .{tld} ending is common on phishing sites.", vars: { tld } } });
    if (SHORTENERS.has(domain) || SHORTENERS.has(host)) signals.push({ id: "shortener", weight: 20, text: { TR: "Kısaltılmış bağlantı: gerçek hedef gizleniyor.", EN: "Shortened link: the real destination is hidden." } });
    if (host.split(".").length > 4) signals.push({ id: "deep-subdomain", weight: 15, text: { TR: "Çok fazla alt alan adı var; gerçek alan adını gizlemek için kullanılabilir.", EN: "Many subdomains; often used to hide the real domain." } });
    if (url.port && !["80", "443"].includes(url.port)) signals.push({ id: "port", weight: 10, text: { TR: "Standart dışı port ({port}).", EN: "Non-standard port ({port}).", vars: { port: url.port } } });
    if (raw.length > 180) signals.push({ id: "long", weight: 8, text: { TR: "Alışılmadık derecede uzun adres.", EN: "Unusually long address." } });
    if ((raw.match(/%[0-9a-f]{2}/gi) ?? []).length > 6) signals.push({ id: "encoded", weight: 10, text: { TR: "Çok sayıda kodlanmış karakter içeriyor.", EN: "Contains many encoded characters." } });
    if (EXECUTABLE.test(url.pathname)) signals.push({ id: "executable", weight: 35, text: { TR: "Çalıştırılabilir bir dosya indiriyor; kaynağından emin değilsen açma.", EN: "Downloads an executable file; don't open it unless you trust the source." } });
    if (/\.(?:pdf|docx?|jpe?g|png|mp4)\.(?:exe|scr|bat|js|vbs|apk)$/i.test(url.pathname)) signals.push({ id: "double-extension", weight: 40, text: { TR: "Çift uzantı (ör. fatura.pdf.exe) klasik bir kötü amaçlı yazılım hilesidir.", EN: "A double extension (e.g. invoice.pdf.exe) is a classic malware trick." } });

    const official = BRANDS.find((brand) => brand.domains.some((entry) => domain === entry || host === entry || host.endsWith(`.${entry}`)));
    if (official) {
        positives.push({ TR: "Resmî {brand} alan adına ait görünüyor ({domain}).", EN: "Looks like an official {brand} domain ({domain}).", vars: { brand: official.name, domain } });
    } else {
        const unicodeHost = host.split(".").map((part) => (part.startsWith("xn--") ? decodePunycode(part.slice(4)) ?? part : part)).join(".");
        const tokens = unicodeHost.split(/[.-]/).filter(Boolean);
        for (const brand of BRANDS) {
            // Homograph trick: the label only *looks* like the brand (Cyrillic "а", "paypa1", "rn" for "m").
            const homograph = tokens.some((token) => token !== brand.name && skeleton(token) === brand.name);
            // Short brand names ("apple", "steam") collide with ordinary words, so only long ones get fuzzy matching.
            const fuzzy = brand.name.length >= 6 && tokens.some((token) => token !== brand.name && token.length >= 4 && levenshtein(token, brand.name) <= (brand.name.length >= 8 ? 2 : 1));
            const lookalike = homograph || fuzzy;
            const embedded = tokens.includes(brand.name);
            if (lookalike || embedded) {
                signals.push({
                    id: "brand",
                    weight: lookalike ? 45 : 35,
                    text: lookalike
                        ? { TR: "\"{host}\" adresi {brand} markasını taklit ediyor ama resmî alan adı değil.", EN: "\"{host}\" imitates {brand} but is not its official domain.", vars: { host: unicodeHost, brand: brand.name } }
                        : { TR: "Adreste \"{brand}\" geçiyor ama site {domain} değil.", EN: "The address mentions \"{brand}\" but the site is not {domain}.", vars: { brand: brand.name, domain: brand.domains[0] } },
                });
                break;
            }
        }
    }
    if (BAIT.test(`${host}${url.pathname}`) && !official) signals.push({ id: "bait", weight: 12, text: { TR: "Adreste \"giriş, doğrula, hediye, bedava\" gibi yem kelimeler var.", EN: "The address has bait words like \"login, verify, gift, free\"." } });

    const score = Math.min(100, signals.reduce((sum, signal) => sum + signal.weight, 0));
    const verdict: LinkVerdict = score >= 45 ? "danger" : score >= 15 ? "caution" : "safe";
    return { verdict, score, url: url.toString(), host, signals, positives };
}

/** Extracts the first URL-looking token from free text (used by the chat bot). */
export function findUrl(text: string) {
    const match = /(?:https?:\/\/|www\.)[^\s<>"']{3,}|\b[a-z0-9-]{2,}(?:\.[a-z0-9-]{2,})*\.(?:com|net|org|io|tr|xyz|top|ru|info|app|dev|gg|me|co|ly|site|online|shop|click|zip|mov)(?:\/[^\s<>"']*)?/i.exec(text);
    return match ? match[0] : null;
}
