// Run: node --test scripts/tests/
// Appeal tokens let a suspended account file an appeal after proving
// ownership at sign-in (src/lib/server/appeal-token.ts); /login reads them
// back out of the sign-in error (src/lib/auth-client.ts).
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { load } from "./setup.mjs";

const {
    APPEAL_TOKEN_MAX_LENGTH, APPEAL_TOKEN_TTL_MS, deriveAppealKey, encodeAppealToken, issueAppealToken, readAppealToken, verifyAppealToken,
} = await load("lib/server/appeal-token.ts");
const { ACCOUNT_SUSPENDED, APPEAL_LIMITS, readAuthError, validateAppealMessage } = await load("lib/auth-client.ts");

const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const KEY = deriveAppealKey("test-secret");
const EMAIL = "ayse.yilmaz+test@example.com";
const TOKEN_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/;

/** Signs arbitrary claims the way the module does, to probe the parser behind a valid signature. */
function signClaims(claims, key = KEY) {
    return `${Buffer.from(claims, "utf8").toString("base64url")}.${createHmac("sha256", key).update(claims, "utf8").digest("base64url")}`;
}

function withEnv(values, run) {
    const names = ["NEXTAUTH_SECRET", "AUTH_SECRET"];
    const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    for (const name of names) {
        if (values[name] === undefined) delete process.env[name];
        else process.env[name] = values[name];
    }
    try {
        return run();
    } finally {
        for (const name of names) {
            if (saved[name] === undefined) delete process.env[name];
            else process.env[name] = saved[name];
        }
    }
}

test("a token round-trips and expires after 30 minutes", () => {
    assert.equal(APPEAL_TOKEN_TTL_MS, 30 * 60_000);
    const expiresAt = NOW + APPEAL_TOKEN_TTL_MS;
    const token = encodeAppealToken(EMAIL, expiresAt, KEY);
    assert.match(token, TOKEN_SHAPE);
    assert.ok(token.length <= APPEAL_TOKEN_MAX_LENGTH);
    assert.deepEqual(verifyAppealToken(token, KEY, NOW), { email: EMAIL, expiresAt });
    assert.deepEqual(verifyAppealToken(token, KEY, expiresAt - 1), { email: EMAIL, expiresAt });
    assert.equal(verifyAppealToken(token, KEY, expiresAt), null);
    assert.equal(verifyAppealToken(token, KEY, expiresAt + 60_000), null);
});

test("the longest address still fits the length limit", () => {
    const email = `${"a".repeat(64)}@${"b".repeat(185)}.com`;
    assert.equal(email.length, 254);
    const token = encodeAppealToken(email, NOW + APPEAL_TOKEN_TTL_MS, KEY);
    assert.ok(token.length <= APPEAL_TOKEN_MAX_LENGTH);
    assert.equal(verifyAppealToken(token, KEY, NOW)?.email, email);
});

test("tokens can't claim a longer life than the module issues", () => {
    // Allowed: a little clock difference between instances.
    assert.ok(verifyAppealToken(encodeAppealToken(EMAIL, NOW + APPEAL_TOKEN_TTL_MS + 30_000, KEY), KEY, NOW));
    assert.equal(verifyAppealToken(encodeAppealToken(EMAIL, NOW + APPEAL_TOKEN_TTL_MS + 5 * 60_000, KEY), KEY, NOW), null);
    assert.equal(verifyAppealToken(encodeAppealToken(EMAIL, NOW + 365 * 86_400_000, KEY), KEY, NOW), null);
});

test("the key is domain-separated and secret-specific", () => {
    const token = encodeAppealToken(EMAIL, NOW + APPEAL_TOKEN_TTL_MS, KEY);
    assert.equal(verifyAppealToken(token, deriveAppealKey("another-secret"), NOW), null);
    // The same secret used directly (or for another purpose) doesn't produce valid tokens.
    const raw = Buffer.from("test-secret");
    assert.notDeepEqual(KEY, raw);
    assert.equal(verifyAppealToken(encodeAppealToken(EMAIL, NOW + APPEAL_TOKEN_TTL_MS, raw), KEY, NOW), null);
    const otherPurpose = createHmac("sha256", "test-secret").update("hanogt:auth-handoff:v1").digest();
    assert.equal(verifyAppealToken(encodeAppealToken(EMAIL, NOW + APPEAL_TOKEN_TTL_MS, otherPurpose), KEY, NOW), null);
});

test("tampered tokens are rejected", () => {
    const token = encodeAppealToken(EMAIL, NOW + APPEAL_TOKEN_TTL_MS, KEY);
    const [payload, signature] = token.split(".");

    // Another address (or a later expiry) under the original signature.
    const otherEmail = Buffer.from(`mehmet@example.com|${NOW + APPEAL_TOKEN_TTL_MS}`).toString("base64url");
    assert.equal(verifyAppealToken(`${otherEmail}.${signature}`, KEY, NOW), null);
    const longer = Buffer.from(`${EMAIL}|${NOW + APPEAL_TOKEN_TTL_MS + 1}`).toString("base64url");
    assert.equal(verifyAppealToken(`${longer}.${signature}`, KEY, NOW), null);

    // Every single-character change of the signature.
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    for (let index = 0; index < signature.length; index += 1) {
        const replacement = alphabet[(alphabet.indexOf(signature[index]) + 1) % alphabet.length];
        const forged = `${payload}.${signature.slice(0, index)}${replacement}${signature.slice(index + 1)}`;
        assert.equal(verifyAppealToken(forged, KEY, NOW), null, `signature change at ${index}`);
    }

    // Signatures don't move between tokens.
    const other = encodeAppealToken("mehmet@example.com", NOW + APPEAL_TOKEN_TTL_MS, KEY);
    assert.equal(verifyAppealToken(`${other.split(".")[0]}.${signature}`, KEY, NOW), null);
});

test("only the canonical encoding is accepted", () => {
    // 29 bytes of claims → 39 base64url characters; the last one carries 2 unused bits.
    const email = "ali@example.com";
    const token = encodeAppealToken(email, NOW + APPEAL_TOKEN_TTL_MS, KEY);
    const [payload, signature] = token.split(".");
    assert.equal(payload.length % 4, 3);
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const last = payload[payload.length - 1];
    const variant = `${payload.slice(0, -1)}${alphabet[alphabet.indexOf(last) ^ 1]}`;
    // Same bytes, different spelling: a lenient decoder would accept it.
    assert.deepEqual(Buffer.from(variant, "base64url"), Buffer.from(payload, "base64url"));
    assert.equal(verifyAppealToken(`${variant}.${signature}`, KEY, NOW), null);
    assert.equal(verifyAppealToken(`${payload}=.${signature}`, KEY, NOW), null);
    assert.ok(verifyAppealToken(token, KEY, NOW));
});

test("malformed input never throws and is rejected", () => {
    const token = encodeAppealToken(EMAIL, NOW + APPEAL_TOKEN_TTL_MS, KEY);
    const [payload, signature] = token.split(".");
    for (const value of [
        undefined, null, 42, {}, [], "", ".", token.replace(".", ""), `${token}.`, `.${signature}`, `${payload}.`,
        `${payload}.${signature}x`, `${payload}.${signature.slice(1)}`, `${payload}..${signature}`, `${payload}.${signature}.${signature}`,
        `${payload.replace(/^./, "+")}.${signature}`, `${payload}/.${signature}`, ` ${token}`, `${token}\n`,
        `${"A".repeat(APPEAL_TOKEN_MAX_LENGTH)}.${signature}`,
    ]) {
        assert.equal(verifyAppealToken(value, KEY, NOW), null, `input ${JSON.stringify(value)?.slice(0, 40)}`);
    }
});

test("validly signed but malformed claims are rejected", () => {
    const expiry = NOW + APPEAL_TOKEN_TTL_MS;
    for (const claims of [
        EMAIL,
        `${EMAIL}|`,
        `|${expiry}`,
        `${EMAIL}|soon`,
        `${EMAIL}|${expiry}.5`,
        `${EMAIL}|-${expiry}`,
        `${EMAIL}|1e15`,
        `${EMAIL}|${"9".repeat(16)}`,
        `AYSE@example.com|${expiry}`,
        ` ${EMAIL}|${expiry}`,
        `ayse@example|${expiry}`,
        `../credentials/x@example.com|${expiry}`,
        `ayşe@example.com|${expiry}`,
        `a..b@example.com|${expiry}`,
    ]) {
        assert.equal(verifyAppealToken(signClaims(claims), KEY, NOW), null, claims);
    }
    // The helper itself produces tokens the module accepts.
    assert.deepEqual(verifyAppealToken(signClaims(`${EMAIL}|${expiry}`), KEY, NOW), { email: EMAIL, expiresAt: expiry });
});

test("issue/read use NEXTAUTH_SECRET (or AUTH_SECRET) and fail closed without one", () => {
    withEnv({ NEXTAUTH_SECRET: "env-secret" }, () => {
        const token = issueAppealToken(EMAIL, NOW);
        assert.match(token, TOKEN_SHAPE);
        assert.deepEqual(readAppealToken(token, NOW), { email: EMAIL, expiresAt: NOW + APPEAL_TOKEN_TTL_MS });
        assert.deepEqual(verifyAppealToken(token, deriveAppealKey("env-secret"), NOW), { email: EMAIL, expiresAt: NOW + APPEAL_TOKEN_TTL_MS });
        assert.equal(readAppealToken(token, NOW + APPEAL_TOKEN_TTL_MS), null);
        // Addresses that can't be document ids never get a token.
        assert.equal(issueAppealToken("Ayse@Example.com", NOW), null);
        assert.equal(issueAppealToken("../x@example.com", NOW), null);
    });
    const fromAuthSecret = withEnv({ AUTH_SECRET: "auth-secret" }, () => issueAppealToken(EMAIL, NOW));
    assert.match(fromAuthSecret, TOKEN_SHAPE);
    withEnv({ AUTH_SECRET: "auth-secret" }, () => assert.equal(readAppealToken(fromAuthSecret, NOW)?.email, EMAIL));
    withEnv({ NEXTAUTH_SECRET: "rotated" }, () => assert.equal(readAppealToken(fromAuthSecret, NOW), null));
    withEnv({}, () => {
        assert.equal(issueAppealToken(EMAIL, NOW), null);
        assert.equal(readAppealToken(fromAuthSecret, NOW), null);
    });
});

test("the token survives the sign-in redirects and is split off the error code", () => {
    const token = encodeAppealToken(EMAIL, NOW + APPEAL_TOKEN_TTL_MS, KEY);
    const base = "https://hanogtcodev.com";

    // Credentials: authorize() throws "AccountSuspended:<token>", NextAuth URI-encodes it into /api/auth/error.
    const code = `${ACCOUNT_SUSPENDED}:${token}`;
    assert.match(code, /^[\x21-\x7e]+$/, "codes in redirect URLs and headers must be plain ASCII");
    const credentialsUrl = new URL(`${base}/api/auth/error?error=${encodeURIComponent(code)}`);
    assert.deepEqual(readAuthError(credentialsUrl.searchParams.get("error")), { code: ACCOUNT_SUSPENDED, appealToken: token });

    // Google: completeSignIn() redirects to /login?error=AccountSuspended&appeal=<token>.
    const googleUrl = new URL(`${base}/login?error=${ACCOUNT_SUSPENDED}&appeal=${encodeURIComponent(token)}`);
    assert.deepEqual(readAuthError(googleUrl.searchParams.get("error"), googleUrl.searchParams.get("appeal")), { code: ACCOUNT_SUSPENDED, appealToken: token });

    // Without a (well-formed) token the suspension is still reported, with nothing to appeal with.
    assert.deepEqual(readAuthError(ACCOUNT_SUSPENDED), { code: ACCOUNT_SUSPENDED, appealToken: null });
    assert.deepEqual(readAuthError(`${ACCOUNT_SUSPENDED}:<script>`), { code: ACCOUNT_SUSPENDED, appealToken: null });
    assert.deepEqual(readAuthError(ACCOUNT_SUSPENDED, "not a token"), { code: ACCOUNT_SUSPENDED, appealToken: null });
    // Other codes never carry a token.
    assert.deepEqual(readAuthError("CredentialsSignin", token), { code: "CredentialsSignin", appealToken: null });
    assert.deepEqual(readAuthError(null, token), { code: null, appealToken: null });
});

test("appeal messages: 20 to 3000 characters after normalising", () => {
    assert.deepEqual(APPEAL_LIMITS, { messageMin: 20, message: 3_000 });
    const twenty = "Hesabım yanlışlıkla!!";
    assert.equal(twenty.length, 21);
    assert.deepEqual(validateAppealMessage(twenty.slice(0, 20)), { ok: true, text: twenty.slice(0, 20) });
    assert.deepEqual(validateAppealMessage(twenty.slice(0, 19)), { ok: false, code: "message_too_short" });
    // Surrounding whitespace and unsafe characters don't count.
    assert.deepEqual(validateAppealMessage(`   ${twenty.slice(0, 19)}\u0000‮  \n\n`), { ok: false, code: "message_too_short" });
    assert.deepEqual(validateAppealMessage(`  ${twenty}\r\n`), { ok: true, text: twenty });
    assert.equal(validateAppealMessage("x".repeat(3_000)).ok, true);
    assert.deepEqual(validateAppealMessage("x".repeat(3_001)), { ok: false, code: "message_too_long" });
    assert.deepEqual(validateAppealMessage("   \n  "), { ok: false, code: "message_required" });
    assert.deepEqual(validateAppealMessage(undefined), { ok: false, code: "message_required" });
    assert.deepEqual(validateAppealMessage(42), { ok: false, code: "invalid_body" });
    assert.deepEqual(validateAppealMessage(["x".repeat(30)]), { ok: false, code: "invalid_body" });
});
