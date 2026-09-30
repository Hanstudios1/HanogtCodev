// Shared helpers for the copy-pack translation tooling.
// The hash must stay identical to copyKey() in src/lib/i18n.tsx.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export const SOURCE_ROOT = path.resolve("src");
export const LOCALE_ROOT = path.join(SOURCE_ROOT, "locales");
export const PACK_ROOT = path.join(LOCALE_ROOT, "copy");
export const PACK_SOURCE = path.join(PACK_ROOT, "_source.json");

/** Every UI language except the two source languages (TR, EN). */
export const PACK_LANGUAGES = [
    "RU", "AZ", "ES", "KZ", "JP", "CN", "KR", "HI", "DE", "NG", "FR", "BE", "NL", "PL", "NO", "FI", "SV", "EL",
    "AR", "PT", "IT", "UK", "ID", "VI", "CS", "RO", "HU", "UZ",
    "FA", "HE", "UR", "BN", "TH", "MS", "TL", "SW", "DA", "BG", "SR", "HR", "SK", "KA", "TK", "KY", "TW", "TA", "SQ", "LT",
];

export function cyrb53(text) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        h1 = Math.imul(h1 ^ code, 2654435761);
        h2 = Math.imul(h2 ^ code, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export const copyKey = (english) => cyrb53(english).toString(36);

export function listSourceFiles(directory = SOURCE_ROOT, found = []) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            if (fullPath !== LOCALE_ROOT) listSourceFiles(fullPath, found);
        } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
            found.push(fullPath);
        }
    }
    return found;
}

function staticText(node) {
    if (!node) return null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    // "a" + "b" concatenations of literals.
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const left = staticText(node.left);
        const right = staticText(node.right);
        return left !== null && right !== null ? left + right : null;
    }
    if (ts.isParenthesizedExpression(node)) return staticText(node.expression);
    return null;
}

function propertyName(property) {
    if (!ts.isPropertyAssignment(property)) return null;
    const { name } = property;
    if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
    return null;
}

/**
 * Finds every translatable pair in the sources:
 *  - object literals with static TR and EN members ({ TR: "…", EN: "…" })
 *  - engine UI tuples in GameEngine/editor/text.ts (key: ["TR", "EN"])
 */
export function extractCopy() {
    const entries = new Map();
    const dynamic = [];
    const files = listSourceFiles().sort();
    for (const file of files) {
        const text = fs.readFileSync(file, "utf8");
        if (!/\b(?:TR|tr)\s*:|\["/.test(text)) continue;
        const relative = path.relative(process.cwd(), file).split(path.sep).join("/");
        const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
        const isEngineText = relative.endsWith("GameEngine/editor/text.ts");
        const add = (en, tr, node) => {
            if (!en.trim()) return;
            const key = copyKey(en);
            const existing = entries.get(key);
            if (existing && existing.en !== en) throw new Error(`copyKey çakışması: ${JSON.stringify(existing.en)} ↔ ${JSON.stringify(en)}`);
            if (existing) {
                if (!existing.files.includes(relative)) existing.files.push(relative);
                return;
            }
            const { line } = source.getLineAndCharacterOfPosition(node.getStart());
            entries.set(key, { en, tr, files: [relative], line: line + 1 });
        };
        const visit = (node) => {
            if (ts.isObjectLiteralExpression(node)) {
                const members = new Map();
                for (const property of node.properties) {
                    const name = propertyName(property);
                    if (name) members.set(name, property.initializer);
                }
                // Lower-case { tr, en } data tables (news categories, rankings…) are shown via
                // tx({ TR: entry.tr, EN: entry.en }), so their English text is a pack key too.
                if (members.has("tr") && members.has("en") && !members.has("TR")) {
                    const en = staticText(members.get("en"));
                    const tr = staticText(members.get("tr"));
                    if (en !== null && tr !== null) add(en, tr, node);
                }
                if (members.has("TR") && members.has("EN")) {
                    const en = staticText(members.get("EN"));
                    const tr = staticText(members.get("TR"));
                    const textLike = (value) => value && (ts.isTemplateExpression(value) || ts.isBinaryExpression(value) || ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value));
                    if (en !== null && tr !== null) add(en, tr, node);
                    else if (textLike(members.get("EN")) || textLike(members.get("TR"))) {
                        const { line } = source.getLineAndCharacterOfPosition(node.getStart());
                        dynamic.push(`${relative}:${line + 1}`);
                    }
                }
            }
            if (isEngineText && ts.isPropertyAssignment(node) && ts.isArrayLiteralExpression(node.initializer) && node.initializer.elements.length === 2) {
                const [trNode, enNode] = node.initializer.elements;
                const tr = staticText(trNode);
                const en = staticText(enNode);
                if (tr !== null && en !== null) add(en, tr, node);
            }
            ts.forEachChild(node, visit);
        };
        visit(source);
    }
    return { entries, dynamic };
}

export function readJson(file, fallback = {}) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
        if (error.code === "ENOENT") return fallback;
        throw new Error(`${file}: ${error.message}`);
    }
}

/** Writes an object with stable, sorted keys and a trailing newline. */
export function writeJson(file, value, { sort = true } = {}) {
    const ordered = sort ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]])) : value;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(ordered, null, 2)}\n`);
}

const PLACEHOLDER = /\{[a-zA-Z0-9_]+\}/g;
const LINK_TARGET = /\]\((\/[^)\s]*)\)/g;

/** Returns problems with a translated string compared to its English source. */
export function translationProblems(english, translated) {
    const problems = [];
    if (typeof translated !== "string" || !translated.trim()) return ["boş"];
    const expected = [...english.matchAll(PLACEHOLDER)].map((match) => match[0]).sort().join(",");
    const actual = [...translated.matchAll(PLACEHOLDER)].map((match) => match[0]).sort().join(",");
    if (expected !== actual) problems.push(`yer tutucular farklı (${expected || "-"} ≠ ${actual || "-"})`);
    const expectedLinks = [...english.matchAll(LINK_TARGET)].map((match) => match[1]).sort().join(",");
    const actualLinks = [...translated.matchAll(LINK_TARGET)].map((match) => match[1]).sort().join(",");
    if (expectedLinks !== actualLinks) problems.push(`bağlantılar farklı (${expectedLinks} ≠ ${actualLinks})`);
    if (translated.includes("�")) problems.push("bozuk karakter");
    return problems;
}
