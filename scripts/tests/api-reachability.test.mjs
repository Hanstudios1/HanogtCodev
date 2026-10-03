// Run: node --test scripts/tests/*.test.mjs
// Cloud Health's check that apps and bots, not only browsers, reach the
// developer API through Cloudflare (lib/server/api-reachability.ts).
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const probe = await load("lib/server/api-reachability.ts");

const answer = (status, headers = {}, body = null) => new Response(body === null ? "" : typeof body === "string" ? body : JSON.stringify(body), { status, headers });

test("the site's own 401 for a request without a key means the way in is open", async () => {
    let seen = null;
    const result = await probe.probePublicApi("https://hanogtcodev.com", {
        fetchImpl: async (url, init) => {
            seen = { url: String(url), init };
            return answer(401, { "content-type": "application/json" }, { error: { code: "missing_api_key", type: "invalid_request_error" } });
        },
    });
    assert.deepEqual(result, { outcome: "ok", status: 401 });
    assert.equal(seen.url, "https://hanogtcodev.com/api/v1/models");
    assert.equal(seen.init.redirect, "manual", "redirects are reported, not followed");
    assert.equal(seen.init.headers["User-Agent"], probe.API_PROBE_USER_AGENT, "asks like an API client, not a browser");
    assert.equal(seen.init.headers.Authorization, undefined, "no key is sent");
});

test("a Cloudflare challenge or block page is a failure with the reason", async () => {
    const challenged = await probe.probePublicApi("https://hanogtcodev.com", {
        fetchImpl: async () => answer(403, { "content-type": "text/html; charset=UTF-8", "cf-mitigated": "challenge", server: "cloudflare" }, "<html>Just a moment...</html>"),
    });
    assert.equal(challenged.outcome, "challenged");
    assert.match(challenged.detail, /HTTP 403 · cf-mitigated: challenge · text\/html/);
    const blocked = probe.classifyApiProbe({ status: 403, contentType: "text/html", cfMitigated: null, server: "cloudflare", location: null, code: null });
    assert.equal(blocked.outcome, "challenged", "a block page without the header too");
});

test("other answers are reported as they are", async () => {
    const redirect = probe.classifyApiProbe({ status: 308, contentType: "", cfMitigated: null, server: "Vercel", location: "https://www.hanogtcodev.com/api/v1/models", code: null });
    assert.deepEqual(redirect, { outcome: "unexpected", status: 308, detail: "HTTP 308 · → www.hanogtcodev.com" });
    const other = probe.classifyApiProbe({ status: 404, contentType: "text/html", cfMitigated: null, server: "Vercel", location: null, code: null });
    assert.equal(other.outcome, "unexpected", "an old deployment without /api/v1 isn't Cloudflare's fault");
    const ownError = probe.classifyApiProbe({ status: 401, contentType: "application/json", cfMitigated: null, server: "cloudflare", location: null, code: "invalid_api_key" });
    assert.equal(ownError.outcome, "unexpected");
});

test("local addresses aren't probed, and a failed request says why", async () => {
    let called = false;
    const fetchImpl = async () => {
        called = true;
        throw new TypeError("fetch failed");
    };
    for (const origin of ["http://localhost:3000", "http://127.0.0.1:3100", "http://hanogtcodev.com", "not a url"]) {
        const result = await probe.probePublicApi(origin, { fetchImpl });
        assert.equal(result.outcome, "local", origin);
    }
    assert.equal(called, false);
    const result = await probe.probePublicApi("https://hanogtcodev.com", { fetchImpl });
    assert.deepEqual(result, { outcome: "unreachable", detail: "TypeError: fetch failed" });
});
