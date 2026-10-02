// LaTeX → HTML for the KaTeX preview. Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { renderLatex, escapeHtml } = await load("lib/runtimes/latex.ts");
const { LANGUAGES } = await load("lib/runtimes/languages.ts");
const { FILE_TEMPLATES, PROJECT_TEMPLATES } = await load("lib/runtimes/templates.ts");

test("bare formulas become one display formula per paragraph", () => {
    const result = renderLatex("E = mc^2\n\n\\frac{a}{b} + \\sum_{i=1}^n i");
    assert.equal(result.formulas, 2);
    assert.equal(result.html, "<div class=\"math-block\"><span class=\"hanogt-math\" data-display=\"1\" data-line=\"1\">E = mc^2</span></div>\n<div class=\"math-block\"><span class=\"hanogt-math\" data-display=\"1\" data-line=\"3\">\\frac{a}{b} + \\sum_{i=1}^n i</span></div>");
    assert.equal(renderLatex("Just some text without math.").html, "<p>Just some text without math.</p>");
});

test("inline and display math keep their source line for error messages", () => {
    const result = renderLatex("a \\(x\\) b\n\\[y\\] c $$z$$ d \\$5 e\n\n$w$");
    assert.equal(result.formulas, 4);
    assert.match(result.html, /<span class="hanogt-math" data-display="0" data-line="1">x<\/span>/);
    assert.match(result.html, /<div class="math-block"><span class="hanogt-math" data-display="1" data-line="2">y<\/span><\/div>/);
    assert.match(result.html, /d \$5 e/, "\\$ is a dollar sign");
    assert.match(result.html, /data-line="4">w</);
});

test("documents: title block, numbered sections, contents, lists, footnotes", () => {
    const source = "\\documentclass{article}\n\\title{Demo}\n\\author{Ada \\and Linus}\n\\date{\\today}\n\\newcommand{\\R}{\\mathbb{R}}\n\\DeclareMathOperator{\\sgn}{sgn}\n\\begin{document}\n\\maketitle\n\\tableofcontents\n\\section{One}\nText.\\footnote{Note.}\n\\subsection{Sub}\n\\begin{itemize}\\item a\\item b\\end{itemize}\n\\begin{enumerate}\\item x\\end{enumerate}\n\\begin{description}\\item[Key] value\\end{description}\n\\section*{Unnumbered}\n\\end{document}";
    const result = renderLatex(source, { today: new Date(2026, 9, 2) });
    assert.equal(result.title, "Demo");
    assert.deepEqual(result.macros, { "\\R": "\\mathbb{R}", "\\sgn": "\\operatorname{sgn}" });
    assert.match(result.html, /^<header class="title-block"><h1 class="title">Demo<\/h1><p class="author">Ada, Linus<\/p><p class="date">October 2, 2026<\/p><\/header>/);
    assert.match(result.html, /<nav class="toc"><h2>Contents<\/h2><ul><li class="toc-2"><a href="#sec-1">1 One<\/a><\/li><li class="toc-3"><a href="#sec-2">1\.1 Sub<\/a><\/li>/);
    assert.match(result.html, /<h1 id="sec-1"><span class="secnum">1<\/span> One<\/h1>/);
    assert.match(result.html, /<ul><li>a<\/li><li>b<\/li><\/ul>\n<ol><li>x<\/li><\/ol>\n<dl><dt>Key<\/dt><dd>value<\/dd><\/dl>/);
    assert.match(result.html, /<ol class="footnotes"><li id="fn-1">Note\. <a href="#fnref-1">↩<\/a><\/li><\/ol>$/);
    assert.doesNotMatch(result.html, /secnum">2/, "starred sections are not numbered");
});

test("Turkish labels and dates", () => {
    const result = renderLatex("\\title{T}\\date{\\today}\\begin{document}\\maketitle\\section{Giriş}\\begin{theorem}x\\end{theorem}\\begin{proof}y\\end{proof}\\end{document}", { locale: "tr", today: new Date(2026, 9, 2) });
    assert.match(result.html, /<p class="date">2 Ekim 2026<\/p>/);
    assert.match(result.html, /<strong>Teorem 1\.<\/strong>/);
    assert.match(result.html, /<em>Kanıt\.<\/em>/);
});

test("text is escaped and links are never clickable", () => {
    const result = renderLatex("Text <img src=x onerror=alert(1)> & \"q\"\n\n\\href{javascript:alert(1)}{click}\n\n\\includegraphics{http://example.com/x.png}\n\n$<script>$\n\n\\begin{verbatim}\n<b>&</b>\n\\end{verbatim}");
    assert.doesNotMatch(result.html, /<img|<script|<a /);
    assert.match(result.html, /Text &lt;img src=x onerror=alert\(1\)&gt; &amp; &quot;q&quot;/);
    assert.match(result.html, /<span class="link" title="javascript:alert\(1\)">click<\/span>/);
    assert.match(result.html, /class="image-placeholder"/);
    assert.match(result.html, /<pre><code>&lt;b&gt;&amp;&lt;\/b&gt;<\/code><\/pre>/);
    assert.equal(escapeHtml("<a href=\"x\">&</a>"), "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
});

test("unsupported commands keep their text and are reported", () => {
    const result = renderLatex("\\begin{document}\nkept \\unknowncmd{arg}\n\\begin{weirdenv}inside\\end{weirdenv}\n50\\% done % a comment\n\\end{document}");
    assert.deepEqual(result.warnings, ["\\unknowncmd", "\\begin{weirdenv}"]);
    assert.match(result.html, /kept arg/);
    assert.match(result.html, /inside/);
    assert.match(result.html, /50% done/);
    assert.doesNotMatch(result.html, /a comment/);
});

test("every LaTeX template renders without warnings", () => {
    const samples = [
        { id: "hello", code: LANGUAGES.find((language) => language.id === "latex").template },
        ...FILE_TEMPLATES.filter((template) => template.language === "latex"),
        ...PROJECT_TEMPLATES.flatMap((project) => project.files.filter((file) => file.language === "latex").map((file) => ({ id: `${project.id}/${file.name}`, code: file.code }))),
    ];
    assert.ok(samples.length >= 3);
    for (const sample of samples) {
        const result = renderLatex(sample.code);
        assert.deepEqual(result.warnings, [], sample.id);
        assert.ok(result.formulas > 0, sample.id);
    }
});
