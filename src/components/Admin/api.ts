/** Thin fetch wrapper for the admin API: never throws, always returns a typed result. */

export type ApiFailure = {
    ok: false;
    /** HTTP status, or 0 when the request never reached the server. */
    status: number;
    /** Machine-readable `code` from the response body, "network" or "unknown". */
    code: string;
    retryAfter: number | null;
};

export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

export async function adminRequest<T>(
    path: string,
    options: { method?: "GET" | "POST"; body?: Record<string, unknown>; signal?: AbortSignal } = {},
): Promise<ApiResult<T>> {
    let response: Response;
    try {
        response = await fetch(path, {
            method: options.method ?? "GET",
            headers: options.body ? { Accept: "application/json", "Content-Type": "application/json" } : { Accept: "application/json" },
            body: options.body ? JSON.stringify(options.body) : undefined,
            credentials: "same-origin",
            cache: "no-store",
            signal: options.signal,
        });
    } catch {
        return { ok: false, status: 0, code: "network", retryAfter: null };
    }
    const payload = await response.json().catch(() => null) as unknown;
    if (response.ok && payload !== null) return { ok: true, data: payload as T };
    const body = payload && typeof payload === "object" ? payload as { code?: unknown } : {};
    const retryAfter = Number(response.headers.get("Retry-After"));
    return {
        ok: false,
        status: response.status,
        code: typeof body.code === "string" ? body.code : "unknown",
        retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
    };
}

export function adminPost<T>(path: string, body: Record<string, unknown>) {
    return adminRequest<T>(path, { method: "POST", body });
}
