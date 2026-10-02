// YAML, TOML, XML, INI, .env, .properties and CSV validators. Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { analyzeYaml } = await load("lib/runtimes/yaml-tools.ts");
const { analyzeToml } = await load("lib/runtimes/toml-tools.ts");
const { analyzeXml } = await load("lib/runtimes/xml-tools.ts");
const { analyzeIni, analyzeDotenv, analyzeProperties, analyzeCsv, detectDelimiter } = await load("lib/runtimes/config-tools.ts");
const { LANGUAGES } = await load("lib/runtimes/languages.ts");
const { FILE_TEMPLATES } = await load("lib/runtimes/templates.ts");

const ANALYZERS = { yaml: analyzeYaml, toml: analyzeToml, xml: analyzeXml, ini: analyzeIni, dotenv: analyzeDotenv, properties: analyzeProperties, csv: analyzeCsv };

test("YAML: every document is checked and re-indented", () => {
    const result = analyzeYaml("name: Hanogt\nlist:\n    - a\n    - b: 1\n      c: [1, 2]\n# comment\n---\nsecond: true\n");
    assert.equal(result.ok, true);
    assert.equal(result.summary, "✓ Valid YAML · 2 documents · root: mapping · 5 keys · depth 5");
    assert.equal(result.formatted, "name: Hanogt\nlist:\n  - a\n  - b: 1\n    c:\n      - 1\n      - 2\n---\nsecond: true");
    assert.match(result.notes[0], /comments and anchors/);
    assert.deepEqual(analyzeYaml("a:\n  b: 1\n c: 2\n").error, { message: "bad indentation of a mapping entry", line: 3, column: 2 });
    assert.deepEqual(analyzeYaml("a: 1\na: 2\n").error, { message: "duplicated mapping key", line: 2, column: 1 });
    assert.equal(analyzeYaml("a:\n\tb: 1\n", { locale: "tr" }).error.message, "girintide sekme karakteri kullanılamaz; boşluk kullanın");
    assert.equal(analyzeYaml("base: &b {x: 1}\nother: *b\n").formatted, "base:\n  x: 1\nother:\n  x: 1", "aliases are expanded");
});

test("TOML: errors have positions and hints; output is canonical", () => {
    const result = analyzeToml("title = \"x\"\n[owner]\nname = \"Ada\"\n[[products]]\nname = \"a\"\n[[products]]\nname = \"b\"\nbig = 9007199254740993\n");
    assert.equal(result.ok, true);
    assert.equal(result.summary, "✓ Valid TOML · 3 tables · 7 keys · 1 array");
    assert.match(result.formatted, /big = 9007199254740993/, "big integers are exact");
    assert.deepEqual(analyzeToml("name = Hanogt\n").error, { message: "invalid value; put text in quotes (for example name = \"Hanogt\")", line: 1, column: 8 });
    assert.match(analyzeToml("s = \"abc\n").error.message, /closing quote/);
    assert.equal(analyzeToml("a = 1\na = 2\n", { locale: "tr" }).error.message, "zaten tanımlanmış bir tablo veya değer yeniden tanımlanıyor");
});

test("XML: well-formedness errors name the tags and positions", () => {
    const ok = analyzeXml("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!-- c -->\n<root xmlns:a=\"u\" id='1'><a:b x=\"&amp;&#65;\">text &lt; here</a:b><c><d/></c><![CDATA[x]]></root>\n");
    assert.equal(ok.ok, true);
    assert.match(ok.summary, /^✓ Well-formed XML · root: <root> · 4 elements · 3 attributes · depth 3$/);
    assert.equal(analyzeXml("<a><b><c>x</c></b></a>", { indent: 2 }).formatted, "<a>\n  <b>\n    <c>x</c>\n  </b>\n</a>");
    const cases = [
        ["<a>\n  <b>\n  </c>\n</a>", "Closing tag </c> does not match; expected </b> (opened on line 2).", 3, 3],
        ["<a>\n  <b>\n</a>", "Unexpected </a>; close <b> (opened on line 2) first.", 3, 1],
        ["<a/><b/>", "An XML document can have only one root element; wrap the elements in a single root.", 1, 5],
        ["<a><x:b/></a>", "The namespace prefix 'x' is not declared; add xmlns:x=\"…\".", 1, 5],
        ["<a b=\"1\" b=\"2\"/>", "Duplicate attribute b in <a>.", 1, 10],
        ["<a b=1/>", "The value of b must be in quotes.", 1, 6],
        ["<a>Tom & Jerry</a>", "Unescaped '&'; write &amp; in text, or end the reference with ';'.", 1, 8],
    ];
    for (const [source, message, line, column] of cases) assert.deepEqual(analyzeXml(source).error, { message, line, column }, source);
    assert.equal(analyzeXml("<a>&nbsp;</a>", { locale: "tr" }).error.message, "Tanımsız varlık &nbsp;. XML'de &#160; kullanın.");
    assert.equal(analyzeXml("<!DOCTYPE note [<!ENTITY writer \"Ada\">]>\n<note>&writer;</note>").ok, true, "internal DTD entities are known");
});

test("INI and .properties: sections, keys, repeats and continuations", () => {
    const ini = analyzeIni("; top\nname=root\n[server]\nhost = localhost\nport:8080\nhost=x\n[server]\nflag\n");
    assert.equal(ini.ok, true);
    assert.equal(ini.summary, "✓ Valid INI · 1 section · 5 keys (1 before any section)");
    assert.deepEqual(ini.warnings.map((warning) => warning.line), [6, 7, 8]);
    assert.match(ini.formatted, /^; top\nname = root\n\n\[server\]\nhost = localhost\nport = 8080/);
    assert.deepEqual(analyzeIni("[a]\nthis is bad\n").error, { message: "Expected a 'key = value' line, a [section] header or a ; comment.", line: 2, column: 1 });
    const properties = analyzeProperties("# c\nkey1=value\nkey2 : value two\nkey3 value3\nmulti=a\\\n    b\\\n    c\nkey1=dup\n");
    assert.equal(properties.summary, "✓ Valid .properties · 5 keys", "every key line counts, repeats included");
    assert.match(properties.formatted, /multi = abc/);
    assert.equal(properties.warnings[0].message, "Key \"key1\" is repeated; the last value wins.");
    assert.equal(analyzeProperties("a=\\u12x4\n").error.line, 1);
});

test(".env: names, quotes, expansion and secrets", () => {
    const env = analyzeDotenv("# comment\nexport API_KEY=\"abc\\\"def\"\nNAME = Hanogt\nMULTI=\"line1\nline2\"\nURL=${HOST}/x\n");
    assert.equal(env.ok, true);
    assert.equal(env.summary, "✓ Valid .env · 4 variables");
    assert.deepEqual(env.warnings.map((warning) => warning.line), [3, 6]);
    assert.match(env.notes.join("\n"), /secrets \(API_KEY\)/);
    assert.deepEqual(analyzeDotenv("A=\"unterminated\nB=2").error, { message: "The quoted value of A is not closed.", line: 1, column: 3 });
    assert.match(analyzeDotenv("1A=2").error.message, /is not a valid variable name/);
});

test("CSV: delimiter detection, quoting rules and a table", () => {
    assert.equal(detectDelimiter("a;b;c\n1;2;3\n"), ";");
    assert.equal(detectDelimiter("a\tb\n1\t2\n"), "\t");
    const csv = analyzeCsv("name,age,city\nAda,36,\"London, UK\"\n\"Grace \"\"Amazing\"\" Hopper\",85,\"New\nYork\"\nLinus,54\n");
    assert.equal(csv.ok, true);
    assert.equal(csv.summary, "✓ Valid CSV · 3 data rows × 3 columns · delimiter ',' · header: name, age, city");
    assert.match(csv.formatted, /\| Grace "Amazing" Hopper \| 85 {2}\| New⏎York {3}\|/);
    assert.equal(csv.warnings[0].message, "Record 4 has 2 fields; the first row has 3.");
    assert.equal(analyzeCsv("a,b\n\"x,1\n").error.line, 2);
    assert.deepEqual(analyzeCsv("a,b\n\"x\"y,1\n").error, { message: "Expected ',' or a line break after the closing quote.", line: 2, column: 4 });
});

test("every validator template is valid and starts with a ✓ summary", () => {
    for (const language of LANGUAGES.filter((item) => item.tool === "validator" && ANALYZERS[item.id])) {
        const samples = [{ id: `${language.id} hello`, code: language.template }, ...FILE_TEMPLATES.filter((template) => template.language === language.id)];
        for (const sample of samples) {
            const result = ANALYZERS[language.id](sample.code);
            assert.equal(result.ok, true, `${sample.id}: ${result.error?.message}`);
            assert.deepEqual(result.warnings, [], sample.id);
            assert.match(result.summary, /^✓ /, sample.id);
            assert.ok(result.formatted, sample.id);
        }
    }
    for (const id of Object.keys(ANALYZERS)) assert.equal(LANGUAGES.find((language) => language.id === id)?.tool, "validator", id);
});
