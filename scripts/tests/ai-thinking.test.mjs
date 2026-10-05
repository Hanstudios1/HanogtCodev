// Run: node --test scripts/tests/*.test.mjs
// Hanogt AI's visible thinking (lib/ai/thinking.ts), the version 2 answer
// stream (lib/ai/stream-protocol.ts) and the server side that re-tells the
// model's events to the browser (lib/server/hanogt-ai-stream.ts): thinking
// and answer apart however the model reports it, a block the template opened
// confirmed or taken back, and a message given back when nothing was answered.
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const thinking = await load("lib/ai/thinking.ts");
const wire = await load("lib/ai/stream-protocol.ts");
const stream = await load("lib/server/hanogt-ai-stream.ts");

/** Every part of a streamed answer pushed piece by piece, then the end. */
function split(pieces, options = {}, end = {}) {
    const splitter = thinking.createThinkingSplitter(options);
    const parts = [];
    for (const piece of pieces) parts.push(...splitter.push(typeof piece === "string" ? { content: piece } : piece));
    parts.push(...splitter.end(end));
    return { parts, splitter };
}

/** The parts joined by kind: { think, text, unthink }. */
function joined(parts) {
    const out = { think: "", text: "", unthink: "" };
    for (const part of parts) out[part.kind] += part.text;
    return out;
}

test("when to think: always, never, or on its own in code and security work and for long questions", () => {
    const ask = (setting, mode, message = "kısa soru") => thinking.wantsThinking(setting, { mode, message });
    assert.deepEqual([ask("on", "general"), ask("off", "code"), ask("off", "security")], [true, false, false]);
    assert.deepEqual([ask("auto", "code"), ask("auto", "security"), ask("auto", "general")], [true, true, false]);
    assert.equal(ask("auto", "general", "x".repeat(400)), true, "a long question");
    assert.equal(ask("auto", "general", "x".repeat(399)), false);
    assert.deepEqual([...thinking.THINKING_SETTINGS], ["auto", "on", "off"]);
});

test("a reasoning field is thinking; the content is the answer", () => {
    const { parts, splitter } = split([{ reasoning: "Önce " }, { reasoning: "düşün." }, { content: "Cevap" }, { content: " burada." }]);
    assert.deepEqual(joined(parts), { think: "Önce düşün.", text: "Cevap burada.", unthink: "" });
    assert.equal(splitter.thought, true);
    assert.deepEqual(thinking.reasoningOf({ reasoning_content: "a", reasoning: "b" }), "a", "reasoning_content first");
    assert.deepEqual([thinking.reasoningOf({ reasoning: "b" }), thinking.reasoningOf({ reasoning: 5 }), thinking.reasoningOf(null)], ["b", "", ""]);
});

test("a <think> block at the start is thinking, even split across pieces", () => {
    const { parts, splitter } = split(["  <thi", "nk>Plan: önce", " test yaz.</th", "ink>\n\nİşte ", "kod."]);
    assert.deepEqual(joined(parts), { think: "Plan: önce test yaz.", text: "İşte kod.", unthink: "" });
    assert.equal(splitter.thought, true);
    // Once the answer started, a literal <think> is just text.
    assert.deepEqual(joined(split(["Cevap: ", "<think>yok</think>"]).parts), { think: "", text: "Cevap: <think>yok</think>", unthink: "" });
    // A held-back "<thi" that never became a tag is text after all.
    assert.deepEqual(joined(split(["<thi"]).parts), { think: "", text: "<thi", unthink: "" });
    // An answer cut inside the block: all of it was thinking.
    const cut = split(["<think>uzun düşünce"], {}, { complete: false });
    assert.deepEqual(joined(cut.parts), { think: "uzun düşünce", text: "", unthink: "" });
    // No thinking at all.
    const plain = split(["Merhaba", "!"]);
    assert.deepEqual(joined(plain.parts), { think: "", text: "Merhaba!", unthink: "" });
    assert.equal(plain.splitter.thought, false);
});

test("a block the template opened: confirmed by </think>, given up for a reasoning field, taken back when it never closes", () => {
    const preopened = { preopened: true };
    // The usual case: the content starts inside the block and closes it.
    assert.deepEqual(joined(split(["adım 1, ", "adım 2</thi", "nk>\n\nSonuç."], preopened).parts), { think: "adım 1, adım 2", text: "Sonuç.", unthink: "" });
    // A server with a reasoning parser: the thinking has its own field and the content is the answer.
    const parsed = split([{ reasoning: "düşünce" }, { content: "Cevap." }], preopened);
    assert.deepEqual(joined(parsed.parts), { think: "düşünce", text: "Cevap.", unthink: "" });
    // The model didn't think (a hybrid model with thinking off): what streamed as thinking was the answer.
    const unthought = split(["Doğrudan ", "cevap."], preopened);
    assert.deepEqual(joined(unthought.parts), { think: "Doğrudan cevap.", text: "", unthink: "Doğrudan cevap." });
    assert.equal(unthought.parts.at(-1).kind, "unthink");
    assert.equal(unthought.splitter.thought, false);
    // Cut before the block closed (length, time limit): it stays thinking.
    assert.deepEqual(joined(split(["yarım düşünce"], preopened, { complete: false }).parts), { think: "yarım düşünce", text: "", unthink: "" });
});

test("whole answers are split the same way; thinking never goes back into the history", () => {
    assert.deepEqual(thinking.splitThinkingText("<think>a</think>b"), { thinking: "a", text: "b" });
    assert.deepEqual(thinking.splitThinkingText("b", "a"), { thinking: "a", text: "b" });
    assert.deepEqual(thinking.splitThinkingText("a</think>b", "", { preopened: true }), { thinking: "a", text: "b" });
    assert.deepEqual(thinking.splitThinkingText("yalnızca cevap", "", { preopened: true }), { thinking: "", text: "yalnızca cevap" }, "never closed: the answer");
    assert.deepEqual(thinking.splitThinkingText("yarım düşünce", "", { preopened: true, complete: false }), { thinking: "yarım düşünce", text: "" }, "cut: still thinking");
    assert.equal(thinking.stripThinkBlocks("<think>\ngizli\n</think>\n\nCevap"), "Cevap");
    assert.equal(thinking.stripThinkBlocks("Cevap <think>x</think>"), "Cevap <think>x</think>", "only a leading block");
});

test("steps are checked before they are shown", () => {
    assert.deepEqual(thinking.readThinkingStep({ kind: "knowledge", titles: ["Planlar", 5, "x".repeat(200), "a", "b", "c"] }), { kind: "knowledge", titles: ["Planlar", "x".repeat(120), "a", "b"] });
    assert.equal(thinking.readThinkingStep({ kind: "knowledge", titles: [] }), null);
    assert.deepEqual(thinking.readThinkingStep({ kind: "analyzer", id: "link" }), { kind: "analyzer", id: "link" });
    assert.equal(thinking.readThinkingStep({ kind: "analyzer", id: "shell" }), null);
    assert.deepEqual(thinking.readThinkingStep({ kind: "file", name: "y".repeat(100) }), { kind: "file", name: "y".repeat(80) });
    assert.deepEqual(thinking.readThinkingStep({ kind: "agent", state: "tools" }), { kind: "agent", state: "tools" });
    for (const broken of [null, "step", { kind: "agent", state: "root" }, { kind: "file", name: "" }, { kind: "other" }]) assert.equal(thinking.readThinkingStep(broken), null, JSON.stringify(broken));
});

test("the version 2 stream: one checked JSON event per line, partial lines wait", () => {
    const events = [
        { t: "step", step: { kind: "knowledge", titles: ["Planlar"] } },
        { t: "think", d: "düşünce" },
        { t: "think_reset" },
        { t: "text", d: "Cevap\nikinci satır" },
        { t: "tools", calls: [{ id: "call_1", name: "navigate", args: { route: "/plans" } }] },
        { t: "error", code: "empty_answer", refunded: true },
        { t: "end", reason: "length" },
    ];
    const text = events.map(wire.encodeWireEvent).join("");
    assert.equal(text.split("\n").length - 1, events.length, "one line each, a newline in the text is escaped");
    for (const event of events) assert.deepEqual(wire.readWireEvent(wire.encodeWireEvent(event).trim()), event);
    const decoder = wire.createWireDecoder();
    const read = [];
    for (let index = 0; index < text.length; index += 7) read.push(...decoder.push(text.slice(index, index + 7)));
    read.push(...decoder.end());
    assert.deepEqual(read, events);
    for (const broken of ["not json", "[]", "{\"t\":\"unknown\"}", "{\"t\":\"end\",\"reason\":\"crash\"}", "{\"t\":\"think\"}", "{\"t\":\"step\",\"step\":{\"kind\":\"x\"}}", "{\"t\":\"error\"}"]) assert.equal(wire.readWireEvent(broken), null, broken);
    assert.equal(wire.readWireEvent(JSON.stringify({ t: "error", code: "x".repeat(100) })).code.length, 40);
    assert.equal(wire.readWireEvent(JSON.stringify({ t: "error", code: "e", refunded: "yes" })).refunded, false);
    const tail = wire.createWireDecoder();
    assert.deepEqual(tail.push("{\"t\":\"text\",\"d\":\"a\"}\n\n{\"t\":\"end\",\"reason\":\"stop\"}"), [{ t: "text", d: "a" }]);
    assert.deepEqual(tail.end(), [{ t: "end", reason: "stop" }], "a last line without a newline");
    assert.deepEqual([wire.WIRE_VERSION, wire.WIRE_HEADER], [2, "X-Hanogt-AI-Wire"]);
});

/** The model's server-sent events in uneven pieces; `fail` ends them with that error instead of closing. */
function upstream(frames, { fail = null } = {}) {
    const bytes = new TextEncoder().encode(frames.map((frame) => (typeof frame === "string" && frame.startsWith(":") ? `${frame}\n\n` : `data: ${typeof frame === "string" ? frame : JSON.stringify(frame)}\n\n`)).join(""));
    const pieces = [];
    for (let index = 0; index < bytes.length; index += 23) pieces.push(bytes.slice(index, index + 23));
    let index = 0;
    return new ReadableStream({
        pull(controller) {
            if (index < pieces.length) controller.enqueue(pieces[index++]);
            else if (fail) controller.error(fail);
            else controller.close();
        },
    });
}

const delta = (value, finish = null) => ({ choices: [{ delta: value, finish_reason: finish }] });

/** Runs chatOutputStream over `frames`; returns what the browser reads and what the route was told. */
async function run(frames, overrides = {}, upstreamOptions = {}) {
    const calls = { noAnswer: 0, close: 0, cancel: 0 };
    const options = {
        wire: 2,
        tools: false,
        steps: [],
        forwardThinking: true,
        isTimedOut: () => false,
        onNoAnswer: async () => {
            calls.noAnswer += 1;
            return true;
        },
        onClose: () => {
            calls.close += 1;
        },
        onCancel: () => {
            calls.cancel += 1;
        },
        ...overrides,
    };
    const output = stream.chatOutputStream(upstream(frames, upstreamOptions), options);
    const reader = output.getReader();
    const decoder = new TextDecoder();
    let raw = "";
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
    }
    const events = options.wire === 2 ? raw.split("\n").filter(Boolean).map((line) => wire.readWireEvent(line)) : null;
    return { raw, events, calls };
}

const textOf = (events) => events.filter((event) => event.t === "text").map((event) => event.d).join("");
const thinkingOf = (events) => events.filter((event) => event.t === "think").map((event) => event.d).join("");

test("the chat stream: steps, thinking and the answer apart, then how it ended", async () => {
    const steps = [{ kind: "knowledge", titles: ["Planlar"] }, { kind: "analyzer", id: "code" }];
    const frames = [": keep-alive", delta({ role: "assistant" }), delta({ reasoning_content: "Kullanıcı plan " }), delta({ reasoning_content: "soruyor." }), delta({ content: "Plus'ta " }), delta({ content: "750 mesaj." }), delta({}, "stop"), "[DONE]"];
    const { events, calls } = await run(frames, { steps });
    assert.deepEqual(events.slice(0, 2), steps.map((step) => ({ t: "step", step })), "the steps come first");
    assert.equal(thinkingOf(events), "Kullanıcı plan soruyor.");
    assert.equal(textOf(events), "Plus'ta 750 mesaj.");
    assert.deepEqual(events.at(-1), { t: "end", reason: "stop" });
    assert.ok(events.findIndex((event) => event.t === "think") < events.findIndex((event) => event.t === "text"));
    assert.deepEqual(calls, { noAnswer: 0, close: 1, cancel: 0 });

    // "Show thinking" off: neither steps nor thinking leave the server.
    const hidden = await run(frames, { steps, forwardThinking: false });
    assert.ok(!hidden.events.some((event) => event.t === "think" || event.t === "step"));
    assert.equal(textOf(hidden.events), "Plus'ta 750 mesaj.");

    // A tab opened before version 2: the plain answer text, nothing else.
    const old = await run(frames, { steps, wire: 1 });
    assert.equal(old.raw, "Plus'ta 750 mesaj.");

    // An answer that hit its length limit says so (the browser offers "Continue").
    const long = await run([delta({ content: "<think>kısa</think>Uzun cevap" }), delta({}, "length")]);
    assert.deepEqual([thinkingOf(long.events), textOf(long.events), long.events.at(-1)], ["kısa", "Uzun cevap", { t: "end", reason: "length" }]);
});

test("nothing answered: the message is given back and the browser is told", async () => {
    const onlyThinking = await run([delta({ reasoning_content: "düşündü ama" }), delta({}, "length")]);
    assert.equal(onlyThinking.calls.noAnswer, 1);
    assert.deepEqual(onlyThinking.events.slice(-2), [{ t: "error", code: "empty_answer", refunded: true }, { t: "end", reason: "error" }]);

    const empty = await run([delta({ content: "   " }), delta({}, "stop")], { onNoAnswer: async () => false });
    assert.deepEqual(empty.events.slice(-2), [{ t: "error", code: "empty_answer", refunded: false }, { t: "end", reason: "error" }]);

    // The route's time limit aborted the model: "timeout", and the message comes back.
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const timedOut = await run([delta({ reasoning_content: "uzun" })], { isTimedOut: () => true }, { fail: abort });
    assert.deepEqual(timedOut.events.slice(-2), [{ t: "error", code: "timeout", refunded: true }, { t: "end", reason: "error" }]);
    // A timeout after some text: the text stays, the end says "timeout".
    const partial = await run([delta({ content: "Yarım" })], { isTimedOut: () => true }, { fail: abort });
    assert.deepEqual([textOf(partial.events), partial.events.at(-1), partial.calls.noAnswer], ["Yarım", { t: "end", reason: "timeout" }, 0]);
    // The browser went away (an abort that isn't the time limit): the stream just closes.
    const left = await run([delta({ content: "Merhaba" })], {}, { fail: abort });
    assert.ok(!left.events.some((event) => event.t === "end"));
    assert.deepEqual([left.calls.noAnswer, left.calls.close], [0, 1]);
    // The model's connection broke midway: what came stays, the end says "error".
    const broken = await run([delta({ content: "Parça" })], {}, { fail: new TypeError("terminated") });
    assert.deepEqual([textOf(broken.events), broken.events.at(-1)], ["Parça", { t: "end", reason: "error" }]);
});

test("agent mode: the model's tool calls are checked, then sent as one event; they count as an answer", async () => {
    const frames = [
        delta({ tool_calls: [{ index: 0, id: "call_nav", function: { name: "navigate", arguments: "{\"rou" } }] }),
        delta({ tool_calls: [{ index: 0, function: { arguments: "te\":\"/editor\"}" } }] }),
        delta({ tool_calls: [{ index: 1, id: "call_bad", function: { name: "delete_account", arguments: "{}" } }] }),
        delta({}, "tool_calls"),
    ];
    const { events, calls } = await run(frames, { tools: true });
    const tools = events.find((event) => event.t === "tools");
    assert.deepEqual(tools.calls[0], { id: "call_nav", name: "navigate", args: { route: "/editor" } });
    assert.deepEqual([tools.calls[1].id, tools.calls[1].name, tools.calls[1].error], ["call_bad", "delete_account", "unknown_tool"]);
    assert.deepEqual([events.at(-1), calls.noAnswer], [{ t: "end", reason: "stop" }, 0]);
    // Without agent mode the calls are ignored (and nothing was answered).
    const off = await run(frames);
    assert.ok(!off.events.some((event) => event.t === "tools"));
    assert.equal(off.calls.noAnswer, 1);
    // A tab before version 2 gets them as the old trailer.
    const old = await run(frames, { tools: true, wire: 1 });
    assert.match(old.raw, /navigate/);
});

test("a template-opened block that never closes: the thinking is taken back and sent as the answer", async () => {
    const { events, calls } = await run([delta({ content: "Doğrudan " }), delta({ content: "cevap." }), delta({}, "stop")], { preopened: true });
    assert.equal(thinkingOf(events), "Doğrudan cevap.", "it streamed as thinking first");
    const reset = events.findIndex((event) => event.t === "think_reset");
    assert.ok(reset > 0);
    assert.equal(textOf(events.slice(reset)), "Doğrudan cevap.");
    assert.deepEqual([events.at(-1), calls.noAnswer], [{ t: "end", reason: "stop" }, 0]);
    // The usual case: the block closes and nothing is taken back.
    const closed = await run([delta({ content: "plan</think>" }), delta({ content: "Cevap." }), delta({}, "stop")], { preopened: true });
    assert.ok(!closed.events.some((event) => event.t === "think_reset"));
    assert.deepEqual([thinkingOf(closed.events), textOf(closed.events)], ["plan", "Cevap."]);
    // Thinking hidden: no reset event either, just the answer.
    const hidden = await run([delta({ content: "Cevap." }), delta({}, "stop")], { preopened: true, forwardThinking: false });
    assert.deepEqual(hidden.events.map((event) => event.t), ["text", "end"]);
    // Old tabs get the answer text.
    const old = await run([delta({ content: "Cevap." }), delta({}, "stop")], { preopened: true, wire: 1 });
    assert.equal(old.raw, "Cevap.");
});
