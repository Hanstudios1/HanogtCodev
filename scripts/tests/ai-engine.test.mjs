// Run: node --test scripts/tests/*.test.mjs
// The advanced code engine (lib/ai/engine.ts, lib/server/ai-engine.ts,
// lib/server/claude-engine.ts): which messages go to it, its settings, the
// chat history and tools in Claude's shape, the streamed answer against a fake
// Anthropic endpoint (text, tools, refusals, failures) and the daily allowance.
import assert from "node:assert/strict";
import test from "node:test";
import { setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();
const engine = await load("lib/ai/engine.ts");
const settings = await load("lib/server/ai-engine.ts");
const claude = await load("lib/server/claude-engine.ts");
const usage = await load("lib/server/ai-usage.ts");

test("which messages go to the advanced engine", () => {
    const route = (message, extra = {}) => engine.wantsAdvancedEngine({ scope: "code", mode: "general", hasFile: false, message, ...extra });
    assert.equal(route("Merhaba, nasılsın?"), false);
    assert.equal(route("Bugün hava nasıl olacak?"), false);
    assert.equal(route("Merhaba", { mode: "code" }), true, "Code mode");
    assert.equal(route("Merhaba", { mode: "security" }), true, "Security mode");
    assert.equal(route("Bunu açıkla", { hasFile: true }), true, "an attached or open file");
    assert.equal(route("Merhaba", { scope: "all" }), true, "scope: every message");
    for (const message of ["Python'da dosya nasıl okunur?", "Bu döngü neden bitmiyor", "değişkenler nasıl tanımlanır", "JavaScript fonksiyonu yaz", "c++ ile oyun", "kodumu düzelt", "write a function that sorts numbers", "React state nedir", "SQL sorgusu yaz"]) {
        assert.equal(route(message), true, message);
    }
    // Everyday words that are also programming words in English aren't enough.
    for (const message of ["dizi önerisi var mı", "9. sınıf matematik", "spor programı hazırla", "community nedir", "trust me", "reaction video"]) {
        assert.equal(route(message), false, message);
    }
    assert.equal(engine.looksLikeCode("```js\nconsole.log(1)\n```"), true, "a fenced block");
    assert.equal(engine.looksLikeCode("Traceback (most recent call last):\n  File \"a.py\", line 3"), true, "a Python trace");
    assert.equal(engine.looksLikeCode("TypeError: x is not a function\n    at main (app.js:3:5)"), true, "a JavaScript error");
    assert.equal(engine.looksLikeCode("const a = 1;\nlet b = 2;\nfunction f() {\n}"), true, "lines of code");
    assert.equal(engine.looksLikeCode("Bugün güzel bir gün."), false);
});

test("settings: stored values are checked, the admin's input strictly", () => {
    assert.deepEqual(engine.normalizeEngineSettings(null), engine.DEFAULT_ENGINE_SETTINGS);
    assert.ok(engine.ENGINE_MODEL_PATTERN.test(engine.DEFAULT_ENGINE_MODEL), "the default is a valid model ID");
    assert.deepEqual(engine.DEFAULT_ENGINE_SETTINGS, { enabled: true, model: engine.DEFAULT_ENGINE_MODEL, effort: "medium", scope: "code", daily: { free: 3, plus: 25, pro: 100 } });
    const mixed = engine.normalizeEngineSettings({ enabled: false, model: "gpt-5", effort: "huge", scope: "all", daily: { free: -1, plus: 40, pro: 2.5 } });
    assert.deepEqual(mixed, { enabled: false, model: engine.DEFAULT_ENGINE_MODEL, effort: "medium", scope: "all", daily: { free: 3, plus: 40, pro: 100 } });
    const input = { enabled: true, model: "claude-test-other", effort: "low", scope: "code", daily: { free: 0, plus: 10, pro: 1000 } };
    assert.deepEqual(engine.readEngineSettingsInput(input), input);
    for (const broken of [null, [], { ...input, enabled: "yes" }, { ...input, model: "llama-3" }, { ...input, effort: "turbo" }, { ...input, scope: "some" }, { ...input, daily: { free: 1, plus: 2 } }, { ...input, daily: { free: 1, plus: 2, pro: 1001 } }]) {
        assert.equal(engine.readEngineSettingsInput(broken), null, JSON.stringify(broken));
    }
});

test("the answer's engine headers make the round trip", () => {
    const window = { limit: 25, used: 3, remaining: 22, resetsAt: "2026-10-04T10:00:00.000Z" };
    const headers = new Headers({ [engine.ENGINE_HEADERS.engine]: "advanced", ...engine.engineWindowHeaders(window) });
    assert.deepEqual(engine.readEngineHeaders(headers), { engine: "advanced", note: null, window });
    assert.deepEqual(engine.readEngineHeaders(new Headers({ [engine.ENGINE_HEADERS.engine]: "standard", [engine.ENGINE_HEADERS.note]: "quota" })), { engine: "standard", note: "quota", window: null });
    assert.deepEqual(engine.readEngineHeaders(new Headers({ [engine.ENGINE_HEADERS.note]: "<script>", [engine.ENGINE_HEADERS.limit]: "5", [engine.ENGINE_HEADERS.remaining]: "9" })), { engine: "standard", note: null, window: null }, "nonsense is dropped");
});

test("the server's settings: the environment's defaults, the stored document, a minute's cache; the key and its address", async () => {
    const saved = { model: process.env.HANOGT_AI_CLAUDE_MODEL, effort: process.env.HANOGT_AI_CLAUDE_EFFORT, key: process.env.ANTHROPIC_API_KEY, base: process.env.ANTHROPIC_BASE_URL };
    try {
        process.env.HANOGT_AI_CLAUDE_MODEL = "claude-test-other";
        process.env.HANOGT_AI_CLAUDE_EFFORT = "high";
        settings.forgetEngineCache();
        await withBackend({}, {}, async () => {
            const current = await settings.getEngineSettings();
            assert.equal(current.model, "claude-test-other");
            assert.equal(current.effort, "high");
        });
        settings.forgetEngineCache();
        await withBackend({ "site_config/ai_engine": { settings: { enabled: false, model: "claude-test-model", effort: "low", scope: "all", daily: { free: 0, plus: 5, pro: 50 } } } }, {}, async () => {
            assert.equal((await settings.getEngineSettings()).enabled, false);
        });
        await withBackend({}, {}, async () => {
            assert.equal((await settings.getEngineSettings()).enabled, false, "cached for a minute");
            assert.equal((await settings.getEngineSettings(true)).enabled, true, "unless asked fresh");
        });

        delete process.env.ANTHROPIC_API_KEY;
        assert.equal(settings.claudeConfig(), null, "no key: no advanced engine");
        assert.equal(await settings.engineAllowances(), null);
        process.env.ANTHROPIC_API_KEY = " sk-ant-test ";
        delete process.env.ANTHROPIC_BASE_URL;
        assert.deepEqual(settings.claudeConfig(), { apiKey: "sk-ant-test" });
        process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:8787/";
        assert.deepEqual(settings.claudeConfig(), { apiKey: "sk-ant-test", baseURL: "http://127.0.0.1:8787" });
        process.env.ANTHROPIC_BASE_URL = "http://example.com";
        assert.equal(settings.claudeConfig(), null, "plain http only to this machine");
        const write = settings.engineSettingsWrite(engine.DEFAULT_ENGINE_SETTINGS, "owner@example.com", new Date("2026-10-03T12:00:00Z"));
        assert.deepEqual(write.updateFields, ["settings", "updatedAt", "updatedBy"]);
        assert.equal(write.path, "site_config/ai_engine");
    } finally {
        for (const [name, value] of [["HANOGT_AI_CLAUDE_MODEL", saved.model], ["HANOGT_AI_CLAUDE_EFFORT", saved.effort], ["ANTHROPIC_API_KEY", saved.key], ["ANTHROPIC_BASE_URL", saved.base]]) {
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        }
        settings.forgetEngineCache();
    }
});

test("the chat's history in Claude's shape: text only, tool rounds as notes, user first and last", () => {
    const history = [
        { role: "assistant", content: "Merhaba! Nasıl yardımcı olayım?" },
        { role: "user", content: "Bir grup kur" },
        { role: "assistant", content: "", tool_calls: [{ id: "call_1", type: "function", function: { name: "create_group", arguments: "{\"name\":\"Python'cular\"}" } }] },
        { role: "tool", tool_call_id: "call_1", content: "{\"status\":\"done\",\"title\":\"Python'cular\"}" },
        { role: "user", content: "Teşekkürler" },
    ];
    const messages = claude.claudeMessages(history);
    assert.equal(messages[0].role, "user", "the leading assistant greeting is dropped");
    assert.deepEqual(messages.map((message) => message.role), ["user"], "a tool round without words joins the user's turns");
    assert.match(messages[0].content, /^Bir grup kur\n\n<hanogt_action_result name="create_group" arguments='\{"name":"Python&#39;cular"\}'>\n\{"status":"done"/);
    assert.ok(messages[0].content.endsWith("Teşekkürler"));
    const spoken = claude.claudeMessages([{ role: "user", content: "a" }, { role: "assistant", content: "b" }, { role: "user", content: "c" }, { role: "assistant", content: "d" }]);
    assert.deepEqual(spoken.map((message) => message.role), ["user", "assistant", "user"], "ends with the user");
});

test("tools and the system prompt in Claude's shape", () => {
    const tools = claude.claudeTools([{ type: "function", function: { name: "navigate", description: "Open a page", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false } } }]);
    assert.deepEqual(tools, [{ name: "navigate", description: "Open a page", input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false }, eager_input_streaming: true }]);
    assert.deepEqual(claude.claudeSystem({ stable: "RULES", dynamic: "" }), [{ type: "text", text: "RULES", cache_control: { type: "ephemeral" } }]);
    assert.equal(claude.claudeSystem({ stable: "RULES", dynamic: "Hanogt knowledge: ..." }).length, 2);
    assert.equal(claude.claudeMaxTokens(1800), 7200);
    assert.equal(claude.claudeMaxTokens(4000), 16000);
    assert.equal(claude.claudeMaxTokens(100), 4096, "never below 4,096 (thinking counts too)");
});

/** A fake Anthropic Messages endpoint: records the request and answers with these server-sent events. */
function anthropic(events, { status = 200 } = {}) {
    const seen = [];
    const fetchImpl = async (url, init) => {
        seen.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) });
        if (status !== 200) return new Response(JSON.stringify({ type: "error", error: { type: "api_error", message: "nope" } }), { status, headers: { "content-type": "application/json", "request-id": "req_test" } });
        const text = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
        return new Response(text, { status: 200, headers: { "content-type": "text/event-stream" } });
    };
    return { seen, fetchImpl };
}

const start = (model = "claude-test-model") => ({ type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } });
const textBlock = (index, ...pieces) => [
    { type: "content_block_start", index, content_block: { type: "text", text: "" } },
    ...pieces.map((text) => ({ type: "content_block_delta", index, delta: { type: "text_delta", text } })),
    { type: "content_block_stop", index },
];
const toolBlock = (index, id, name, ...json) => [
    { type: "content_block_start", index, content_block: { type: "tool_use", id, name, input: {} } },
    ...json.map((partial_json) => ({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json } })),
    { type: "content_block_stop", index },
];
const end = (stop_reason) => [{ type: "message_delta", delta: { stop_reason, stop_sequence: null }, usage: { output_tokens: 20 } }, { type: "message_stop" }];

const REQUEST = {
    model: "claude-test-model",
    effort: "medium",
    system: { stable: "RULES", dynamic: "PAGE" },
    messages: [{ role: "user", content: "Bir grup kur" }],
    tools: [{ type: "function", function: { name: "create_group", description: "Create a group", parameters: { type: "object", properties: { name: { type: "string" } } } } }],
    toolChoice: "auto",
    maxTokens: 7200,
};

async function collect(open) {
    const out = [];
    for await (const event of open.events) out.push(event);
    return out;
}

test("a streamed answer: the request Claude gets, text as it comes, tools once the answer ends", async () => {
    const { seen, fetchImpl } = anthropic([
        start(),
        { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
        { type: "content_block_stop", index: 0 },
        ...textBlock(1, "Grubu ", "kuruyorum."),
        ...toolBlock(2, "toolu_01", "create_group", "{\"na", "me\":\"Python\"}"),
        ...end("tool_use"),
    ]);
    const client = claude.claudeClient({ apiKey: "sk-ant-test", baseURL: "http://anthropic.test" }, fetchImpl);
    const open = await claude.openClaudeStream(client, REQUEST, new AbortController().signal);
    assert.equal(open.ok, true);
    const events = await collect(open);
    assert.deepEqual(events, [
        { type: "text", text: "Grubu " },
        { type: "text", text: "kuruyorum." },
        { type: "tool", id: "toolu_01", name: "create_group", args: "{\"name\":\"Python\"}" },
        { type: "end", stopReason: "tool_use", model: "claude-test-model", fallback: false },
    ]);
    const request = seen[0];
    assert.equal(request.url, "http://anthropic.test/v1/messages?beta=true");
    assert.ok(request.headers.get("anthropic-beta").includes("server-side-fallback-2026-07-01"));
    assert.equal(request.headers.get("x-api-key"), "sk-ant-test");
    assert.equal(request.body.model, "claude-test-model");
    assert.equal(request.body.max_tokens, 7200);
    assert.equal(request.body.stream, true);
    assert.equal(request.body.fallbacks, "default");
    assert.deepEqual(request.body.output_config, { effort: "medium" });
    assert.equal(request.body.thinking, undefined, "thinking stays adaptive (the model's default)");
    assert.equal(request.body.temperature, undefined, "no sampling parameters");
    assert.deepEqual(request.body.system, [{ type: "text", text: "RULES", cache_control: { type: "ephemeral" } }, { type: "text", text: "PAGE" }]);
    assert.deepEqual(request.body.tool_choice, { type: "auto" });
    assert.equal(request.body.tools[0].eager_input_streaming, true);
});

test("a refusal or a cut-off answer runs no tool; the last agent round can't call any", async () => {
    for (const reason of ["refusal", "max_tokens"]) {
        const { fetchImpl } = anthropic([start(), ...textBlock(0, "Kısmi"), ...toolBlock(1, "toolu_02", "create_group", "{\"name\":"), ...end(reason)]);
        const open = await claude.openClaudeStream(claude.claudeClient({ apiKey: "k", baseURL: "http://anthropic.test" }, fetchImpl), REQUEST, new AbortController().signal);
        const events = await collect(open);
        assert.equal(events.some((event) => event.type === "tool"), false, reason);
        assert.equal(events.at(-1).stopReason, reason);
    }
    const { seen, fetchImpl } = anthropic([start("claude-test-fallback"), { type: "content_block_start", index: 0, content_block: { type: "fallback", from: { model: "claude-test-model" }, to: { model: "claude-test-fallback" } } }, { type: "content_block_stop", index: 0 }, ...textBlock(1, "Yanıt"), ...end("end_turn")]);
    const open = await claude.openClaudeStream(claude.claudeClient({ apiKey: "k", baseURL: "http://anthropic.test" }, fetchImpl), { ...REQUEST, toolChoice: "none" }, new AbortController().signal);
    const events = await collect(open);
    assert.deepEqual(events.at(-1), { type: "end", stopReason: "end_turn", model: "claude-test-fallback", fallback: true }, "the fallback model's answer is noted");
    assert.deepEqual(seen[0].body.tool_choice, { type: "none" });
    const plain = anthropic([start(), ...textBlock(0, "x"), ...end("end_turn")]);
    await collect(await claude.openClaudeStream(claude.claudeClient({ apiKey: "k", baseURL: "http://anthropic.test" }, plain.fetchImpl), { ...REQUEST, tools: null }, new AbortController().signal));
    assert.equal(plain.seen[0].body.tools, undefined, "no tools when the agent is off");
    assert.equal(plain.seen[0].body.tool_choice, undefined);
});

test("failures before the answer are reported (so the standard engine can answer), never thrown", async () => {
    const cases = [[401, "auth"], [403, "auth"], [429, "rate_limited"], [400, "bad_request"], [500, "unavailable"], [529, "unavailable"]];
    for (const [status, reason] of cases) {
        const { seen, fetchImpl } = anthropic([], { status });
        const open = await claude.openClaudeStream(claude.claudeClient({ apiKey: "k", baseURL: "http://anthropic.test" }, fetchImpl), REQUEST, new AbortController().signal);
        assert.deepEqual(open, { ok: false, status, reason }, String(status));
        assert.equal(seen.length, 1, "no retry: the route falls back instead");
    }
    const offline = await claude.openClaudeStream(claude.claudeClient({ apiKey: "k", baseURL: "http://anthropic.test" }, async () => {
        throw new TypeError("fetch failed");
    }), REQUEST, new AbortController().signal);
    assert.deepEqual(offline, { ok: false, status: 0, reason: "unavailable" });
});

test("the daily allowance: counted per answer, refused when used up or zero", async () => {
    await withBackend({}, {}, async (backend) => {
        const first = await usage.enforceEngineQuota("dev@example.com", 2);
        assert.equal(first.ok, true);
        assert.deepEqual({ limit: first.window.limit, used: first.window.used, remaining: first.window.remaining }, { limit: 2, used: 1, remaining: 1 });
        assert.ok(Date.parse(first.window.resetsAt) > Date.now() + 23 * 3600_000, "24 hours from the first answer");
        assert.equal((await usage.enforceEngineQuota("dev@example.com", 2)).ok, true);
        assert.deepEqual(await usage.enforceEngineQuota("dev@example.com", 2), { ok: false, reason: "quota" });
        const writes = backend.paths().length;
        assert.deepEqual(await usage.enforceEngineQuota("free@example.com", 0), { ok: false, reason: "quota" });
        assert.equal(backend.paths().length, writes, "a plan without the engine writes nothing");
        const seen = await usage.aiUsageFor("dev@example.com", { plan: "plus", status: "active", expiresAt: null, note: "", grantedBy: null, grantedAt: null, aiBonusDaily: 0, aiBonusUntil: null, paddle: null, paddleCustomerId: null, paddleCheckout: null, planBadgeHidden: false }, { engine: { free: 3, plus: 2, pro: 100 } });
        assert.deepEqual({ limit: seen.engine.limit, used: seen.engine.used, remaining: seen.engine.remaining }, { limit: 2, used: 2, remaining: 0 });
        const without = await usage.aiUsageFor("dev@example.com", null, {});
        assert.equal(without.engine, null, "not listed without the engine");
    });
});
