// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { renderMarkdown, sanitizeUrl } = await load("lib/runtimes/markdown.ts");

test("raw HTML and dangerous URLs never become markup", () => {
    const html = renderMarkdown([
        "<script>alert(1)</script>",
        "<img src=x onerror=alert(1)>",
        "[a](javascript:alert(1)) [b](JAVASCRIPT:alert(1)) [c]( data:text/html,<b>x</b> ) [d](vbscript:x)",
        "![e](javascript:alert(1)) ![f](data:image/svg+xml;base64,PHN2Zz4=)",
        "<a href=\"javascript:alert(1)\">x</a>",
        "[g](https://ok.example \"t\\\" onmouseover=\\\"x\")",
    ].join("\n\n"));
    // Only real tags matter: escaped text such as "&lt;img onerror=…&gt;" is harmless.
    const tags = html.match(/<[a-z][^>]*>/gi) ?? [];
    for (const tag of tags) {
        assert.doesNotMatch(tag, /^<(?:script|iframe|object|embed|style|svg|math)/i, tag);
        assert.doesNotMatch(tag, /\son[a-z]+\s*=/i, tag);
        assert.doesNotMatch(tag, /(?:javascript|vbscript|data:text|data:image\/svg)/i, tag);
    }
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /<p>a b c d<\/p>/);
    assert.equal(sanitizeUrl("java\nscript:alert(1)", "link"), null);
    assert.equal(sanitizeUrl("https://a.b/c", "link"), "https://a.b/c");
    assert.equal(sanitizeUrl("img.png", "image"), null);
    assert.equal(sanitizeUrl("#top", "link"), "#top");
});

test("attribute-free formatting tags are kept", () => {
    assert.equal(renderMarkdown("<kbd>Ctrl</kbd> <sub>2</sub> <br>"), "<p><kbd>ctrl</kbd> <sub>2</sub> <br></p>".replace("ctrl", "Ctrl"));
    assert.doesNotMatch(renderMarkdown("<kbd onclick=x>a</kbd>"), /<kbd onclick/);
});

test("headings get unique ids", () => {
    assert.equal(renderMarkdown("# Title\n# Title\n## Başlık Türkçe"), '<h1 id="title">Title</h1>\n<h1 id="title-1">Title</h1>\n<h2 id="başlık-türkçe">Başlık Türkçe</h2>');
    assert.equal(renderMarkdown("Setext\n===", { headingIds: false }), "<h1>Setext</h1>");
});

test("inline formatting, links and code", () => {
    assert.equal(renderMarkdown("a **b** *c* _d_ __e__ ~~f~~ `g <b>` snake_case_word"), "<p>a <strong>b</strong> <em>c</em> <em>d</em> <strong>e</strong> <del>f</del> <code>g &lt;b&gt;</code> snake_case_word</p>");
    assert.equal(renderMarkdown("[x](https://a.com?q=1&r=2 \"T\")"), '<p><a href="https://a.com?q=1&amp;r=2" title="T" target="_blank" rel="noopener noreferrer">x</a></p>');
    assert.equal(renderMarkdown("Visit https://example.com/path."), '<p>Visit <a href="https://example.com/path" target="_blank" rel="noopener noreferrer">https://example.com/path</a>.</p>');
    assert.equal(renderMarkdown("[ref][r]\n\n[r]: https://ref.example"), '<p><a href="https://ref.example" target="_blank" rel="noopener noreferrer">ref</a></p>');
    assert.equal(renderMarkdown("[local](docs/a.md) [top](#top)"), '<p><a class="relative-link" title="docs/a.md">local</a> <a href="#top">top</a></p>');
    assert.equal(renderMarkdown("line  \nnext"), "<p>line<br>\nnext</p>");
    assert.equal(renderMarkdown("&copy; & 1 < 2"), "<p>&copy; &amp; 1 &lt; 2</p>");
});

test("blocks: lists, task lists, quotes, code and tables", () => {
    assert.equal(renderMarkdown("1. one\n2. two\n   - nested\n3. three"), "<ol>\n<li>one</li>\n<li>two\n<ul>\n<li>nested</li>\n</ul></li>\n<li>three</li>\n</ol>");
    assert.equal(renderMarkdown("3. three\n4. four"), '<ol start="3">\n<li>three</li>\n<li>four</li>\n</ol>');
    assert.equal(renderMarkdown("- [x] done\n- [ ] todo"), '<ul class="contains-task-list">\n<li class="task-list-item"><input type="checkbox" disabled checked> done</li>\n<li class="task-list-item"><input type="checkbox" disabled> todo</li>\n</ul>');
    assert.equal(renderMarkdown("- a\n\n- b"), "<ul>\n<li><p>a</p></li>\n<li><p>b</p></li>\n</ul>");
    assert.equal(renderMarkdown("> quote\n> > nested"), "<blockquote>\n<p>quote</p>\n<blockquote>\n<p>nested</p>\n</blockquote>\n</blockquote>");
    assert.equal(renderMarkdown("```js\nconst a = '<b>';\n```"), '<pre><code class="language-js">const a = &#39;&lt;b&gt;&#39;;\n</code></pre>');
    assert.equal(renderMarkdown("    indented\n    code"), "<pre><code>indented\ncode\n</code></pre>");
    assert.equal(renderMarkdown("| a | b |\n|:-:|--:|\n| `x|y` | 2 |"), '<table><thead><tr><th class="align-center">a</th><th class="align-right">b</th></tr></thead><tbody><tr><td class="align-center"><code>x|y</code></td><td class="align-right">2</td></tr></tbody></table>');
    assert.equal(renderMarkdown("***"), "<hr>");
});
