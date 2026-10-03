import { API_BASE_PATH } from "@/lib/ai/api-keys";

/*
 * Whether the developer API answers clients that aren't browsers (Admin ›
 * Cloud Health). Behind Cloudflare, the WAF, Bot Fight Mode or Super Bot Fight
 * Mode can answer them with a challenge page, and then apps, bots and scripts
 * never reach /api/v1 even though the site works in a browser. The probe asks
 * for /api/v1/models without a key, the way an API client would, and expects
 * our own 401 `missing_api_key`. No imports from next/server or the admin
 * modules, so tests can load it (the fetch is injectable).
 */

export type ApiProbeResult =
    | { outcome: "ok"; status: number }
    /** Cloudflare answered instead of the site (a challenge or a block page). */
    | { outcome: "challenged"; status: number; detail: string }
    /** Something else answered: a redirect, another error page, an old deployment. */
    | { outcome: "unexpected"; status: number; detail: string }
    | { outcome: "unreachable"; detail: string }
    /** A local or non-HTTPS address: nothing in front of it to check. */
    | { outcome: "local"; detail: string };

export const API_PROBE_USER_AGENT = "HanogtCodev-CloudHealth/1.0 (api-reachability)";
const PROBE_TIMEOUT_MS = 8_000;

export function isLocalOrigin(url: URL) {
    const host = url.hostname;
    return url.protocol !== "https:" || host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0" || host === "[::1]" || /^127\./.test(host);
}

export type ApiProbeAnswer = {
    status: number;
    contentType: string;
    /** Cloudflare's `cf-mitigated` header: "challenge" when it challenged the request. */
    cfMitigated: string | null;
    server: string | null;
    location: string | null;
    /** `error.code` of a JSON answer. */
    code: unknown;
};

/** What the answer to the keyless probe says about the way in. */
export function classifyApiProbe(answer: ApiProbeAnswer): ApiProbeResult {
    const type = answer.contentType.split(";")[0].trim();
    let redirect = "";
    if (answer.status >= 300 && answer.status < 400 && answer.location) {
        try {
            redirect = `→ ${new URL(answer.location, "https://invalid.invalid").host}`;
        } catch {
            redirect = "→ ?";
        }
    }
    const detail = [`HTTP ${answer.status}`, answer.cfMitigated ? `cf-mitigated: ${answer.cfMitigated}` : "", type, redirect].filter(Boolean).join(" · ");
    if (answer.status === 401 && answer.code === "missing_api_key") return { outcome: "ok", status: answer.status };
    const fromCloudflare = (answer.server ?? "").toLowerCase() === "cloudflare";
    if (answer.cfMitigated || (fromCloudflare && !type.includes("json") && [403, 429, 503].includes(answer.status))) {
        return { outcome: "challenged", status: answer.status, detail };
    }
    return { outcome: "unexpected", status: answer.status, detail };
}

/** Asks `origin`'s /api/v1/models without a key, as an API client would (no redirects followed). */
export async function probePublicApi(origin: string, options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<ApiProbeResult> {
    let url: URL;
    try {
        url = new URL(`${API_BASE_PATH}/models`, origin);
    } catch {
        return { outcome: "local", detail: origin.slice(0, 120) };
    }
    if (isLocalOrigin(url)) return { outcome: "local", detail: url.host };
    const fetchImpl = options.fetchImpl ?? fetch;
    try {
        const response = await fetchImpl(url, {
            headers: { "User-Agent": API_PROBE_USER_AGENT, Accept: "application/json" },
            redirect: "manual",
            cache: "no-store",
            signal: AbortSignal.timeout(options.timeoutMs ?? PROBE_TIMEOUT_MS),
        });
        const contentType = response.headers.get("content-type") ?? "";
        let code: unknown = null;
        if (contentType.includes("json")) {
            const body = (await response.json().catch(() => null)) as { error?: { code?: unknown } } | null;
            code = body?.error?.code ?? null;
        } else {
            await response.body?.cancel().catch(() => undefined);
        }
        return classifyApiProbe({
            status: response.status,
            contentType,
            cfMitigated: response.headers.get("cf-mitigated"),
            server: response.headers.get("server"),
            location: response.headers.get("location"),
            code,
        });
    } catch (error) {
        return { outcome: "unreachable", detail: error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 160) : "fetch failed" };
    }
}
