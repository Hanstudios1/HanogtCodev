import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

/** Short-lived, readable cookie that carries the reason of a failed sign-in back to /login. */
export const AUTH_ERROR_COOKIE = "hanogt.auth-error";

type AuthRequestState = { reason: string | null };

/** Per-request slot the NextAuth logger fills while the route handler runs. */
export const authRequestContext = new AsyncLocalStorage<AuthRequestState>();

// Only sign-in failures are surfaced; routine noise such as stale session
// cookies (JWT_SESSION_ERROR) must not show up on the login screen.
const REPORTED_CODES = new Set([
    "OAUTH_CALLBACK_ERROR",
    "OAUTH_CALLBACK_HANDLER_ERROR",
    "SIGNIN_OAUTH_ERROR",
    "SIGNIN_CALLBACK_ERROR",
    "CALLBACK_CREDENTIALS_HANDLER_ERROR",
]);

function describe(code: string, metadata: unknown) {
    const candidate = metadata && typeof metadata === "object" && "error" in metadata
        ? (metadata as { error: unknown }).error
        : metadata;
    const message = candidate instanceof Error ? candidate.message : typeof candidate === "string" ? candidate : "";
    return `${code}${message ? `: ${message}` : ""}`
        // One-time values (state, codes, tokens) never leave the server. They mix
        // letters and digits; setting names such as FIREBASE_SERVICE_ACCOUNT_BASE64
        // (capital words joined by underscores) stay readable.
        .replace(/[A-Za-z0-9_-]{24,}/g, (token) => (/\d/.test(token) && /[A-Za-z]/.test(token) && !/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(token) ? "[redacted]" : token))
        // The cookie is URI-encoded, so Unicode is safe; control characters are not.
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .slice(0, 180);
}

/** NextAuth logger hook: keeps Vercel logs and remembers the first sign-in failure of this request. */
export function recordAuthError(code: string, metadata: unknown) {
    console.error(`[next-auth][error][${code}]`, metadata);
    if (!REPORTED_CODES.has(code)) return;
    const state = authRequestContext.getStore();
    if (state && !state.reason) state.reason = describe(code, metadata);
}
