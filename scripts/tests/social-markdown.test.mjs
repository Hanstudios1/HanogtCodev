// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { parseChatMarkdown, parseInline, hasMarkdown, markdownToPlain, MARKDOWN_MAX_LENGTH } = await load("lib/social/markdown.ts");

const text = (value) => ({ type: "text", text: value });

test("inline markers become nodes, never markup", () => {
    assert.deepEqual(parseInline("**kalın** ve *eğik*"), [
        { type: "bold", children: [text("kalın")] },
        text(" ve "),
        { type: "italic", children: [text("eğik")] },
    ]);
    assert.deepEqual(parseInline("__alt__ ~~üstü çizili~~ ||sürpriz|| `kod`"), [
        { type: "underline", children: [text("alt")] },
        text(" "),
        { type: "strike", children: [text("üstü çizili")] },
        text(" "),
        { type: "spoiler", children: [text("sürpriz")] },
        text(" "),
        { type: "code", text: "kod" },
    ]);
    // HTML stays text.
    assert.deepEqual(parseInline("<img src=x onerror=alert(1)>"), [text("<img src=x onerror=alert(1)>")]);
});

test("nesting, bold italic and escapes", () => {
    assert.deepEqual(parseInline("**kalın *ve eğik***"), [
        { type: "bold", children: [text("kalın "), { type: "italic", children: [text("ve eğik")] }] },
    ]);
    assert.deepEqual(parseInline("***ikisi***"), [{ type: "bold", children: [{ type: "italic", children: [text("ikisi")] }] }]);
    assert.deepEqual(parseInline("\\*yıldız\\*"), [text("*yıldız*")]);
    assert.deepEqual(parseInline("`**kod içinde**`"), [{ type: "code", text: "**kod içinde**" }]);
});

test("loose markers, snake_case and links stay as they are", () => {
    assert.deepEqual(parseInline("2 * 3 * 4"), [text("2 * 3 * 4")]);
    assert.deepEqual(parseInline("my_var_name ve file_name.py"), [text("my_var_name ve file_name.py")]);
    assert.deepEqual(parseInline("bak https://example.com/a_b_c*d*e"), [text("bak https://example.com/a_b_c*d*e")]);
    assert.deepEqual(parseInline("**kapanmamış"), [text("**kapanmamış")]);
    assert.deepEqual(parseInline("* liste değil*"), [text("* liste değil*")]);
});

test("code blocks keep their content and language", () => {
    const blocks = parseChatMarkdown("Şuna bak:\n```js\nconst a = **1**;\n<b>x</b>\n```\nbitti");
    assert.deepEqual(blocks, [
        { type: "paragraph", children: [text("Şuna bak:")] },
        { type: "code", lang: "js", text: "const a = **1**;\n<b>x</b>" },
        { type: "paragraph", children: [text("bitti")] },
    ]);
    assert.deepEqual(parseChatMarkdown("```tek satır```"), [{ type: "code", lang: "", text: "tek satır" }]);
    // An unclosed fence is plain text.
    assert.equal(parseChatMarkdown("```js\nkapanmadı")[0].type, "paragraph");
});

test("quotes, headings and lists", () => {
    assert.deepEqual(parseChatMarkdown("> alıntı\n> **ikinci**\nnormal"), [
        { type: "quote", children: [{ type: "paragraph", children: [text("alıntı\n"), { type: "bold", children: [text("ikinci")] }] }] },
        { type: "paragraph", children: [text("normal")] },
    ]);
    const rest = parseChatMarkdown("önce\n>>> hepsi\nalıntı");
    assert.equal(rest[1].type, "quote");
    assert.deepEqual(rest[1].children, [{ type: "paragraph", children: [text("hepsi\nalıntı")] }]);
    assert.deepEqual(parseChatMarkdown("# Başlık"), [{ type: "heading", level: 1, children: [text("Başlık")] }]);
    // A #topic is not a heading.
    assert.deepEqual(parseChatMarkdown("#genel merhaba"), [{ type: "paragraph", children: [text("#genel merhaba")] }]);
    assert.deepEqual(parseChatMarkdown("- bir\n- *iki*"), [{ type: "list", ordered: false, start: 1, items: [[text("bir")], [{ type: "italic", children: [text("iki")] }]] }]);
    assert.deepEqual(parseChatMarkdown("3. üç\n4. dört"), [{ type: "list", ordered: true, start: 3, items: [[text("üç")], [text("dört")]] }]);
});

test("blank lines stay inside a paragraph; long texts aren't parsed", () => {
    assert.deepEqual(parseChatMarkdown("a\n\nb"), [{ type: "paragraph", children: [text("a\n\nb")] }]);
    assert.deepEqual(parseChatMarkdown("   "), []);
    const long = "**".repeat(MARKDOWN_MAX_LENGTH);
    assert.deepEqual(parseChatMarkdown(long), [{ type: "paragraph", children: [text(long)] }]);
});

test("adversarial input stays fast", () => {
    const started = performance.now();
    parseChatMarkdown("*a ".repeat(1300));
    parseChatMarkdown("_".repeat(4000));
    parseChatMarkdown("**a ".repeat(1000));
    parseChatMarkdown("||".repeat(2000));
    assert.ok(performance.now() - started < 1500, `took ${performance.now() - started} ms`);
});

test("plain text and the markdown check", () => {
    assert.equal(markdownToPlain("**kalın** ||gizli|| `kod`"), "kalın ▒▒▒ kod");
    assert.equal(markdownToPlain("- a\n- b"), "• a\n• b");
    assert.equal(hasMarkdown("düz bir mesaj"), false);
    assert.equal(hasMarkdown("**kalın**"), true);
    assert.equal(hasMarkdown("> alıntı"), true);
});
