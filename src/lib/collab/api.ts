/**
 * Browser calls to /api/collab/**. Every failure becomes a CollabRequestError
 * with a code the interface translates (COLLAB_ERROR_COPY in ./copy).
 */
import {
    isCollabErrorCode,
    type CollabChatMessage,
    type CollabErrorCode,
    type CollabFriend,
    type CollabInfoResponse,
    type CollabInvitee,
    type CollabMeta,
    type CollabPollResponse,
    type CollabSignalKind,
} from "./protocol";

export class CollabRequestError extends Error {
    readonly code: CollabErrorCode;
    readonly status: number;
    readonly retryAfterMs: number;

    constructor(code: CollabErrorCode, status = 0, retryAfterMs = 0) {
        super(code);
        this.name = "CollabRequestError";
        this.code = code;
        this.status = status;
        this.retryAfterMs = retryAfterMs;
    }
}

export function collabErrorCode(error: unknown): CollabErrorCode {
    return error instanceof CollabRequestError ? error.code : "network";
}

async function request<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
    const { json, ...rest } = init;
    let response: Response;
    try {
        response = await fetch(url, {
            ...rest,
            cache: "no-store",
            credentials: "same-origin",
            headers: json === undefined ? { Accept: "application/json" } : { "Content-Type": "application/json", Accept: "application/json" },
            body: json === undefined ? undefined : JSON.stringify(json),
        });
    } catch {
        throw new CollabRequestError("network");
    }
    const data = await response.json().catch(() => ({})) as T & { code?: unknown };
    if (!response.ok) {
        const retryAfter = Number(response.headers.get("Retry-After") || 0);
        const fallback: CollabErrorCode = response.status === 401 ? "unauthorized"
            : response.status === 404 ? "not_found"
                : response.status === 410 ? "ended"
                    : response.status === 429 ? "rate_limited"
                        : response.status === 413 ? "payload_too_large" : "unavailable";
        throw new CollabRequestError(isCollabErrorCode(data.code) ? data.code : fallback, response.status, Number.isFinite(retryAfter) ? retryAfter * 1000 : 0);
    }
    return data;
}

export type CollabCreateFile = { id: string; name: string; lang: string; code: string };
export type CollabSyncBody = { client: number; update?: string; awareness?: string; leave?: boolean };
export type CollabOutgoingSignal = { to: string; toClient: number; kind: CollabSignalKind; data: string };

const base = (id: string) => `/api/collab/${encodeURIComponent(id)}`;

export const collabApi = {
    friends: () => request<{ friends: CollabFriend[] }>("/api/collab?view=friends"),
    create: (body: { title: string; files: CollabCreateFile[]; invite: string[] }) => request<{ id: string; meta: CollabMeta }>("/api/collab", { method: "POST", json: body }),
    info: (id: string) => request<CollabInfoResponse>(`${base(id)}?view=info`),
    poll: (id: string, params: { after: number; chat: number; signals: boolean; client: number }) => {
        const query = new URLSearchParams({ after: String(params.after), chat: String(Math.floor(params.chat)), signals: params.signals ? "1" : "0", client: String(params.client) });
        return request<CollabPollResponse>(`${base(id)}?${query.toString()}`);
    },
    join: (id: string) => request<{ ok: true; meta: CollabMeta }>(base(id), { method: "POST", json: { action: "join" } }),
    leave: (id: string) => request<{ ok: true }>(base(id), { method: "POST", json: { action: "leave" } }),
    invite: (id: string, emails: string[]) => request<{ ok: true; invited: CollabInvitee[] }>(base(id), { method: "POST", json: { action: "invite", emails } }),
    remove: (id: string, email: string) => request<{ ok: true; invited: CollabInvitee[]; meta: CollabMeta }>(base(id), { method: "POST", json: { action: "remove", email } }),
    readOnly: (id: string, value: boolean) => request<{ ok: true; meta: CollabMeta }>(base(id), { method: "POST", json: { action: "readOnly", value } }),
    end: (id: string) => request<{ ok: true; meta: CollabMeta | null }>(base(id), { method: "POST", json: { action: "end" } }),
    sync: (id: string, body: CollabSyncBody) => request<{ ok: true; seq: number | null }>(`${base(id)}/sync`, { method: "POST", json: body }),
    chat: (id: string, text: string) => request<{ message: CollabChatMessage }>(`${base(id)}/chat`, { method: "POST", json: { text } }),
    call: (id: string, body: { client: number; signals?: CollabOutgoingSignal[]; ack?: string[] }) => request<{ ok: true }>(`${base(id)}/call`, { method: "POST", json: body }),
};

/**
 * Tells the server this tab is gone (presence removed at once instead of
 * after the 30-second awareness timeout). Works while the page unloads.
 */
export function sendLeaveBeacon(id: string, client: number) {
    const body = JSON.stringify({ client, leave: true });
    try {
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function" && navigator.sendBeacon(`${base(id)}/sync`, body)) return;
    } catch {
        // Falls back to a keepalive request below.
    }
    void fetch(`${base(id)}/sync`, { method: "POST", body, keepalive: true, credentials: "same-origin", headers: { "Content-Type": "application/json" } }).catch(() => undefined);
}

/** Sends the last local edits while the page unloads (keepalive requests are limited to 64 KB). */
export function sendFinalUpdate(id: string, client: number, update: string) {
    if (update.length > 60_000) return false;
    void fetch(`${base(id)}/sync`, { method: "POST", body: JSON.stringify({ client, update }), keepalive: true, credentials: "same-origin", headers: { "Content-Type": "application/json" } }).catch(() => undefined);
    return true;
}
