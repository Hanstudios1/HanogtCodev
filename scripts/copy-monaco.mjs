// Copies Monaco's AMD build into /public so the editor is served from our own
// origin. @monaco-editor/react loads it from cdn.jsdelivr.net by default, which
// the site's Content-Security-Policy (script-src 'self') blocks, leaving the
// code editor stuck on "Loading…" in production.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const packageJson = require(path.join(root, "node_modules", "monaco-editor", "package.json"));
const source = path.join(root, "node_modules", "monaco-editor", "min", "vs");
const target = path.join(root, "public", "monaco", "vs");
const marker = path.join(root, "public", "monaco", ".version");

if (!fs.existsSync(source)) {
    console.error("monaco-editor paketi bulunamadı; önce `npm install` çalıştırın.");
    process.exit(1);
}

const current = fs.existsSync(marker) ? fs.readFileSync(marker, "utf8").trim() : "";
if (current === packageJson.version && fs.existsSync(path.join(target, "loader.js"))) {
    console.log(`Monaco ${packageJson.version} zaten hazır.`);
    process.exit(0);
}

fs.rmSync(path.join(root, "public", "monaco"), { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.cpSync(source, target, { recursive: true });
fs.writeFileSync(marker, `${packageJson.version}\n`);
console.log(`Monaco ${packageJson.version} public/monaco/vs altına kopyalandı.`);
