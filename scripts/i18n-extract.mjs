// Regenerates src/locales/copy/_source.json from the inline { TR, EN } copy in src/
// and makes sure every language has a main dictionary and a copy pack file.
import fs from "node:fs";
import path from "node:path";
import { LOCALE_ROOT, PACK_LANGUAGES, PACK_ROOT, PACK_SOURCE, extractCopy, readJson, writeJson } from "./i18n-lib.mjs";

const { entries, dynamic } = extractCopy();
const ordered = [...entries.entries()].sort(([, a], [, b]) => a.files[0].localeCompare(b.files[0]) || a.line - b.line);
const source = Object.fromEntries(ordered.map(([key, entry]) => [key, { en: entry.en, tr: entry.tr, files: entry.files }]));
writeJson(PACK_SOURCE, source, { sort: false });

for (const language of PACK_LANGUAGES) {
    const packFile = path.join(PACK_ROOT, `${language}.json`);
    if (!fs.existsSync(packFile)) writeJson(packFile, {});
    const mainFile = path.join(LOCALE_ROOT, `${language}.json`);
    if (!fs.existsSync(mainFile)) writeJson(mainFile, {});
}

const keys = Object.keys(source);
console.log(`${keys.length} çevrilebilir metin → ${path.relative(process.cwd(), PACK_SOURCE)}`);
if (dynamic.length) console.log(`${dynamic.length} dinamik metin (şablon değişkeni içeriyor, paketle çevrilemez): ${dynamic.join(", ")}`);
if (process.argv.includes("--coverage")) {
    for (const language of PACK_LANGUAGES) {
        const pack = readJson(path.join(PACK_ROOT, `${language}.json`));
        const done = keys.filter((key) => typeof pack[key] === "string" && pack[key].trim()).length;
        console.log(`${language}: ${done}/${keys.length}`);
    }
}
