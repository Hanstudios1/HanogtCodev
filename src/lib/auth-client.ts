/** Only same-origin relative paths are accepted as post-login destinations. */
export function safeCallbackPath(value: string | null) {
    if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/dashboard";
    if (value.startsWith("/login") || value.startsWith("/signup")) return "/dashboard";
    return value.slice(0, 500);
}

/** Error code used when the auth endpoints cannot be reached at all. */
export const AUTH_NETWORK_ERROR = "Network";

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
            return { url, error: target.searchParams.get("error") };
        } catch (error) {
            lastError = error;
            if (attempt === 0) await wait(700);
        }
    }
    console.warn("Auth request failed", lastError);
    return { url: "", error: AUTH_NETWORK_ERROR };
}

/** Signs in with e-mail and password; resolves with an error code, or null on success. */
export async function signInWithPassword(email: string, password: string, callbackUrl: string) {
    const result = await postAuthForm("callback/credentials", { email, password, callbackUrl });
    return result.error;
}

/**
 * Starts the Google OAuth flow; navigates away on success, otherwise resolves
 * with an error code. Google always returns to the host in NEXTAUTH_URL, so a
 * visitor on another host (apex vs www, *.vercel.app) would come back without
 * the state/PKCE cookies set here. In that case the flow is restarted once on
 * the host Google returns to (`canonicalHop` stops a redirect loop).
 */
export async function startGoogleSignIn(callbackUrl: string, { canonicalHop = false } = {}) {
    const result = await postAuthForm("signin/google", { callbackUrl });
    if (result.error) return result.error;
    if (!canonicalHop) {
        try {
            const redirectUri = new URL(result.url).searchParams.get("redirect_uri");
            const returnOrigin = redirectUri ? new URL(redirectUri).origin : window.location.origin;
            if (returnOrigin !== window.location.origin) {
                const restart = new URL("/login", returnOrigin);
                restart.searchParams.set("provider", "google");
                restart.searchParams.set("callbackUrl", callbackUrl);
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
