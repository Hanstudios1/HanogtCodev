// Run: node --test scripts/tests/
// "Bildirimleri kontrol et" (lib/server/paddle-notifications.ts): Paddle's
// notification destinations and delivery log read back, what keeps
// notifications from arriving, and that no secret or customer detail leaves.
import assert from "node:assert/strict";
import test from "node:test";
import { json, setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();
const PADDLE_HOST = "127.0.0.1:8785";
const SECRET = "pdl_ntfset_01abcdefghijklmnopqrstuvwxyz_abcdefghijklmnopqrstuvwxyz012345";
const OTHER_SECRET = "pdl_ntfset_01zyxwvutsrqponmlkjihgfedcba_zyxwvutsrqponmlkjihgfedcba543210";
Object.assign(process.env, {
    PADDLE_API_KEY: "pdl_sdbx_apikey_01abcdefghijklmnopqrstuvwx_testkeytestkeytestkeyXX",
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "test_0123456789abcdefghijkl",
    PADDLE_WEBHOOK_SECRET: SECRET,
    PADDLE_API_BASE_URL: `http://${PADDLE_HOST}`,
});

const notifications = await load("lib/server/paddle-notifications.ts");
const paddle = await load("lib/server/paddle.ts");

const SITE = "https://hanogtcodev.com";
const ALL_EVENTS = [...notifications.REQUIRED_EVENTS, "subscription.imported", "customer.created"].map((name) => ({ name, description: name, group: "x", available_versions: [1] }));
const destination = (overrides = {}) => ({
    id: "ntfset_01aaaaaaaaaaaaaaaaaaaaaaaaaa",
    description: "Hanogt",
    type: "url",
    destination: `${SITE}/api/paddle/webhook`,
    active: true,
    api_version: 1,
    include_sensitive_fields: false,
    subscribed_events: ALL_EVENTS,
    endpoint_secret_key: SECRET,
    traffic_source: "platform",
    ...overrides,
});
const notification = (id, status, overrides = {}) => ({
    id,
    type: "subscription.created",
    status,
    payload: { data: { custom_data: { hanogt_account: "ali@example.com" }, customer_id: "ctm_01aaaaaaaaaaaaaaaaaaaaaaaa" } },
    occurred_at: "2026-10-03T10:00:00Z",
    delivered_at: status === "delivered" ? "2026-10-03T10:00:01Z" : null,
    replayed_at: null,
    origin: "event",
    last_attempt_at: "2026-10-03T10:05:00Z",
    retry_at: status === "needs_retry" ? "2026-10-03T10:20:00Z" : null,
    times_attempted: status === "delivered" ? 1 : 3,
    notification_setting_id: "ntfset_01aaaaaaaaaaaaaaaaaaaaaaaaaa",
    ...overrides,
});

/** Paddle's notification endpoints; `forbid` answers 403 for a path's first part. */
function createPaddle({ settings = [destination()], deliveries = [], logs = {}, forbid = [] } = {}) {
    const calls = [];
    const route = async (url, init = {}) => {
        assert.equal(url.host, PADDLE_HOST, `unexpected request to ${url.href}`);
        const method = (init.method || "GET").toUpperCase();
        calls.push({ method, path: url.pathname, search: url.search });
        const parts = url.pathname.split("/").filter(Boolean);
        if (forbid.includes(parts[0])) return json(403, { error: { type: "request_error", code: "forbidden", detail: "permission" } });
        if (parts[0] === "notification-settings") return json(200, { data: settings });
        if (parts[0] === "notifications" && parts.length === 1) {
            const wanted = (url.searchParams.get("notification_setting_id") ?? "").split(",");
            return json(200, { data: deliveries.filter((entry) => wanted.includes(entry.notification_setting_id)) });
        }
        if (parts[0] === "notifications" && parts[2] === "logs") return json(200, { data: logs[parts[1]] ?? [] });
        throw new Error(`Unsupported Paddle request ${method} ${url.pathname}`);
    };
    return { calls, route };
}

async function check(seed, run) {
    paddle.forgetPaddleCaches();
    const api = createPaddle(seed);
    return withBackend({}, { route: api.route }, async () => run(await notifications.checkPaddleNotifications({ siteUrl: SITE, now: new Date("2026-10-03T12:00:00Z") }), api));
}

test("a destination set up right and a delivered notification: all good, and only GET requests", async () => {
    await check({ deliveries: [notification("ntf_01delivered00000000000000", "delivered")] }, (result, api) => {
        assert.equal(result.ok, true);
        assert.deepEqual(result.problems, []);
        assert.equal(result.expectedUrl, `${SITE}/api/paddle/webhook`);
        assert.deepEqual(result.destinations, [{ id: "ntfset_01aaaaaaaaaaaaaaaaaaaaaaaaaa", description: "Hanogt", url: `${SITE}/api/paddle/webhook`, canonicalHost: true, active: true, trafficSource: "platform", missingEvents: [], secretMatches: true }]);
        assert.equal(result.deliveries[0].status, "delivered");
        assert.equal(result.lastFailure, null);
        assert.ok(api.calls.every((call) => call.method === "GET"));
        const text = JSON.stringify(result);
        assert.equal(text.includes("pdl_ntfset_"), false, "the secret never leaves the server");
        assert.equal(text.includes("ali@example.com") || text.includes("ctm_01"), false, "nothing from notification payloads");
    });
});

test("what keeps notifications from arriving: no destination, off, simulation only, missing events, other secret, www", async () => {
    await check({ settings: [destination({ destination: "https://hanogtcodev.com/api/other" }), destination({ id: "ntfset_01mailxxxxxxxxxxxxxxxxxxxx", type: "email", destination: "team@example.com" })] }, (result, api) => {
        assert.deepEqual(result.problems, ["no_destination"]);
        assert.equal(result.ok, false);
        assert.equal(api.calls.some((call) => call.path === "/notifications"), false, "no destination, no deliveries to read");
    });
    await check({ settings: [destination({ active: false, traffic_source: "simulation", subscribed_events: ALL_EVENTS.filter((event) => event.name !== "transaction.completed" && event.name !== "subscription.updated"), endpoint_secret_key: OTHER_SECRET, destination: "https://www.hanogtcodev.com/api/paddle/webhook" })] }, (result) => {
        assert.deepEqual(result.problems.sort(), ["inactive", "missing_events", "other_host", "secret_mismatch", "simulation_only"]);
        assert.deepEqual(result.destinations[0].missingEvents, ["subscription.updated", "transaction.completed"]);
        assert.equal(result.destinations[0].canonicalHost, false);
        assert.equal(JSON.stringify(result).includes("pdl_ntfset_"), false);
    });
    // The right one among several: an active one with the matching secret on the site's address.
    await check({ settings: [destination({ id: "ntfset_01oldxxxxxxxxxxxxxxxxxxxx", endpoint_secret_key: OTHER_SECRET, active: false }), destination()] }, (result) => {
        assert.deepEqual(result.problems, []);
        assert.equal(result.destinations.length, 2);
    });
    await check({ settings: [destination(), destination({ id: "ntfset_01twoxxxxxxxxxxxxxxxxxxxx" })] }, (result) => {
        assert.deepEqual(result.problems, ["several_destinations"]);
        assert.equal(result.ok, true, "a duplicate destination doesn't stop deliveries");
    });
});

test("a failing delivery: Paddle's answer and its cause (Cloudflare page, our own refusals)", async () => {
    const cloudflare = "<!DOCTYPE html><html><head><title>Just a moment...</title><style>body{}</style><script>var x=1</script></head><body>Enable JavaScript and cookies to continue. Performance &amp; security by Cloudflare. Ray ID: 8c1d2e3f</body></html>";
    const seed = {
        deliveries: [notification("ntf_01failingxxxxxxxxxxxxxxxx", "needs_retry"), notification("ntf_01olderdeliveredxxxxxxxxx", "delivered")],
        logs: { ntf_01failingxxxxxxxxxxxxxxxx: [
            { id: "ntflog_01a", response_code: 403, response_content_type: "text/html", response_body: cloudflare, attempted_at: "2026-10-03T10:05:00Z" },
            { id: "ntflog_01b", response_code: 0, response_content_type: null, response_body: "", attempted_at: "2026-10-03T10:00:00Z" },
        ] },
    };
    await check(seed, (result) => {
        assert.deepEqual(result.problems, ["deliveries_failing"]);
        assert.equal(result.ok, false);
        assert.equal(result.lastFailure.cause, "cloudflare");
        assert.equal(result.lastFailure.responseCode, 403, "the newest attempt");
        assert.ok(result.lastFailure.body.startsWith("Just a moment..."), result.lastFailure.body);
        assert.ok(result.lastFailure.body.length <= 160);
        assert.equal(/<|var x|body\{/.test(result.lastFailure.body), false, "markup, scripts and styles are dropped");
    });

    const classify = (responseCode, contentType, body) => notifications.classifyDelivery({ responseCode, contentType, body });
    assert.equal(classify(401, "application/json", "{\"error\":\"invalid_signature\",\"reason\":\"mismatch\"}"), "signature");
    assert.equal(classify(401, "application/json", "{\"error\":\"invalid_signature\",\"reason\":\"expired\"}"), "signature_expired");
    assert.equal(classify(403, "application/json", "{\"error\":\"forbidden\"}"), "ip_allowlist");
    assert.equal(classify(503, "application/json", "{\"error\":\"not_configured\"}"), "not_configured");
    assert.equal(classify(503, "application/json", "{\"error\":\"retry_later\"}"), "ip_list");
    assert.equal(classify(500, "application/json", "{\"error\":\"retry_later\"}"), "processing");
    assert.equal(classify(401, "text/html", "Authentication Required Vercel"), "vercel_protection");
    assert.equal(classify(308, "text/plain", "Redirecting..."), "redirect");
    assert.equal(classify(404, "text/html", "This page could not be found."), "not_found");
    assert.equal(classify(429, null, ""), "rate_limited");
    assert.equal(classify(502, "text/html", "Bad gateway"), "server_error");
    assert.equal(classify(0, null, ""), "no_response");
    assert.equal(classify(null, null, ""), "no_response");
    assert.equal(classify(418, "text/plain", "teapot"), "other");
    assert.equal(notifications.deliveryBodyText("contact ali@example.com\u0000now"), "contact [e-mail] now", "e-mail addresses and control characters are removed");
});

test("missing permissions: what can be read is shown, and which permission to add", async () => {
    await check({ forbid: ["notification-settings"] }, (result) => {
        assert.equal(result.access.settings, "no_permission");
        assert.deepEqual(result.problems, ["no_permission_settings"]);
        assert.equal(result.ok, false);
    });
    await check({ forbid: ["notifications"] }, (result) => {
        assert.equal(result.access.settings, "ok");
        assert.equal(result.access.notifications, "no_permission");
        assert.deepEqual(result.problems, ["no_permission_notifications"]);
        assert.equal(result.ok, true, "the destination itself is fine");
    });
    const unset = { ...process.env };
    delete process.env.PADDLE_WEBHOOK_SECRET;
    try {
        await check({}, (result) => {
            assert.ok(result.problems.includes("secret_unset"));
            assert.equal(result.destinations[0].secretMatches, null);
        });
    } finally {
        process.env.PADDLE_WEBHOOK_SECRET = unset.PADDLE_WEBHOOK_SECRET;
    }
});
