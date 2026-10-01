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
