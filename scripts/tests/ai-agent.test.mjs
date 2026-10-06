// Run: node --test scripts/tests/
// Hanogt AI agent mode: tool registry, argument sanitising, the page
// whitelist, permissions, refusals, the wire protocol and the offline Core's
// message → action mapping.
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const tools = await load("lib/ai/agent-tools.ts");
const protocol = await load("lib/ai/agent-protocol.ts");
const intents = await load("lib/ai/agent-intents.ts");
const programs = await load("lib/ai/programs.ts");
const { PROJECT_TEMPLATES } = await load("lib/game-engine/templates/index.ts");
const { GROUP_LIMITS } = await load("lib/groups.ts");

const tx = (copy, vars = {}) => copy.TR.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
const propose = (intent, text, options = {}) => intents.proposeCoreAction(intent, text, { tx, programs, ...options });

test("registry: every tool has a kind, an auth rule, a title and exactly one schema", () => {
    const names = tools.AGENT_TOOL_NAMES;
    assert.equal(new Set(names).size, names.length);
    for (const name of names) {
        assert.ok(["info", "read", "navigate", "write"].includes(tools.AGENT_TOOL_KIND[name]), name);
        assert.equal(typeof tools.AGENT_TOOL_REQUIRES_AUTH[name], "boolean", name);
        assert.ok(tools.AGENT_TOOL_TITLES[name].TR && tools.AGENT_TOOL_TITLES[name].EN, name);
        assert.ok(tools.isAgentToolName(name));
    }
    assert.equal(tools.isAgentToolName("delete_account"), false);
    const schemas = tools.agentToolSchemas();
    assert.deepEqual(schemas.map((schema) => schema.function.name).sort(), [...names].sort());
    for (const schema of schemas) {
        assert.equal(schema.type, "function");
        assert.equal(schema.function.parameters.type, "object");
        assert.equal(schema.function.parameters.additionalProperties, false);
    }
});

test("registry: destructive or sensitive operations have no tool at all", () => {
    for (const name of tools.AGENT_TOOL_NAMES) assert.doesNotMatch(name, /delete|remove|password|2fa|admin|ban|message|send|invite/);
    // Account actions need a session; the rest also work for visitors.
    assert.equal(tools.AGENT_TOOL_REQUIRES_AUTH.get_my_profile, true);
    assert.equal(tools.AGENT_TOOL_REQUIRES_AUTH.create_group, true);
    assert.equal(tools.AGENT_TOOL_REQUIRES_AUTH.create_game, true);
    assert.equal(tools.AGENT_TOOL_REQUIRES_AUTH.navigate, false);
});

test("schemas list the whitelisted pages and the engine's own templates", () => {
    const schemas = Object.fromEntries(tools.agentToolSchemas().map((schema) => [schema.function.name, schema.function.parameters]));
    assert.deepEqual(schemas.navigate.properties.route.enum, [...tools.AGENT_ROUTE_PATHS]);
    assert.deepEqual(schemas.create_game.properties.template.enum, PROJECT_TEMPLATES.map((template) => template.id));
    assert.deepEqual(tools.agentGameTemplates().map((template) => template.id), PROJECT_TEMPLATES.map((template) => template.id));
});

test("route whitelist accepts only known site pages", () => {
    assert.equal(tools.normalizeAgentRoute("editor"), "/editor");
    assert.equal(tools.normalizeAgentRoute("/Editor/"), "/editor");
    // Friends, messages and groups moved into Hanogt Social.
    assert.equal(tools.normalizeAgentRoute(" /groups "), "/social");
    assert.equal(tools.normalizeAgentRoute("friends"), "/social");
    assert.equal(tools.normalizeAgentRoute("/messages/"), "/social");
    for (const bad of ["https://evil.example", "//evil.example", "/admin", "/editor?import=x", "/../admin", "javascript:alert(1)", "/editor#x", "/game-engine/../admin", "", null, 42, "/ai"]) {
        assert.equal(tools.normalizeAgentRoute(bad), null, String(bad));
    }
    for (const path of ["/editor", "/dashboard", "/social", "/media", "/news", "/arcade", "/game-engine", "/account-settings", "/settings", "/feedback", "/guide", "/security", "/about"]) {
        assert.ok(tools.isAgentRoute(path), path);
    }
    assert.equal(tools.isAgentRoute("/groups"), false);
});

test("sanitizeAgentCall validates names and cleans arguments", () => {
    assert.deepEqual(tools.sanitizeAgentCall("delete_account", {}), { ok: false, error: "unknown_tool" });
    assert.deepEqual(tools.sanitizeAgentCall("create_group", "{not json"), { ok: false, error: "invalid_arguments" });
    assert.deepEqual(tools.sanitizeAgentCall("create_group", "[1,2]"), { ok: false, error: "invalid_arguments" });

    const group = tools.sanitizeAgentCall("create_group", JSON.stringify({ name: "  React\u202e çalışma\u200b grubu \n ", template: "nope", color: "neon", description: "a\u0000b" }));
    assert.equal(group.ok, true);
    assert.equal(group.call.args.name, "React çalışma grubu");
    assert.equal(group.call.args.template, "blank");
    assert.equal(group.call.args.color, null);
    assert.equal(group.call.args.description, "ab");
    const long = tools.sanitizeAgentCall("create_group", { name: "x".repeat(500) });
    assert.equal(long.call.args.name.length, GROUP_LIMITS.nameMax);

    const editor = tools.sanitizeAgentCall("open_editor_with_code", { language: "py", fileName: "../../calc", code: "print(1)\r\n\u202eevil" });
    assert.equal(editor.ok, true);
    assert.equal(editor.call.args.language, "python");
    assert.equal(editor.call.args.fileName, "calc.py");
    assert.equal(editor.call.args.code, "print(1)\nevil");
    assert.deepEqual(tools.sanitizeAgentCall("open_editor_with_code", { language: "klingon", code: "x" }), { ok: false, error: "unsupported_language" });
    assert.deepEqual(tools.sanitizeAgentCall("open_editor_with_code", { language: "python", code: "   " }), { ok: false, error: "empty_code" });
    assert.deepEqual(tools.sanitizeAgentCall("open_editor_with_code", { language: "python", code: "x".repeat(tools.AGENT_MAX_CODE_CHARS + 1) }), { ok: false, error: "code_too_large" });
    // The file name's extension can name the language.
    assert.equal(tools.sanitizeAgentCall("open_editor_with_code", { fileName: "index.html", code: "<p>hi</p>" }).call.args.language, "html");

    const game = tools.sanitizeAgentCall("create_game", { name: "Benim Oyunum", template: "platformer" });
    assert.equal(game.ok, true);
    assert.equal(game.call.args.template, "platformer-2d");
    assert.deepEqual(tools.sanitizeAgentCall("create_game", { name: "x", template: "doom-eternal" }), { ok: false, error: "invalid_template" });

    assert.deepEqual(tools.sanitizeAgentCall("navigate", { route: "/admin" }), { ok: false, error: "invalid_route" });
    assert.deepEqual(tools.sanitizeAgentCall("navigate", { route: "messages" }), { ok: true, call: { name: "navigate", args: { route: "/social" } } });
    assert.deepEqual(tools.sanitizeAgentCall("search_site", { query: "   " }), { ok: false, error: "empty_query" });
    assert.deepEqual(tools.sanitizeAgentCall("get_my_profile", { anything: true }), { ok: true, call: { name: "get_my_profile", args: {} } });
});

test("agentArgsProblem keeps Allow disabled until the details are valid", () => {
    assert.equal(tools.agentArgsProblem({ name: "create_group", args: { name: "a", description: "", template: "blank", color: null } }), "name_too_short");
    assert.equal(tools.agentArgsProblem({ name: "create_group", args: { name: "Takım", description: "", template: "blank", color: null } }), null);
    assert.equal(tools.agentArgsProblem({ name: "create_game", args: { name: " ", template: "platformer-2d", description: "" } }), "name_too_short");
    assert.equal(tools.agentArgsProblem({ name: "navigate", args: { route: "/nowhere" } }), "invalid_route");
});

test("permissions: off blocks, ask confirms, auto runs only safe actions", () => {
    const decide = (name, mode, granted = false) => tools.agentDecision(name, { mode, granted });
    for (const name of tools.AGENT_TOOL_NAMES) assert.equal(decide(name, "off"), "blocked", name);
    assert.equal(decide("search_site", "ask"), "run");
    assert.equal(decide("get_my_profile", "ask"), "ask");
    assert.equal(decide("get_my_profile", "ask", true), "run");
    assert.equal(decide("navigate", "ask"), "ask");
    assert.equal(decide("create_group", "ask"), "ask");
    assert.equal(decide("navigate", "auto_safe"), "run");
    assert.equal(decide("open_editor_with_code", "auto_safe"), "run");
    assert.equal(decide("create_group", "auto_safe"), "ask");
    assert.equal(decide("create_game", "auto_safe"), "ask");
    assert.equal(decide("get_my_profile", "auto_safe"), "ask");
    assert.equal(decide("create_game", "auto_safe", true), "run");
    // Reading the profile is asked once per session; other tools only when "always" is chosen.
    assert.equal(tools.approvalGrantsSession("get_my_profile", false), true);
    assert.equal(tools.approvalGrantsSession("create_group", false), false);
    assert.equal(tools.approvalGrantsSession("create_group", true), true);
    assert.equal(tools.DEFAULT_AGENT_MODE, "ask");
});

test("sensitive requests are recognised and how-to questions are not refused", () => {
    const cases = {
        "hesabımı sil": "delete",
        "delete my account": "delete",
        "grubumu silsene": "delete",
        "şifremi değiştir": "password",
        "parolamı göster": "password",
        "2fa'yı kapat": "two_factor",
        "turn off two factor authentication": "two_factor",
        "beni admin yap": "admin",
        "make me a moderator": "admin",
        "Ali'yi banla": "moderation",
        "Ayşe'ye mesaj gönder": "message_others",
        "send a message to my friends": "message_others",
    };
    for (const [text, category] of Object.entries(cases)) assert.equal(tools.detectSensitiveRequest(text), category, text);
    for (const text of ["mesaj gönderemiyorum", "parola üreten bir python kodu yaz", "banlandım neden", "React çalışma grubu kur", "bana admin paneli hakkında bilgi ver", "write a python bot that sends messages", "profilimde ne yazıyor"]) {
        assert.equal(tools.detectSensitiveRequest(text), null, text);
    }
    assert.equal(tools.isHowToQuestion("hesabımı nasıl silerim"), true);
    assert.equal(tools.isHowToQuestion("how do i delete my account"), true);
    assert.equal(tools.isHowToQuestion("hesabımı sil"), false);
});

test("the profile summary never carries e-mail, links or private settings", () => {
    const summary = tools.summarizeProfile({
        fields: { username: "Oğuz", nickname: "oguz", nicknameTag: "0420", bio: "Merhaba\u202e", favoriteLangs: ["py", "ts", 5], customStatus: "kod yazıyor", email: "a@b.c", socialLinks: ["https://x"] },
        account: { createdAt: "2025-03-04T10:00:00.000Z", staffRole: "moderator", email: "a@b.c", twoFactorEnabled: true },
        stats: { projects: 3, gameProjects: -1, groups: 2, friends: 7, mediaPosts: "9" },
    });
    assert.equal(summary.displayName, "Oğuz");
    assert.equal(summary.tag, "0420");
    assert.equal(summary.bio, "Merhaba");
    assert.equal(summary.memberSince, "2025-03-04");
    assert.equal(summary.staffRole, "moderator");
    assert.deepEqual(summary.stats, { projects: 3, gameProjects: null, groups: 2, friends: 7, mediaPosts: null });
    assert.equal(summary.favoriteLanguages.length, 2);
    assert.doesNotMatch(JSON.stringify(summary), /a@b\.c|https:\/\/x|twoFactor/);
    assert.equal(tools.summarizeProfile(null), null);
    assert.equal(tools.summarizeProfile({ fields: "x" }), null);
});

test("agent trailer: encoded after the text and split off while streaming", () => {
    const trailer = { toolCalls: [{ id: "call_1", name: "navigate", args: { route: "/editor" } }] };
    const streamed = `Editörü açıyorum.${protocol.encodeAgentTrailer(trailer)}`;
    assert.deepEqual(protocol.splitAgentStream(streamed), { text: "Editörü açıyorum.", trailer });
    // Half a trailer is never shown as text and isn't parsed yet.
    const partial = streamed.slice(0, streamed.length - 5);
    assert.deepEqual(protocol.splitAgentStream(partial), { text: "Editörü açıyorum.", trailer: null });
    assert.deepEqual(protocol.splitAgentStream("plain answer"), { text: "plain answer", trailer: null });
    assert.equal(protocol.stripTrailerMark("a\u001eb"), "ab");
    const bad = `x${protocol.AGENT_TRAILER_MARK}${JSON.stringify({ toolCalls: [{ id: "bad id!", name: "navigate" }, { id: "ok", name: "navigate", args: [] }] })}`;
    assert.deepEqual(protocol.splitAgentStream(bad).trailer.toolCalls, [{ id: "ok", name: "navigate", args: {} }]);
});

test("history: tool calls and results keep OpenAI order and are validated", () => {
    const history = [
        { role: "user", content: "editörü aç" },
        { role: "assistant", content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "navigate", arguments: "{\"route\":\"/editor\"}" } }, { id: "c2", type: "function", function: { name: "rm_rf", arguments: "{}" } }] },
        { role: "tool", tool_call_id: "c1", content: "{\"status\":\"opened\"}" },
        { role: "tool", tool_call_id: "zz", content: "orphan" },
    ];
    const withTools = protocol.normalizeChatMessages(history, { tools: true });
    assert.deepEqual(withTools.map((message) => message.role), ["user", "assistant", "tool"]);
    assert.equal(withTools[1].tool_calls.length, 1);
    assert.equal(withTools[1].tool_calls[0].function.name, "navigate");
    // An unanswered call gets a "not executed" result so the model's turn stays valid.
    const unanswered = protocol.normalizeChatMessages(history.slice(0, 2).concat([{ role: "user", content: "boşver" }]), { tools: true });
    assert.deepEqual(unanswered.map((message) => message.role), ["user", "assistant", "tool", "user"]);
    assert.match(unanswered[2].content, /not_executed/);
    // Without tools, calls are folded into text.
    const flat = protocol.normalizeChatMessages(history, { tools: false });
    assert.deepEqual(flat, null);
    const flatTurn = protocol.normalizeChatMessages([...history, { role: "user", content: "teşekkürler" }], { tools: false });
    assert.deepEqual(flatTurn.map((message) => message.role), ["user", "assistant", "user"]);
    assert.match(flatTurn[1].content, /Hanogt AI action: navigate/);
    assert.equal(protocol.normalizeChatMessages([{ role: "assistant", content: "hi" }], { tools: false }), null);
});

test("buildWireMessages turns stored cards into tool calls and results", () => {
    const messages = [
        { id: "1", role: "user", content: "React grubu kur", createdAt: 1 },
        { id: "2", role: "assistant", content: "", createdAt: 2, agent: { source: "llm", calls: [{ id: "call_9", name: "create_group", args: { name: "React", template: "study" }, status: "done", output: "{\"status\":\"created\"}" }], followUp: "waiting", round: 0 } },
        { id: "3", role: "assistant", content: "Kartı kontrol et.", createdAt: 3, agent: { source: "core", calls: [{ id: "core-1", name: "navigate", args: { route: "/social" }, status: "denied" }] } },
    ];
    const wire = protocol.buildWireMessages(messages, { tools: true });
    assert.deepEqual(wire.map((message) => message.role), ["user", "assistant", "tool", "assistant"]);
    assert.equal(wire[1].tool_calls[0].function.name, "create_group");
    assert.equal(wire[2].tool_call_id, "call_9");
    assert.equal(wire[2].content, "{\"status\":\"created\"}");
    assert.match(wire[3].content, /navigate: denied/);
    assert.match(protocol.toolOutput({ status: "denied" }), /declined/);
});

test("Core maps sample sentences to the same actions the model would take", () => {
    const calc = propose("write_code", "Python ile hesap makinesi yaz ve editörde aç");
    assert.equal(calc.kind, "call");
    assert.equal(calc.call.name, "open_editor_with_code");
    assert.equal(calc.call.args.language, "python");
    assert.equal(calc.call.args.fileName, "hesap_makinesi.py");
    assert.match(calc.call.args.code, /def hesapla/);

    // Without "open it", the code is only shown.
    assert.equal(propose("write_code", "Python ile hesap makinesi yaz").kind, "code");
    assert.equal(propose("write_code", "bana kod yazar mısın").kind, "need_topic");
    const cpp = propose("write_code", "C++ ile sayı tahmin oyunu yaz ve editöre koy");
    assert.equal(cpp.call.args.language, "cpp");
    const rust = propose("write_code", "rust ile hesap makinesi yaz ve editörde aç");
    assert.equal(rust.program.missingLanguage, "Rust");

    const platformer = propose("make_game", "bana bir platform oyunu yap");
    assert.equal(platformer.call.name, "create_game");
    assert.equal(platformer.call.args.template, "platformer-2d");
    assert.ok(platformer.call.args.name.length >= 2);
    assert.equal(propose("make_game", "make me a space shooter game").call.args.template, "space-shooter-2d");
    assert.equal(propose("make_game", "\"Uzay Avcısı\" adında bir uzay oyunu yap").call.args.name, "Uzay Avcısı");
    const snake = propose("make_game", "basit bir yılan oyunu oluştur");
    assert.equal(snake.call.name, "open_editor_with_code");
    assert.equal(snake.call.args.language, "html");
    // Naming the engine (or C++/C#) picks the engine template instead of the browser program.
    assert.equal(propose("make_game", "C++ ile yılan oyunu yap").call.args.template, "snake-2d");
    assert.equal(propose("make_game", "oyun motorunda pong yap").call.args.template, "pong-2d");
    assert.equal(propose("make_game", "bana kule savunma oyunu yap").call.args.template, "tower-defense-2d");
    assert.equal(propose("make_game", "rpg macera oyunu kur").call.args.template, "rpg-topdown-2d");
    assert.equal(propose("make_game", "3d parkur oyunu yap").call.args.template, "obstacle-course-3d");
    assert.equal(propose("make_game", "flappy bird gibi bir oyun").call.args.template, "flappy-2d");
    assert.equal(propose("make_game", "2d koşu oyunu yap").call.args.template, "runner-2d");
    assert.equal(propose("make_game", "sonsuz koşu oyunu yap").call.args.template, "runner-3d");

    const group = propose("create_group", "React çalışma grubu kur");
    assert.equal(group.call.name, "create_group");
    assert.equal(group.call.args.name, "React çalışma grubu");
    assert.equal(group.call.args.template, "study");
    assert.equal(propose("create_group", "create a group called night coders").call.args.name, "Night coders");
    assert.equal(propose("create_group", "python öğrenenler için bir grup aç").call.args.name, "Python öğrenenler grubu");
    assert.equal(propose("create_group", "açık kaynak projemiz için grup oluştur").call.args.template, "opensource");
    // No name given: the card asks for one.
    assert.equal(propose("create_group", "bana bir ekip kur").call.args.name, "");

    assert.deepEqual(propose("navigate", "mesajlar sayfasına git").call, { name: "navigate", args: { route: "/social" } });
    assert.equal(propose("navigate", "beni Hanogt Social'a götür").call.args.route, "/social");
    assert.equal(propose("navigate", "editör ayarlarına git").call.args.route, "/settings");
    assert.equal(propose("navigate", "take me to the dashboard").call.args.route, "/dashboard");
    assert.equal(propose("navigate", "beni bir yere götür"), null);
    assert.deepEqual(propose("open_editor", "kod editörünü aç").call, { name: "navigate", args: { route: "/editor" } });
    assert.deepEqual(propose("my_profile", "profilimde ne yazıyor").call, { name: "get_my_profile", args: {} });
    assert.equal(propose("greeting", "merhaba"), null);
});

test("offline programs are complete, searchable and safe to embed", () => {
    for (const program of programs.PROGRAM_SNIPPETS) {
        const languages = Object.keys(program.code);
        assert.ok(languages.length, program.id);
        for (const language of languages) {
            assert.ok(programs.PROGRAM_LANGUAGES[language], `${program.id}/${language}`);
            assert.ok(program.code[language].trim().length > 40, `${program.id}/${language}`);
        }
        if (program.code.html) {
            assert.match(program.code.html, /^<!doctype html>/i, program.id);
            // Sandboxed previews have no storage: pages must not touch localStorage directly.
            assert.doesNotMatch(program.code.html, /(?<![.\w])localStorage\.(?:getItem|setItem|removeItem)/, program.id);
        }
    }
    assert.equal(programs.findProgram("hesap makinesi")?.id, "calculator");
    assert.equal(programs.findProgram("yılan oyunu")?.id, "snake");
    assert.equal(programs.findProgram("to-do app")?.id, "todo");
    assert.equal(programs.findProgram("çok garip bir istek"), null);
});
