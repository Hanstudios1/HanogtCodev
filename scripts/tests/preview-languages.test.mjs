// SVG, Mermaid, LaTeX, Graphviz DOT, ABC, AsciiDoc, GLSL and Logo previews: documents,
// frame policy and the postMessage contract. Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { load } from "./setup.mjs";

const { buildSvgDocument, buildLiveShell, isLivePreviewKind, resolvePreviewTarget, strictPreviewCsp, LIVE_PREVIEW_CSP, STATIC_PREVIEW_CSP, PREVIEW_HOST_SOURCE } = await load("lib/runtimes/web-preview.ts");
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
    for (const id of ["svg", "mermaid", "latex", "dot", "abc", "asciidoc", "glsl", "logo"]) {
        const language = LANGUAGES.find((item) => item.id === id);
        assert.equal(language.engine, "preview", id);
        assert.ok(resolvePreviewTarget([{ name: language.defaultFileName, language: id, code: language.template }], undefined), id);
    }
    const docs = PROJECT_TEMPLATES.find((project) => project.id === "docs-project");
    assert.deepEqual(docs.files.map((file) => file.language).sort(), ["latex", "markdown", "mermaid"]);
    assert.equal(resolvePreviewTarget(docs.files, docs.files.find((file) => file.language === "mermaid")).kind, "mermaid");
});

// ------------------------------------------------------------------ Graphviz DOT, ABC, AsciiDoc, GLSL, Logo
test("Graphviz, ABC, AsciiDoc, GLSL and Logo files preview themselves", () => {
    const html = { name: "index.html", language: "html", code: "<p>x</p>" };
    const files = ["dot", "abc", "asciidoc", "glsl", "logo"].map((language) => ({ name: `f.${language}`, language, code: "x" }));
    for (const file of files) assert.equal(resolvePreviewTarget([html, ...files], file).kind, file.language);
    assert.equal(resolvePreviewTarget([html, ...files], undefined).kind, "web");
    assert.equal(resolvePreviewTarget(files, undefined).kind, "asciidoc", "documents come first when nothing previewable is active");
    assert.equal(resolvePreviewTarget(files.filter((file) => file.language !== "asciidoc"), undefined).kind, "dot");
    for (const kind of ["dot", "abc", "asciidoc", "glsl"]) assert.equal(isLivePreviewKind(kind), true, kind);
    assert.equal(isLivePreviewKind("logo"), false, "Logo is drawn in the page and shown as a static document");
});

const STRICT_LABELS = { error: "ERR", line: "line {line}", empty: "EMPTY", unsupported: "U {list}", warnings: "WARNINGS", pause: "PAUSE", play: "PLAY", noWebgl: "NO WEBGL" };

function strictBootstrapOf(html) {
    return /<script nonce="[^"]+">(\(function\(\)\{var T=[\s\S]*?post\('ready'\)\}\)\(\);)<\/script><\/body><\/html>$/.exec(html)[1];
}

test("the newer live frames run only scripts that carry their nonce", () => {
    for (const kind of ["dot", "abc", "asciidoc", "glsl"]) {
        const html = buildLiveShell(kind, { token: "tok", nonce: "n0nce", library: kind === "glsl" ? "" : "/* lib </script> */", labels: STRICT_LABELS });
        const policy = strictPreviewCsp(kind, "n0nce");
        assert.ok(html.includes(`content="${policy}"`), kind);
        assert.match(policy, /default-src 'none'/);
        assert.match(policy, /script-src 'nonce-n0nce'(?: 'unsafe-eval')?;/, "no 'unsafe-inline': inline handlers and javascript: links can't run");
        assert.match(policy, /connect-src 'none'/);
        assert.equal(policy.includes("'unsafe-eval'"), kind === "dot", "only Graphviz compiles WebAssembly");
        assert.equal(/img-src[^;]*https:/.test(policy), kind === "asciidoc", "only AsciiDoc documents show images over https");
        if (kind !== "glsl") assert.match(html, /<script nonce="n0nce">\/\* lib <\\\/script> \*\/<\/script>/);
        else assert.doesNotMatch(html, /\/\* lib/);
        assert.equal((html.match(/<script(?: [^>]*)?>/g) ?? []).every((tag) => tag === "<script nonce=\"n0nce\">"), true, kind);
        assert.doesNotThrow(() => new vm.Script(strictBootstrapOf(html)), kind);
    }
    const first = buildLiveShell("dot", { token: "t", library: "", labels: STRICT_LABELS });
    const second = buildLiveShell("dot", { token: "t", library: "", labels: STRICT_LABELS });
    assert.notEqual(/nonce="([^"]+)"/.exec(first)[1], /nonce="([^"]+)"/.exec(second)[1], "a fresh nonce for every frame");
});

/** A tiny DOM: enough for the bootstraps, which build their own elements. */
function fakeDocument() {
    const element = (tag) => {
        const node = {
            tagName: tag.toUpperCase(), className: "", textContent: "", children: [], attributes: {}, style: {},
            appendChild(child) { this.children.push(child); return child; },
            replaceChildren(...nodes) { this.children = nodes; },
            setAttribute(name, value) { this.attributes[name] = String(value); },
            getAttribute(name) { return this.attributes[name] ?? null; },
            addEventListener() {},
        };
        if (tag === "template") {
            node.content = { html: "", querySelectorAll: () => [] };
            Object.defineProperty(node, "innerHTML", { set(value) { node.content.html = value; } });
        }
        if (tag === "canvas") node.getContext = () => null;
        return node;
    };
    const out = element("main");
    return { out, document: { getElementById: (id) => (id === "out" ? out : null), createElement: element, body: element("body"), addEventListener() {} } };
}

/** Runs a strict frame's bootstrap with `globals` (fake libraries); returns what it posted and a way to render. */
function strictFrame(kind, globals = {}) {
    const html = buildLiveShell(kind, { token: "tok", nonce: "n", library: "", labels: STRICT_LABELS });
    const posted = [];
    const listeners = {};
    const parent = { postMessage: (message) => posted.push(message) };
    const { out, document } = fakeDocument();
    const window = { parent, addEventListener: (type, listener) => { listeners[type] = listener; } };
    vm.runInContext(strictBootstrapOf(html), vm.createContext({ window, document, ...globals }));
    const render = (code, extra = {}) => listeners.message({ source: parent, data: { source: PREVIEW_HOST_SOURCE, token: "tok", type: "render", payload: { kind, code }, ...extra } });
    return { posted, out, render };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("DOT frames pick the layout engine, draw the SVG and report syntax errors with their line", async () => {
    const calls = [];
    const graphviz = {
        layout(code, format, engine) {
            calls.push([format, engine]);
            if (code.includes("broken")) throw new Error("syntax error in line 2 near '->'");
            return "<?xml version=\"1.0\"?>\n<!DOCTYPE svg>\n<svg><g/></svg>";
        },
    };
    const frame = strictFrame("dot", { HanogtGraphviz: { Graphviz: { load: () => Promise.resolve(graphviz) } } });
    assert.deepEqual(JSON.parse(JSON.stringify(frame.posted)), [{ source: "hanogt-preview", token: "tok", type: "ready" }]);
    frame.render("digraph { a -> b }");
    await settle();
    assert.equal(frame.out.children[0].className, "paper");
    assert.equal(frame.out.children[0].children[0].html, "<svg><g/></svg>", "the XML prologue is dropped");
    frame.render("graph { layout=neato; a -- b }");
    await settle();
    assert.deepEqual(calls, [["svg", "dot"], ["svg", "neato"]]);
    frame.render("digraph {\n  broken -> -> x\n}");
    await settle();
    assert.equal(frame.out.children[0].className, "hanogt-error");
    assert.equal(frame.out.children[0].textContent, "ERR (line 2)\n\nsyntax error in line 2 near '->'");
    frame.render("  ");
    assert.equal(frame.out.children[0].textContent, "EMPTY");
    frame.render("digraph { x }", { token: "other" });
    await settle();
    assert.equal(calls.length, 3, "messages with another token are ignored");
});

test("ABC frames give every tune its own sheet and list the parser's warnings", () => {
    const rendered = [];
    const ABCJS = {
        numberOfTunes: (code) => (code.match(/^X:/gm) ?? []).length,
        renderAbc: (targets, code, options) => {
            rendered.push({ count: targets.length, options });
            return targets.map((_, index) => ({ warnings: index === 0 ? ["Music Line:4:4: Unknown character ignored: <span>@</span>"] : [] }));
        },
    };
    class DOMParser {
        parseFromString(html) { return { body: { textContent: html.replace(/<[^>]+>/g, "") } }; }
    }
    const frame = strictFrame("abc", { ABCJS, DOMParser });
    frame.render("X:1\nK:C\nCD @ EF|\nX:2\nK:G\nGABc|");
    assert.equal(rendered[0].count, 2);
    assert.equal(rendered[0].options.responsive, "resize");
    assert.deepEqual(frame.out.children.map((child) => child.className), ["paper", "paper", "hanogt-note"]);
    assert.equal(frame.out.children[2].textContent, "WARNINGS\nMusic Line:4:4: Unknown character ignored: @");
});

test("AsciiDoc frames convert in secure mode and list the log with line numbers", async () => {
    const options = [];
    let messages = [];
    const logger = { clear: () => { messages = []; }, getMessages: () => messages };
    const HanogtAsciidoctor = {
        MemoryLogger: { create: () => logger },
        LoggerManager: { setLogger: (value) => assert.equal(value, logger) },
        convert: (code, settings) => {
            options.push(settings);
            messages.push({ getSourceLocation: () => ({ getLineNumber: () => 3 }), getText: () => "section title out of sequence" });
            return Promise.resolve("<h1>Title</h1>");
        },
    };
    const frame = strictFrame("asciidoc", { HanogtAsciidoctor });
    frame.render("= Title\n\n=== Skipped");
    await settle();
    assert.equal(options[0].safe, "secure", "include:: and other file access stay off");
    assert.equal(frame.out.children[0].html, "<h1>Title</h1>");
    assert.equal(frame.out.children[1].textContent, "WARNINGS\nline 3: section title out of sequence");
});

test("GLSL frames say so when WebGL is missing", () => {
    const frame = strictFrame("glsl", {});
    frame.render("void mainImage(out vec4 c, in vec2 p) { c = vec4(1.0); }");
    assert.equal(frame.out.children[0].className, "hanogt-error");
    assert.equal(frame.out.children[0].textContent, "NO WEBGL");
});
