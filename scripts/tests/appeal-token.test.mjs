// Run: node --test scripts/tests/
// Sign-in tokens (src/lib/server/appeal-token.ts) let someone who can't finish
// signing in still reach the team from /login: a suspended account appeals,
// and a person who lost their second factor asks for a 2FA reset. /login
// reads the tokens back out of sign-in errors (src/lib/auth-client.ts).
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { load } from "./setup.mjs";

const {
    APPEAL_TOKEN_MAX_LENGTH, APPEAL_TOKEN_TTL_MS, SIGN_IN_TOKEN_MAX_LENGTH, SIGN_IN_TOKEN_PURPOSES, SIGN_IN_TOKEN_TTL_MS,
    deriveSignInTokenKey, encodeAppealToken, encodeSignInToken, issueAppealToken, issueSignInToken,
    issuePasswordRecoveryToken, issueTwoFactorRecoveryToken, readAppealToken, readPasswordRecoveryToken, readSignInToken,
    readTwoFactorRecoveryToken, verifyAppealToken, verifySignInToken,
} = await load("lib/server/appeal-token.ts");
const {
    ACCOUNT_SUSPENDED, APPEAL_LIMITS, SIGN_IN_REQUEST_LIMITS, TWO_FACTOR_RECOVERY, normalizeAppealMessage, normalizeSignInRequestMessage,
    readAuthError, validateSignInRequestMessage,
} = await load("lib/auth-client.ts");

const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const SECRET = "test-secret";
/** The per-purpose signing keys the module derives from SECRET (used to forge tokens by hand). */
const KEY = deriveSignInTokenKey(SECRET, "appeal");
const RECOVERY_KEY = deriveSignInTokenKey(SECRET, "2fa-recovery");
const EMAIL = "ayse.yilmaz+test@example.com";
const TOKEN_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

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
    assert.equal(SIGN_IN_TOKEN_TTL_MS, 30 * 60_000);
    assert.equal(APPEAL_TOKEN_TTL_MS, SIGN_IN_TOKEN_TTL_MS);
    const expiresAt = NOW + APPEAL_TOKEN_TTL_MS;
    const token = encodeAppealToken(EMAIL, expiresAt, SECRET);
    assert.match(token, TOKEN_SHAPE);
    assert.ok(token.length <= APPEAL_TOKEN_MAX_LENGTH);
    assert.deepEqual(verifyAppealToken(token, SECRET, NOW), { email: EMAIL, expiresAt });
    assert.deepEqual(verifyAppealToken(token, SECRET, expiresAt - 1), { email: EMAIL, expiresAt });
    assert.equal(verifyAppealToken(token, SECRET, expiresAt), null);
    assert.equal(verifyAppealToken(token, SECRET, expiresAt + 60_000), null);
    // A Buffer secret works the same as its string.
    assert.deepEqual(verifyAppealToken(token, Buffer.from(SECRET), NOW), { email: EMAIL, expiresAt });

    const recovery = encodeSignInToken("2fa-recovery", EMAIL, expiresAt, SECRET);
    assert.match(recovery, TOKEN_SHAPE);
    assert.deepEqual(verifySignInToken(recovery, "2fa-recovery", SECRET, NOW), { email: EMAIL, expiresAt });
    assert.equal(verifySignInToken(recovery, "2fa-recovery", SECRET, expiresAt), null);
});

test("the longest address still fits the length limit, for every purpose", () => {
    const email = `${"a".repeat(64)}@${"b".repeat(185)}.com`;
    assert.equal(email.length, 254);
    for (const purpose of SIGN_IN_TOKEN_PURPOSES) {
        const token = encodeSignInToken(purpose, email, NOW + SIGN_IN_TOKEN_TTL_MS, SECRET);
        assert.ok(token.length <= SIGN_IN_TOKEN_MAX_LENGTH, purpose);
        assert.equal(verifySignInToken(token, purpose, SECRET, NOW)?.email, email, purpose);
    }
});

test("tokens can't claim a longer life than the module issues", () => {
    // Allowed: a little clock difference between instances.
    assert.ok(verifyAppealToken(encodeAppealToken(EMAIL, NOW + APPEAL_TOKEN_TTL_MS + 30_000, SECRET), SECRET, NOW));
    assert.equal(verifyAppealToken(encodeAppealToken(EMAIL, NOW + APPEAL_TOKEN_TTL_MS + 5 * 60_000, SECRET), SECRET, NOW), null);
    assert.equal(verifyAppealToken(encodeAppealToken(EMAIL, NOW + 365 * 86_400_000, SECRET), SECRET, NOW), null);
    assert.equal(verifySignInToken(encodeSignInToken("2fa-recovery", EMAIL, NOW + 365 * 86_400_000, SECRET), "2fa-recovery", SECRET, NOW), null);
});

test("keys are domain-separated: per purpose and from every other use of the secret", () => {
    const expiresAt = NOW + APPEAL_TOKEN_TTL_MS;
    const token = encodeAppealToken(EMAIL, expiresAt, SECRET);
    assert.equal(verifyAppealToken(token, "another-secret", NOW), null);
    assert.deepEqual(KEY, createHmac("sha256", SECRET).update("hanogt-appeal-v1").digest());
    assert.deepEqual(RECOVERY_KEY, createHmac("sha256", SECRET).update("hanogt-2fa-recovery-v1").digest());
    assert.notDeepEqual(KEY, RECOVERY_KEY);
    // The module signs with the derived key: the same text signed by hand with that key verifies...
    assert.equal(signClaims(`appeal|${EMAIL}|${expiresAt}`, KEY), token);
    // ...but signed with the raw secret, or a key the same secret makes for another use, it doesn't.
    assert.equal(verifyAppealToken(signClaims(`appeal|${EMAIL}|${expiresAt}`, Buffer.from(SECRET)), SECRET, NOW), null);
    const otherUse = createHmac("sha256", SECRET).update("hanogt:auth-handoff:v1").digest();
    assert.equal(verifyAppealToken(signClaims(`appeal|${EMAIL}|${expiresAt}`, otherUse), SECRET, NOW), null);
});

test("a token of one purpose never verifies as another", () => {
    const expiresAt = NOW + SIGN_IN_TOKEN_TTL_MS;
    const keys = Object.fromEntries(SIGN_IN_TOKEN_PURPOSES.map((purpose) => [purpose, deriveSignInTokenKey(SECRET, purpose)]));
    assert.deepEqual(keys.appeal, KEY);
    assert.deepEqual(keys["2fa-recovery"], RECOVERY_KEY);
    assert.deepEqual(keys["password-recovery"], createHmac("sha256", SECRET).update("hanogt-password-recovery-v1").digest());
    const tokens = Object.fromEntries(SIGN_IN_TOKEN_PURPOSES.map((purpose) => [purpose, encodeSignInToken(purpose, EMAIL, expiresAt, SECRET)]));
    assert.deepEqual([...SIGN_IN_TOKEN_PURPOSES].sort(), ["2fa-recovery", "appeal", "password-recovery"]);

    // Every (issued purpose, checked purpose) pair under the same secret: only the exact match passes.
    for (const issued of SIGN_IN_TOKEN_PURPOSES) {
        for (const checked of SIGN_IN_TOKEN_PURPOSES) {
            const expected = issued === checked ? { email: EMAIL, expiresAt } : null;
            assert.deepEqual(verifySignInToken(tokens[issued], checked, SECRET, NOW), expected, `issued ${issued}, checked as ${checked}`);
        }
    }
    assert.equal(verifyAppealToken(tokens["2fa-recovery"], SECRET, NOW), null);
    assert.equal(verifyAppealToken(tokens["password-recovery"], SECRET, NOW), null);
    for (const issued of SIGN_IN_TOKEN_PURPOSES) {
        for (const other of SIGN_IN_TOKEN_PURPOSES.filter((purpose) => purpose !== issued)) {
            assert.notEqual(tokens[issued].split(".")[0], tokens[other].split(".")[0], `${issued} / ${other} payload`);
            assert.notEqual(tokens[issued].split(".")[1], tokens[other].split(".")[1], `${issued} / ${other} signature`);
        }
    }

    // Both barriers on their own: the right claims under another purpose's key (key check),
    // and another purpose's claims under the right key (purpose check). Refused either way.
    for (const purpose of SIGN_IN_TOKEN_PURPOSES) {
        for (const other of SIGN_IN_TOKEN_PURPOSES.filter((candidate) => candidate !== purpose)) {
            assert.equal(verifySignInToken(signClaims(`${purpose}|${EMAIL}|${expiresAt}`, keys[other]), purpose, SECRET, NOW), null, `${purpose} claims, ${other} key`);
            assert.equal(verifySignInToken(signClaims(`${other}|${EMAIL}|${expiresAt}`, keys[purpose]), purpose, SECRET, NOW), null, `${other} claims, ${purpose} key`);
        }
        assert.ok(verifySignInToken(signClaims(`${purpose}|${EMAIL}|${expiresAt}`, keys[purpose]), purpose, SECRET, NOW), `${purpose} claims, ${purpose} key`);
    }

    // One purpose's signature on another's payload doesn't work either.
    for (const purpose of SIGN_IN_TOKEN_PURPOSES) {
        for (const other of SIGN_IN_TOKEN_PURPOSES.filter((candidate) => candidate !== purpose)) {
            const [payload] = tokens[purpose].split(".");
            const [, signature] = tokens[other].split(".");
            assert.equal(verifySignInToken(`${payload}.${signature}`, purpose, SECRET, NOW), null, `${purpose} payload, ${other} signature`);
        }
    }
});

test("password-recovery tokens: issued for a pending step-up, read back by /api/support/password-recovery", () => {
    withEnv({ NEXTAUTH_SECRET: SECRET }, () => {
        const token = issuePasswordRecoveryToken(EMAIL, NOW);
        assert.match(token, TOKEN_SHAPE);
        assert.deepEqual(readPasswordRecoveryToken(token, NOW), { email: EMAIL, expiresAt: NOW + SIGN_IN_TOKEN_TTL_MS });
        assert.equal(readPasswordRecoveryToken(token, NOW + SIGN_IN_TOKEN_TTL_MS), null);
        // Not an appeal or a 2FA reset, and those aren't one either.
        assert.equal(readAppealToken(token, NOW), null);
        assert.equal(readTwoFactorRecoveryToken(token, NOW), null);
        assert.equal(readPasswordRecoveryToken(issueTwoFactorRecoveryToken(EMAIL, NOW), NOW), null);
        assert.equal(readPasswordRecoveryToken(issueAppealToken(EMAIL, NOW), NOW), null);
    });
    // Without a secret nothing is issued.
    withEnv({}, () => assert.equal(issuePasswordRecoveryToken(EMAIL, NOW), null));
});

test("unknown purposes are refused", () => {
    const token = encodeAppealToken(EMAIL, NOW + APPEAL_TOKEN_TTL_MS, SECRET);
    for (const purpose of ["admin", "Appeal", "2FA-RECOVERY", "", undefined, null]) {
        assert.equal(verifySignInToken(token, purpose, SECRET, NOW), null, String(purpose));
        assert.throws(() => deriveSignInTokenKey(SECRET, purpose), /purpose/, String(purpose));
        assert.throws(() => encodeSignInToken(purpose, EMAIL, NOW + APPEAL_TOKEN_TTL_MS, SECRET), /purpose/, String(purpose));
    }
    // A hand-made "admin" token under either real key stays useless for every real purpose.
    for (const key of [KEY, RECOVERY_KEY]) {
        const forged = signClaims(`admin|${EMAIL}|${NOW + APPEAL_TOKEN_TTL_MS}`, key);
        for (const purpose of SIGN_IN_TOKEN_PURPOSES) assert.equal(verifySignInToken(forged, purpose, SECRET, NOW), null);
    }
});

test("tampered tokens are rejected", () => {
    const token = encodeAppealToken(EMAIL, NOW + APPEAL_TOKEN_TTL_MS, SECRET);
    const [payload, signature] = token.split(".");

    // Another address (or a later expiry) under the original signature.
    const otherEmail = Buffer.from(`appeal|mehmet@example.com|${NOW + APPEAL_TOKEN_TTL_MS}`).toString("base64url");
    assert.equal(verifyAppealToken(`${otherEmail}.${signature}`, SECRET, NOW), null);
    const longer = Buffer.from(`appeal|${EMAIL}|${NOW + APPEAL_TOKEN_TTL_MS + 1}`).toString("base64url");
    assert.equal(verifyAppealToken(`${longer}.${signature}`, SECRET, NOW), null);

    // Every single-character change of the signature.
    for (let index = 0; index < signature.length; index += 1) {
        const replacement = ALPHABET[(ALPHABET.indexOf(signature[index]) + 1) % ALPHABET.length];
        const forged = `${payload}.${signature.slice(0, index)}${replacement}${signature.slice(index + 1)}`;
        assert.equal(verifyAppealToken(forged, SECRET, NOW), null, `signature change at ${index}`);
    }

    // Signatures don't move between tokens.
    const other = encodeAppealToken("mehmet@example.com", NOW + APPEAL_TOKEN_TTL_MS, SECRET);
    assert.equal(verifyAppealToken(`${other.split(".")[0]}.${signature}`, SECRET, NOW), null);
});

test("only the canonical encoding is accepted", () => {
    // An address whose payload ends in a partial base64 group: its last character carries unused bits.
    const email = ["al@example.com", "ali@example.com", "alia@example.com"]
        .find((candidate) => encodeAppealToken(candidate, NOW + APPEAL_TOKEN_TTL_MS, SECRET).split(".")[0].length % 4 === 3);
    assert.ok(email);
    const token = encodeAppealToken(email, NOW + APPEAL_TOKEN_TTL_MS, SECRET);
    const [payload, signature] = token.split(".");
    const last = payload[payload.length - 1];
    const variant = `${payload.slice(0, -1)}${ALPHABET[ALPHABET.indexOf(last) ^ 1]}`;
    // Same bytes, different spelling: a lenient decoder would accept it.
    assert.deepEqual(Buffer.from(variant, "base64url"), Buffer.from(payload, "base64url"));
    assert.equal(verifyAppealToken(`${variant}.${signature}`, SECRET, NOW), null);
    assert.equal(verifyAppealToken(`${payload}=.${signature}`, SECRET, NOW), null);
    assert.ok(verifyAppealToken(token, SECRET, NOW));
});

test("malformed input never throws and is rejected", () => {
    const token = encodeAppealToken(EMAIL, NOW + APPEAL_TOKEN_TTL_MS, SECRET);
    const [payload, signature] = token.split(".");
    for (const value of [
        undefined, null, 42, {}, [], "", ".", token.replace(".", ""), `${token}.`, `.${signature}`, `${payload}.`,
        `${payload}.${signature}x`, `${payload}.${signature.slice(1)}`, `${payload}..${signature}`, `${payload}.${signature}.${signature}`,
        `${payload.replace(/^./, "+")}.${signature}`, `${payload}/.${signature}`, ` ${token}`, `${token}\n`,
        `${"A".repeat(APPEAL_TOKEN_MAX_LENGTH)}.${signature}`,
    ]) {
        assert.equal(verifyAppealToken(value, SECRET, NOW), null, `input ${JSON.stringify(value)?.slice(0, 40)}`);
        assert.equal(verifySignInToken(value, "2fa-recovery", SECRET, NOW), null, `input ${JSON.stringify(value)?.slice(0, 40)}`);
    }
});

test("validly signed but malformed claims are rejected", () => {
    const expiry = NOW + APPEAL_TOKEN_TTL_MS;
    for (const claims of [
        // The format before purposes existed: no purpose at all.
        `${EMAIL}|${expiry}`,
        `appeal|${EMAIL}`,
        `appeal|${EMAIL}|`,
        `appeal||${expiry}`,
        `|${EMAIL}|${expiry}`,
        `Appeal|${EMAIL}|${expiry}`,
        `appeal |${EMAIL}|${expiry}`,
        `appeal|${EMAIL}|${expiry}|`,
        `appeal|${EMAIL}|${expiry}|2fa-recovery`,
        `appeal|${EMAIL}|soon`,
        `appeal|${EMAIL}|${expiry}.5`,
        `appeal|${EMAIL}|-${expiry}`,
        `appeal|${EMAIL}|1e15`,
        `appeal|${EMAIL}|${"9".repeat(16)}`,
        `appeal|AYSE@example.com|${expiry}`,
        `appeal| ${EMAIL}|${expiry}`,
        `appeal|ayse@example|${expiry}`,
        `appeal|../credentials/x@example.com|${expiry}`,
        `appeal|ayşe@example.com|${expiry}`,
        `appeal|a..b@example.com|${expiry}`,
        // Another purpose under the appeal key.
        `2fa-recovery|${EMAIL}|${expiry}`,
    ]) {
        assert.equal(verifyAppealToken(signClaims(claims), SECRET, NOW), null, claims);
    }
    // The helper itself produces tokens the module accepts.
    assert.deepEqual(verifyAppealToken(signClaims(`appeal|${EMAIL}|${expiry}`), SECRET, NOW), { email: EMAIL, expiresAt: expiry });
    assert.deepEqual(verifySignInToken(signClaims(`2fa-recovery|${EMAIL}|${expiry}`, RECOVERY_KEY), "2fa-recovery", SECRET, NOW), { email: EMAIL, expiresAt: expiry });
});

test("issue/read use NEXTAUTH_SECRET (or AUTH_SECRET) and fail closed without one", () => {
    withEnv({ NEXTAUTH_SECRET: "env-secret" }, () => {
        const token = issueAppealToken(EMAIL, NOW);
        assert.match(token, TOKEN_SHAPE);
        assert.deepEqual(readAppealToken(token, NOW), { email: EMAIL, expiresAt: NOW + APPEAL_TOKEN_TTL_MS });
        assert.deepEqual(verifyAppealToken(token, "env-secret", NOW), { email: EMAIL, expiresAt: NOW + APPEAL_TOKEN_TTL_MS });
        assert.equal(readAppealToken(token, NOW + APPEAL_TOKEN_TTL_MS), null);
        // Addresses that can't be document ids never get a token.
        assert.equal(issueAppealToken("Ayse@Example.com", NOW), null);
        assert.equal(issueAppealToken("../x@example.com", NOW), null);
        assert.equal(issueAppealToken("", NOW), null);
        assert.equal(issueTwoFactorRecoveryToken("../x@example.com", NOW), null);
        assert.equal(issueTwoFactorRecoveryToken("", NOW), null);
    });
    const fromAuthSecret = withEnv({ AUTH_SECRET: "auth-secret" }, () => issueAppealToken(EMAIL, NOW));
    assert.match(fromAuthSecret, TOKEN_SHAPE);
    withEnv({ AUTH_SECRET: "auth-secret" }, () => assert.equal(readAppealToken(fromAuthSecret, NOW)?.email, EMAIL));
    withEnv({ NEXTAUTH_SECRET: "rotated" }, () => assert.equal(readAppealToken(fromAuthSecret, NOW), null));
    withEnv({}, () => {
        assert.equal(issueAppealToken(EMAIL, NOW), null);
        assert.equal(issueTwoFactorRecoveryToken(EMAIL, NOW), null);
        assert.equal(readAppealToken(fromAuthSecret, NOW), null);
    });
});

test("2FA recovery tokens from the environment only read back as 2FA recovery tokens", () => {
    withEnv({ NEXTAUTH_SECRET: "env-secret" }, () => {
        const recovery = issueTwoFactorRecoveryToken(EMAIL, NOW);
        const appeal = issueAppealToken(EMAIL, NOW);
        assert.match(recovery, TOKEN_SHAPE);
        assert.notEqual(recovery, appeal);
        assert.deepEqual(readTwoFactorRecoveryToken(recovery, NOW), { email: EMAIL, expiresAt: NOW + SIGN_IN_TOKEN_TTL_MS });
        assert.deepEqual(readSignInToken(recovery, "2fa-recovery", NOW), { email: EMAIL, expiresAt: NOW + SIGN_IN_TOKEN_TTL_MS });
        assert.equal(issueSignInToken("2fa-recovery", EMAIL, NOW), recovery);
        // Neither kind of token opens the other door.
        assert.equal(readAppealToken(recovery, NOW), null);
        assert.equal(readSignInToken(recovery, "appeal", NOW), null);
        assert.equal(readTwoFactorRecoveryToken(appeal, NOW), null);
        assert.equal(readSignInToken(appeal, "2fa-recovery", NOW), null);
        assert.equal(readTwoFactorRecoveryToken(recovery, NOW + SIGN_IN_TOKEN_TTL_MS), null);
    });
});

test("tokens survive the sign-in redirects and are split off the error code", () => {
    const token = encodeAppealToken(EMAIL, NOW + APPEAL_TOKEN_TTL_MS, SECRET);
    const recovery = encodeSignInToken("2fa-recovery", EMAIL, NOW + SIGN_IN_TOKEN_TTL_MS, SECRET);
    const base = "https://hanogtcodev.com";

    // Credentials: authorize() throws "AccountSuspended:<token>", NextAuth URI-encodes it into /api/auth/error.
    const code = `${ACCOUNT_SUSPENDED}:${token}`;
    assert.match(code, /^[\x21-\x7e]+$/, "codes in redirect URLs and headers must be plain ASCII");
    const credentialsUrl = new URL(`${base}/api/auth/error?error=${encodeURIComponent(code)}`);
    assert.deepEqual(readAuthError(credentialsUrl.searchParams.get("error")), { code: ACCOUNT_SUSPENDED, appealToken: token, recoveryToken: null });

    // Google: completeSignIn() redirects to /login?error=AccountSuspended&appeal=<token>.
    const googleUrl = new URL(`${base}/login?error=${ACCOUNT_SUSPENDED}&appeal=${encodeURIComponent(token)}`);
    assert.deepEqual(readAuthError(googleUrl.searchParams.get("error"), googleUrl.searchParams.get("appeal")), { code: ACCOUNT_SUSPENDED, appealToken: token, recoveryToken: null });

    // 2FA recovery: authorize() throws "TwoFactorRecovery:<token>" the same way.
    const recoveryCode = `${TWO_FACTOR_RECOVERY}:${recovery}`;
    assert.match(recoveryCode, /^[\x21-\x7e]+$/);
    const recoveryUrl = new URL(`${base}/api/auth/error?error=${encodeURIComponent(recoveryCode)}`);
    assert.deepEqual(readAuthError(recoveryUrl.searchParams.get("error")), { code: TWO_FACTOR_RECOVERY, appealToken: null, recoveryToken: recovery });

    // Without a (well-formed) token the code stays, and nothing token-like is left inside it.
    assert.deepEqual(readAuthError(ACCOUNT_SUSPENDED), { code: ACCOUNT_SUSPENDED, appealToken: null, recoveryToken: null });
    assert.deepEqual(readAuthError(`${ACCOUNT_SUSPENDED}:<script>`), { code: ACCOUNT_SUSPENDED, appealToken: null, recoveryToken: null });
    assert.deepEqual(readAuthError(ACCOUNT_SUSPENDED, "not a token"), { code: ACCOUNT_SUSPENDED, appealToken: null, recoveryToken: null });
    assert.deepEqual(readAuthError(`${TWO_FACTOR_RECOVERY}:<script>`), { code: TWO_FACTOR_RECOVERY, appealToken: null, recoveryToken: null });
    // Tokens only count where their code puts them.
    assert.deepEqual(readAuthError(TWO_FACTOR_RECOVERY, recovery), { code: TWO_FACTOR_RECOVERY, appealToken: null, recoveryToken: null });
    assert.deepEqual(readAuthError("CredentialsSignin", token), { code: "CredentialsSignin", appealToken: null, recoveryToken: null });
    assert.deepEqual(readAuthError(null, token), { code: null, appealToken: null, recoveryToken: null });
});

test("request messages: 20 to 3000 characters after normalising", () => {
    assert.deepEqual(SIGN_IN_REQUEST_LIMITS, { messageMin: 20, message: 3_000 });
    // The appeal form's names are the same rules.
    assert.equal(APPEAL_LIMITS, SIGN_IN_REQUEST_LIMITS);
    assert.equal(normalizeAppealMessage, normalizeSignInRequestMessage);
    const twenty = "Hesabım yanlışlıkla!!";
    assert.equal(twenty.length, 21);
    assert.deepEqual(validateSignInRequestMessage(twenty.slice(0, 20)), { ok: true, text: twenty.slice(0, 20) });
    assert.deepEqual(validateSignInRequestMessage(twenty.slice(0, 19)), { ok: false, code: "message_too_short" });
    // Surrounding whitespace and unsafe characters don't count.
    assert.deepEqual(validateSignInRequestMessage(`   ${twenty.slice(0, 19)}\u0000‮  \n\n`), { ok: false, code: "message_too_short" });
    assert.deepEqual(validateSignInRequestMessage(`  ${twenty}\r\n`), { ok: true, text: twenty });
    assert.equal(validateSignInRequestMessage("x".repeat(3_000)).ok, true);
    assert.deepEqual(validateSignInRequestMessage("x".repeat(3_001)), { ok: false, code: "message_too_long" });
    assert.deepEqual(validateSignInRequestMessage("   \n  "), { ok: false, code: "message_required" });
    assert.deepEqual(validateSignInRequestMessage(undefined), { ok: false, code: "message_required" });
    assert.deepEqual(validateSignInRequestMessage(42), { ok: false, code: "invalid_body" });
    assert.deepEqual(validateSignInRequestMessage(["x".repeat(30)]), { ok: false, code: "invalid_body" });
});
