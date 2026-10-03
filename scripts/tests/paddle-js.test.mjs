// Run: node --test scripts/tests/
// The Plans page's Paddle.js loader (src/components/Plans/paddle-js.ts): how
// failures are classified, and loading, initialising and opening against a
// minimal fake DOM (script tags, CSP events) and a fake Paddle.js.
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const SCRIPT_URL = "https://cdn.paddle.com/paddle/v2/paddle.js";
const SANDBOX = { environment: "sandbox", clientToken: "test_0123456789abcdefghijkl" };
const CUSTOMER = "ctm_01aaaaaaaaaaaaaaaaaaaaaaaa";

let fresh = 0;
/** A module instance of its own: the loader keeps its state per page. */
const loader = () => load(`components/Plans/paddle-js.ts?case=${++fresh}`);

// ---------------------------------------------------------------------------
// Classification (no DOM)
// ---------------------------------------------------------------------------

test("failures are classified by the stage they happened in", async () => {
    const js = await loader();
    const classify = js.classifyPaddleFailure;

    const blocked = classify({ kind: "script_error" });
    assert.ok(blocked instanceof js.PaddleLoadError);
    assert.deepEqual([blocked.stage, blocked.blockedUrl, blocked.message], ["blocked", null, `${SCRIPT_URL} failed to load`]);
    const refused = classify({ kind: "script_error", violation: { url: SCRIPT_URL, directive: "script-src-elem" } });
    assert.deepEqual([refused.stage, refused.blockedUrl], ["blocked", SCRIPT_URL]);
    assert.match(refused.message, /\(script-src-elem refused https:\/\/cdn\.paddle\.com\/paddle\/v2\/paddle\.js\)$/);
    assert.equal(classify({ kind: "script_timeout" }).stage, "blocked", "a stalled download counts as blocked");
    assert.equal(classify({ kind: "no_instance" }).stage, "missing");
    assert.match(classify({ kind: "no_instance" }).message, /window\.PaddleBillingV1 and window\.Paddle are missing/);

    const init = classify({ kind: "threw", call: "Initialize", error: new Error("[PADDLE BILLING] Invalid token\n  at x") });
    assert.deepEqual([init.stage, init.message], ["init", "Initialize: [PADDLE BILLING] Invalid token at x"]);
    assert.equal(classify({ kind: "threw", call: "Environment.set", error: "nope" }).message, "Environment.set: nope", "anything thrown, as String(value)");
    assert.equal(classify({ kind: "threw", call: "Update", error: undefined }).stage, "init");
    assert.equal(classify({ kind: "threw", call: "Checkout.open", error: new TypeError("frame") }).stage, "open");
    assert.equal(classify({ kind: "threw", call: "script", error: new TypeError("no <head>") }).stage, "blocked", "a tag that can't be added never loads");
    const earlier = new js.PaddleLoadError("missing", "kept", null);
    assert.equal(classify({ kind: "threw", call: "Checkout.open", error: earlier }), earlier, "an error that already has a stage keeps it");
    assert.equal(classify({ kind: "threw", call: "Initialize", error: "y".repeat(500) }).message.length, 300);
    const withUrl = classify({ kind: "threw", call: "Initialize", error: new Error("x"), violation: { url: "https://public.profitwell.com/js/profitwell.js", directive: "script-src" } });
    assert.deepEqual([withUrl.stage, withUrl.blockedUrl], ["init", "https://public.profitwell.com/js/profitwell.js"], "the stage stays where it failed; the refused address comes along");

    assert.equal(js.failureMessage(new Error("a\n   b")), "a b");
    assert.equal(js.failureMessage("x".repeat(400)).length, 300);
    assert.equal(js.failureMessage({ message: "duck typed" }), "duck typed");
    assert.equal(js.failureMessage(Object.create(null)), "", "a value without toString");
    assert.equal(js.failureMessage({ toString() { throw new Error("boom"); } }), "");
});

test("only https addresses on Paddle's and Retain's domains count as blocked addresses", async () => {
    const js = await loader();
    assert.equal(js.paddleBlockedUrl("https://sandbox-buy.paddle.com/checkout/custom?_ptxn=txn_01x#top"), "https://sandbox-buy.paddle.com/checkout/custom", "no query: it can carry ids");
    assert.equal(js.paddleBlockedUrl("https://public.profitwell.com/js/profitwell.js?auth=abc"), "https://public.profitwell.com/js/profitwell.js");
    assert.equal(js.paddleBlockedUrl("https://paddle.com/x"), "https://paddle.com/x");
    for (const raw of ["https://evilpaddle.com/x", "https://paddle.com.evil.example/x", "http://cdn.paddle.com/x", "inline", "eval", "", null, 42]) {
        assert.equal(js.paddleBlockedUrl(raw), null, String(raw));
    }
});

// ---------------------------------------------------------------------------
// Loading against a fake DOM
// ---------------------------------------------------------------------------

/** Just enough DOM for the loader: <script> tags in <head>, CSP events, timers. */
function fakeDom() {
    const listeners = new Map();
    const dom = { appended: [], removed: [], onAppend: null };
    const head = {
        children: [],
        appendChild(node) {
            head.children.push(node);
            dom.appended.push(node);
            // The browser starts loading after the tag is in the page.
            queueMicrotask(() => dom.onAppend?.(node));
            return node;
        },
    };
    class Script {
        constructor() {
            this.src = "";
            this.async = false;
            this.handlers = new Map();
        }
        addEventListener(type, handler) {
            if (!this.handlers.has(type)) this.handlers.set(type, new Set());
            this.handlers.get(type).add(handler);
        }
        removeEventListener(type, handler) {
            this.handlers.get(type)?.delete(handler);
        }
        fire(type) {
            for (const handler of [...(this.handlers.get(type) ?? [])]) handler({ type, target: this });
        }
        listening(type) {
            return this.handlers.get(type)?.size ?? 0;
        }
        remove() {
            head.children = head.children.filter((child) => child !== this);
            dom.removed.push(this);
        }
    }
    const document = {
        head,
        body: head,
        createElement: (tag) => {
            assert.equal(tag, "script");
            return new Script();
        },
        querySelector: (selector) => head.children.find((node) => selector === `script[src="${node.src}"]`) ?? null,
        addEventListener: (type, handler) => {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(handler);
        },
        removeEventListener: (type, handler) => listeners.get(type)?.delete(handler),
    };
    dom.violate = (blockedURI, directive) => {
        for (const handler of listeners.get("securitypolicyviolation") ?? []) handler({ blockedURI, effectiveDirective: directive, violatedDirective: directive });
    };
    dom.window = { setTimeout, clearTimeout };
    dom.document = document;
    dom.Script = Script;
    globalThis.window = dom.window;
    globalThis.document = document;
    return dom;
}

/** A Paddle.js instance that records what it is asked to do. */
function fakePaddle({ initialized = false, failInitialize = null, failOpen = null } = {}) {
    const calls = [];
    const paddle = {
        Initialized: initialized,
        Environment: { set: (environment) => calls.push(["Environment.set", environment]) },
        Initialize(options) {
            calls.push(["Initialize", options]);
            if (failInitialize) throw new Error(failInitialize);
            paddle.Initialized = true;
        },
        Update(options) {
            calls.push(["Update", options]);
        },
        Checkout: {
            open(options) {
                calls.push(["Checkout.open", options]);
                if (failOpen) throw new Error(failOpen);
            },
            close() {},
        },
    };
    return { paddle, calls };
}

async function withDom(run) {
    const dom = fakeDom();
    try {
        return await run(dom);
    } finally {
        delete globalThis.window;
        delete globalThis.document;
    }
}

test("loads one tag, prefers window.PaddleBillingV1 and initialises sandbox, debug and Retain once", async () => {
    const js = await loader();
    await withDom(async (dom) => {
        const billing = fakePaddle();
        const legacy = fakePaddle();
        dom.onAppend = (node) => {
            dom.window.PaddleBillingV1 = billing.paddle;
            dom.window.Paddle = legacy.paddle;
            node.fire("load");
        };
        const [first, concurrent] = await Promise.all([
            js.getPaddle(SANDBOX, { settings: { theme: "dark", locale: "tr" }, customerId: CUSTOMER, debug: true }),
            js.getPaddle(SANDBOX, { settings: { theme: "dark", locale: "tr" }, customerId: CUSTOMER, debug: true }),
        ]);
        assert.equal(first, billing.paddle, "window.PaddleBillingV1, like Paddle's own loader");
        assert.equal(concurrent, billing.paddle);
        assert.equal(dom.appended.length, 1, "one tag for calls made while it loads");
        assert.equal(dom.appended[0].src, SCRIPT_URL);
        assert.equal(dom.appended[0].async, true);
        assert.equal(dom.appended[0].listening("load") + dom.appended[0].listening("error"), 0, "no listeners left behind");
        assert.deepEqual(billing.calls.map(([name]) => name), ["Environment.set", "Initialize"]);
        assert.equal(billing.calls[0][1], "sandbox");
        const options = billing.calls[1][1];
        assert.equal(options.token, SANDBOX.clientToken);
        assert.deepEqual(options.pwCustomer, { id: CUSTOMER });
        assert.equal(options.debug, true);
        assert.deepEqual(options.checkout, { settings: { displayMode: "overlay", allowLogout: false, theme: "dark", locale: "tr" } });
        assert.deepEqual(legacy.calls, []);

        // Events go to the handler the page registered last.
        const seen = [];
        js.onPaddleEvent((event) => seen.push(`a:${event.name}`));
        js.onPaddleEvent((event) => seen.push(`b:${event.name}`));
        options.eventCallback({ name: "checkout.completed" });
        js.onPaddleEvent(null);
        options.eventCallback({ name: "checkout.closed" });
        assert.deepEqual(seen, ["b:checkout.completed"]);

        // Initialised: nothing to do until something changes, then Update.
        await js.getPaddle(SANDBOX, { customerId: CUSTOMER, debug: true });
        await js.getPaddle(SANDBOX, { customerId: null, debug: true });
        assert.equal(billing.calls.length, 2, "same token, customer and debug: Paddle.js is left alone");
        await js.getPaddle(SANDBOX, { customerId: "ctm_01bbbbbbbbbbbbbbbbbbbbbbbb", debug: true });
        assert.deepEqual(billing.calls.slice(2).map(([name]) => name), ["Environment.set", "Update"]);
        assert.deepEqual(billing.calls[3][1].pwCustomer, { id: "ctm_01bbbbbbbbbbbbbbbbbbbbbbbb" });
        await js.getPaddle(SANDBOX, { customerId: "not-a-customer", debug: false });
        assert.equal(billing.calls.at(-1)[0], "Update");
        assert.equal(billing.calls.at(-1)[1].debug, false);
        assert.equal("pwCustomer" in billing.calls.at(-1)[1], false, "malformed customer ids never reach Paddle");
        assert.equal(dom.appended.length, 1);

        js.openCheckout(billing.paddle, "txn_01abcdefghijklmnopqrstuvwx", { theme: "light" });
        assert.deepEqual(billing.calls.at(-1), ["Checkout.open", { transactionId: "txn_01abcdefghijklmnopqrstuvwx", settings: { theme: "light" } }]);
    });
});

test("a tag already on the page is reused; an instance initialised elsewhere gets Update", async () => {
    const js = await loader();
    await withDom(async (dom) => {
        const existing = new dom.Script();
        existing.src = SCRIPT_URL;
        dom.document.head.children.push(existing);
        const { paddle, calls } = fakePaddle({ initialized: true });
        const pending = js.getPaddle({ environment: "production", clientToken: "live_0123456789abcdefghijkl" }, { customerId: CUSTOMER });
        dom.window.Paddle = paddle;
        existing.fire("load");
        assert.equal(await pending, paddle, "window.Paddle when there is no window.PaddleBillingV1");
        assert.equal(dom.appended.length, 0, "no second tag");
        assert.deepEqual(calls.map(([name]) => name), ["Update"], "live: no Environment.set; Initialized: Update, not a second Initialize");
        assert.equal(typeof calls[0][1].eventCallback, "function", "our events are wired up");
        assert.deepEqual(calls[0][1].pwCustomer, { id: CUSTOMER });
    });
});

test("a failed download is tried once more with a fresh tag, then reported as blocked with the refused address", async () => {
    const js = await loader();
    await withDom(async (dom) => {
        dom.onAppend = (node) => {
            dom.violate("https://evil.example/tracker.js", "script-src-elem");
            dom.violate(`${SCRIPT_URL}?v=2`, "script-src-elem");
            node.fire("error");
        };
        await assert.rejects(js.getPaddle(SANDBOX), (error) => {
            assert.ok(error instanceof js.PaddleLoadError);
            assert.equal(error.stage, "blocked");
            assert.equal(error.blockedUrl, SCRIPT_URL, "the Paddle address, without its query; other hosts are ignored");
            assert.match(error.message, /failed to load \(script-src-elem refused/);
            return true;
        });
        assert.equal(dom.appended.length, 2, "tried twice");
        assert.equal(dom.removed.length, 2, "failed tags are removed");
        assert.equal(dom.document.head.children.length, 0);

        // The next press starts over, and a hiccup on the first try isn't fatal.
        const { paddle } = fakePaddle();
        let tries = 0;
        dom.onAppend = (node) => {
            tries += 1;
            if (tries === 1) return node.fire("error");
            dom.window.PaddleBillingV1 = paddle;
            node.fire("load");
        };
        assert.equal(await js.getPaddle(SANDBOX), paddle);
        assert.equal(dom.appended.length, 4);
    });
});

test("no instance after loading is missing, a throwing Initialize is init, a throwing Checkout.open is open", async () => {
    const js = await loader();
    await withDom(async (dom) => {
        dom.onAppend = (node) => node.fire("load");
        await assert.rejects(js.getPaddle(SANDBOX), (error) => error.stage === "missing" && error.blockedUrl === null);
        assert.equal(dom.appended.length, 1, "a script that ran is not downloaded again right away");

        const broken = fakePaddle({ failInitialize: "[PADDLE] Invalid client-side token" });
        dom.onAppend = (node) => {
            dom.window.PaddleBillingV1 = broken.paddle;
            node.fire("load");
        };
        await assert.rejects(js.getPaddle(SANDBOX), (error) => error.stage === "init" && error.message === "Initialize: [PADDLE] Invalid client-side token");
        await assert.rejects(js.getPaddle(SANDBOX), (error) => error.stage === "init", "not marked as initialised: tried again next time");
        assert.equal(broken.calls.filter(([name]) => name === "Initialize").length, 2);

        const sandboxOnly = fakePaddle();
        sandboxOnly.paddle.Environment.set = () => {
            throw new Error("unknown environment");
        };
        dom.window.PaddleBillingV1 = sandboxOnly.paddle;
        await assert.rejects(js.getPaddle(SANDBOX), (error) => error.stage === "init" && error.message === "Environment.set: unknown environment");

        const opening = fakePaddle({ failOpen: "Checkout is already open" });
        dom.window.PaddleBillingV1 = opening.paddle;
        const paddle = await js.getPaddle(SANDBOX);
        assert.throws(() => js.openCheckout(paddle, "txn_01abcdefghijklmnopqrstuvwx", {}), (error) => error instanceof js.PaddleLoadError && error.stage === "open" && error.message === "Checkout.open: Checkout is already open");
    });
});

test("a refusal from before the press isn't blamed on it", async () => {
    const js = await loader();
    await withDom(async (dom) => {
        dom.onAppend = (node) => node.fire("error");
        await assert.rejects(js.getPaddle(SANDBOX), (error) => error.stage === "blocked" && error.blockedUrl === null);
        dom.violate("https://sandbox-cdn.paddle.com/paddle/v2/paddle.js", "script-src-elem");
        await new Promise((resolve) => setTimeout(resolve, 5));
        await assert.rejects(js.getPaddle(SANDBOX), (error) => error.stage === "blocked" && error.blockedUrl === null);
    });
});
