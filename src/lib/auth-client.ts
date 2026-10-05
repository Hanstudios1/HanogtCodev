import { sanitizeTicketText } from "@/lib/support";

/** Only same-origin relative paths are accepted as post-login destinations. */
export function safeCallbackPath(value: string | null) {
    // Browsers drop tabs/newlines and treat "\\" like "/", so "/\t//evil.com"
    // or "/\\evil.com" would leave the site: reject them outright.
    if (!value || !/^\/(?![/\\])/.test(value) || /[\u0000-\u001f\u007f\\]/.test(value)) return "/dashboard";
    if (value.startsWith("/login") || value.startsWith("/signup")) return "/dashboard";
    return value.slice(0, 500);
}

/**
 * Where NextAuth may send the browser after signing in or out: our own
 * origin only (an address like "https://site.com.evil.example" also starts
 * with the base URL). A bare /login or /signup becomes the dashboard; one
 * that carries something to show stays, which is how signing out lands on
 * "/login?error=StepUpExpired" or "/login?callbackUrl=…" (the sign-in form
 * itself always names its destination, see safeCallbackPath).
 */
export function authRedirectTarget(url: string, baseUrl: string) {
    if (url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\")) {
        if (url === "/") return baseUrl;
        return isBareAuthPage(url) ? `${baseUrl}/dashboard` : `${baseUrl}${url}`;
    }
    let target: URL;
    let base: URL;
    try {
        target = new URL(url);
        base = new URL(baseUrl);
    } catch {
        return baseUrl;
    }
    if (target.origin !== base.origin) return baseUrl;
    if (url === baseUrl || isBareAuthPage(`${target.pathname}${target.search}`)) return `${baseUrl}/dashboard`;
    return target.href;
}

/** /login or /signup without an error or a destination to show. */
function isBareAuthPage(path: string) {
    return /^\/(?:login|signup)\/?(?:[?#]|$)/.test(path) && !/[?&](?:error|callbackUrl)=/.test(path);
}

/** Google said it hasn't verified the account's address: it can't stand for the account. */
export const GOOGLE_EMAIL_UNVERIFIED = "GoogleEmailUnverified";
/** The second check after a Google sign-in wasn't finished in time. */
export const STEP_UP_EXPIRED = "StepUpExpired";

/** Error code used when the auth endpoints cannot be reached at all. */
export const AUTH_NETWORK_ERROR = "Network";

/**
 * Sign-in error of a suspended account. Only after the password (and second
 * factor) or Google proved ownership does it carry an appeal token:
 * "AccountSuspended:<token>" from the credentials sign-in, or
 * "?error=AccountSuspended&appeal=<token>" after Google.
 */
export const ACCOUNT_SUSPENDED = "AccountSuspended";

/**
 * Answer to a 2FA recovery request (requestTwoFactorRecovery): the password
 * was right, and the code carries a token for a recovery request to the team,
 * "TwoFactorRecovery:<token>". It only ever arrives in that fetch response.
 */
export const TWO_FACTOR_RECOVERY = "TwoFactorRecovery";

/** Loose shape check only; the /api/support routes verify the signature and purpose. */
function isSignInTokenShape(value: string | null | undefined): value is string {
    return typeof value === "string" && value.length <= 512 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(value);
}

export type AuthErrorParts = { code: string | null; appealToken: string | null; recoveryToken: string | null };

/**
 * Splits a sign-in error into its code and the token some codes carry: the
 * appeal token of a verified suspended account, or a 2FA recovery token.
 * Tokens never stay inside the code, so they are never displayed.
 */
export function readAuthError(error: string | null, appeal: string | null = null): AuthErrorParts {
    if (!error) return { code: null, appealToken: null, recoveryToken: null };
    if (error.startsWith(`${ACCOUNT_SUSPENDED}:`)) {
        const token = error.slice(ACCOUNT_SUSPENDED.length + 1);
        return { code: ACCOUNT_SUSPENDED, appealToken: isSignInTokenShape(token) ? token : null, recoveryToken: null };
    }
    if (error === ACCOUNT_SUSPENDED) return { code: ACCOUNT_SUSPENDED, appealToken: isSignInTokenShape(appeal) ? appeal : null, recoveryToken: null };
    if (error.startsWith(`${TWO_FACTOR_RECOVERY}:`)) {
        const token = error.slice(TWO_FACTOR_RECOVERY.length + 1);
        return { code: TWO_FACTOR_RECOVERY, appealToken: null, recoveryToken: isSignInTokenShape(token) ? token : null };
    }
    return { code: error, appealToken: null, recoveryToken: null };
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
 * For someone who lost both their authenticator and their recovery codes: the
 * password is checked again (with the sign-in rate limits) and, if right, the
 * answer is "TwoFactorRecovery:<token>" for submitTwoFactorRecovery. Resolves
 * with that code, another error code, or null when the account no longer asks
 * for a second factor and is now signed in.
 */
export async function requestTwoFactorRecovery(email: string, password: string, callbackUrl: string) {
    const result = await postAuthForm("callback/credentials", { email, password, callbackUrl, twoFactorRecovery: "1" });
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
// Requests sent from /login with a token from sign-in: suspension appeals
// (/api/support/appeal) and 2FA recovery requests (/api/support/two-factor-recovery)
// ---------------------------------------------------------------------------

/** Length of the request text after normalising (trimmed, as stored). */
export const SIGN_IN_REQUEST_LIMITS = { messageMin: 20, message: 3_000 } as const;

export type SignInRequestErrorCode =
    | "bad_origin"
    | "rate_limited"
    | "invalid_body"
    | "invalid_token"
    | "message_required"
    | "message_too_short"
    | "message_too_long"
    | "unavailable";

const SIGN_IN_REQUEST_ERROR_CODES: readonly SignInRequestErrorCode[] = [
    "bad_origin", "rate_limited", "invalid_body", "invalid_token", "message_required", "message_too_short", "message_too_long", "unavailable",
];

/** The text as it will be stored: support-ticket normalisation (NFC, unsafe characters removed, trimmed). */
export function normalizeSignInRequestMessage(value: string) {
    return sanitizeTicketText(value, true);
}

/** Shared by the forms (counter, submit button) and the routes, so both count the same characters. */
export function validateSignInRequestMessage(value: unknown): { ok: true; text: string } | { ok: false; code: Extract<SignInRequestErrorCode, "invalid_body" | "message_required" | "message_too_short" | "message_too_long"> } {
    if (value !== undefined && value !== null && typeof value !== "string") return { ok: false, code: "invalid_body" };
    const text = typeof value === "string" ? normalizeSignInRequestMessage(value) : "";
    if (!text) return { ok: false, code: "message_required" };
    if (text.length < SIGN_IN_REQUEST_LIMITS.messageMin) return { ok: false, code: "message_too_short" };
    if (text.length > SIGN_IN_REQUEST_LIMITS.message) return { ok: false, code: "message_too_long" };
    return { ok: true, text };
}

export type SignInRequestFailure = { code: SignInRequestErrorCode | typeof AUTH_NETWORK_ERROR | "unknown"; retryAfter: number | null };
export type SignInRequestResult = { ok: true } | ({ ok: false } & SignInRequestFailure);

/** The server only ever answers "received" or an error code. */
async function submitSignInRequest(path: string, token: string, message: string): Promise<SignInRequestResult> {
    let response: Response;
    try {
        response = await fetch(path, {
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
    const code = SIGN_IN_REQUEST_ERROR_CODES.find((known) => known === data.code) ?? "unknown";
    const retryAfter = typeof data.retryAfter === "number" && data.retryAfter > 0 ? data.retryAfter : Number(response.headers.get("Retry-After")) || null;
    return { ok: false, code, retryAfter };
}

/** Files an appeal against a suspension with the token from "AccountSuspended:<token>". */
export function submitSuspensionAppeal(token: string, message: string) {
    return submitSignInRequest("/api/support/appeal", token, message);
}

/** Asks the team to reset two-step verification, with the token from "TwoFactorRecovery:<token>". */
export function submitTwoFactorRecovery(token: string, message: string) {
    return submitSignInRequest("/api/support/two-factor-recovery", token, message);
}

/** Asks the team to remove a forgotten password, with the token /api/auth/step-up gives at /login/verify. */
export function submitPasswordRecovery(token: string, message: string) {
    return submitSignInRequest("/api/support/password-recovery", token, message);
}

/** Names the suspension appeal form uses (same rules as every sign-in request). */
export const APPEAL_LIMITS = SIGN_IN_REQUEST_LIMITS;
export const normalizeAppealMessage = normalizeSignInRequestMessage;
export type AppealFailure = SignInRequestFailure;
