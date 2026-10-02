// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { load } from "./setup.mjs";

const { buildWebPreview, resolvePreviewTarget, parsePreviewMessage, buildMarkdownDocument, buildCssShowcase, PREVIEW_CSP } = await load("lib/runtimes/web-preview.ts");
const { PROJECT_TEMPLATES } = await load("lib/runtimes/templates.ts");

const files = [
    { name: "index.html", language: "html", code: '<!DOCTYPE html>\n<html>\n<head>\n  <title>T</title>\n  <link rel="stylesheet" href="./style.css">\n</head>\n<body>\n  <h1>Hi</h1>\n  <script src="script.js"></script>\n  <script src="missing.js"></script>\n  <script>\n    undefinedFn();\n  </script>\n</body>\n</html>\n' },
    { name: "style.css", language: "css", code: "h1 { color: red; }\n/* </style> trap */" },
    { name: "script.js", language: "javascript", code: "console.log('a');\nconst s = '</script>';\nnotDefined();\n" },
];

function bridgeOf(html) {
    return /<script>(\(function\(\)\{var T=[\s\S]*?\}\)\(\);)<\/script>/.exec(html)[1];
}

test("local stylesheets and scripts are inlined; missing files are reported", () => {
    const result = buildWebPreview(files, files[0], { token: "tok", stdin: "Ada\n42\n" });
    assert.deepEqual(result.missing, ["missing.js"]);
    assert.deepEqual(result.inlined, ["style.css", "script.js"]);
    assert.match(result.html, /<style data-hanogt-file="style.css">\nh1 \{ color: red; \}\n\/\* <\\\/style> trap \*\/\n<\/style>/);
    assert.match(result.html, /const s = '<\\\/script>';/);
    assert.match(result.html, /<!-- missing.js is not in this project -->/);
    assert.ok(result.html.startsWith("<!DOCTYPE html>\n<html>\n<head><meta http-equiv=\"Content-Security-Policy\""));
    assert.ok(result.html.includes(`content="${PREVIEW_CSP}"`));
});

test("the bridge script is valid JavaScript and maps lines back to files", () => {
    const result = buildWebPreview(files, files[0], { token: "tok" });
    const bridge = bridgeOf(result.html);
    assert.doesNotThrow(() => new vm.Script(bridge));
    assert.doesNotMatch(bridge, /\n/);
    const map = JSON.parse(/M=(\[[^\]]*\])/.exec(bridge)[1]);
    const lines = result.html.split("\n");
    const where = (needle) => {
        const line = lines.findIndex((text) => text.includes(needle)) + 1;
        const entry = map.find((item) => line >= item.s && line <= item.e);
        return `${entry.f}:${entry.l + line - entry.s}`;
    };
    assert.equal(where("notDefined();"), "script.js:3");
    assert.equal(where("undefinedFn();"), "index.html:12");
    assert.equal(where("<h1>Hi</h1>"), "index.html:8");
});

test("the bridge forwards console calls with the token and handles prompt from stdin", () => {
    const result = buildWebPreview(files, files[0], { token: "tok", stdin: "Ada\n" });
    const posted = [];
    const listeners = {};
    const window = {
        parent: { postMessage: (message, origin) => posted.push({ message, origin }) },
        addEventListener: (type, listener) => { listeners[type] = listener; },
    };
    window.window = window;
    const context = vm.createContext({ window, console: { log() {}, info() {}, warn() {}, error() {}, debug() {}, table() {}, dir() {}, trace() {} }, setTimeout, JSON, document: { body: null, createElement: () => ({ style: {}, setAttribute() {}, remove() {} }), documentElement: { appendChild() {} } } });
    vm.runInContext(bridgeOf(result.html), context);
    vm.runInContext("console.log('hi', {a: 1}, [1, 2]); console.error(new Error('bad')); var answer = window.prompt('Name?');", context);
    assert.equal(context.answer, "Ada");
    // Objects created inside the vm context have their own prototypes; compare plain copies.
    const consoleMessages = posted.filter((item) => item.message.type === "console").map((item) => JSON.parse(JSON.stringify(item.message)));
    assert.deepEqual(consoleMessages[0], { source: "hanogt-preview", token: "tok", type: "console", level: "log", args: ["hi", "{ a: 1 }", "[ 1, 2 ]"] });
    assert.deepEqual(consoleMessages[1].args, ["Error: bad"]);
    assert.equal(consoleMessages[1].level, "error");
    assert.match(consoleMessages[2].args[0], /\[prompt\] Name\? → "Ada"/);
    assert.equal(posted[0].message.type, "ready");
    listeners.error({ message: "boom", lineno: 3, colno: 5 });
    assert.match(posted.at(-1).message.args[0], /boom \(index\.html:3:5\)/);
});

test("CodePen-style pages get every stylesheet and script", () => {
    const pen = [
        { name: "index.html", language: "html", code: "<h1>Pen</h1>" },
        { name: "a.css", language: "css", code: "h1{color:blue}" },
        { name: "a.js", language: "javascript", code: "console.log(1)" },
    ];
    const result = buildWebPreview(pen, pen[0], { token: "t" });
    assert.ok(result.html.startsWith("<!DOCTYPE html><head><meta http-equiv=\"Content-Security-Policy\""));
    assert.match(result.html, /<h1>Pen<\/h1><style data-hanogt-file="a.css">/);
    assert.match(result.html, /<script data-hanogt-file="a.js">\nconsole.log\(1\)\n<\/script>$/);
});

test("project templates build without missing files", () => {
    for (const project of PROJECT_TEMPLATES.filter((item) => item.kind === "web")) {
        const entry = project.files.find((file) => file.name === "index.html");
        const result = buildWebPreview(project.files, entry, { token: "t" });
        assert.deepEqual(result.missing, [], project.id);
        assert.deepEqual(result.inlined.sort(), ["script.js", "style.css"], project.id);
    }
});

test("preview target selection", () => {
    const markdown = { name: "README.md", language: "markdown", code: "# x" };
    const css = { name: "a.css", language: "css", code: "" };
    assert.equal(resolvePreviewTarget(files, files[2]).file.name, "index.html");
    assert.equal(resolvePreviewTarget([...files, markdown], markdown).kind, "markdown");
    assert.equal(resolvePreviewTarget([css], css).kind, "css");
    assert.equal(resolvePreviewTarget([{ name: "a.py", language: "python", code: "" }], undefined), null);
});

test("messages from preview frames are validated", () => {
    assert.deepEqual(parsePreviewMessage({ source: "hanogt-preview", token: "tok", type: "console", level: "warn", args: ["x", 5] }, "tok"), { type: "console", level: "warn", args: ["x", "5"] });
    assert.equal(parsePreviewMessage({ source: "hanogt-preview", token: "bad", type: "console", level: "warn", args: [] }, "tok"), null);
    assert.equal(parsePreviewMessage({ source: "hanogt-preview", token: "tok", type: "console", level: "alert", args: [] }, "tok"), null);
    assert.equal(parsePreviewMessage("string", "tok"), null);
});

test("static documents carry a script-free policy and escape their input", () => {
    const markdown = buildMarkdownDocument("", { dark: true, emptyText: "<empty>" });
    assert.match(markdown, /data-theme="dark"/);
    assert.match(markdown, /&lt;empty>/);
    assert.match(markdown, /default-src 'none'; style-src 'unsafe-inline'/);
    const showcase = buildCssShowcase("body{}</style><script>x</script>", { labels: { title: "<T>", paragraph: "P", button: "B", input: "I", box: "Bx", card: "C", listItem: "L", quote: "Q" } });
    assert.match(showcase, /<\\\/style><script>x<\/script>/);
    assert.match(showcase, /<h1>&lt;T><\/h1>/);
});

test("pages in the sandboxed preview get in-memory storage when the real one is blocked", () => {
    const result = buildWebPreview(files, files[0], { token: "tok" });
    const makeWindow = () => {
        const window = { parent: { postMessage() {} }, addEventListener() {} };
        window.window = window;
        return window;
    };
    const quiet = { log() {}, info() {}, warn() {}, error() {}, debug() {}, table() {}, dir() {}, trace() {} };
    const documentStub = { body: null, createElement: () => ({ style: {}, setAttribute() {}, remove() {} }), documentElement: { appendChild() {} } };

    // An opaque-origin frame throws a SecurityError on any access to localStorage/sessionStorage.
    const blocked = makeWindow();
    for (const name of ["localStorage", "sessionStorage"]) {
        Object.defineProperty(blocked, name, { configurable: true, get() { throw new Error("SecurityError: the document is sandboxed"); } });
    }
    const context = vm.createContext({ window: blocked, console: quiet, setTimeout, JSON, Object, String, document: documentStub });
    vm.runInContext(bridgeOf(result.html), context);
    vm.runInContext("window.localStorage.setItem('score', 42); var score = window.localStorage.getItem('score'); var missing = window.localStorage.getItem('nope'); var size = window.localStorage.length; window.sessionStorage.setItem('a', 'b'); window.localStorage.clear(); var afterClear = window.localStorage.length;", context);
    assert.equal(context.score, "42");
    assert.equal(context.missing, null);
    assert.equal(context.size, 1);
    assert.equal(context.afterClear, 0);

    // Working storage is left untouched.
    const store = new Map();
    const real = { setItem: (k, v) => store.set(k, v), getItem: (k) => store.get(k) ?? null, removeItem: (k) => store.delete(k) };
    const open = makeWindow();
    open.localStorage = real;
    open.sessionStorage = real;
    vm.runInContext(bridgeOf(result.html), vm.createContext({ window: open, console: quiet, setTimeout, JSON, Object, String, document: documentStub }));
    assert.equal(open.localStorage, real);
    assert.equal(store.size, 0, "the probe key is removed again");
});
