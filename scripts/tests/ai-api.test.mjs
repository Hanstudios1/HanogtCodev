// Run: node --test scripts/tests/*.test.mjs
// The Hanogt AI developer API (lib/server/ai-api-keys.ts, lib/server/hanogt-ai-api.ts):
// keys shown once and kept as hashes, the plan's allowance, revoking in one
// commit, who may call (cheapest check first), the request body, OpenAI's
// shapes for answers, streams and errors, counting, and the account's data.
import assert from "node:assert/strict";
import test from "node:test";
import { setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();
const keys = await load("lib/server/ai-api-keys.ts");
const api = await load("lib/server/hanogt-ai-api.ts");
const shared = await load("lib/ai/api-keys.ts");
const plans = await load("lib/plans.ts");
const features = await load("lib/server/features.ts");
const deletion = await load("lib/server/account-deletion.ts");
const intents = await load("lib/ai/agent-intents.ts");
const tools = await load("lib/ai/agent-tools.ts");

const ALI = "ali@example.com";
const DAY = 24 * 60 * 60_000;
let ipCounter = 0;
const nextIp = () => `203.0.113.${(ipCounter += 1)}`;

function seed({ plan = "plus", role = "user", audience = "all", user = {} } = {}) {
    return {
        [`users/${ALI}`]: { email: ALI, role, ...user },
        [`subscriptions/${ALI}`]: { plan, status: "active", expiresAt: new Date(Date.now() + 30 * DAY) },
        ...(audience ? { "site_config/features": { audiences: { ai_api: audience } } } : {}),
    };
}

/** Counts the Firestore requests made while `run` runs. */
async function countingReads(run) {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (url, init) => {
        calls += 1;
        return original(url, init);
    };
    try {
        await run();
    } finally {
        globalThis.fetch = original;
    }
    return calls;
}

test("a key: hnk_ and 43 URL-safe characters, kept only as its SHA-256", () => {
    const made = keys.generateApiKey();
    assert.match(made.key, shared.API_KEY_PATTERN);
    assert.equal(made.key.length, 47);
    assert.equal(made.hash, keys.hashApiKey(made.key));
    assert.match(made.hash, /^[0-9a-f]{64}$/);
    assert.equal(made.start, made.key.slice(0, 8));
    assert.equal(made.last4, made.key.slice(-4));
    assert.notEqual(keys.generateApiKey().key, made.key);
    assert.deepEqual(plans.PLAN_IDS.map(keys.apiKeyAllowance), [0, 2, 5]);
    assert.equal(keys.cleanKeyName("  Discord\u0000 botum \n ", "x"), "Discord botum");
    assert.equal(keys.cleanKeyName("", "API 1"), "API 1");
    assert.equal([...keys.cleanKeyName("ç".repeat(80), "x")].length, shared.API_KEY_NAME_MAX);
});

test("keys are made within the plan's allowance and shown once; the list never holds a key or a hash", async () => {
    await withBackend(seed({ plan: "plus" }), {}, async (db) => {
        const first = await keys.createApiKey(ALI, "plus", "Discord botu");
        assert.match(first.key, shared.API_KEY_PATTERN);
        assert.deepEqual(Object.keys(first.item).sort(), ["active", "createdAt", "id", "last4", "lastUsedAt", "name", "start"]);
        assert.equal(first.item.active, true);
        const stored = db.get(`ai_api_keys/${ALI}`);
        assert.equal(stored.items.length, 1);
        assert.ok(!JSON.stringify(stored).includes(first.key), "the key itself is never stored");
        assert.deepEqual(db.get(`ai_api_key_index/${keys.hashApiKey(first.key)}`).email, ALI);
        await keys.createApiKey(ALI, "plus");
        await assert.rejects(keys.createApiKey(ALI, "plus"), (error) => error.code === "limit_reached", "Plus allows 2");
        const listed = await keys.listApiKeys(ALI, "plus");
        assert.equal(listed.length, 2);
        assert.equal(listed[1].name, "API 2", "a default name");
        for (const item of listed) assert.ok(!("hash" in item) && !("key" in item));
        await assert.rejects(keys.createApiKey(ALI, "free"), (error) => error.code === "plan_required");
    });
});

test("two tabs making keys at once can't pass the allowance", async () => {
    await withBackend(seed({ plan: "plus" }), {}, async (db) => {
        await keys.createApiKey(ALI, "plus");
        const results = await Promise.allSettled([keys.createApiKey(ALI, "plus"), keys.createApiKey(ALI, "plus"), keys.createApiKey(ALI, "plus")]);
        assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
        assert.ok(results.filter((result) => result.status === "rejected").every((result) => result.reason.code === "limit_reached" || result.reason.code === "conflict"));
        assert.equal(db.get(`ai_api_keys/${ALI}`).items.length, 2);
        assert.equal(db.paths().filter((path) => path.startsWith("ai_api_key_index/")).length, 2, "no index entry without its key");
    });
});

test("revoking removes the key and its index entry in one commit; it stops working at once", async () => {
    const commits = [];
    await withBackend(seed({ plan: "pro" }), { onCommit: (writes) => commits.push(writes) }, async (db) => {
        const made = await keys.createApiKey(ALI, "pro", "silinecek");
        commits.length = 0;
        await keys.revokeApiKey(ALI, made.item.id);
        assert.equal(commits.length, 1);
        assert.equal(commits[0].length, 2, "list and index together");
        assert.equal(db.has(`ai_api_key_index/${keys.hashApiKey(made.key)}`), false);
        assert.equal(await keys.findApiKey(made.key), null);
        await assert.rejects(keys.revokeApiKey(ALI, made.item.id), (error) => error.code === "not_found");
        await assert.rejects(keys.revokeApiKey(ALI, "../users/x"), (error) => error.code === "not_found");
    });
});

test("after a downgrade the oldest keys within the allowance keep working", () => {
    const stored = [3, 1, 4, 2, 5].map((n) => ({ id: `key_000000000000000${n}`, name: `k${n}`, hash: "a".repeat(64), start: "hnk_", last4: "", createdAt: new Date(Date.UTC(2026, 9, n)).toISOString() }));
    assert.deepEqual([...keys.activeKeyIds(stored, "pro")].sort(), stored.map((key) => key.id).sort());
    assert.deepEqual([...keys.activeKeyIds(stored, "plus")].sort(), ["key_0000000000000001", "key_0000000000000002"]);
    assert.equal(keys.activeKeyIds(stored, "free").size, 0);
    assert.deepEqual(keys.readStoredKeys({ items: [{ id: "bad" }, { id: "key_0000000000000009", hash: "x" }, null, stored[0], stored[0]] }).map((key) => key.id), [stored[0].id], "malformed and repeated entries are left out");
});

test("who may call: the cheapest check first, then account, plan, allowance and the team's switch", async () => {
    features.forgetFeatureCache();
    // A malformed key is refused without a single read.
    const reads = await countingReads(async () => {
        const headers = [[null, "missing_api_key"], ["", "missing_api_key"], ["Basic abc", "missing_api_key"], ["Bearer", "missing_api_key"], ["Bearer sk-123", "invalid_api_key"], ["Bearer hnk_short", "invalid_api_key"]];
        for (const [header, code] of headers) {
            const result = await api.authenticateApiCaller(header, nextIp());
            assert.deepEqual([result.ok, result.failure.status, result.failure.code], [false, 401, code], String(header));
        }
    });
    assert.equal(reads, 0);

    const cases = [
        // [description, seed options, setup, expected status, code]
        ["an unknown key", {}, async () => keys.generateApiKey().key, 401, "invalid_api_key"],
        ["a deleted account", {}, async (db) => { const made = await keys.createApiKey(ALI, "plus"); await db.fetch(`http://127.0.0.1:8080/v1/projects/demo-hanogt/databases/(default)/documents/users/${ALI}`, { method: "DELETE" }); return made.key; }, 401, "invalid_api_key"],
        ["a suspended account", { user: { suspended: true } }, async () => (await keys.createApiKey(ALI, "plus")).key, 403, "account_suspended"],
        ["a Free account", { plan: "free" }, async () => (await keys.createApiKey(ALI, "plus")).key, 403, "plan_required"],
        ["the API not open yet (staff only)", { audience: "staff" }, async () => (await keys.createApiKey(ALI, "plus")).key, 403, "feature_unavailable"],
    ];
    for (const [name, options, setup, status, code] of cases) {
        features.forgetFeatureCache();
        await withBackend(seed(options), {}, async (db) => {
            const key = await setup(db);
            const result = await api.authenticateApiCaller(`Bearer ${key}`, nextIp());
            assert.equal(result.ok, false, name);
            assert.deepEqual([result.failure.status, result.failure.code], [status, code], name);
            assert.equal(api.apiErrorBody(result.failure).error.type, status === 401 ? "authentication_error" : "permission_error", name);
        });
    }

    // Staff see it while it is staff-only; a key beyond the allowance after a downgrade is refused.
    features.forgetFeatureCache();
    await withBackend(seed({ plan: "pro", role: "admin", audience: "staff" }), {}, async (db) => {
        const made = [];
        for (let n = 0; n < 3; n += 1) {
            made.push(await keys.createApiKey(ALI, "pro", `k${n}`));
            await new Promise((resolve) => setTimeout(resolve, 5));
        }
        const ok = await api.authenticateApiCaller(`Bearer ${made[2].key}`, nextIp());
        assert.equal(ok.ok, true);
        assert.deepEqual([ok.caller.email, ok.caller.plan, ok.caller.staff, ok.caller.keyId], [ALI, "pro", true, made[2].item.id]);
        db.get(`subscriptions/${ALI}`).plan = "plus";
        const newest = await api.authenticateApiCaller(`Bearer ${made[2].key}`, nextIp());
        assert.deepEqual([newest.ok, newest.failure?.code], [false, "key_inactive"]);
        assert.equal((await api.authenticateApiCaller(`Bearer ${made[0].key}`, nextIp())).ok, true, "the oldest keys keep working");
    });
});

test("one address can't flood the API, whatever keys it sends", async () => {
    const ip = "198.51.100.77";
    let last;
    await withBackend({}, {}, async () => {
        for (let n = 0; n < 301; n += 1) last = await api.authenticateApiCaller(`Bearer ${keys.generateApiKey().key}`, ip);
    });
    assert.deepEqual([last.failure.status, last.failure.code], [429, "rate_limit_exceeded"]);
    assert.ok(Number(last.failure.headers["Retry-After"]) > 0);
});

test("requests are counted per account: the minute first, then the 24 hours, with x-ratelimit headers", async () => {
    features.forgetFeatureCache();
    await withBackend(seed({ plan: "plus" }), {}, async () => {
        const made = await keys.createApiKey(ALI, "plus");
        const { caller } = await api.authenticateApiCaller(`Bearer ${made.key}`, nextIp());
        const limits = plans.PLAN_AI_FEATURES.plus.api;
        let counted;
        for (let n = 0; n < limits.perMinute; n += 1) counted = await api.countApiRequest(caller);
        assert.equal(counted.ok, true);
        assert.equal(counted.headers["x-ratelimit-limit-requests"], String(limits.perMinute));
        assert.equal(counted.headers["x-ratelimit-remaining-requests"], "0");
        assert.match(counted.headers["x-ratelimit-reset-requests"], /^\d+s$/);
        assert.equal(counted.headers["x-hanogt-ratelimit-limit-day"], String(limits.perDay));
        assert.equal(counted.headers["x-hanogt-ratelimit-remaining-day"], String(limits.perDay - limits.perMinute));
        const refused = await api.countApiRequest(caller);
        assert.deepEqual([refused.ok, refused.failure.status, refused.failure.code], [false, 429, "rate_limit_exceeded"]);
        assert.match(refused.failure.message, /per minute/);
        assert.ok(Number(refused.failure.headers["Retry-After"]) > 0);
    });
});

test("the request body: OpenAI's chat.completions, text only, within the limits", () => {
    const user = (content) => ({ role: "user", content });
    const parse = (body, plan = "plus") => api.parseCompletionRequest(body, plan);
    const ok = parse({ model: "hanogt-ai", messages: [{ role: "system", content: "Kısa yaz." }, { role: "developer", content: [{ type: "text", text: "Türkçe." }] }, user("Merhaba"), { role: "assistant", content: "Selam" }, user([{ type: "text", text: "Nasılsın?" }])], stream: true, temperature: 0.2, max_tokens: 99_999, stop: "END", mode: "code", language: "tr" });
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.request, {
        messages: [user("Merhaba"), { role: "assistant", content: "Selam" }, user("Nasılsın?")],
        system: "Kısa yaz.\n\nTürkçe.",
        stream: true,
        temperature: 0.2,
        topP: null,
        stop: ["END"],
        maxTokens: plans.PLAN_AI_FEATURES.plus.maxTokens,
        mode: "code",
        language: "TR",
    });
    assert.deepEqual(parse({ messages: [user("x")] }).request.maxTokens, plans.PLAN_AI_FEATURES.plus.maxTokens, "the plan's length by default");
    assert.equal(parse({ messages: [user("x")], max_completion_tokens: 100 }, "pro").request.maxTokens, 100);
    assert.deepEqual([parse({ messages: [user("x")] }).request.mode, parse({ messages: [user("x")] }).request.language], ["general", "EN"]);

    const refused = (body, status, code, param) => {
        const result = parse(body);
        assert.equal(result.ok, false, JSON.stringify(body).slice(0, 80));
        assert.deepEqual([result.failure.status, result.failure.code, result.failure.param ?? null], [status, code, param ?? null], JSON.stringify(body).slice(0, 80));
    };
    refused(null, 400, "invalid_request");
    refused({ model: "gpt-4o", messages: [user("x")] }, 404, "model_not_found", "model");
    refused({ messages: [user("x")], n: 2 }, 400, "unsupported_parameter", "n");
    refused({ messages: [user("x")], tools: [{ type: "function" }] }, 400, "unsupported_parameter", "tools");
    refused({ messages: [user("x")], tool_choice: "auto" }, 400, "unsupported_parameter", "tool_choice");
    refused({ messages: [user("x")], response_format: { type: "json_object" } }, 400, "unsupported_parameter", "response_format");
    refused({ messages: [{ role: "tool", content: "x" }] }, 400, "unsupported_parameter", "messages[0]");
    refused({ messages: [user([{ type: "image_url", image_url: { url: "https://x" } }])] }, 400, "invalid_request", "messages[0]");
    refused({ messages: [] }, 400, "invalid_request", "messages");
    refused({ messages: Array.from({ length: 51 }, () => user("x")) }, 400, "invalid_request", "messages");
    refused({ messages: [user("x".repeat(100_001))] }, 413, "context_length_exceeded", "messages");
    refused({ messages: [{ role: "system", content: "x".repeat(4_001) }, user("x")] }, 413, "context_length_exceeded", "messages");
    refused({ messages: [user("x"), { role: "assistant", content: "y" }] }, 400, "invalid_request", "messages");
    refused({ messages: [user("x")], temperature: 3 }, 400, "invalid_request", "temperature");
    refused({ messages: [user("x")], max_tokens: 1.5 }, 400, "invalid_request", "max_tokens");
    refused({ messages: [user("x")], stop: ["a", "b", "c", "d", "e"] }, 400, "invalid_request", "stop");
    refused({ messages: [user("x")], mode: "hack" }, 400, "invalid_request", "mode");
    refused({ messages: [user("x")], language: "turkish" }, 400, "invalid_request", "language");
    refused({ messages: [user("x")], stream: "yes" }, 400, "invalid_request", "stream");
    // Harmless OpenAI parameters are ignored.
    assert.equal(parse({ messages: [user("x")], n: 1, user: "u1", seed: 7, presence_penalty: 0.5, stream_options: { include_usage: true }, parallel_tool_calls: false }).ok, true);
});

test("answers in OpenAI's shapes: a chat.completion, never the provider's ids or model", () => {
    const meta = { id: "chatcmpl-test", created: 1_790_000_000 };
    const body = api.completionBody({ id: "provider-id", model: "llama-secret", choices: [{ message: { content: "Merhaba!" }, finish_reason: "length" }], usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15, queue_time: 1 } }, meta);
    assert.deepEqual(body, {
        id: "chatcmpl-test", object: "chat.completion", created: meta.created, model: "hanogt-ai",
        choices: [{ index: 0, message: { role: "assistant", content: "Merhaba!" }, finish_reason: "length" }],
        usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
    });
    assert.equal(api.completionBody({ choices: [{ message: { content: "  " } }] }, meta), null, "an empty answer");
    assert.equal(api.completionBody(null, meta), null);
    assert.deepEqual(api.apiModel(), { id: "hanogt-ai", object: "model", created: api.apiModel().created, owned_by: "hanogt" });
    assert.match(api.newCompletionId(), /^chatcmpl-[0-9a-f]{24}$/);
    assert.deepEqual(api.apiErrorBody({ status: 429, code: "rate_limit_exceeded", message: "m" }), { error: { message: "m", type: "rate_limit_error", code: "rate_limit_exceeded", param: null } });
    assert.equal(api.apiErrorBody({ status: 503, code: "service_unavailable", message: "m" }).error.type, "api_error");
});

/** The provider's SSE bytes, in uneven pieces (a frame split across reads). */
function upstreamStream(text, { failAfter = null } = {}) {
    const bytes = new TextEncoder().encode(text);
    const pieces = [bytes.slice(0, 37), bytes.slice(37, 120), bytes.slice(120)];
    let index = 0;
    return new ReadableStream({
        pull(controller) {
            if (failAfter !== null && index === failAfter) {
                controller.error(new Error("socket hang up"));
                return;
            }
            if (index >= pieces.length) controller.close();
            else controller.enqueue(pieces[index++]);
        },
    });
}

async function readAll(stream) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let text = "";
    for (;;) {
        const { value, done } = await reader.read();
        if (done) return text;
        text += decoder.decode(value, { stream: true });
    }
}

const events = (text) => text.split("\n\n").filter(Boolean).map((frame) => frame.replace(/^data: /, ""));

test("a stream is re-told as chat.completion.chunk events ending with [DONE]", async () => {
    const meta = { id: "chatcmpl-s", created: 1 };
    const upstream = [
        ": keep-alive",
        `data: ${JSON.stringify({ id: "prov", model: "llama", choices: [{ delta: { role: "assistant" } }] })}`,
        `data: ${JSON.stringify({ id: "prov", choices: [{ delta: { content: "Mer" } }] })}`,
        `data: ${JSON.stringify({ id: "prov", choices: [{ delta: { content: "haba" }, finish_reason: null }] })}`,
        `data: ${JSON.stringify({ id: "prov", choices: [{ delta: {}, finish_reason: "stop" }], x_groq: { usage: {} } })}`,
        "data: [DONE]",
        "",
    ].join("\n\n");
    let ended = false;
    const out = events(await readAll(api.completionStream(upstreamStream(upstream), meta, { onEnd: () => { ended = true; } })));
    assert.equal(out.at(-1), "[DONE]");
    const chunks = out.slice(0, -1).map((frame) => JSON.parse(frame));
    assert.deepEqual(chunks[0].choices[0].delta, { role: "assistant", content: "" });
    assert.equal(chunks.map((chunk) => chunk.choices[0].delta.content ?? "").join(""), "Merhaba");
    assert.equal(chunks.at(-1).choices[0].finish_reason, "stop");
    for (const chunk of chunks) {
        assert.deepEqual([chunk.id, chunk.object, chunk.model, chunk.created], ["chatcmpl-s", "chat.completion.chunk", "hanogt-ai", 1]);
        assert.ok(!("x_groq" in chunk));
    }
    assert.ok(!out.join("").includes("llama") && !out.join("").includes("prov"), "nothing of the provider's");
    assert.equal(ended, true);

    // The provider fails midway: an error event, then [DONE].
    const broken = events(await readAll(api.completionStream(upstreamStream(`data: ${JSON.stringify({ choices: [{ delta: { content: "Yar" } }] })}\n\n`, { failAfter: 1 }), meta)));
    assert.equal(broken.at(-1), "[DONE]");
    assert.deepEqual(JSON.parse(broken.at(-2)).error.code, "upstream_error");
});

test("the account's data: export without keys or hashes; deletion and staff's revoke-all clear every entry", async () => {
    features.forgetFeatureCache();
    await withBackend(seed({ plan: "pro" }), {}, async (db) => {
        const made = await keys.createApiKey(ALI, "pro", "bot");
        await keys.createApiKey(ALI, "pro", "site");
        const exported = await keys.exportApiKeys(ALI);
        assert.deepEqual(exported.map((item) => item.name), ["bot", "site"]);
        assert.ok(!JSON.stringify(exported).includes(made.key) && !JSON.stringify(exported).includes(keys.hashApiKey(made.key)));
        assert.equal(await keys.apiKeyCount(ALI), 2);
        await keys.touchApiKey({ hash: keys.hashApiKey(made.key), lastUsedAt: null });
        assert.ok(db.get(`ai_api_key_index/${keys.hashApiKey(made.key)}`).lastUsedAt, "last use noted");
        assert.equal(await keys.touchApiKey({ hash: keys.hashApiKey(made.key), lastUsedAt: new Date().toISOString() }), false, "at most every ten minutes");
        const summary = await deletion.deleteAccountData(ALI, { scope: "all" });
        assert.equal(summary.deleted.aiApiKeys, 2);
        assert.equal(db.has(`ai_api_keys/${ALI}`), false);
        assert.equal(db.paths().filter((path) => path.startsWith("ai_api_key_index/")).length, 0);
        assert.equal(await keys.touchApiKey({ hash: keys.hashApiKey(made.key), lastUsedAt: null }), false, "a revoked key's entry never comes back");
        assert.equal(db.has(`ai_api_key_index/${keys.hashApiKey(made.key)}`), false);
    });
    // An index entry a failed write left behind is found by the account's address.
    await withBackend({ ...seed({ plan: "pro" }), [`ai_api_key_index/${"e".repeat(64)}`]: { email: ALI, id: "key_0000000000000001" } }, {}, async (db) => {
        await keys.createApiKey(ALI, "pro");
        assert.equal(await keys.revokeAllApiKeys(ALI), 1);
        assert.equal(db.paths().filter((path) => path.startsWith("ai_api_key_index/")).length, 0, "the stray entry went too");
    });
});

test("the agent can open the API page", () => {
    assert.equal(intents.extractRoute("API anahtarlarımı aç"), "/ai/api");
    assert.equal(intents.extractRoute("Hanogt AI API sayfasına git"), "/ai/api");
    assert.equal(intents.extractRoute("open my api keys"), "/ai/api");
    assert.equal(intents.extractRoute("Hanogt AI ayarlarını aç"), "/ai/settings", "settings stay settings");
    assert.equal(tools.normalizeAgentRoute("/ai/api"), "/ai/api");
});
