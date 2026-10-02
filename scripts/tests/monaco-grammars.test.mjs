// The custom Monarch grammars in src/lib/monaco.ts are compiled and run with
// Monaco's own Monarch compiler and tokenizer, so a broken rule fails here
// instead of breaking syntax highlighting in the editor. Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { compile } = await import("monaco-editor/editor/standalone/common/monarch/monarchCompile.js");
const { MonarchTokenizer } = await import("monaco-editor/editor/standalone/common/monarch/monarchLexer.js");
const { EXTRA_MONACO_LANGUAGES } = await load("lib/monaco.ts");
const { LANGUAGES } = await load("lib/runtimes/languages.ts");
const { FILE_TEMPLATES } = await load("lib/runtimes/templates.ts");

const noop = { dispose() {} };
const languageService = { languageIdCodec: { encodeLanguageId: () => 1 }, isRegisteredLanguageId: () => false, requestBasicLanguageFeatures() {}, getLanguageIdByLanguageName: () => null };
const themeService = { getColorTheme: () => ({ tokenTheme: { match: () => 0 } }), onDidColorThemeChange: () => noop };
const configurationService = { getValue: () => 20000, onDidChangeConfiguration: () => noop };

/** Tokenizes `source` line by line and returns the tokens of every line. */
function tokenize(definition, source) {
    const lexer = compile(definition.id, definition.tokens);
    const tokenizer = new MonarchTokenizer(languageService, themeService, definition.id, lexer, configurationService);
    let state = tokenizer.getInitialState();
    return source.split("\n").map((line) => {
        const result = tokenizer.tokenize(line, true, state);
        state = result.endState;
        return result.tokens.map((token) => ({ offset: token.offset, type: token.type.replace(new RegExp(`\\.${definition.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "") }));
    });
}

/** The token type that covers `column` (0-based) of a tokenized line. */
function tokenAt(tokens, column) {
    let found = tokens[0];
    for (const token of tokens) if (token.offset <= column) found = token;
    return found?.type;
}

const byId = new Map(EXTRA_MONACO_LANGUAGES.map((definition) => [definition.id, definition]));

test("every grammar compiles and tokenizes the templates of its languages", () => {
    assert.ok(EXTRA_MONACO_LANGUAGES.length >= 30);
    for (const definition of EXTRA_MONACO_LANGUAGES) {
        assert.doesNotThrow(() => compile(definition.id, definition.tokens), definition.id);
        const samples = [
            ...LANGUAGES.filter((language) => language.monaco === definition.id).map((language) => language.template),
            ...FILE_TEMPLATES.filter((template) => LANGUAGES.find((language) => language.id === template.language)?.monaco === definition.id).map((template) => template.code),
        ].filter(Boolean);
        for (const sample of samples) {
            const lines = tokenize(definition, sample);
            assert.ok(lines.length > 0, definition.id);
            // Something other than plain text must be recognised.
            assert.ok(lines.flat().some((token) => token.type !== "" && token.type !== "source"), `${definition.id} highlights nothing`);
        }
    }
});

test("every registry language uses a known grammar", () => {
    for (const language of LANGUAGES) {
        if (byId.has(language.monaco)) assert.equal(byId.get(language.monaco).id, language.monaco);
    }
});

test("grammars recognise the important constructs", () => {
    const at = (id, source, line, column) => tokenAt(tokenize(byId.get(id), source)[line], column);
    assert.equal(at("prolog", "grand(X, Y) :- parent(X, Z). % c", 0, 6), "variable");
    assert.equal(at("prolog", "grand(X, Y) :- parent(X, Z). % c", 0, 30), "comment");
    assert.equal(at("forth", ": square dup * ; \\ comment", 0, 2), "function");
    assert.equal(at("forth", ": square dup * ; \\ comment", 0, 20), "comment");
    assert.equal(at("forth", ".\" hi there\" cr", 0, 4), "string");
    assert.equal(at("basic", "10 PRINT \"Hi\": REM done", 0, 3), "keyword");
    assert.equal(at("basic", "10 PRINT \"Hi\": REM done", 0, 20), "comment");
    assert.equal(at("basic", "x$ = LEFT$(a$, 2)", 0, 6), "predefined");
    assert.equal(at("befunge", "55+\"olleh\">:#,_@", 0, 5), "string");
    assert.equal(at("latex", "Text $x^2$ \\section{A}", 0, 6), "string");
    assert.equal(at("latex", "Text $x^2$ \\section{A}", 0, 12), "keyword.flow");
    assert.equal(at("toml", "[server]\nport = 8080 # c", 0, 1), "type");
    assert.equal(at("toml", "[server]\nport = 8080 # c", 1, 0), "key");
    assert.equal(at("toml", "[server]\nport = 8080 # c", 1, 8), "number");
    assert.equal(at("dotenv", "export API_KEY=\"x${HOME}\" # c", 0, 7), "key");
    assert.equal(at("dotenv", "export API_KEY=\"x${HOME}\" # c", 0, 19), "variable");
    const csv = tokenize(byId.get("csv"), "a,b,c\nx,y,z");
    assert.equal(tokenAt(csv[0], 0), tokenAt(csv[1], 0), "every line starts with the first column colour");
    assert.notEqual(tokenAt(csv[0], 0), tokenAt(csv[0], 2));
    assert.equal(at("makefile", "hello: main.c\n\t$(CC) -o $@ $<", 0, 0), "type");
    assert.equal(at("makefile", "hello: main.c\n\t$(CC) -o $@ $<", 1, 2), "variable");
    assert.equal(at("cmake", "add_executable(hello main.cpp) # c", 0, 0), "keyword");
    assert.equal(at("nginx", "server {\n    listen 80;\n}", 1, 5), "predefined");
    assert.equal(at("nginx", "server {\n    listen 80;\n}", 0, 0), "keyword");
    assert.equal(at("nasm", "_start: mov rax, 1 ; exit", 0, 9), "keyword.flow");
    assert.equal(at("nasm", "_start: mov rax, 1 ; exit", 0, 13), "variable.predefined");
    assert.equal(at("fortran", "PROGRAM hello ! comment", 0, 0), "keyword");
    assert.equal(at("cobol", "       DISPLAY \"Hi\".", 0, 8), "keyword");
    assert.equal(at("ada", "procedure Hello is -- c", 0, 0), "keyword");
    assert.equal(at("vhdl", "signal clk : std_logic := '0';", 0, 14), "type");
    assert.equal(at("mermaid", "flowchart LR\n  A --> B", 1, 4), "operator");
    assert.equal(at("prisma", "model User {\n  id Int @id\n}", 1, 9), "annotation");
    assert.equal(at("elm", "main = text \"hi\" -- c", 0, 13), "string");
    assert.equal(at("vlang", "println('hi')", 0, 9), "string");
});
