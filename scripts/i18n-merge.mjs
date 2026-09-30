// Merges translator output ({ key: "translation" }) into a language's copy pack
// (or main dictionary with --main) after validating placeholders and links.
//   node scripts/i18n-merge.mjs DE part1.json [part2.json …] [--main]
import path from "node:path";
import { LOCALE_ROOT, PACK_ROOT, PACK_SOURCE, readJson, translationProblems, writeJson } from "./i18n-lib.mjs";

const args = process.argv.slice(2);
const main = args.includes("--main");
const [language, ...files] = args.filter((arg) => arg !== "--main");
if (!language || !files.length) {
    console.error("Kullanım: node scripts/i18n-merge.mjs <DİL> <çeviri.json> [...] [--main]");
    process.exit(1);
}
const targetFile = main ? path.join(LOCALE_ROOT, `${language}.json`) : path.join(PACK_ROOT, `${language}.json`);
const target = readJson(targetFile);
const english = main
    ? readJson(path.join(LOCALE_ROOT, "EN.json"))
    : Object.fromEntries(Object.entries(readJson(PACK_SOURCE)).map(([key, entry]) => [key, entry.en]));

let merged = 0;
const problems = [];
for (const file of files) {
    const part = readJson(file);
    for (const [key, raw] of Object.entries(part)) {
        const value = typeof raw === "string" ? raw : raw && typeof raw === "object" && typeof raw.text === "string" ? raw.text : null;
        if (!(key in english)) { problems.push(`${key}: kaynakta yok`); continue; }
        const issues = translationProblems(english[key], value);
        if (issues.length) { problems.push(`${key}: ${issues.join("; ")}`); continue; }
        target[key] = value;
        merged += 1;
    }
}
writeJson(targetFile, target);
console.log(`${language}${main ? " (ana sözlük)" : ""}: ${merged} çeviri birleştirildi → ${path.relative(process.cwd(), targetFile)}`);
if (problems.length) {
    console.error(`${problems.length} sorunlu çeviri atlandı:\n  ${problems.slice(0, 50).join("\n  ")}`);
    process.exitCode = 1;
}
