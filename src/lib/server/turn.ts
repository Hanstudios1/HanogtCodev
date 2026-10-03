import "server-only";

import { createHash, createHmac } from "node:crypto";

/*
 * ICE servers for Hanogt Social's voice calls (/api/calls/ice). STUN finds
 * a direct path on most home networks; mobile carriers, company and school
 * networks need a TURN relay. Three ways to get one, the first configured wins:
 *   1. Cloudflare Realtime TURN (1,000 GB a month free): CLOUDFLARE_TURN_KEY_ID
 *      and CLOUDFLARE_TURN_KEY_API_TOKEN; short-lived credentials per request.
 *   2. Own coturn with the TURN REST API: TURN_SERVER_URL + TURN_SHARED_SECRET.
 *   3. A provider that gives fixed credentials: TURN_SERVER_URL +
 *      TURN_USERNAME + TURN_CREDENTIAL.
 * Audio stays end-to-end encrypted (DTLS-SRTP); a relay only forwards it.
 */

export type TurnProvider = "cloudflare" | "coturn" | "static" | "none";

export type IceConfig = {
    iceServers: RTCIceServer[];
    turnConfigured: boolean;
    provider: TurnProvider;
    /** Why the configured TURN couldn't be used this time (the call still gets STUN). */
    problem: string | null;
};

type Env = Record<string, string | undefined>;

const STUN: RTCIceServer = { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun.cloudflare.com:3478"] };
const CLOUDFLARE_API = "https://rtc.live.cloudflare.com/v1/turn/keys";
const CREDENTIAL_TTL_SECONDS = 3_600;
const CLOUDFLARE_TIMEOUT_MS = 5_000;

function value(env: Env, ...names: string[]) {
    for (const name of names) {
        const text = env[name]?.trim();
        if (text) return text;
    }
    return "";
}

function cloudflareKeys(env: Env) {
    const keyId = value(env, "CLOUDFLARE_TURN_KEY_ID", "CLOUDFLARE_TURN_TOKEN_ID");
    const token = value(env, "CLOUDFLARE_TURN_KEY_API_TOKEN", "CLOUDFLARE_TURN_API_TOKEN");
    return keyId && token ? { keyId, token } : null;
}

/** The configured TURN option (without contacting anyone). */
export function turnProvider(env: Env = process.env): TurnProvider {
    if (cloudflareKeys(env)) return "cloudflare";
    if (!value(env, "TURN_SERVER_URL")) return "none";
    if (value(env, "TURN_SHARED_SECRET")) return "coturn";
    if (value(env, "TURN_USERNAME") && value(env, "TURN_CREDENTIAL")) return "static";
    return "none";
}

/** stun:/turn:/turns: URLs only; port 53 is dropped (browsers refuse it and it only slows gathering down). */
export function cleanIceUrls(input: unknown): string[] {
    const list = Array.isArray(input) ? input : typeof input === "string" ? [input] : [];
    return list
        .filter((url): url is string => typeof url === "string")
        .map((url) => url.trim())
        .filter((url) => /^(?:stun|turns?):[^\s"'<>]{1,200}$/i.test(url) && !/:53(?:[/?]|$)/.test(url))
        .slice(0, 12);
}

function credentialText(input: unknown) {
    return typeof input === "string" && input.length > 0 && input.length <= 512 && !/[\u0000-\u001f]/.test(input) ? input : null;
}

/** Cloudflare's answer, in either shape it has used ({ iceServers: [...] } or a single object). */
export function readCloudflareIceServers(payload: unknown): RTCIceServer[] {
    const raw = (payload as { iceServers?: unknown } | null)?.iceServers;
    const entries = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
    const servers: RTCIceServer[] = [];
    for (const entry of entries) {
        const record = entry as { urls?: unknown; username?: unknown; credential?: unknown };
        const urls = cleanIceUrls(record.urls);
        if (!urls.length) continue;
        const username = credentialText(record.username);
        const credential = credentialText(record.credential);
        const turn = urls.filter((url) => /^turns?:/i.test(url));
        const stun = urls.filter((url) => /^stun:/i.test(url));
        if (turn.length && username && credential) servers.push({ urls: turn, username, credential });
        if (stun.length) servers.push({ urls: stun });
    }
    return servers;
}

/**
 * Opaque, stable id of a person for TURN usernames. The username travels in
 * clear text in STUN/TURN messages and lands in the TURN server's logs, so it
 * must not be the e-mail address. The salt is a server secret the TURN
 * operator doesn't have (not TURN_SHARED_SECRET), so the id can't be matched
 * against a list of known addresses either.
 */
function turnUserId(email: string, env: Env) {
    const salt = value(env, "RATE_LIMIT_SALT", "NEXTAUTH_SECRET", "AUTH_SECRET") || "hanogt";
    return createHash("sha256").update(`${salt}:turn-user:${email}`).digest("hex").slice(0, 24);
}

async function cloudflareServers(keys: { keyId: string; token: string }, fetcher: typeof fetch): Promise<RTCIceServer[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLOUDFLARE_TIMEOUT_MS);
    try {
        const response = await fetcher(`${CLOUDFLARE_API}/${encodeURIComponent(keys.keyId)}/credentials/generate-ice-servers`, {
            method: "POST",
            headers: { Authorization: `Bearer ${keys.token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ ttl: CREDENTIAL_TTL_SECONDS }),
            cache: "no-store",
            signal: controller.signal,
        });
        if (!response.ok) throw new Error(`cloudflare_${response.status}`);
        const servers = readCloudflareIceServers(await response.json().catch(() => null));
        if (!servers.some((server) => server.username)) throw new Error("cloudflare_empty");
        return servers;
    } catch (error) {
        throw new Error(error instanceof Error && error.message.startsWith("cloudflare_") ? error.message : controller.signal.aborted ? "cloudflare_timeout" : "cloudflare_unreachable");
    } finally {
        clearTimeout(timer);
    }
}

/** ICE servers for one call of `email` (TURN when configured, STUN always). */
export async function iceServersFor(email: string, env: Env = process.env, fetcher: typeof fetch = fetch): Promise<IceConfig> {
    const provider = turnProvider(env);
    const iceServers: RTCIceServer[] = [STUN];
    if (provider === "cloudflare") {
        try {
            const servers = await cloudflareServers(cloudflareKeys(env)!, fetcher);
            return { iceServers: [...iceServers, ...servers], turnConfigured: true, provider, problem: null };
        } catch (error) {
            // A Cloudflare outage or a revoked key: the call still tries STUN.
            const problem = error instanceof Error ? error.message : "cloudflare_failed";
            console.warn("[calls] TURN credentials unavailable:", problem);
            return { iceServers, turnConfigured: false, provider, problem };
        }
    }
    const urls = cleanIceUrls(value(env, "TURN_SERVER_URL").split(","));
    if (provider === "coturn" && urls.length) {
        // TURN REST API: username "<expiry>:<user id>", password base64(HMAC-SHA1(secret, username)).
        const expires = Math.floor(Date.now() / 1000) + CREDENTIAL_TTL_SECONDS;
        const username = `${expires}:${turnUserId(email, env)}`;
        const credential = createHmac("sha1", value(env, "TURN_SHARED_SECRET")).update(username).digest("base64");
        return { iceServers: [...iceServers, { urls, username, credential }], turnConfigured: true, provider, problem: null };
    }
    if (provider === "static" && urls.length) {
        return { iceServers: [...iceServers, { urls, username: value(env, "TURN_USERNAME"), credential: value(env, "TURN_CREDENTIAL") }], turnConfigured: true, provider, problem: null };
    }
    return { iceServers, turnConfigured: false, provider: provider === "none" ? "none" : provider, problem: provider === "none" ? null : "turn_url_invalid" };
}

/** Cloud Health: is TURN set up, and does Cloudflare hand out credentials? */
export async function checkTurn(env: Env = process.env, fetcher: typeof fetch = fetch): Promise<{ provider: TurnProvider; ok: boolean; problem: string | null; urls: string[] }> {
    const provider = turnProvider(env);
    if (provider === "none") return { provider, ok: false, problem: value(env, "TURN_SERVER_URL") ? "turn_credentials_missing" : "turn_missing", urls: [] };
    const config = await iceServersFor("cloud-health@hanogt.invalid", env, fetcher);
    const urls = config.iceServers.filter((server) => server.username).flatMap((server) => (Array.isArray(server.urls) ? server.urls : [server.urls]));
    return { provider, ok: config.turnConfigured, problem: config.problem, urls };
}
