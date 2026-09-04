import fs from "node:fs";
import path from "node:path";

const sourceRoot = path.resolve("src");
const localeRoot = path.join(sourceRoot, "locales");
const sourceFiles = [];

function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            if (fullPath !== localeRoot) walk(fullPath);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
            sourceFiles.push(fullPath);
        }
    }
}

walk(sourceRoot);
const required = new Set();
for (const file of sourceFiles) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/\bt\(\s*["']([a-zA-Z0-9_]+)["']/g)) required.add(match[1]);
}

const changelog = fs.readFileSync(path.join(sourceRoot, "components", "ChangelogModal.tsx"), "utf8");
for (const match of changelog.matchAll(/(?:titleKey|descKey|key):\s*["']([a-zA-Z0-9_]+)["']/g)) required.add(match[1]);

let failed = false;
for (const file of fs.readdirSync(localeRoot).filter((name) => name.endsWith(".json")).sort()) {
    const dictionary = JSON.parse(fs.readFileSync(path.join(localeRoot, file), "utf8"));
    const missing = [...required].filter((key) => typeof dictionary[key] !== "string" || !dictionary[key].trim());
    const corrupt = [...required].filter((key) => {
        const value = dictionary[key];
        return typeof value === "string" && (
            value.includes("\uFFFD")
            || /\?{2,}/.test(value)
            || /[\p{L}\d]\?[\p{L}\d]/u.test(value)
        );
    });
    if (missing.length || corrupt.length) {
        failed = true;
        if (missing.length) console.error(`${file}: ${missing.length} eksik anahtar -> ${missing.join(", ")}`);
        if (corrupt.length) console.error(`${file}: ${corrupt.length} bozuk metin -> ${corrupt.join(", ")}`);
    } else {
        console.log(`${file}: ${required.size} kullanılan anahtar tamam`);
    }
}

if (failed) process.exitCode = 1;
