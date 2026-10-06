// Run: node --test scripts/tests/
// Hanogt AI connections (own API keys on Plus/Pro): sealing keys, checking
// them with each kind of provider (fake provider APIs on their real hosts,
// answered through fake-backend's `route`), plan limits, resolving for chat,
// use records and deletion against the in-memory Firestore.
// All keys below are made up; none of them works anywhere.
import assert from "node:assert/strict";
import test from "node:test";
import { json, setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();
process.env.AI_KEYS_ENCRYPTION_KEY = "test-ai-keys-secret-not-real";

const box = await load("lib/server/secret-box.ts");
const store = await load("lib/server/ai-connections.ts");
const shared = await load("lib/ai/connections.ts");
const plans = await load("lib/plans.ts");
const rest = await load("lib/server/firebase-rest.ts");

const ALI = "ali@example.com";
const EVE = "eve@example.com";
/** Text a provider echoes in its errors; it must never come back out. */
const ECHO = "PROVIDER-ECHO-sk-test";

const GOOD = {
    openai: "sk-test-openai-good-key-0001",
    anthropic: "sk-ant-test-good-key-0001",
    gemini: "AIza-test-gemini-good-key-0001",
    groq: "gsk_test_good_key_0001", // a retired provider: never asked
    mistral: "mistral-test-good-key-0001",
    openrouter: "sk-or-v1-test-good-key-0001",
    deepseek: "sk-test-deepseek-good-0001",
    xai: "xai-test-good-key-0001",
    together: "tgp_v1_test_good_key_0001",
};
const WRONG = "sk-test-wrong-key-0000";

const HOSTS = { "api.openai.com": "openai", "api.mistral.ai": "mistral", "api.deepseek.com": "deepseek", "api.x.ai": "xai" };
const MODELS = {
    openai: ["gpt-4o-mini", "gpt-4o", "gpt-4o", "text-embedding-3-small", "whisper-1", "dall-e-3", "o3-mini", "omni-moderation-latest"],
    mistral: ["mistral-large-latest", "mistral-embed", "codestral-latest"],
    deepseek: ["deepseek-chat", "deepseek-reasoner"],
    xai: ["grok-4", "grok-3-mini"],
};

/** Fake provider APIs. Requests are recorded; nothing is asserted inside (testKey would swallow it). */
function createProviders(options = {}) {
    const state = { calls: [], down: false, hang: false, failWith: null, legacyOpenRouter: false, openRouterModelsDown: false, ...options };
    const unauthorized = () => json(401, { error: { message: `Incorrect API key provided: ${ECHO}`, type: "invalid_request_error", code: "invalid_api_key" } });
    state.route = async (url, init = {}) => {
        const headers = { ...(init.headers ?? {}) };
        state.calls.push({ href: url.href, host: url.host, path: url.pathname, headers, redirect: init.redirect, method: (init.method || "GET").toUpperCase() });
        if (state.down) throw new TypeError("fetch failed");
        if (state.hang) {
            return new Promise((resolve, reject) => {
                init.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")), { once: true });
            });
        }
        if (state.failWith) return json(state.failWith, { error: { message: ECHO } });
        const bearer = typeof headers.Authorization === "string" ? headers.Authorization.replace(/^Bearer /, "") : null;
        switch (url.host) {
            case "api.anthropic.com":
                if (url.pathname !== "/v1/models") return json(404, {});
                if (headers["x-api-key"] !== GOOD.anthropic || headers["anthropic-version"] !== "2023-06-01") return json(401, { type: "error", error: { type: "authentication_error", message: ECHO } });
                return json(200, { data: [{ type: "model", id: "claude-sonnet-4-5", display_name: "Claude Sonnet 4.5" }, { type: "model", id: "claude-haiku-4-5" }], has_more: false });
            case "generativelanguage.googleapis.com":
                if (url.pathname !== "/v1beta/openai/models") return json(404, {});
                // Gemini answers a wrong key with 400 INVALID_ARGUMENT.
                if (bearer !== GOOD.gemini) return json(400, [{ error: { code: 400, message: `API key not valid. ${ECHO}`, status: "INVALID_ARGUMENT" } }]);
                return json(200, { object: "list", data: ["models/gemini-2.5-pro", "models/gemini-2.5-flash", "models/text-embedding-004", "models/imagen-4.0-generate-001", "models/gemini-2.5-flash"].map((id) => ({ id, object: "model", owned_by: "google" })) });
            case "openrouter.ai":
                if (url.pathname === "/api/v1/models") return state.openRouterModelsDown ? json(503, {}) : json(200, { data: [{ id: "openai/gpt-4o-mini" }, { id: "anthropic/claude-sonnet-4.5" }] });
                if (url.pathname === "/api/v1/key" && state.legacyOpenRouter) return json(404, { error: { message: "Not Found" } });
                if (url.pathname !== "/api/v1/key" && url.pathname !== "/api/v1/auth/key") return json(404, {});
                return bearer === GOOD.openrouter ? json(200, { data: { label: "sk-or-v1-tes...", usage: 0, limit: null } }) : unauthorized();
            case "api.together.xyz":
                if (url.pathname !== "/v1/models") return json(404, {});
                if (bearer !== GOOD.together) return unauthorized();
                // Together answers with a bare array that mixes model types.
                return json(200, [
                    { id: "meta-llama/Llama-3.3-70B-Instruct-Turbo", type: "chat" },
                    { id: "black-forest-labs/FLUX.1-schnell", type: "image" },
                    { id: "BAAI/bge-large-en-v1.5", type: "embedding" },
                    { id: "Qwen/Qwen2.5-Coder-32B-Instruct", type: "language" },
                ]);
            default: {
                const id = HOSTS[url.host];
                if (!id || url.href !== `${shared.aiProvider(id).baseUrl}/models`) return json(404, {});
                // xAI answers a wrong key with 400.
                if (bearer !== GOOD[id]) return id === "xai" ? json(400, { code: "Client specified an invalid argument", error: `Incorrect API key provided: ${ECHO}` }) : unauthorized();
                return json(200, { object: "list", data: MODELS[id].map((model) => ({ id: model, object: "model" })) });
            }
        }
    };
    return state;
}

const userSeed = (plan, status = "active") => ({
    [`users/${ALI}`]: { email: ALI },
    ...(plan ? { [`subscriptions/${ALI}`]: { plan, status } } : {}),
});

const addOpenAi = (label, email = ALI) => store.addConnection(email, { provider: "openai", apiKey: GOOD.openai, model: "gpt-4o-mini", label, consent: true });

/** Runs `run` with environment changes (undefined deletes); awaits it when it is async. */
async function withEnvAsync(changes, run) {
    const saved = { ...process.env };
    try {
        for (const [key, value] of Object.entries(changes)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        return await run();
    } finally {
        for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
        Object.assign(process.env, saved);
    }
}

function withEnv(changes, run) {
    const saved = { ...process.env };
    try {
        for (const [key, value] of Object.entries(changes)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        return run();
    } finally {
        for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
        Object.assign(process.env, saved);
    }
}

// ---------------------------------------------------------------------------
// Secret box
// ---------------------------------------------------------------------------

test("secret box: round trip, a fresh IV each time, and nothing opens after tampering", () => {
    const aad = box.aiKeyAssociatedData(ALI, "conn-1234-abcd");
    assert.equal(aad, `ai-key:v1:${ALI}:conn-1234-abcd`);
    const sealed = box.sealSecret(GOOD.openai, aad);
    assert.match(sealed, /^v1\.[\w-]{16}\.[\w-]{22}\.[\w-]+$/);
    assert.equal(sealed.includes(GOOD.openai), false);
    assert.notEqual(box.sealSecret(GOOD.openai, aad), sealed, "a random IV every time");
    assert.equal(box.openSecret(sealed, aad), GOOD.openai);

    const parts = sealed.split(".");
    // The first character of each part carries data bits (the last one may be padding).
    const flip = (text) => `${text[0] === "A" ? "B" : "A"}${text.slice(1)}`;
    for (const index of [1, 2, 3]) {
        const tampered = parts.map((part, position) => (position === index ? flip(part) : part)).join(".");
        assert.throws(() => box.openSecret(tampered, aad), (error) => box.isSecretBoxError(error, "decrypt_failed"), `part ${index}`);
    }
    assert.throws(() => box.openSecret(sealed, box.aiKeyAssociatedData(EVE, "conn-1234-abcd")), (error) => box.isSecretBoxError(error, "decrypt_failed"), "bound to the owner");
    assert.throws(() => box.openSecret(sealed, box.aiKeyAssociatedData(ALI, "conn-9999-zzzz")), (error) => box.isSecretBoxError(error, "decrypt_failed"), "bound to the connection");
    assert.throws(() => box.openSecret(["v2", ...parts.slice(1)].join("."), aad), (error) => box.isSecretBoxError(error, "unsupported_version"));
    assert.throws(() => box.openSecret("not sealed", aad), (error) => box.isSecretBoxError(error, "malformed"));
    assert.throws(() => box.openSecret(`v1.${parts[1].slice(2)}.${parts[2]}.${parts[3]}`, aad), (error) => box.isSecretBoxError(error, "malformed"), "a short IV");
    try {
        box.openSecret(sealed, "ai-key:v1:other");
        assert.fail("must not open");
    } catch (error) {
        assert.equal(error.message.includes(GOOD.openai) || error.message.includes("ai-key"), false, "errors name neither the key nor the associated data");
    }
});

test("secret box: AI_KEYS_ENCRYPTION_KEY, then TOTP_ENCRYPTION_KEY, then NEXTAUTH_SECRET/AUTH_SECRET; none refuses", () => {
    const aad = box.aiKeyAssociatedData(ALI, "conn-1234-abcd");
    const unset = { AI_KEYS_ENCRYPTION_KEY: undefined, TOTP_ENCRYPTION_KEY: undefined, NEXTAUTH_SECRET: undefined, AUTH_SECRET: undefined };
    const sealedWithOne = withEnv({ ...unset, AI_KEYS_ENCRYPTION_KEY: "one", TOTP_ENCRYPTION_KEY: "totp" }, () => box.sealSecret("value", aad));
    withEnv({ ...unset, AI_KEYS_ENCRYPTION_KEY: "two", TOTP_ENCRYPTION_KEY: "totp" }, () => {
        assert.throws(() => box.openSecret(sealedWithOne, aad), (error) => box.isSecretBoxError(error, "decrypt_failed"), "another secret can't open it");
    });
    withEnv({ ...unset, TOTP_ENCRYPTION_KEY: "totp", NEXTAUTH_SECRET: "nextauth" }, () => {
        assert.equal(box.openSecret(box.sealSecret("value", aad), aad), "value");
        assert.throws(() => box.openSecret(sealedWithOne, aad), "TOTP_ENCRYPTION_KEY is a different key");
    });
    const sealedWithTotp = withEnv({ ...unset, TOTP_ENCRYPTION_KEY: "totp" }, () => box.sealSecret("value", aad));
    withEnv({ ...unset, TOTP_ENCRYPTION_KEY: "totp", NEXTAUTH_SECRET: "nextauth" }, () => assert.equal(box.openSecret(sealedWithTotp, aad), "value", "TOTP_ENCRYPTION_KEY wins over NEXTAUTH_SECRET"));
    withEnv({ ...unset, AUTH_SECRET: "auth" }, () => {
        assert.equal(box.isSecretBoxConfigured(), true);
        assert.equal(box.openSecret(box.sealSecret("value", aad), aad), "value");
    });
    withEnv(unset, () => {
        assert.equal(box.isSecretBoxConfigured(), false);
        assert.throws(() => box.sealSecret("value", aad), (error) => box.isSecretBoxError(error, "not_configured"));
    });
});

// ---------------------------------------------------------------------------
// Provider catalog
// ---------------------------------------------------------------------------

test("provider catalog: fixed https endpoints, model ids and request settings", () => {
    assert.deepEqual([...shared.AI_PROVIDER_IDS], ["openai", "anthropic", "gemini", "mistral", "openrouter", "deepseek", "xai", "together"]);
    // Groq is retired: stored connections are still read (to be deleted), never offered or used.
    assert.deepEqual([...shared.RETIRED_PROVIDER_IDS], ["groq"]);
    assert.deepEqual([shared.isAiProviderId("groq"), shared.isRetiredProviderId("groq"), shared.isStoredProviderId("groq"), shared.isStoredProviderId("openai"), shared.isStoredProviderId("custom")], [false, true, true, true, false]);
    assert.deepEqual([shared.providerName("groq"), shared.providerName("openai")], ["Groq", "OpenAI"]);
    for (const provider of shared.AI_PROVIDERS) {
        assert.match(provider.baseUrl, /^https:\/\/[a-z0-9.-]+(?:\/[\w.-]+)*$/, provider.id);
        assert.match(provider.keyUrl, /^https:\/\//, provider.id);
        assert.ok(provider.keyFormat.TR && provider.keyFormat.EN, provider.id);
        assert.ok(shared.isAiProviderId(provider.id));
    }
    assert.equal(shared.aiProvider("anthropic").baseUrl, "https://api.anthropic.com/v1");
    assert.equal(shared.aiProvider("gemini").baseUrl, "https://generativelanguage.googleapis.com/v1beta/openai");
    assert.equal(shared.aiProvider("openrouter").baseUrl, "https://openrouter.ai/api/v1");
    assert.equal(shared.isAiProviderId("custom"), false);
    assert.equal(shared.PLAN_AI_CONNECTIONS, plans.PLAN_AI_CONNECTIONS, "the plan table is reused, not copied");
    assert.equal(shared.MAX_STORED_AI_CONNECTIONS, 5);

    assert.equal(shared.normalizeModelId("gemini", " models/gemini-2.5-flash "), "gemini-2.5-flash");
    assert.equal(shared.normalizeModelId("openai", "models/x"), "models/x", "only Gemini drops the prefix");
    assert.equal(shared.normalizeModelId("openrouter", "anthropic/claude-sonnet-4.5:beta"), "anthropic/claude-sonnet-4.5:beta");
    assert.equal(shared.normalizeModelId("openai", ""), "");
    assert.equal(shared.normalizeModelId("openai", "a".repeat(201)), "");
    assert.equal(shared.normalizeModelId("openai", "a".repeat(200)), "a".repeat(200));
    assert.equal(shared.normalizeModelId("openai", "gpt 4o"), "", "no spaces");
    assert.equal(shared.normalizeModelId("openai", "gpt\"4o"), "", "no quotes");
    assert.equal(shared.normalizeConnectionLabel("  İş \n hesabı  ", "OpenAI"), "İş hesabı");
    assert.equal(shared.normalizeConnectionLabel("", "OpenAI"), "OpenAI");
    assert.equal(shared.normalizeConnectionLabel("x".repeat(80), "OpenAI").length, 60);

    assert.equal(shared.isPlausibleApiKey("short"), false);
    assert.equal(shared.isPlausibleApiKey("sk-test key-0001"), false, "no spaces");
    assert.equal(shared.isPlausibleApiKey(GOOD.openai), true);
    assert.equal(shared.keyHintOf(GOOD.openai), "…0001");

    assert.deepEqual(shared.ownKeyRequestParams("openai", "o3-mini", 0.3), { max_completion_tokens: 8000 }, "reasoning models: default temperature");
    assert.deepEqual(shared.ownKeyRequestParams("openai", "gpt-5-mini", 0.3), { max_completion_tokens: 8000 });
    assert.deepEqual(shared.ownKeyRequestParams("openai", "gpt-4o", 0.3), { max_completion_tokens: 4000, temperature: 0.3 });
    assert.deepEqual(shared.ownKeyRequestParams("anthropic", "claude-sonnet-4-5", 0.45), { max_tokens: 4000 }, "Anthropic's newer models refuse temperature: its default");
});

test("own-connection messages have no allowance of their own: connections on Plus (2) and Pro (5) use Hanogt AI's window", () => {
    const { PLAN_AI_CONNECTIONS, PLAN_AI_FEATURES } = plans;
    assert.deepEqual(PLAN_AI_CONNECTIONS, { free: 0, plus: 2, pro: 5 });
    for (const plan of ["free", "plus", "pro"]) assert.equal("ownKey" in PLAN_AI_FEATURES[plan], false, `${plan}: no separate own-key limits`);
});

// ---------------------------------------------------------------------------
// Key checks
// ---------------------------------------------------------------------------

test("key checks: OpenAI-style providers list chat models with a Bearer key", async () => {
    const expected = {
        openai: ["gpt-4o", "gpt-4o-mini", "o3-mini"],
        mistral: ["codestral-latest", "mistral-large-latest"],
        deepseek: ["deepseek-chat", "deepseek-reasoner"],
        xai: ["grok-3-mini", "grok-4"],
    };
    for (const id of Object.keys(expected)) {
        const api = createProviders();
        await withBackend({}, { route: api.route }, async () => {
            assert.deepEqual(await store.testKey(id, GOOD[id]), { ok: true, models: expected[id] }, id);
            const [call] = api.calls;
            assert.equal(call.href, `${shared.aiProvider(id).baseUrl}/models`);
            assert.equal(call.method, "GET");
            assert.equal(call.headers.Authorization, `Bearer ${GOOD[id]}`);
            assert.equal(call.redirect, "error", "redirects are refused");
            assert.deepEqual(await store.testKey(id, WRONG), { ok: false, reason: "invalid_key" }, `${id} wrong key`);
            assert.equal(api.calls.length, 2);
        });
    }
});

test("key checks: Anthropic uses its native model list with x-api-key", async () => {
    const api = createProviders();
    await withBackend({}, { route: api.route }, async () => {
        assert.deepEqual(await store.testKey("anthropic", GOOD.anthropic), { ok: true, models: ["claude-haiku-4-5", "claude-sonnet-4-5"] });
        const [call] = api.calls;
        assert.equal(call.href, "https://api.anthropic.com/v1/models?limit=1000");
        assert.equal(call.headers["x-api-key"], GOOD.anthropic);
        assert.equal(call.headers["anthropic-version"], "2023-06-01");
        assert.equal("Authorization" in call.headers, false);
        assert.deepEqual(await store.testKey("anthropic", WRONG), { ok: false, reason: "invalid_key" });
    });
});

test("key checks: Gemini drops the models/ prefix and reads a 400 as a wrong key", async () => {
    const api = createProviders();
    await withBackend({}, { route: api.route }, async () => {
        assert.deepEqual(await store.testKey("gemini", GOOD.gemini), { ok: true, models: ["gemini-2.5-flash", "gemini-2.5-pro"] }, "embedding and image models are left out");
        assert.equal(api.calls[0].href, "https://generativelanguage.googleapis.com/v1beta/openai/models");
        assert.deepEqual(await store.testKey("gemini", WRONG), { ok: false, reason: "invalid_key" });
    });
});

test("key checks: OpenRouter checks /key (older accounts /auth/key), then lists models", async () => {
    let api = createProviders();
    await withBackend({}, { route: api.route }, async () => {
        assert.deepEqual(await store.testKey("openrouter", GOOD.openrouter), { ok: true, models: ["anthropic/claude-sonnet-4.5", "openai/gpt-4o-mini"] });
        assert.deepEqual(api.calls.map((call) => call.path), ["/api/v1/key", "/api/v1/models"]);
        api.calls.length = 0;
        assert.deepEqual(await store.testKey("openrouter", WRONG), { ok: false, reason: "invalid_key" });
        assert.deepEqual(api.calls.map((call) => call.path), ["/api/v1/key"], "no model list for a wrong key");
    });
    api = createProviders({ legacyOpenRouter: true });
    await withBackend({}, { route: api.route }, async () => {
        assert.equal((await store.testKey("openrouter", GOOD.openrouter)).ok, true);
        assert.deepEqual(api.calls.map((call) => call.path), ["/api/v1/key", "/api/v1/auth/key", "/api/v1/models"]);
        assert.deepEqual(await store.testKey("openrouter", WRONG), { ok: false, reason: "invalid_key" });
    });
    api = createProviders({ openRouterModelsDown: true });
    await withBackend({}, { route: api.route }, async () => {
        assert.deepEqual(await store.testKey("openrouter", GOOD.openrouter), { ok: true, models: [] }, "a valid key without a model list is still valid");
    });
});

test("key checks: Together AI's bare array, chat models only", async () => {
    const api = createProviders();
    await withBackend({}, { route: api.route }, async () => {
        assert.deepEqual(await store.testKey("together", GOOD.together), { ok: true, models: ["Qwen/Qwen2.5-Coder-32B-Instruct", "meta-llama/Llama-3.3-70B-Instruct-Turbo"] });
        assert.equal(api.calls[0].href, "https://api.together.xyz/v1/models");
        assert.deepEqual(await store.testKey("together", WRONG), { ok: false, reason: "invalid_key" });
    });
});

test("key checks: provider errors, outages and the time limit; the provider's text never comes back", async () => {
    for (const status of [429, 500, 503]) {
        const api = createProviders({ failWith: status });
        await withBackend({}, { route: api.route }, async () => {
            const result = await store.testKey("openai", GOOD.openai);
            assert.deepEqual(result, { ok: false, reason: "provider_error" }, String(status));
            assert.equal(JSON.stringify(result).includes(ECHO), false);
        });
    }
    let api = createProviders({ down: true });
    await withBackend({}, { route: api.route }, async () => {
        assert.deepEqual(await store.testKey("mistral", GOOD.mistral), { ok: false, reason: "unreachable" });
    });
    api = createProviders({ hang: true });
    await withBackend({}, { route: api.route }, async () => {
        const started = Date.now();
        assert.deepEqual(await store.testKey("deepseek", GOOD.deepseek, { timeoutMs: 40 }), { ok: false, reason: "unreachable" });
        assert.ok(Date.now() - started < 2_000, "the time limit ends the check");
    });
    assert.equal(store.KEY_TEST_TIMEOUT_MS, 10_000);
    api = createProviders();
    await withBackend({}, { route: api.route }, async () => {
        assert.deepEqual(await store.testKey("openai", "bad key with spaces"), { ok: false, reason: "invalid_key" });
        assert.deepEqual(await store.testKey("custom", GOOD.openai), { ok: false, reason: "invalid_key" });
        assert.deepEqual(await store.testKey("groq", GOOD.groq), { ok: false, reason: "invalid_key" }, "a retired provider is never asked");
        assert.equal(api.calls.length, 0, "implausible input never reaches a provider");
    });
});

test("model lists are deduplicated, sorted and capped at 500", () => {
    const many = Array.from({ length: 600 }, (_, index) => ({ id: `model-${String(599 - index).padStart(3, "0")}` }));
    const ids = store.modelIdsOf({ data: [...many, ...many, { id: 42 }, null, { id: "with space" }] }, "openai");
    assert.equal(ids.length, 500);
    assert.equal(ids[0], "model-000");
    assert.equal(ids[499], "model-499");
    assert.deepEqual(store.modelIdsOf("nonsense", "openai"), []);
});

// ---------------------------------------------------------------------------
// Plans, storage and secrecy
// ---------------------------------------------------------------------------

test("Free can't add or check keys; Plus adds two and Pro five", async () => {
    let api = createProviders();
    await withBackend(userSeed(null), { route: api.route }, async (db) => {
        assert.deepEqual(await addOpenAi("Bir"), { ok: false, code: "plan_required" });
        assert.deepEqual(await store.canAddConnection(ALI), { ok: false, code: "plan_required" });
        assert.equal(api.calls.length, 0, "no provider is asked without a plan");
        assert.equal(db.has(`ai_connections/${ALI}`), false);
        const state = await store.listConnections(ALI);
        assert.deepEqual({ plan: state.plan, limit: state.limit, items: state.items, canStore: state.canStore }, { plan: "free", limit: 0, items: [], canStore: true });
        assert.equal(state.providers.length, 8);
        assert.ok(!state.providers.some((provider) => provider.id === "groq"), "a retired provider isn't offered");
        assert.equal("baseUrl" in state.providers[0], false, "only display information goes to the browser");
    });

    api = createProviders();
    await withBackend(userSeed("plus"), { route: api.route }, async () => {
        assert.deepEqual(await store.canAddConnection(ALI), { ok: true });
        const first = await addOpenAi("Bir");
        assert.equal(first.ok, true);
        assert.equal(first.state.items.length, 1);
        assert.ok(first.state.items.some((item) => item.id === first.id));
        assert.equal((await addOpenAi("İki")).ok, true);
        assert.deepEqual(await addOpenAi("Üç"), { ok: false, code: "limit_reached" });
        assert.deepEqual(await store.canAddConnection(ALI), { ok: false, code: "limit_reached" });
        const state = await store.listConnections(ALI);
        assert.equal(state.plan, "plus");
        assert.equal(state.limit, 2);
        assert.deepEqual(state.items.map((item) => [item.label, item.active, item.keyHint]), [["Bir", true, "…0001"], ["İki", true, "…0001"]]);
    });

    api = createProviders();
    await withBackend(userSeed("pro"), { route: api.route }, async () => {
        for (let index = 1; index <= 5; index += 1) assert.equal((await addOpenAi(`Hesap ${index}`)).ok, true, `connection ${index}`);
        assert.deepEqual(await addOpenAi("Hesap 6"), { ok: false, code: "limit_reached" });
        const state = await store.listConnections(ALI);
        assert.equal(state.limit, 5);
        assert.deepEqual(state.items.map((item) => item.active), [true, true, true, true, true]);
    });

    await withBackend(userSeed("pro", "blocked"), { route: createProviders().route }, async () => {
        assert.deepEqual(await addOpenAi("Bir"), { ok: false, code: "plan_required" }, "a blocked plan gives nothing");
    });
});

test("keys are checked again, sealed to the account and never listed or exported", async () => {
    const api = createProviders();
    await withBackend(userSeed("plus"), { route: api.route }, async (db) => {
        const added = await addOpenAi("Bir");
        assert.equal(api.calls.length, 1, "the server checks the key itself");
        const stored = db.get(`ai_connections/${ALI}`).items[0];
        assert.match(stored.keySealed, /^v1\./);
        assert.equal(JSON.stringify(db.get(`ai_connections/${ALI}`)).includes(GOOD.openai), false, "only the sealed key is stored");
        assert.equal(box.openSecret(stored.keySealed, box.aiKeyAssociatedData(ALI, stored.id)), GOOD.openai);

        for (const output of [added, await store.listConnections(ALI), await store.exportAiConnections(ALI)]) {
            const text = JSON.stringify(output);
            assert.equal(text.includes(GOOD.openai), false);
            assert.equal(text.includes("keySealed"), false);
            assert.equal(text.includes(stored.keySealed), false);
        }
        assert.match(stored.consentAt, /^\d{4}-\d{2}-\d{2}T/);
        assert.equal(stored.consentAt, stored.createdAt);
        assert.equal(added.state.items[0].consentAt, stored.consentAt);
        assert.deepEqual(await store.exportAiConnections(ALI), [{
            provider: "openai", providerName: "OpenAI", label: "Bir", model: "gpt-4o-mini", keyHint: "…0001", createdAt: stored.createdAt, consentAt: stored.consentAt, lastUsedAt: null, lastError: null,
        }]);

        assert.deepEqual(await store.addConnection(ALI, { provider: "openai", apiKey: WRONG, model: "gpt-4o", consent: true }), { ok: false, code: "invalid_key" });
        assert.equal(api.calls.length, 2);
        assert.equal(db.get(`ai_connections/${ALI}`).items.length, 1, "a rejected key is not stored");
    });
});

test("adding needs explicit consent (KVKK m.9/6-a) before anything is sent or stored", async () => {
    const api = createProviders();
    await withBackend(userSeed("plus"), { route: api.route }, async (db) => {
        for (const consent of [undefined, false, "true", 1, "yes"]) {
            assert.deepEqual(await store.addConnection(ALI, { provider: "openai", apiKey: GOOD.openai, model: "gpt-4o", consent }), { ok: false, code: "consent_required" }, String(consent));
        }
        assert.equal(api.calls.length, 0, "the provider isn't contacted without consent");
        assert.equal(db.has(`ai_connections/${ALI}`), false);
        const added = await store.addConnection(ALI, { provider: "openai", apiKey: GOOD.openai, model: "gpt-4o", consent: true });
        assert.equal(added.ok, true);
        assert.ok(Number.isFinite(Date.parse(added.state.items[0].consentAt)), "the time of consent is kept");
    });
});

test("adding checks provider, key, model and label", async () => {
    const api = createProviders();
    await withBackend(userSeed("pro"), { route: api.route }, async (db) => {
        const add = (input) => store.addConnection(ALI, { provider: "openai", apiKey: GOOD.openai, model: "gpt-4o", consent: true, ...input });
        assert.deepEqual(await add({ provider: "custom" }), { ok: false, code: "invalid_request" });
        assert.deepEqual(await add({ provider: undefined }), { ok: false, code: "invalid_request" });
        assert.deepEqual(await add({ apiKey: "short" }), { ok: false, code: "invalid_request" });
        assert.deepEqual(await add({ apiKey: 42 }), { ok: false, code: "invalid_request" });
        assert.deepEqual(await add({ model: "" }), { ok: false, code: "invalid_request" });
        assert.deepEqual(await add({ model: "   " }), { ok: false, code: "invalid_request" });
        assert.deepEqual(await add({ model: "m".repeat(201) }), { ok: false, code: "invalid_request" });
        assert.deepEqual(await add({ model: "gpt 4o" }), { ok: false, code: "invalid_request" });
        assert.equal(api.calls.length, 0, "invalid input never reaches a provider");
        assert.equal(db.has(`ai_connections/${ALI}`), false);

        const gemini = await store.addConnection(ALI, { provider: "gemini", apiKey: ` ${GOOD.gemini} `, model: "models/gemini-2.5-flash", label: "", consent: true });
        assert.equal(gemini.ok, true);
        const item = gemini.state.items.find((entry) => entry.id === gemini.id);
        assert.deepEqual([item.provider, item.model, item.label, item.keyHint], ["gemini", "gemini-2.5-flash", "Google Gemini", "…0001"]);
        const labelled = await add({ label: `  Benim\u0000 \t anahtarım ${"x".repeat(80)}` });
        assert.equal(labelled.state.items.find((entry) => entry.id === labelled.id).label, `Benim anahtarım ${"x".repeat(44)}`);

        await withEnvAsync({ AI_KEYS_ENCRYPTION_KEY: undefined, TOTP_ENCRYPTION_KEY: undefined, NEXTAUTH_SECRET: undefined, AUTH_SECRET: undefined }, async () => {
            assert.deepEqual(await add({}), { ok: false, code: "encryption_unavailable" });
            assert.deepEqual(await store.canAddConnection(ALI), { ok: false, code: "encryption_unavailable" });
            assert.equal((await store.listConnections(ALI)).canStore, false);
        });
    });
});

test("two adds at once can't pass the plan limit", async () => {
    const api = createProviders();
    await withBackend(userSeed("plus"), { route: api.route }, async (db) => {
        assert.equal((await addOpenAi("Bir")).ok, true);
        const results = await Promise.all([addOpenAi("İki"), addOpenAi("Üç")]);
        assert.deepEqual(results.map((result) => result.ok).sort(), [false, true]);
        assert.equal(results.find((result) => !result.ok).code, "limit_reached");
        assert.equal(db.get(`ai_connections/${ALI}`).items.length, 2);
    });
});

test("moving from Pro to Plus keeps every connection; only the oldest ones in the plan resolve", async () => {
    const api = createProviders();
    await withBackend(userSeed("pro"), { route: api.route }, async (db) => {
        const ids = [];
        for (let index = 1; index <= 5; index += 1) ids.push((await addOpenAi(`Hesap ${index}`)).id);

        await rest.patchServerDocument(`subscriptions/${ALI}`, { plan: "plus" });
        let state = await store.listConnections(ALI);
        assert.equal(state.plan, "plus");
        assert.deepEqual(state.items.map((item) => item.id), ids, "oldest first");
        assert.deepEqual(state.items.map((item) => item.active), [true, true, false, false, false], "extras switched off, not deleted");
        assert.deepEqual(await addOpenAi("Hesap 6"), { ok: false, code: "limit_reached" });

        const resolved = await store.resolveConnectionForChat(ALI, ids[1]);
        assert.deepEqual(
            { apiKey: resolved.apiKey, baseUrl: resolved.baseUrl, model: resolved.model, provider: resolved.provider, id: resolved.id },
            { apiKey: GOOD.openai, baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", provider: "openai", id: ids[1] },
        );
        assert.equal(await store.resolveConnectionForChat(ALI, ids[2]), null, "outside the plan");
        assert.equal(await store.resolveConnectionForChat(ALI, "missing-connection-id"), null);
        assert.equal(await store.resolveConnectionForChat(ALI, "../credentials"), null);
        assert.equal(await store.resolveConnectionForChat(EVE, ids[0]), null, "another account's id");

        // Deleting an active connection lets the next oldest in.
        assert.equal((await store.deleteConnection(ALI, ids[0])).ok, true);
        state = await store.listConnections(ALI);
        assert.deepEqual(state.items.map((item) => item.active), [true, true, false, false]);
        assert.ok(await store.resolveConnectionForChat(ALI, ids[2]));

        await rest.patchServerDocument(`subscriptions/${ALI}`, { plan: "free" });
        state = await store.listConnections(ALI);
        assert.deepEqual(state.items.map((item) => item.active), [false, false, false, false]);
        assert.equal(await store.resolveConnectionForChat(ALI, ids[1]), null);
        assert.equal(db.get(`ai_connections/${ALI}`).items.length, 4, "nothing is deleted on Free");

        await rest.patchServerDocument(`subscriptions/${ALI}`, { plan: "pro", status: "blocked" });
        assert.equal(await store.resolveConnectionForChat(ALI, ids[1]), null, "blocked plans resolve nothing");
        await rest.patchServerDocument(`subscriptions/${ALI}`, { status: "active" });
        assert.ok(await store.resolveConnectionForChat(ALI, ids[4]), "Pro again: all usable");
    });
});

test("a key copied to another connection or account doesn't open", async () => {
    const api = createProviders();
    const seed = { ...userSeed("plus"), [`subscriptions/${EVE}`]: { plan: "plus", status: "active" } };
    await withBackend(seed, { route: api.route }, async (db) => {
        const first = await addOpenAi("Bir");
        const second = await store.addConnection(ALI, { provider: "anthropic", apiKey: GOOD.anthropic, model: "claude-sonnet-4-5", consent: true });
        assert.equal(second.ok, true);
        const items = db.get(`ai_connections/${ALI}`).items;

        await rest.patchServerDocument(`ai_connections/${EVE}`, { items: [items[0]] });
        assert.equal(await store.resolveConnectionForChat(EVE, items[0].id), null, "sealed to Ali");

        const swapped = items.map((item, index) => ({ ...item, keySealed: items[1 - index].keySealed }));
        await rest.patchServerDocument(`ai_connections/${ALI}`, { items: swapped });
        assert.equal(await store.resolveConnectionForChat(ALI, first.id), null, "sealed to its own connection");
        const state = await store.listConnections(ALI);
        assert.equal(state.items.find((item) => item.id === first.id).lastError, "key_unreadable");
    });
});

test("label and model changes, use records and deletion", async () => {
    const api = createProviders();
    await withBackend(userSeed("plus"), { route: api.route }, async (db) => {
        const { id } = await addOpenAi("Bir");
        const updated = await store.updateConnection(ALI, id, { label: "  İş   hesabı ", model: " gpt-4o " });
        assert.equal(updated.ok, true);
        assert.deepEqual([updated.state.items[0].label, updated.state.items[0].model], ["İş hesabı", "gpt-4o"]);
        assert.deepEqual(await store.updateConnection(ALI, id, { model: "" }), { ok: false, code: "invalid_request" });
        assert.deepEqual(await store.updateConnection(ALI, id, {}), { ok: false, code: "invalid_request" });
        assert.deepEqual(await store.updateConnection(ALI, "missing-connection-id", { label: "x" }), { ok: false, code: "not_found" });
        assert.deepEqual(await store.updateConnection(ALI, "../x", { label: "x" }), { ok: false, code: "not_found" });
        assert.equal(api.calls.length, 1, "edits never send the key anywhere");

        const now = Date.parse("2026-10-02T12:00:00.000Z");
        assert.equal(await store.markUsed(ALI, id, "invalid_key", now), true);
        let item = (await store.listConnections(ALI)).items[0];
        assert.deepEqual([item.lastUsedAt, item.lastError], ["2026-10-02T12:00:00.000Z", "invalid_key"]);
        assert.equal(await store.markUsed(ALI, id, "invalid_key", now + 1_000), false, "the same outcome within a minute isn't written again");
        assert.equal(await store.markUsed(ALI, id, "invalid_key", now + 61_000), true);
        assert.equal(await store.markUsed(ALI, id, null, now + 62_000), true, "a success clears the error");
        assert.equal((await store.listConnections(ALI)).items[0].lastError, null);
        assert.equal(await store.markUsed(ALI, "missing-connection-id", null, now), false);
        assert.equal(store.shouldRecordUse({ lastUsedAt: null, lastError: null }, null, now), true);
        assert.equal(store.shouldRecordUse({ lastUsedAt: new Date(now).toISOString(), lastError: null }, null, now + 59_000), false);
        assert.equal(store.shouldRecordUse({ lastUsedAt: new Date(now).toISOString(), lastError: null }, "quota", now + 1), true);

        await store.markUsed(ALI, id, "model_not_found", now + 120_000);
        item = (await store.updateConnection(ALI, id, { model: "gpt-4o-mini" })).state.items[0];
        assert.equal(item.lastError, null, "a new model starts afresh");

        assert.deepEqual(await store.deleteConnection(ALI, "missing-connection-id"), { ok: false, code: "not_found" });
        const second = await addOpenAi("İki");
        const afterDelete = await store.deleteConnection(ALI, id);
        assert.equal(afterDelete.ok, true);
        assert.deepEqual(afterDelete.state.items.map((entry) => entry.id), [second.id]);
        assert.equal((await store.deleteConnection(ALI, second.id)).ok, true);
        assert.equal(db.has(`ai_connections/${ALI}`), false, "the last one takes the document with it");
    });
});

test("damaged records are read safely", async () => {
    const sealed = box.sealSecret(GOOD.openai, box.aiKeyAssociatedData(ALI, "conn-good-0001"));
    const seed = {
        ...userSeed("pro"),
        [`ai_connections/${ALI}`]: {
            items: [
                { id: "conn-good-0001", provider: "openai", label: "İyi", model: "gpt-4o", keySealed: sealed, keyHint: "…0001", createdAt: "2026-10-01T10:00:00.000Z", lastUsedAt: null, lastError: "weird" },
                { id: "conn-good-0001", provider: "openai", label: "Kopya", model: "gpt-4o", keySealed: sealed, createdAt: "2026-10-01T11:00:00.000Z" },
                { id: "../escape", provider: "openai", keySealed: sealed },
                { id: "conn-bad-provider", provider: "custom", keySealed: sealed },
                { id: "conn-no-key-00001", provider: "openai" },
                "not an object",
            ],
        },
    };
    await withBackend(seed, { route: createProviders().route }, async () => {
        const state = await store.listConnections(ALI);
        assert.deepEqual(state.items.map((item) => [item.id, item.label, item.lastError]), [["conn-good-0001", "İyi", null]]);
        assert.equal((await store.resolveConnectionForChat(ALI, "conn-good-0001")).apiKey, GOOD.openai);
    });
});

test("a retired Groq connection is listed as no longer supported: never active or counted, only deletable", async () => {
    const sealedGroq = box.sealSecret(GOOD.groq, box.aiKeyAssociatedData(ALI, "conn-groq-00001"));
    const seed = {
        ...userSeed("plus"),
        [`ai_connections/${ALI}`]: {
            items: [{ id: "conn-groq-00001", provider: "groq", label: "Groq", model: "llama-3.3-70b-versatile", keySealed: sealedGroq, keyHint: "…0001", createdAt: "2026-09-01T10:00:00.000Z", lastUsedAt: null, lastError: null }],
        },
    };
    const api = createProviders();
    await withBackend(seed, { route: api.route }, async (db) => {
        let state = await store.listConnections(ALI);
        assert.deepEqual(state.items.map((item) => [item.id, item.provider, item.active, item.retired]), [["conn-groq-00001", "groq", false, true]]);
        assert.equal(await store.resolveConnectionForChat(ALI, "conn-groq-00001"), null, "never used for a message");
        assert.deepEqual(await store.updateConnection(ALI, "conn-groq-00001", { label: "Yeni" }), { ok: false, code: "invalid_request" });
        // It doesn't take one of Plus's two places.
        assert.equal((await addOpenAi("Bir")).ok, true);
        assert.equal((await addOpenAi("İki")).ok, true);
        assert.deepEqual(await addOpenAi("Üç"), { ok: false, code: "limit_reached" });
        state = await store.listConnections(ALI);
        assert.deepEqual(state.items.map((item) => [item.label, item.active, item.retired]), [["Groq", false, true], ["Bir", true, false], ["İki", true, false]]);
        assert.ok(!api.calls.some((call) => call.host === "api.groq.com"), "Groq is never asked");
        const deleted = await store.deleteConnection(ALI, "conn-groq-00001");
        assert.equal(deleted.ok, true);
        assert.deepEqual(deleted.state.items.map((item) => item.label), ["Bir", "İki"]);
        assert.equal(db.get(`ai_connections/${ALI}`).items.length, 2);
    });
});

test("account deletion removes every connection", async () => {
    const api = createProviders();
    await withBackend(userSeed("pro"), { route: api.route }, async (db) => {
        for (const label of ["Bir", "İki", "Üç"]) await addOpenAi(label);
        assert.equal(await store.deleteAllConnections(ALI), 3);
        assert.equal(db.has(`ai_connections/${ALI}`), false);
        assert.deepEqual((await store.listConnections(ALI)).items, []);
        assert.equal(await store.deleteAllConnections(ALI), 0, "nothing left is fine");
    });
});

// ---------------------------------------------------------------------------
// Chat failures
// ---------------------------------------------------------------------------

test("chat failures through a connection are classified; the provider's text stays out", async () => {
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    const cases = [
        [reply(401, { error: { message: ECHO } }), "invalid_key"],
        [reply(403, {}), "invalid_key"],
        [reply(402, { error: { message: "Insufficient Balance" } }), "quota"],
        [reply(404, { error: { code: "model_not_found" } }), "model_not_found"],
        [reply(429, { error: { message: "You exceeded your current quota, please check your plan and billing details.", type: "insufficient_quota" } }), "quota"],
        [reply(429, { error: { message: "Rate limit reached for requests" } }), "rate_limited"],
        [reply(400, [{ error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } }]), "invalid_key"],
        [reply(400, { code: "Client specified an invalid argument", error: "Incorrect API key provided: xa***" }), "invalid_key"],
        [reply(400, { object: "error", message: "Invalid model: foo", type: "invalid_model" }), "model_not_found"],
        [reply(400, { error: { message: "models/gemini-9 is not found for API version v1beta" } }), "model_not_found"],
        [reply(400, { error: { message: "This model's maximum context length is 128000 tokens.", type: "invalid_request_error", code: "context_length_exceeded" } }), "provider_error"],
        [reply(500, { error: { message: ECHO } }), "provider_error"],
    ];
    for (const [response, expected] of cases) {
        const status = response.status;
        assert.equal(await store.classifyProviderFailure(response), expected, `HTTP ${status} → ${expected}`);
    }
    assert.equal(await store.classifyProviderFailure(new Response("x".repeat(10_000), { status: 400 })), "provider_error", "a huge body is not read");
});
