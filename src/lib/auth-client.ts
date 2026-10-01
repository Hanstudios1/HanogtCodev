import { sanitizeTicketText } from "@/lib/support";

/** Only same-origin relative paths are accepted as post-login destinations. */
export function safeCallbackPath(value: string | null) {
    // Browsers drop tabs/newlines and treat "\\" like "/", so "/\t//evil.com"
    // or "/\\evil.com" would leave the site: reject them outright.
    if (!value || !/^\/(?![/\\])/.test(value) || /[\u0000-\u001f\u007f\\]/.test(value)) return "/dashboard";
    if (value.startsWith("/login") || value.startsWith("/signup")) return "/dashboard";
    return value.slice(0, 500);
}

/** Error code used when the auth endpoints cannot be reached at all. */
export const AUTH_NETWORK_ERROR = "Network";

/**
 * Sign-in error of a suspended account. Only after the password (and second
 * factor) or Google proved ownership does it carry an appeal token:
 * "AccountSuspended:<token>" from the credentials sign-in, or
 * "?error=AccountSuspended&appeal=<token>" after Google.
 */
export const ACCOUNT_SUSPENDED = "AccountSuspended";

/** Loose shape check only; /api/support/appeal verifies the signature. */
function isAppealTokenShape(value: string | null | undefined): value is string {
    return typeof value === "string" && value.length <= 512 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(value);
}

/** Splits a sign-in error into its code and, for a verified suspended account, the appeal token. */
export function readAuthError(error: string | null, appeal: string | null = null): { code: string | null; appealToken: string | null } {
    if (!error) return { code: null, appealToken: null };
    if (error.startsWith(`${ACCOUNT_SUSPENDED}:`)) {
        const token = error.slice(ACCOUNT_SUSPENDED.length + 1);
        return { code: ACCOUNT_SUSPENDED, appealToken: isAppealTokenShape(token) ? token : null };
    }
    if (error === ACCOUNT_SUSPENDED) return { code: ACCOUNT_SUSPENDED, appealToken: isAppealTokenShape(appeal) ? appeal : null };
    return { code: error, appealToken: null };
}

/** Cookie that binds a cross-domain session hand-off to the browser that started it. */
export const AUTH_HANDOFF_COOKIE = "hanogt.handoff";
export const AUTH_HANDOFF_NONCE = /^[A-Za-z0-9_-]{22,64}$/;

function randomNonce() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Where to go after signing in on the auth host when the sign-in started on
 * another of our sites: /api/auth/handoff sends the session back there.
 */
export function handoffPath(target: string | null, nonce: string | null, callbackPath: string) {
    if (!target || !nonce || !AUTH_HANDOFF_NONCE.test(nonce)) return null;
    try {
        if (new URL(target).origin === window.location.origin) return null;
    } catch {
        return null;
    }
    const params = new URLSearchParams({ target, nonce, callbackUrl: callbackPath });
    return `/api/auth/handoff?${params.toString()}`;
}

const AUTH_ERROR_COOKIE = "hanogt.auth-error";

/**
 * Reads (and clears) the server-side reason of the last failed sign-in, set by
 * the NextAuth route for this browser only, e.g. "OAUTH_CALLBACK_ERROR: …".
 */
export function consumeAuthErrorDetail() {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${AUTH_ERROR_COOKIE.replace(".", "\\.")}=([^;]*)`));
    if (!match) return null;
    document.cookie = `${AUTH_ERROR_COOKIE}=; Max-Age=0; Path=/`;
    try {
        return decodeURIComponent(match[1]);
    } catch {
        return match[1];
    }
}

type AuthPostResult = { url: string; error: string | null };

function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchCsrfToken() {
    const response = await fetch("/api/auth/csrf", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error(`csrf ${response.status}`);
    const data = await response.json() as { csrfToken?: string };
    if (!data.csrfToken) throw new Error("csrf token missing");
    return data.csrfToken;
}

/**
 * Posts a form to a NextAuth endpoint and returns the redirect it would have
 * made. next-auth/react's signIn() first fetches /api/auth/providers and, if
 * that request fails even once, sends the browser to NextAuth's bare
 * "Error" page; talking to the endpoints directly keeps every failure on our
 * own login screen and lets transient network errors be retried.
 */
async function postAuthForm(path: string, fields: Record<string, string>): Promise<AuthPostResult> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            const csrfToken = await fetchCsrfToken();
            const response = await fetch(`/api/auth/${path}`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
                body: new URLSearchParams({ ...fields, csrfToken, json: "true" }),
            });
            const data = await response.json().catch(() => ({})) as { url?: string };
            const url = typeof data.url === "string" ? data.url : "";
            if (!url) throw new Error(`auth ${response.status}`);
            const target = new URL(url, window.location.origin);
            // A stale CSRF cookie makes NextAuth bounce back to its sign-in page; a fresh token fixes it.
            if (target.searchParams.get("csrf") === "true") throw new Error("csrf rejected");
            const error = target.searchParams.get("error");
            const appeal = target.searchParams.get("appeal");
            // The sign-in callback reports a suspension as "?error=AccountSuspended&appeal=<token>".
            return { url, error: error === ACCOUNT_SUSPENDED && appeal ? `${error}:${appeal}` : error };
        } catch (error) {
            lastError = error;
            if (attempt === 0) await wait(700);
        }
    }
    console.warn("Auth request failed", lastError);
    return { url: "", error: AUTH_NETWORK_ERROR };
}

/**
 * Signs in with e-mail and password; resolves with an error code, or null on
 * success. Accounts with two-step verification answer "TwoFactorRequired"
 * until the authenticator (or a recovery) code is passed as `otp`.
 */
export async function signInWithPassword(email: string, password: string, callbackUrl: string, otp?: string) {
    const result = await postAuthForm("callback/credentials", { email, password, callbackUrl, ...(otp ? { otp } : {}) });
    return result.error;
}

/**
 * Starts the Google OAuth flow; navigates away on success, otherwise resolves
 * with an error code. Google always returns to the host in NEXTAUTH_URL, so a
 * visitor on another host (apex vs www, *.vercel.app) would come back without
 * the state/PKCE cookies set here. In that case the flow is restarted once on
 * the host Google returns to (`canonicalHop` stops a redirect loop), which then
 * hands the finished session back to this site (see /api/auth/handoff).
 */
export async function startGoogleSignIn(callbackUrl: string, { canonicalHop = false } = {}) {
    const result = await postAuthForm("signin/google", { callbackUrl });
    if (result.error) return result.error;
    if (!canonicalHop) {
        try {
            const redirectUri = new URL(result.url).searchParams.get("redirect_uri");
            const returnOrigin = redirectUri ? new URL(redirectUri).origin : window.location.origin;
            if (returnOrigin !== window.location.origin) {
                const nonce = randomNonce();
                const secure = window.location.protocol === "https:" ? "; Secure" : "";
                document.cookie = `${AUTH_HANDOFF_COOKIE}=${nonce}; Path=/api/auth/handoff; Max-Age=900; SameSite=Lax${secure}`;
                const restart = new URL("/login", returnOrigin);
                restart.searchParams.set("provider", "google");
                restart.searchParams.set("callbackUrl", callbackUrl);
                restart.searchParams.set("handoff", window.location.origin);
                restart.searchParams.set("nonce", nonce);
                window.location.assign(restart.toString());
                return null;
            }
        } catch {
            // An unexpected URL shape falls through to Google as before.
        }
    }
    window.location.assign(result.url);
    return null;
}

/**
 * Opens the destination with a full page load so the session provider and the
 * Firebase bridge start from the freshly issued session cookie.
 */
export function completeSignIn(callbackPath: string) {
    window.location.assign(callbackPath);
}

// ---------------------------------------------------------------------------
// Suspension appeals (/api/support/appeal), sent from /login with the token above
// ---------------------------------------------------------------------------

/** Length of the appeal text after normalising (trimmed, as stored). */
export const APPEAL_LIMITS = { messageMin: 20, message: 3_000 } as const;

export type AppealErrorCode =
    | "bad_origin"
    | "rate_limited"
    | "invalid_body"
    | "invalid_token"
    | "message_required"
    | "message_too_short"
    | "message_too_long"
    | "unavailable";

const APPEAL_ERROR_CODES: readonly AppealErrorCode[] = [
    "bad_origin", "rate_limited", "invalid_body", "invalid_token", "message_required", "message_too_short", "message_too_long", "unavailable",
];

/** The text as it will be stored: support-ticket normalisation (NFC, unsafe characters removed, trimmed). */
export function normalizeAppealMessage(value: string) {
    return sanitizeTicketText(value, true);
}

/** Shared by the form (counter, submit button) and the route, so both count the same characters. */
export function validateAppealMessage(value: unknown): { ok: true; text: string } | { ok: false; code: Extract<AppealErrorCode, "invalid_body" | "message_required" | "message_too_short" | "message_too_long"> } {
    if (value !== undefined && value !== null && typeof value !== "string") return { ok: false, code: "invalid_body" };
    const text = typeof value === "string" ? normalizeAppealMessage(value) : "";
    if (!text) return { ok: false, code: "message_required" };
    if (text.length < APPEAL_LIMITS.messageMin) return { ok: false, code: "message_too_short" };
    if (text.length > APPEAL_LIMITS.message) return { ok: false, code: "message_too_long" };
    return { ok: true, text };
}

export type AppealFailure = { code: AppealErrorCode | typeof AUTH_NETWORK_ERROR | "unknown"; retryAfter: number | null };
export type AppealResult = { ok: true } | ({ ok: false } & AppealFailure);

/** Files the appeal; the server only ever answers "received" or an error code. */
export async function submitSuspensionAppeal(token: string, message: string): Promise<AppealResult> {
    let response: Response;
    try {
        response = await fetch("/api/support/appeal", {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, message }),
        });
    } catch {
        return { ok: false, code: AUTH_NETWORK_ERROR, retryAfter: null };
    }
    if (response.ok) return { ok: true };
    const data = await response.json().catch(() => ({})) as { code?: unknown; retryAfter?: unknown };
    const code = APPEAL_ERROR_CODES.find((known) => known === data.code) ?? "unknown";
    const retryAfter = typeof data.retryAfter === "number" && data.retryAfter > 0 ? data.retryAfter : Number(response.headers.get("Retry-After")) || null;
    return { ok: false, code, retryAfter };
}
