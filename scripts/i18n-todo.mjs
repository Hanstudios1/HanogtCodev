// Writes the untranslated entries of one language to a work file for translators.
//   node scripts/i18n-todo.mjs DE out.json          copy-pack entries  { key: { en, tr } }
//   node scripts/i18n-todo.mjs FA out.json --main   main dictionary    { key: { en, tr } }
import path from "node:path";
import { LOCALE_ROOT, PACK_ROOT, PACK_SOURCE, readJson, writeJson } from "./i18n-lib.mjs";

const [language, outFile] = process.argv.slice(2);
if (!language || !outFile) {
    console.error("Kullanım: node scripts/i18n-todo.mjs <DİL> <çıktı.json> [--main]");
    process.exit(1);
}
const main = process.argv.includes("--main");
const todo = {};
if (main) {
    const en = readJson(path.join(LOCALE_ROOT, "EN.json"));
    const tr = readJson(path.join(LOCALE_ROOT, "TR.json"));
    const target = readJson(path.join(LOCALE_ROOT, `${language}.json`));
    for (const key of Object.keys(en)) if (typeof target[key] !== "string" || !target[key].trim()) todo[key] = { en: en[key], tr: tr[key] ?? "" };
} else {
    const source = readJson(PACK_SOURCE);
    const pack = readJson(path.join(PACK_ROOT, `${language}.json`));
    for (const [key, entry] of Object.entries(source)) if (typeof pack[key] !== "string" || !pack[key].trim()) todo[key] = { en: entry.en, tr: entry.tr };
}
writeJson(outFile, todo, { sort: false });
console.log(`${language}: ${Object.keys(todo).length} çevrilecek metin → ${outFile}`);
