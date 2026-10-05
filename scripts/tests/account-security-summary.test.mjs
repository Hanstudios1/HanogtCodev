// Run: node --test scripts/tests/
// The Security page's account status (src/lib/account-security.ts): which
// checks it lists for an account and how it reads the server's answer.
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { LOW_RECOVERY_CODES, openActions, readSecuritySummary, securityChecks } = await load("lib/account-security.ts");

const summary = (overrides = {}) => ({
    provider: "credentials",
    hasPassword: true,
    twoFactor: { enabled: false, recoveryCodesLeft: 0 },
    lastLoginAt: "2026-10-05T10:00:00.000Z",
    sessionSince: null,
    ...overrides,
});

test("two-step verification off: one thing to do", () => {
    const checks = securityChecks(summary());
    assert.deepEqual(checks, [
        { id: "password", state: "ok" },
        { id: "twoFactor", state: "action" },
        { id: "sessions", state: "info" },
    ]);
    assert.equal(openActions(checks), 1);
});

test("a Google account without a password is fine, but two-step verification still needs one", () => {
    const checks = securityChecks(summary({ provider: "google", hasPassword: false }));
    assert.deepEqual(checks.map((check) => [check.id, check.state]), [["password", "info"], ["twoFactor", "action"], ["sessions", "info"]]);
});

test("with two-step verification, the recovery codes are checked too", () => {
    const plenty = securityChecks(summary({ twoFactor: { enabled: true, recoveryCodesLeft: 8 } }));
    assert.deepEqual(plenty.map((check) => [check.id, check.state]), [["password", "ok"], ["twoFactor", "ok"], ["recovery", "ok"], ["sessions", "info"]]);
    assert.equal(openActions(plenty), 0);
    const few = securityChecks(summary({ twoFactor: { enabled: true, recoveryCodesLeft: LOW_RECOVERY_CODES - 1 } }));
    assert.equal(few.find((check) => check.id === "recovery").state, "action");
    assert.equal(securityChecks(summary({ twoFactor: { enabled: true, recoveryCodesLeft: LOW_RECOVERY_CODES } })).find((check) => check.id === "recovery").state, "ok");
});

test("the server's answer is read defensively", () => {
    assert.equal(readSecuritySummary(null), null);
    assert.equal(readSecuritySummary({ error: "Etkin oturum gerekli.", code: "session" }), null);
    assert.equal(readSecuritySummary({ hasPassword: "yes", twoFactor: { enabled: true } }), null);
    assert.deepEqual(readSecuritySummary({
        provider: "github",
        hasPassword: false,
        twoFactor: { enabled: false, recoveryCodesLeft: 7 },
        lastLoginAt: "not a date",
        sessionSince: "2026-10-05T09:30:00Z",
    }), {
        provider: null,
        hasPassword: false,
        // Codes only count while two-step verification is on.
        twoFactor: { enabled: false, recoveryCodesLeft: 0 },
        lastLoginAt: null,
        sessionSince: "2026-10-05T09:30:00.000Z",
    });
    assert.equal(readSecuritySummary({ provider: "google", hasPassword: true, twoFactor: { enabled: true, recoveryCodesLeft: -2 } }).twoFactor.recoveryCodesLeft, 0);
    assert.equal(readSecuritySummary({ provider: "google", hasPassword: true, twoFactor: { enabled: true, recoveryCodesLeft: 1e9 } }).twoFactor.recoveryCodesLeft, 99);
});
