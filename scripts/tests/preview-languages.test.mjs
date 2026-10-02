// SVG, Mermaid and LaTeX previews: documents, frame policy and the postMessage contract.
// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { load } from "./setup.mjs";

const { buildSvgDocument, buildLiveShell, isLivePreviewKind, resolvePreviewTarget, LIVE_PREVIEW_CSP, STATIC_PREVIEW_CSP, PREVIEW_HOST_SOURCE } = await load("lib/runtimes/web-preview.ts");
const { PROJECT_TEMPLATES } = await load("lib/runtimes/templates.ts");
const { LANGUAGES } = await load("lib/runtimes/languages.ts");

const SVG_LABELS = { invalid: "INVALID", notSvg: "NOT SVG", location: "line {line}, column {column}", namespaceAdded: "NS ADDED", note: "NOTE" };
const LIVE_LABELS = { error: "ERR", line: "line {line}", empty: "EMPTY", unsupported: "UNSUPPORTED {list}" };

test("SVG files are shown as a script-free image", () => {
    const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"20\" height=\"10\" viewBox=\"0 0 20 10\"><script>alert(1)</script><rect width=\"20\" height=\"10\"/></svg>";
    const html = buildSvgDocument(svg, { dark: true, labels: SVG_LABELS });
    assert.ok(html.includes(`content="${STATIC_PREVIEW_CSP}"`));
    assert.match(html, /data-theme="dark"/);
    assert.match(html, /<img alt="" src="data:image\/svg\+xml;charset=utf-8,%3Csvg%20xmlns/);
    assert.doesNotMatch(html, /<script/i, "the SVG source only appears URI-encoded");
    assert.match(html, /<footer>20 × 10 · viewBox 0 0 20 10 · NOTE<\/footer>/);
    const added = buildSvgDocument("<svg width=\"1\" height=\"1\"><rect/></svg>", { labels: SVG_LABELS });
    assert.match(added, /%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width/);
    assert.match(added, /NS ADDED/);
    const broken = buildSvgDocument("<svg xmlns=\"http://www.w3.org/2000/svg\">\n  <rect>\n</svg>", { labels: SVG_LABELS });
    assert.match(broken, /<strong>INVALID<\/strong> \(line 3, column 1\)<br>Unexpected &lt;\/svg&gt;; close &lt;rect&gt; \(opened on line 2\) first\.<pre>&lt;\/svg&gt;\n\^<\/pre>/);
    assert.match(buildSvgDocument("<html><body/></html>", { labels: SVG_LABELS }), /<strong>NOT SVG<\/strong>/);
});

test("SVG, Mermaid and LaTeX files preview themselves", () => {
    const svg = { name: "logo.svg", language: "svg", code: "<svg/>" };
    const mermaid = { name: "flow.mmd", language: "mermaid", code: "graph TD" };
    const latex = { name: "paper.tex", language: "latex", code: "$x$" };
    const html = { name: "index.html", language: "html", code: "<p>x</p>" };
    assert.equal(resolvePreviewTarget([html, svg, mermaid, latex], svg).kind, "svg");
    assert.equal(resolvePreviewTarget([html, svg, mermaid, latex], mermaid).kind, "mermaid");
    assert.equal(resolvePreviewTarget([html, svg, mermaid, latex], latex).kind, "latex");
    assert.equal(resolvePreviewTarget([html, svg, mermaid, latex], undefined).kind, "web", "a web page wins when nothing previewable is active");
    assert.equal(resolvePreviewTarget([svg, mermaid, latex], { name: "a.py", language: "python", code: "" }).kind, "latex");
    assert.equal(resolvePreviewTarget([svg, mermaid], undefined).kind, "mermaid");
    assert.equal(resolvePreviewTarget([svg], undefined).kind, "svg");
    assert.equal(isLivePreviewKind("mermaid"), true);
    assert.equal(isLivePreviewKind("latex"), true);
    assert.equal(isLivePreviewKind("svg"), false);
    assert.equal(isLivePreviewKind(null), false);
});

function liveBootstrapOf(html) {
    return /<script>(\(function\(\)\{var T=[\s\S]*?post\('ready'\)\}\)\(\);)<\/script><\/body><\/html>$/.exec(html)[1];
}

/** Runs a live frame's bootstrap with a fake DOM; returns what it posted and a way to send messages. */
function liveFrame(kind, library, mathNodes = []) {
    const html = buildLiveShell(kind, { token: "tok", library: "/* lib </script> */", css: "b{}</style>", labels: LIVE_LABELS });
    const posted = [];
    const listeners = {};
    const parent = { postMessage: (message) => posted.push(message) };
    const out = {
        html: "",
        children: [],
        set innerHTML(value) { this.html = value; this.children = []; },
        get innerHTML() { return this.html; },
        get textContent() { return this.html.replace(/<[^>]+>/g, "") + this.children.map((child) => child.textContent).join(""); },
        replaceChildren(...nodes) { this.html = ""; this.children = nodes; },
        appendChild(node) { this.children.push(node); },
        querySelector: () => mathNodes[0] ?? null,
        querySelectorAll: () => mathNodes,
    };
    const document = { getElementById: (id) => (id === "out" ? out : null), createElement: () => ({ className: "", textContent: "" }) };
    const context = vm.createContext({ window: { parent, addEventListener: (type, listener) => { listeners[type] = listener; } }, document, ...library });
    vm.runInContext(liveBootstrapOf(html), context);
    const send = (data, source = parent) => listeners.message({ source, data });
    return { html, posted, out, send };
}

test("live frames: strict policy, protected inline code and a ready handshake", () => {
    const frame = liveFrame("mermaid", { mermaid: { initialize() {}, render: () => Promise.resolve({ svg: "" }) } });
    assert.ok(frame.html.includes(`content="${LIVE_PREVIEW_CSP}"`));
    assert.match(LIVE_PREVIEW_CSP, /default-src 'none'/);
    assert.match(LIVE_PREVIEW_CSP, /connect-src 'none'/);
    assert.match(frame.html, /<script>\/\* lib <\\\/script> \*\/<\/script>/);
    assert.match(frame.html, /<style>b\{\}<\\\/style><\/style>/);
    assert.doesNotThrow(() => new vm.Script(liveBootstrapOf(frame.html)));
    assert.deepEqual(JSON.parse(JSON.stringify(frame.posted)), [{ source: "hanogt-preview", token: "tok", type: "ready" }]);
});

test("Mermaid frames render posted diagrams and report errors with the line", async () => {
    const calls = [];
    let config = null;
    const mermaid = {
        initialize: (value) => { config = value; },
        render: (id, code) => {
            calls.push(code);
            if (code.includes("eof")) return Promise.reject(new Error("Parse error on line 9:\n..."));
            return code.includes("oops") ? Promise.reject(new Error("Parse error on line 3:\n...")) : Promise.resolve({ svg: `<svg id="${id}"></svg>` });
        },
    };
    const frame = liveFrame("mermaid", { mermaid });
    assert.equal(config.securityLevel, "strict");
    assert.equal(config.startOnLoad, false);
    const render = (code, extra = {}) => frame.send({ source: PREVIEW_HOST_SOURCE, token: "tok", type: "render", payload: { kind: "mermaid", code }, ...extra });
    render("graph TD; A-->B");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(frame.out.innerHTML, "<svg id=\"hanogt-diagram-1\"></svg>");
    render("ignored", { token: "other" });
    render("ignored", { source: "someone-else" });
    frame.send({ source: PREVIEW_HOST_SOURCE, token: "tok", type: "render", payload: { kind: "mermaid", code: "ignored" } }, {});
    assert.deepEqual(calls, ["graph TD; A-->B"], "only the parent with the right token and source is obeyed");
    render("graph TD\n  A-->B\n  oops");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(frame.out.children[0].className, "hanogt-error");
    assert.match(frame.out.children[0].textContent, /^ERR \(line 3\)\n\nParse error on line 3:/);
    render("graph TD\n  eof");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.match(frame.out.children[0].textContent, /^ERR \(line 2\)/, "lines past the end of the file are clamped");
    render("   ");
    assert.equal(frame.out.children[0].className, "hanogt-empty");
    assert.equal(frame.out.children[0].textContent, "EMPTY");
});

test("LaTeX frames typeset every formula with KaTeX and mark the broken ones", () => {
    const node = (tex, display, line) => ({
        textContent: tex,
        className: "hanogt-math",
        title: "",
        getAttribute: (name) => (name === "data-display" ? (display ? "1" : "0") : name === "data-line" ? String(line) : null),
    });
    const nodes = [node("x^2", false, 2), node("\\frac{1}{\n}", true, 5)];
    const calls = [];
    const katex = {
        render: (tex, element, options) => {
            calls.push({ tex, displayMode: options.displayMode, macros: { ...options.macros }, trust: options.trust, throwOnError: options.throwOnError });
            if (tex.startsWith("\\frac")) throw Object.assign(new Error("KaTeX parse error: Expected '}'"), { position: 10 });
        },
    };
    const frame = liveFrame("latex", { katex }, nodes);
    frame.send({ source: PREVIEW_HOST_SOURCE, token: "tok", type: "render", payload: { kind: "latex", html: "<p>text</p>", macros: { "\\R": "\\mathbb{R}" }, warnings: ["\\foo"] } });
    assert.equal(frame.out.innerHTML, "<p>text</p>");
    assert.deepEqual(calls.map((call) => [call.tex, call.displayMode, call.trust, call.throwOnError]), [["x^2", false, false, true], ["\\frac{1}{\n}", true, false, true]]);
    assert.deepEqual(calls[0].macros, { "\\R": "\\mathbb{R}" });
    assert.equal(nodes[1].className, "hanogt-math math-error");
    assert.match(nodes[1].textContent, /⚠ Expected '}'$/);
    assert.equal(nodes[1].title, "ERR (line 6)", "the error line counts the formula's own line breaks");
    assert.equal(frame.out.children.at(-1).className, "hanogt-note");
    assert.equal(frame.out.children.at(-1).textContent, "UNSUPPORTED \\foo");
});

test("preview languages and the docs project are wired to the preview engine", () => {
    for (const id of ["svg", "mermaid", "latex"]) {
        const language = LANGUAGES.find((item) => item.id === id);
        assert.equal(language.engine, "preview", id);
        assert.ok(resolvePreviewTarget([{ name: language.defaultFileName, language: id, code: language.template }], undefined), id);
    }
    const docs = PROJECT_TEMPLATES.find((project) => project.id === "docs-project");
    assert.deepEqual(docs.files.map((file) => file.language).sort(), ["latex", "markdown", "mermaid"]);
    assert.equal(resolvePreviewTarget(docs.files, docs.files.find((file) => file.language === "mermaid")).kind, "mermaid");
});
