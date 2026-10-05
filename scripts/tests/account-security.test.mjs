// Run: node --test scripts/tests/
// Account security: the second check after a Google sign-in (step-up),
// "sign out everywhere" (users/{email}.authVersion), the sign-in redirect
// check and the claims the session hand-off carries between our sites. The
// server helpers talk to the in-memory Firestore/Auth stand-in.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { decode, encode } from "next-auth/jwt";
import { NextRequest } from "next/server.js";
import { setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();
const SECRET = "test-nextauth-secret-for-account-security";
process.env.NEXTAUTH_SECRET = SECRET;

const stepUp = await load("lib/step-up.ts");
const {
    RECENT_AUTH_MS, SESSION_TOKEN_VERSION, STEP_UP_PATH, STEP_UP_TTL_MS, isRecentAuth, isStaleAuthVersion, readSessionStepUp,
    readStepUpClaim, sessionStepUpOf, stepUpExpired, stepUpForSignIn,
} = stepUp;
const { authRedirectTarget } = await load("lib/auth-client.ts");
const { signHandoff, verifyHandoff } = await load("lib/server/auth-handoff.ts");
const { authVersionOf, cachedAuthVersion, raiseAuthVersion, revokeDataSessions, signOutEverywhere } = await load("lib/server/auth-version.ts");
const { keepSessionCookie, sessionCookieHeaders } = await load("lib/server/session-cookie.ts");
const { authOptions } = await load("lib/auth.ts");
const { hashPassword } = await load("lib/server/password.ts");
const { encryptSecret, generateTotpSecret, totpAt, currentTotpStep } = await load("lib/server/totp.ts");
const { readPasswordRecoveryToken } = await load("lib/server/appeal-token.ts");
const stepUpRoute = await load("app/api/auth/step-up/route.ts");

const NOW = Date.UTC(2026, 9, 5, 12, 0, 0);
const ORIGIN = "http://localhost:3000";
const COOKIE = "hanogt.session-token";
const PASSWORD = "doğru-at-pil-zımba";
let counter = 0;
/** A fresh address per test: the version cache and the rate limits are per address. */
const nextEmail = () => `kisi${++counter}@example.com`;

// ---------------------------------------------------------------- step-up.ts

test("a Google sign-in asks for the password (and the code) only when the account has a password", () => {
    assert.equal(STEP_UP_TTL_MS, 15 * 60_000);
    assert.equal(RECENT_AUTH_MS, 30 * 60_000);
    assert.equal(STEP_UP_PATH, "/login/verify");
    assert.equal(SESSION_TOKEN_VERSION, 2);
    assert.deepEqual(stepUpForSignIn("google", { hasPassword: true, twoFactor: false }, NOW), { needs: ["password"], since: NOW });
    assert.deepEqual(stepUpForSignIn("google", { hasPassword: true, twoFactor: true }, NOW), { needs: ["password", "totp"], since: NOW });
    // Created with Google and never given a password: Google is the only way in.
    assert.equal(stepUpForSignIn("google", { hasPassword: false, twoFactor: false }, NOW), null);
    // A password sign-in has just proved the password (and the code).
    assert.equal(stepUpForSignIn("credentials", { hasPassword: true, twoFactor: true }, NOW), null);
    // A session from before step-ups: the account proves its password once more.
    assert.deepEqual(stepUpForSignIn(undefined, { hasPassword: true, twoFactor: false }, NOW), { needs: ["password"], since: NOW });
});

test("stored claims are checked: the password is always part of it", () => {
    assert.deepEqual(readStepUpClaim({ needs: ["totp", "password", "totp", "admin"], since: NOW }), { needs: ["password", "totp"], since: NOW });
    for (const bad of [null, undefined, "x", 1, {}, { needs: [], since: NOW }, { needs: ["totp"], since: NOW }, { needs: "password", since: NOW }, { needs: ["password"] }, { needs: ["password"], since: Number.NaN }, { needs: ["password"], since: "1" }]) {
        assert.equal(readStepUpClaim(bad), null, JSON.stringify(bad));
    }
    const shown = sessionStepUpOf({ needs: ["password", "totp"], since: NOW });
    assert.deepEqual(shown, { needs: ["password", "totp"], expiresAt: NOW + STEP_UP_TTL_MS });
    assert.deepEqual(readSessionStepUp({ user: {}, stepUp: shown }), shown);
    for (const bad of [null, {}, { stepUp: null }, { stepUp: { needs: ["totp"], expiresAt: NOW } }, { stepUp: { needs: ["password"] } }]) {
        assert.equal(readSessionStepUp(bad), null, JSON.stringify(bad));
    }
    assert.equal(stepUpExpired(shown, NOW + STEP_UP_TTL_MS - 1), false);
    assert.equal(stepUpExpired(shown, NOW + STEP_UP_TTL_MS), true);
});

test("a recent sign-in is one in the last 30 minutes", () => {
    assert.equal(isRecentAuth(NOW, NOW), true);
    assert.equal(isRecentAuth(NOW - RECENT_AUTH_MS + 1, NOW), true);
    assert.equal(isRecentAuth(NOW - RECENT_AUTH_MS, NOW), false);
    // Unknown (a session from before it was recorded), missing or nonsense: not recent.
    for (const value of [0, null, undefined, "1", Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(isRecentAuth(value, NOW), false, String(value));
    // A little clock difference between instances is fine; a time far in the future isn't.
    assert.equal(isRecentAuth(NOW + 30_000, NOW), true);
    assert.equal(isRecentAuth(NOW + 5 * 60_000, NOW), false);
});

test("a session is stale once the account's version went past it", () => {
    assert.equal(isStaleAuthVersion(1, 0), true);
    assert.equal(isStaleAuthVersion(1, undefined), true);
    assert.equal(isStaleAuthVersion(3, 2), true);
    assert.equal(isStaleAuthVersion(2, 2), false);
    assert.equal(isStaleAuthVersion(undefined, undefined), false);
    assert.equal(isStaleAuthVersion(0, 0), false);
    // A session can't be "ahead", and odd stored values count as 0.
    assert.equal(isStaleAuthVersion(2, 3), false);
    assert.equal(isStaleAuthVersion("5", 0), false);
    assert.equal(authVersionOf(4), 4);
    assert.equal(authVersionOf("4"), 0);
});

// ---------------------------------------------------------------- redirect

test("sign-in only sends people back to our own origin", () => {
    const base = "https://hanogtcodev.com";
    assert.equal(authRedirectTarget("/editor", base), `${base}/editor`);
    assert.equal(authRedirectTarget("/", base), base);
    // A bare sign-in page sends a signed-in person to the dashboard...
    assert.equal(authRedirectTarget("/login", base), `${base}/dashboard`);
    assert.equal(authRedirectTarget("/signup", base), `${base}/dashboard`);
    assert.equal(authRedirectTarget("/login?provider=google", base), `${base}/dashboard`);
    // ...but signing out may land on one with something to show (an error, where to go next).
    assert.equal(authRedirectTarget("/login?error=StepUpExpired&callbackUrl=%2Feditor", base), `${base}/login?error=StepUpExpired&callbackUrl=%2Feditor`);
    assert.equal(authRedirectTarget("/login?callbackUrl=%2Faccount-settings", base), `${base}/login?callbackUrl=%2Faccount-settings`);
    assert.equal(authRedirectTarget(`${base}/login?error=AccountSuspended`, base), `${base}/login?error=AccountSuspended`);
    assert.equal(authRedirectTarget("/login/verify?callbackUrl=%2Fai", base), `${base}/login/verify?callbackUrl=%2Fai`);
    assert.equal(authRedirectTarget(`${base}/ai?x=1`, base), `${base}/ai?x=1`);
    assert.equal(authRedirectTarget(`${base}/login`, base), `${base}/dashboard`);
    assert.equal(authRedirectTarget(base, base), `${base}/dashboard`);
    for (const evil of ["https://evil.example/", "//evil.example/x", "/\\evil.example", "https://hanogtcodev.com.evil.example/", "http://hanogtcodev.com/x", "javascript:alert(1)", "not a url"]) {
        assert.equal(authRedirectTarget(evil, base), base, evil);
    }
});

// ---------------------------------------------------------------- hand-off

test("the hand-off carries what the sign-in proved, a pending step-up included", () => {
    const nonce = "n".repeat(32);
    const user = { email: "ayse@example.com", name: "Ayşe", picture: null, id: "ayse@example.com" };
    const pending = { authTime: NOW, provider: "google", authVersion: 2, stepUp: { needs: ["password"], since: NOW } };
    const token = signHandoff({ aud: ORIGIN, nonce, next: "/ai", user, claims: pending });
    assert.deepEqual(verifyHandoff(token, ORIGIN, nonce)?.claims, pending);
    const done = signHandoff({ aud: ORIGIN, nonce, next: "/ai", user, claims: { ...pending, stepUp: null } });
    assert.equal(verifyHandoff(done, ORIGIN, nonce)?.claims.stepUp, null);

    // Without the claims, or with a malformed step-up, a hand-off could drop the check: refused.
    for (const claims of [undefined, { ...pending, authTime: "now" }, { ...pending, authVersion: undefined }, { ...pending, provider: 1 }, { ...pending, stepUp: { needs: ["totp"], since: NOW } }, { ...pending, stepUp: undefined }]) {
        assert.equal(verifyHandoff(signHandoff({ aud: ORIGIN, nonce, next: "/ai", user, claims }), ORIGIN, nonce), null, JSON.stringify(claims));
    }
    // Bound to the site and the browser that started the sign-in.
    assert.equal(verifyHandoff(token, "https://evil.example", nonce), null);
    assert.equal(verifyHandoff(token, ORIGIN, "m".repeat(32)), null);
    // A changed claim breaks the signature.
    const [body, signature] = token.split(".");
    const edited = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    edited.claims.stepUp = null;
    assert.equal(verifyHandoff(`${Buffer.from(JSON.stringify(edited)).toString("base64url")}.${signature}`, ORIGIN, nonce), null);
});

// ---------------------------------------------------------------- authVersion

test("raising the version signs earlier sessions out; a deleted account isn't brought back", async () => {
    const email = nextEmail();
    await withBackend({ [`users/${email}`]: { email, authVersion: 2 } }, {}, async (backend) => {
        assert.equal(await cachedAuthVersion(email), 2);
        assert.equal(await raiseAuthVersion(email), 3);
        assert.equal(backend.get(`users/${email}`).authVersion, 3);
        // This instance remembers the raise at once.
        assert.equal(await cachedAuthVersion(email), 3);
        const result = await signOutEverywhere(email);
        assert.deepEqual(result, { authVersion: 4, dataSessionsRevoked: true });
        // The Firebase Auth user goes, and with it every browser's Firestore connection.
        const uid = createHash("sha256").update(email).digest("hex").slice(0, 64);
        assert.ok(backend.authDeleted.includes(uid));
    });
    const gone = nextEmail();
    await withBackend({}, {}, async (backend) => {
        await assert.rejects(() => raiseAuthVersion(gone));
        assert.equal(backend.has(`users/${gone}`), false);
        assert.equal(await cachedAuthVersion(gone), null);
    });
    const fresh = nextEmail();
    await withBackend({ [`users/${fresh}`]: { email: fresh } }, {}, async () => {
        // Never raised before: 0, then 1.
        assert.equal(await cachedAuthVersion(fresh), 0);
        assert.equal(await raiseAuthVersion(fresh), 1);
    });
});

test("revoking the data sessions is best effort", async () => {
    const email = nextEmail();
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response("{}", { status: 500 });
    const errors = console.error;
    console.error = () => undefined;
    try {
        assert.equal(await revokeDataSessions(email), false);
    } finally {
        globalThis.fetch = original;
        console.error = errors;
    }
});

// ---------------------------------------------------------------- session cookie

async function sessionCookie(claims) {
    return encode({ token: claims, secret: SECRET, maxAge: 60 * 60 });
}

function requestWith(path, { method = "GET", cookie, body, origin = ORIGIN, cookies = {} } = {}) {
    const headers = { host: "localhost:3000", "content-type": "application/json" };
    if (origin) headers.origin = origin;
    const jar = { ...cookies, ...(cookie ? { [COOKIE]: cookie } : {}) };
    if (Object.keys(jar).length) headers.cookie = Object.entries(jar).map(([name, value]) => `${name}=${value}`).join("; ");
    return new NextRequest(`${ORIGIN}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

/** The session token a response stores. */
async function storedToken(response) {
    const header = response.headers.getSetCookie().find((value) => value.startsWith(`${COOKIE}=`));
    assert.ok(header, "no session cookie was set");
    return decode({ token: header.slice(COOKIE.length + 1).split(";")[0], secret: SECRET });
}

test("keeping this session: the new version, a fresh authTime when proven, stale chunks cleared", async () => {
    const email = nextEmail();
    const claims = { email, name: "Ada", sub: email, sv: 2, authTime: NOW, provider: "google", authVersion: 1 };
    // A large session was stored in chunks (name.0, name.1); the kept one is a single cookie, so the chunks go.
    const value = await sessionCookie(claims);
    const half = Math.ceil(value.length / 2);
    const request = requestWith("/api/account/sessions", { cookies: { [`${COOKIE}.0`]: value.slice(0, half), [`${COOKIE}.1`]: value.slice(half) } });
    const headers = await keepSessionCookie(request, 5);
    assert.ok(headers[0].startsWith(`${COOKIE}=`));
    for (const chunk of [`${COOKIE}.0`, `${COOKIE}.1`]) assert.ok(headers.some((header) => header.startsWith(`${chunk}=;`) && header.includes("Max-Age=0")), chunk);
    const kept = await decode({ token: headers[0].slice(COOKIE.length + 1).split(";")[0], secret: SECRET });
    assert.equal(kept.authVersion, 5);
    assert.equal(kept.authTime, NOW);
    assert.equal(kept.email, email);

    const proven = await keepSessionCookie(requestWith("/x", { cookie: await sessionCookie(claims) }), 6, { proven: true });
    const renewed = await decode({ token: proven[0].slice(COOKIE.length + 1).split(";")[0], secret: SECRET });
    assert.ok(Math.abs(renewed.authTime - Date.now()) < 5_000);

    // Nothing to keep: no session, a pending step-up, or a session already signed out everywhere.
    assert.equal(await keepSessionCookie(requestWith("/x"), 2), null);
    assert.equal(await keepSessionCookie(requestWith("/x", { cookie: await sessionCookie({ ...claims, stepUp: { needs: ["password"], since: NOW } }) }), 2), null);
    assert.equal(await keepSessionCookie(requestWith("/x", { cookie: await sessionCookie({ ...claims, revoked: true }) }), 2), null);
    assert.ok(await sessionCookieHeaders(claims));
});

// ---------------------------------------------------------------- jwt and session callbacks

const google = { provider: "google", type: "oauth", providerAccountId: "1" };
const credentials = { provider: "credentials", type: "credentials", providerAccountId: "x" };

test("the session token records the sign-in and a pending step-up", async () => {
    const email = nextEmail();
    const passwordHash = await hashPassword(PASSWORD);
    await withBackend({ [`users/${email}`]: { email, authVersion: 4 }, [`credentials/${email}`]: { passwordHash } }, {}, async () => {
        const { jwt, session } = authOptions.callbacks;
        const before = Date.now();
        const token = await jwt({ token: { email: email.toUpperCase(), name: "Ada" }, user: { id: email, email }, account: google });
        assert.equal(token.email, email);
        assert.equal(token.sv, SESSION_TOKEN_VERSION);
        assert.equal(token.provider, "google");
        assert.equal(token.authVersion, 4);
        assert.ok(token.authTime >= before);
        assert.deepEqual(token.stepUp, { needs: ["password"], since: token.authTime });

        // The browser sees the step-up and when it runs out; getActiveSession treats the session as signed out.
        const shown = await session({ session: { user: { email, name: "Ada" }, expires: "" }, token });
        assert.deepEqual(shown.stepUp, { needs: ["password"], expiresAt: token.authTime + STEP_UP_TTL_MS });
        assert.equal(shown.authVersion, 4);
        assert.equal(shown.authTime, token.authTime);

        // update() from the browser can't clear it.
        const updated = await jwt({ token: { ...token }, trigger: "update", session: { stepUp: null } });
        assert.deepEqual(updated.stepUp, token.stepUp);

        // A password sign-in has nothing left to prove.
        const direct = await jwt({ token: { email, name: "Ada" }, user: { id: email, email }, account: credentials });
        assert.equal(direct.provider, "credentials");
        assert.equal(direct.stepUp, undefined);
    });
});

test("with two-step verification on, the step-up asks for the code too; Google-only accounts aren't asked", async () => {
    const withCode = nextEmail();
    const googleOnly = nextEmail();
    await withBackend({
        [`users/${withCode}`]: { email: withCode },
        [`credentials/${withCode}`]: { passwordHash: "scrypt$x", totpEnabled: true, totpSecretEnc: "x" },
        [`users/${googleOnly}`]: { email: googleOnly, provider: "google" },
    }, {}, async () => {
        const { jwt } = authOptions.callbacks;
        const token = await jwt({ token: { email: withCode }, user: { id: withCode, email: withCode }, account: google });
        assert.deepEqual(token.stepUp.needs, ["password", "totp"]);
        const plain = await jwt({ token: { email: googleOnly }, user: { id: googleOnly, email: googleOnly }, account: google });
        assert.equal(plain.stepUp, undefined);
        assert.equal(plain.authVersion, 0);
    });
});

test("a session from before step-ups is upgraded once and doesn't count as a recent sign-in", async () => {
    const email = nextEmail();
    await withBackend({ [`users/${email}`]: { email, password: "legacy-plain", authVersion: 1 } }, {}, async () => {
        const { jwt } = authOptions.callbacks;
        const token = await jwt({ token: { email, iat: Math.floor(Date.now() / 1000) } });
        assert.equal(token.sv, SESSION_TOKEN_VERSION);
        assert.equal(token.authTime, 0);
        assert.equal(token.authVersion, 1);
        assert.deepEqual(token.stepUp.needs, ["password"]);
        assert.equal(isRecentAuth(token.authTime), false);
    });
});

test("signed out everywhere: the browser's session reads as signed out", async () => {
    const email = nextEmail();
    await withBackend({ [`users/${email}`]: { email, authVersion: 1 } }, {}, async () => {
        const { jwt, session } = authOptions.callbacks;
        const token = { email, sv: SESSION_TOKEN_VERSION, authTime: NOW, provider: "google", authVersion: 1 };
        const same = await jwt({ token: { ...token } });
        assert.equal(same.revoked, undefined);
        assert.equal((await session({ session: { user: { email }, expires: "" }, token: same })).user.email, email);

        await raiseAuthVersion(email);
        const stale = await jwt({ token: { ...token } });
        assert.equal(stale.revoked, true);
        // An empty session is "signed out" to NextAuth's client and getServerSession.
        assert.deepEqual(await session({ session: { user: { email }, expires: "" }, token: stale }), {});
        // Once marked, it stays signed out without reading the database again.
        assert.equal((await jwt({ token: { ...stale } })).revoked, true);
    });
});

// ---------------------------------------------------------------- /api/auth/step-up

async function pendingCookie(email, overrides = {}) {
    return sessionCookie({
        email, name: "Ada", sub: email, id: email, sv: SESSION_TOKEN_VERSION, authTime: Date.now(), provider: "google", authVersion: 0,
        stepUp: { needs: ["password"], since: Date.now() }, ...overrides,
    });
}

async function post(cookie, body, options = {}) {
    const response = await stepUpRoute.POST(requestWith("/api/auth/step-up", { method: "POST", cookie, body, ...options }));
    return { response, body: await response.clone().json() };
}

test("step-up: GET reports the pending check", async () => {
    const email = nextEmail();
    await withBackend({}, {}, async () => {
        const anonymous = await stepUpRoute.GET(requestWith("/api/auth/step-up"));
        assert.equal(anonymous.status, 401);
        const since = Date.now();
        const pending = await (await stepUpRoute.GET(requestWith("/api/auth/step-up", { cookie: await pendingCookie(email, { stepUp: { needs: ["password", "totp"], since } }) }))).json();
        assert.deepEqual(pending, { pending: true, email, needs: ["password", "totp"], expiresAt: since + STEP_UP_TTL_MS, expired: false });
        const done = await (await stepUpRoute.GET(requestWith("/api/auth/step-up", { cookie: await sessionCookie({ email, sv: 2 }) }))).json();
        assert.deepEqual(done, { pending: false, email });
        const revoked = await stepUpRoute.GET(requestWith("/api/auth/step-up", { cookie: await pendingCookie(email, { revoked: true }) }));
        assert.equal(revoked.status, 401);
    });
});

test("step-up: the right password finishes the sign-in; a wrong one doesn't", async () => {
    const email = nextEmail();
    const passwordHash = await hashPassword(PASSWORD);
    await withBackend({ [`users/${email}`]: { email, authVersion: 0 }, [`credentials/${email}`]: { passwordHash } }, {}, async () => {
        const cookie = await pendingCookie(email, { authTime: NOW });
        assert.equal((await post(cookie, { action: "verify", password: PASSWORD }, { origin: "https://evil.example" })).response.status, 403);
        assert.equal((await post(cookie, { action: "verify", password: "" })).body.code, "bad_request");
        assert.equal((await post(cookie, { action: "nope" })).body.code, "bad_request");

        const wrong = await post(cookie, { action: "verify", password: "yanlış" });
        assert.equal(wrong.response.status, 403);
        assert.equal(wrong.body.code, "wrong_password");
        assert.equal(wrong.response.headers.getSetCookie().length, 0);

        const before = Date.now();
        const right = await post(cookie, { action: "verify", password: PASSWORD });
        assert.equal(right.response.status, 200);
        assert.deepEqual(right.body, { ok: true });
        const token = await storedToken(right.response);
        assert.equal(token.stepUp, undefined);
        assert.equal(token.email, email);
        assert.equal(token.provider, "google");
        // Proving the password counts as a fresh sign-in (first password, deleting the account).
        assert.ok(token.authTime >= before);

        // Nothing is pending any more.
        const again = await post(await sessionCookie({ ...token }), { action: "verify", password: PASSWORD });
        assert.equal(again.body.code, "not_pending");
    });
});

test("step-up: with two-step verification the code is asked after the password", async () => {
    const email = nextEmail();
    const secret = generateTotpSecret();
    const passwordHash = await hashPassword(PASSWORD);
    await withBackend({
        [`users/${email}`]: { email },
        [`credentials/${email}`]: { passwordHash, totpEnabled: true, totpSecretEnc: encryptSecret(secret), totpLastStep: 0, recoveryCodes: [] },
    }, {}, async () => {
        const cookie = await pendingCookie(email, { stepUp: { needs: ["password", "totp"], since: Date.now() } });
        const needsCode = await post(cookie, { action: "verify", password: PASSWORD });
        assert.equal(needsCode.response.status, 409);
        assert.equal(needsCode.body.code, "totp_required");
        // A wrong password never reaches the code.
        assert.equal((await post(cookie, { action: "verify", password: "yanlış", code: "000000" })).body.code, "wrong_password");
        const wrongCode = totpAt(secret, currentTotpStep()) === "000000" ? "111111" : "000000";
        assert.equal((await post(cookie, { action: "verify", password: PASSWORD, code: wrongCode })).body.code, "totp_invalid");
        const ok = await post(cookie, { action: "verify", password: PASSWORD, code: totpAt(secret, currentTotpStep()) });
        assert.equal(ok.response.status, 200);
        assert.equal((await storedToken(ok.response)).stepUp, undefined);
    });
});

test("step-up: expired, signed out everywhere, suspended or password removed", async () => {
    const email = nextEmail();
    const passwordHash = await hashPassword(PASSWORD);
    await withBackend({ [`users/${email}`]: { email, authVersion: 3 }, [`credentials/${email}`]: { passwordHash } }, {}, async (backend) => {
        const old = await pendingCookie(email, { authVersion: 3, stepUp: { needs: ["password"], since: Date.now() - STEP_UP_TTL_MS - 1 } });
        assert.equal((await post(old, { action: "verify", password: PASSWORD })).response.status, 410);
        // The owner pressed "sign out everywhere" while this sign-in waited at /login/verify.
        const stale = await post(await pendingCookie(email, { authVersion: 2 }), { action: "verify", password: PASSWORD });
        assert.equal(stale.body.code, "expired");
        assert.equal((await post(await pendingCookie(email, { authVersion: 3, revoked: true }), { action: "verify", password: PASSWORD })).response.status, 401);

        // A suspension is told only once ownership is proven.
        await withSuspended(backend, email, async () => {
            assert.equal((await post(await pendingCookie(email, { authVersion: 3 }), { action: "verify", password: "yanlış" })).body.code, "wrong_password");
            assert.equal((await post(await pendingCookie(email, { authVersion: 3 }), { action: "verify", password: PASSWORD })).body.code, "suspended");
        });
    });
    // The team removed a forgotten password: Google alone is enough again.
    const removed = nextEmail();
    await withBackend({ [`users/${removed}`]: { email: removed } }, {}, async () => {
        const done = await post(await pendingCookie(removed), { action: "verify", password: "anything" });
        assert.equal(done.response.status, 200);
    });
});

async function withSuspended(backend, email, run) {
    // The backend has no direct setter: suspend through a commit like the admin route.
    const { commitServerPatches } = await load("lib/server/firebase-rest.ts");
    await commitServerPatches([{ path: `users/${email}`, data: { suspended: true }, updateFields: ["suspended"] }]);
    assert.equal(backend.get(`users/${email}`).suspended, true);
    await run();
}

test("step-up: a forgotten password gets a short-lived request token", async () => {
    const email = nextEmail();
    await withBackend({ [`users/${email}`]: { email } }, {}, async () => {
        const cookie = await pendingCookie(email);
        const { response, body } = await post(cookie, { action: "recovery_token" });
        assert.equal(response.status, 200);
        assert.equal(readPasswordRecoveryToken(body.token)?.email, email);
        // Only while a step-up is pending.
        assert.equal((await post(await sessionCookie({ email, sv: 2 }), { action: "recovery_token" })).body.code, "not_pending");
        for (let index = 0; index < 4; index += 1) await post(cookie, { action: "recovery_token" });
        assert.equal((await post(cookie, { action: "recovery_token" })).response.status, 429);
    });
});

test("step-up: password guesses are limited per account", async () => {
    const email = nextEmail();
    const passwordHash = await hashPassword(PASSWORD);
    await withBackend({ [`users/${email}`]: { email }, [`credentials/${email}`]: { passwordHash } }, {}, async () => {
        const cookie = await pendingCookie(email);
        for (let index = 0; index < 10; index += 1) assert.equal((await post(cookie, { action: "verify", password: `yanlış-${index}` })).body.code, "wrong_password");
        const limited = await post(cookie, { action: "verify", password: PASSWORD });
        assert.equal(limited.response.status, 429);
        assert.ok(Number(limited.response.headers.get("Retry-After")) > 0);
    });
});
