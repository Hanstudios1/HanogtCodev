// Run: node --test scripts/tests/
// ICE servers for voice calls (lib/server/turn.ts): Cloudflare Realtime TURN,
// coturn's REST secret, fixed credentials, and what happens when they fail.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { load } from "./setup.mjs";

const turn = await load("lib/server/turn.ts");

const CF = { CLOUDFLARE_TURN_KEY_ID: "key-123", CLOUDFLARE_TURN_KEY_API_TOKEN: "secret-token" };

function cloudflare(status, body) {
    const calls = [];
    const fetcher = async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    };
    return { fetcher, calls };
}

test("provider: Cloudflare first, then coturn, then fixed credentials", () => {
    assert.equal(turn.turnProvider({}), "none");
    assert.equal(turn.turnProvider(CF), "cloudflare");
    assert.equal(turn.turnProvider({ ...CF, TURN_SERVER_URL: "turn:x.example:3478", TURN_SHARED_SECRET: "s" }), "cloudflare");
    assert.equal(turn.turnProvider({ TURN_SERVER_URL: "turn:x.example:3478", TURN_SHARED_SECRET: "s" }), "coturn");
    assert.equal(turn.turnProvider({ TURN_SERVER_URL: "turn:x.example:3478", TURN_USERNAME: "u", TURN_CREDENTIAL: "p" }), "static");
    assert.equal(turn.turnProvider({ TURN_SERVER_URL: "turn:x.example:3478" }), "none");
    // The older variable names Cloudflare's dashboard shows work too.
    assert.equal(turn.turnProvider({ CLOUDFLARE_TURN_TOKEN_ID: "a", CLOUDFLARE_TURN_API_TOKEN: "b" }), "cloudflare");
});

test("URLs: only stun/turn/turns, port 53 dropped", () => {
    assert.deepEqual(turn.cleanIceUrls([
        "stun:stun.cloudflare.com:3478",
        "turn:turn.cloudflare.com:3478?transport=udp",
        "turn:turn.cloudflare.com:53?transport=udp",
        "turns:turn.cloudflare.com:443?transport=tcp",
        "https://evil.example",
        "turn:bad host",
        42,
    ]), ["stun:stun.cloudflare.com:3478", "turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"]);
    assert.deepEqual(turn.cleanIceUrls("turn:a.example:3478"), ["turn:a.example:3478"]);
});

test("Cloudflare: credentials per call, STUN always included", async () => {
    const { fetcher, calls } = cloudflare(201, {
        iceServers: [
            { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] },
            { urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turn:turn.cloudflare.com:53?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"], username: "u1", credential: "c1" },
        ],
    });
    const config = await turn.iceServersFor("ali@example.com", CF, fetcher);
    assert.equal(config.provider, "cloudflare");
    assert.equal(config.turnConfigured, true);
    assert.equal(config.problem, null);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://rtc.live.cloudflare.com/v1/turn/keys/key-123/credentials/generate-ice-servers");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers.Authorization, "Bearer secret-token");
    assert.deepEqual(JSON.parse(calls[0].init.body), { ttl: 3600 });
    const relay = config.iceServers.find((server) => server.username);
    assert.deepEqual(relay, { urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"], username: "u1", credential: "c1" });
    assert.ok(config.iceServers.some((server) => !server.username && server.urls.includes("stun:stun.l.google.com:19302")));
    // Nothing on port 53 reaches the browser.
    assert.ok(!JSON.stringify(config.iceServers).includes(":53"));
});

test("Cloudflare: the older single-object answer is understood", () => {
    assert.deepEqual(turn.readCloudflareIceServers({ iceServers: { urls: ["turn:t.example:3478"], username: "u", credential: "c" } }), [{ urls: ["turn:t.example:3478"], username: "u", credential: "c" }]);
    assert.deepEqual(turn.readCloudflareIceServers({ iceServers: [{ urls: ["turn:t.example:3478"] }] }), []);
    assert.deepEqual(turn.readCloudflareIceServers(null), []);
});

test("Cloudflare down or key revoked: the call still gets STUN and says why", async () => {
    const original = console.warn;
    console.warn = () => undefined;
    try {
        const refused = await turn.iceServersFor("ali@example.com", CF, cloudflare(401, { errors: ["bad"] }).fetcher);
        assert.equal(refused.turnConfigured, false);
        assert.equal(refused.problem, "cloudflare_401");
        assert.equal(refused.iceServers.length, 1);
        const empty = await turn.iceServersFor("ali@example.com", CF, cloudflare(200, { iceServers: [] }).fetcher);
        assert.equal(empty.problem, "cloudflare_empty");
        const offline = await turn.iceServersFor("ali@example.com", CF, async () => { throw new TypeError("fetch failed"); });
        assert.equal(offline.problem, "cloudflare_unreachable");
    } finally {
        console.warn = original;
    }
});

test("coturn REST: time-limited username without the e-mail address, HMAC password", async () => {
    const env = { TURN_SERVER_URL: "turn:turn.example:3478, turns:turn.example:5349?transport=tcp", TURN_SHARED_SECRET: "shh", NEXTAUTH_SECRET: "salt" };
    const config = await turn.iceServersFor("ali@example.com", env, async () => { throw new Error("must not be called"); });
    assert.equal(config.provider, "coturn");
    const relay = config.iceServers.find((server) => server.username);
    assert.deepEqual(relay.urls, ["turn:turn.example:3478", "turns:turn.example:5349?transport=tcp"]);
    const [expires, user] = relay.username.split(":");
    assert.ok(Number(expires) > Date.now() / 1000);
    assert.ok(!relay.username.includes("ali"));
    assert.match(user, /^[0-9a-f]{24}$/);
    assert.equal(relay.credential, createHmac("sha1", "shh").update(relay.username).digest("base64"));
});

test("fixed credentials and health check outcomes", async () => {
    const fixed = await turn.iceServersFor("ali@example.com", { TURN_SERVER_URL: "turns:relay.example:443?transport=tcp", TURN_USERNAME: "user", TURN_CREDENTIAL: "pass" });
    assert.deepEqual(fixed.iceServers.find((server) => server.username), { urls: ["turns:relay.example:443?transport=tcp"], username: "user", credential: "pass" });
    assert.deepEqual(await turn.checkTurn({}), { provider: "none", ok: false, problem: "turn_missing", urls: [] });
    assert.equal((await turn.checkTurn({ TURN_SERVER_URL: "turn:x.example:3478" })).problem, "turn_credentials_missing");
    const healthy = await turn.checkTurn(CF, cloudflare(201, { iceServers: [{ urls: ["turn:turn.cloudflare.com:3478"], username: "u", credential: "c" }] }).fetcher);
    assert.equal(healthy.ok, true);
    assert.deepEqual(healthy.urls, ["turn:turn.cloudflare.com:3478"]);
});
