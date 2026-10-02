// Registry consistency: every language the editor offers must be complete,
// unambiguous and wired to a runtime. Run: node --test scripts/tests/
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ROOT, load } from "./setup.mjs";

const registry = await load("lib/runtimes/languages.ts");
const { LANGUAGES, normalizeLanguageId, languageFromFileName, ensureFileExtension, resolveLanguage, BROWSER_LANGUAGES, RUNNABLE_LANGUAGES, SERVER_LANGUAGE_IDS, LANGUAGE_CATEGORIES, ENGINE_LABELS, isProgramLanguage, fileExtensionFor } = registry;
const { FILE_TEMPLATES, PROJECT_TEMPLATES } = await load("lib/runtimes/templates.ts");
const root = fileURLToPath(ROOT);
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

/** Monaco's own language ids (from the installed package) plus the ones src/lib/monaco.ts registers. */
function monacoLanguageIds() {
    const definitions = path.join(root, "node_modules/monaco-editor/esm/vs/languages/definitions");
    const ids = new Set(["plaintext"]);
    for (const folder of fs.readdirSync(definitions)) {
        const file = path.join(definitions, folder, "register.js");
        if (!fs.existsSync(file)) continue;
        for (const match of fs.readFileSync(file, "utf8").matchAll(/id:\s*["']([^"']+)["']/g)) ids.add(match[1]);
    }
    for (const builtin of ["json", "css", "scss", "less", "html", "typescript", "javascript"]) ids.add(builtin);
    const extra = read("src/lib/monaco.ts").split("const EXTRA_LANGUAGES")[1] ?? "";
    for (const match of extra.matchAll(/\bid:\s*"([^"]+)"/g)) ids.add(match[1]);
    return ids;
}

test("ids are unique, short and lower case", () => {
    const ids = LANGUAGES.map((language) => language.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) {
        assert.match(id, /^[a-z][a-z0-9+#.-]*$/, id);
        assert.ok(id.length <= 30, `${id} must fit the 30-character Firestore rule`);
    }
});

test("every language is complete", () => {
    const categories = new Set(LANGUAGE_CATEGORIES.map((category) => category.id));
    const monaco = monacoLanguageIds();
    for (const language of LANGUAGES) {
        assert.ok(language.name, language.id);
        assert.ok(categories.has(language.category), `${language.id} category`);
        assert.ok(ENGINE_LABELS[language.engine], `${language.id} engine`);
        assert.ok(monaco.has(language.monaco), `${language.id} uses unknown Monaco language "${language.monaco}"`);
        assert.match(language.color, /^#[0-9A-F]{6}$/i, `${language.id} color`);
        assert.ok(fs.existsSync(path.join(root, "public", language.icon)), `${language.id} icon ${language.icon} is missing`);
        assert.ok(language.extensions.length || language.fileNames?.length, `${language.id} extensions`);
        for (const extension of language.extensions) assert.match(extension, /^[a-z0-9+#_-]+$/, `${language.id} extension ${extension}`);
        if (language.engine !== "none") assert.ok(language.template.trim(), `${language.id} template`);
        assert.equal(languageFromFileName(language.defaultFileName)?.id, language.id, `${language.id} default file name ${language.defaultFileName}`);
    }
});

test("extensions and aliases are unambiguous", () => {
    const owners = new Map();
    for (const language of LANGUAGES) {
        for (const extension of language.extensions) {
            assert.ok(!owners.has(extension), `.${extension} is claimed by ${owners.get(extension)} and ${language.id}`);
            owners.set(extension, language.id);
        }
    }
    for (const language of LANGUAGES) {
        assert.equal(normalizeLanguageId(language.id), language.id);
        assert.equal(normalizeLanguageId(language.name), language.id, `name ${language.name}`);
        for (const alias of language.aliases ?? []) assert.equal(normalizeLanguageId(alias), language.id, `alias ${alias}`);
        for (const extension of language.extensions) assert.equal(normalizeLanguageId(`.${extension}`), language.id, `.${extension}`);
    }
});

test("runtimes exist for every runnable language", () => {
    const worker = read("src/lib/runtimes/worker.ts");
    for (const id of BROWSER_LANGUAGES) assert.match(worker, new RegExp(`case "${id}":`), `the worker has no runner for ${id}`);
    for (const language of LANGUAGES.filter((item) => item.engine === "server")) {
        assert.ok(language.server, `${language.id} must be accepted by /api/execute`);
        assert.ok(language.wandbox || language.id === "kotlin", `${language.id} has no Wandbox mapping`);
    }
    for (const id of SERVER_LANGUAGE_IDS) assert.ok(RUNNABLE_LANGUAGES.includes(id), `${id} is accepted by the server but not runnable`);
    assert.ok(!SERVER_LANGUAGE_IDS.includes("brainfuck") && !SERVER_LANGUAGE_IDS.includes("scheme"), "browser-only languages must not reach the server");
    assert.equal(isProgramLanguage("json"), false, "validators do not join Run all");
    assert.equal(isProgramLanguage("python"), true);
});

test("legacy values and file names resolve", () => {
    const cases = { "C++": "cpp", "CSharp": "csharp", "Javascript": "javascript", "py": "python", "golang": "go", "sh": "bash", "SQLITE3": "sql", "f#": "fsharp", "kt": "kotlin", "md": "markdown", "yml": "yaml" };
    for (const [input, expected] of Object.entries(cases)) assert.equal(normalizeLanguageId(input), expected, input);
    assert.equal(normalizeLanguageId("multi"), null);
    assert.equal(normalizeLanguageId(""), null);
    assert.equal(resolveLanguage("nonsense").id, "plaintext");
    assert.equal(languageFromFileName("Dockerfile")?.id, "dockerfile");
    assert.equal(languageFromFileName("src/App.TSX")?.id, "typescript");
    assert.equal(languageFromFileName(".vimrc")?.id, "vim");
    // The editor names copies of special files "Makefile-2", ".env-2", "CMakeLists-2.txt"; they keep their language.
    assert.equal(languageFromFileName("Makefile-2")?.id, languageFromFileName("Makefile")?.id);
    assert.equal(languageFromFileName(".env-2")?.id, languageFromFileName(".env")?.id);
    assert.equal(languageFromFileName(".env-3.local")?.id, languageFromFileName(".env.local")?.id);
    assert.equal(languageFromFileName("CMakeLists-2.txt")?.id, languageFromFileName("CMakeLists.txt")?.id);
    assert.equal(languageFromFileName("Dockerfile-12")?.id, "dockerfile");
    assert.equal(languageFromFileName("app-2.js")?.id, "javascript");
    assert.equal(languageFromFileName("notes-2"), undefined);
    assert.equal(languageFromFileName("README"), undefined);
    assert.equal(ensureFileExtension("Python Projesi", "python"), "Python Projesi.py");
    assert.equal(ensureFileExtension("notes.md", "python"), "notes.md");
    assert.equal(ensureFileExtension("Dockerfile", "dockerfile"), "Dockerfile");
    assert.equal(fileExtensionFor("cpp"), "cpp");
    assert.equal(fileExtensionFor("unknown"), "txt");
});

test("templates reference known languages", () => {
    const ids = new Set(LANGUAGES.map((language) => language.id));
    for (const template of FILE_TEMPLATES) {
        assert.ok(ids.has(template.language), template.id);
        assert.ok(template.code.trim(), template.id);
        assert.ok(template.title.TR && template.title.EN, template.id);
    }
    assert.equal(new Set(FILE_TEMPLATES.map((template) => template.id)).size, FILE_TEMPLATES.length);
    for (const project of PROJECT_TEMPLATES) {
        const names = project.files.map((file) => file.name);
        assert.equal(new Set(names).size, names.length, project.id);
        for (const file of project.files) assert.equal(languageFromFileName(file.name)?.id, file.language, `${project.id}/${file.name}`);
    }
});

test("Hanogt offers at least 55 usable and 100 languages in total", () => {
    const { LANGUAGE_STATS } = registry;
    assert.ok(LANGUAGE_STATS.usable >= 55, `usable: ${LANGUAGE_STATS.usable}`);
    assert.ok(LANGUAGES.length >= 100, `total: ${LANGUAGES.length}`);
    assert.equal(LANGUAGE_STATS.usable, LANGUAGE_STATS.runnable + LANGUAGE_STATS.preview);
    assert.equal(LANGUAGE_STATS.highlighted, LANGUAGES.length - 1);
});

test("validators check files instead of running programs", () => {
    const worker = read("src/lib/runtimes/worker.ts");
    const validators = LANGUAGES.filter((language) => language.tool === "validator");
    assert.deepEqual(validators.map((language) => language.id).sort(), ["csv", "dotenv", "ini", "json", "properties", "toml", "xml", "yaml"]);
    for (const language of validators) {
        assert.equal(language.engine, "browser", language.id);
        assert.equal(isProgramLanguage(language.id), false, `${language.id} must not join Run all`);
        assert.ok(!SERVER_LANGUAGE_IDS.includes(language.id), `${language.id} never reaches the server`);
        assert.match(worker, new RegExp(`case "${language.id}":`), `the worker has no validator for ${language.id}`);
    }
    for (const id of ["prolog", "forth", "basic", "befunge", "whitespace", "mips"]) {
        assert.ok(BROWSER_LANGUAGES.has(id), id);
        assert.equal(isProgramLanguage(id), true, id);
        assert.ok(!SERVER_LANGUAGE_IDS.includes(id), `${id} runs in the browser only`);
    }
    for (const id of ["svg", "mermaid", "latex"]) assert.equal(registry.getLanguage(id).engine, "preview", id);
});

test("new extensions and well-known file names resolve", () => {
    const names = {
        "Makefile": "makefile", "GNUmakefile": "makefile", "rules.mk": "makefile", "CMakeLists.txt": "cmake", "nginx.conf": "nginx",
        ".env": "dotenv", ".env.local": "dotenv", "config/.env.production": "dotenv", ".editorconfig": "ini", "settings.ini": "ini",
        "app.properties": "properties", "Cargo.toml": "toml", "ci.yml": "yaml", "feed.rss": "xml", "data.tsv": "csv",
        "logo.svg": "svg", "flow.mmd": "mermaid", "paper.tex": "latex", "family.prolog": "prolog", "main.pro": "prolog", "script.pl": "perl",
        "words.fth": "forth", "GAME.BAS": "basic", "maze.b93": "befunge", "hello.ws": "whitespace", "sum.asm": "mips", "boot.nasm": "nasm",
        "solver.f90": "fortran", "PAYROLL.cbl": "cobol", "main.adb": "ada", "counter.vhd": "vhdl", "alu.v": "verilog", "top.sv": "systemverilog",
        "schema.prisma": "prisma", "Main.elm": "elm", "app.gleam": "gleam", "main.odin": "odin", "page.twig": "twig", "index.pug": "pug",
    };
    for (const [name, expected] of Object.entries(names)) assert.equal(languageFromFileName(name)?.id, expected, name);
    assert.equal(ensureFileExtension("Makefile", "makefile"), "Makefile");
    assert.equal(ensureFileExtension(".env", "dotenv"), ".env");
    assert.equal(normalizeLanguageId("asm"), "mips");
    assert.equal(normalizeLanguageId("Vlang"), "vlang");
});

test("monaco.ts registers a grammar for every custom Monaco id", () => {
    const builtin = new Set();
    const definitions = path.join(root, "node_modules/monaco-editor/esm/vs/languages/definitions");
    for (const folder of fs.readdirSync(definitions)) {
        const file = path.join(definitions, folder, "register.js");
        if (fs.existsSync(file)) for (const match of fs.readFileSync(file, "utf8").matchAll(/id:\s*["']([^"']+)["']/g)) builtin.add(match[1]);
    }
    const monaco = read("src/lib/monaco.ts");
    for (const id of ["prolog", "forth", "basic", "befunge", "whitespace", "mermaid", "latex", "toml", "dotenv", "csv", "makefile", "cmake", "nginx", "prisma", "nasm", "fortran", "cobol", "ada", "vhdl", "odin", "vlang", "gleam", "elm"]) {
        assert.ok(!builtin.has(id), `${id} is a Monaco built-in`);
        assert.match(monaco, new RegExp(`\\bid: "${id}"`), `${id} grammar`);
    }
});

test("language-count sentences match the plural form of the current number", () => {
    // Written for LANGUAGE_STATS.usable (see the comment above it in languages.ts). When the
    // number moves to another plural category, rewrite these keys in the listed locales.
    const writtenFor = { RU: "many", UK: "many", SR: "other", HR: "other", LT: "few", RO: "other" };
    const keys = ["about_purpose_text", "auth_feature_code", "lp_hero_sub", "lp_marquee", "ab_editor_text"];
    for (const [locale, category] of Object.entries(writtenFor)) {
        const actual = new Intl.PluralRules(locale.toLowerCase()).select(registry.LANGUAGE_STATS.usable);
        assert.equal(actual, category, `${locale}: ${registry.LANGUAGE_STATS.usable} is "${actual}" now; update ${keys.join(", ")} in src/locales/${locale}.json`);
        const messages = JSON.parse(read(`src/locales/${locale}.json`));
        for (const key of keys) assert.match(messages[key], /\{count\}/, `${locale}.${key}`);
    }
});
