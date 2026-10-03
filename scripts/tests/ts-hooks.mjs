// Module resolution hooks for the plain-Node tests in this folder.
// Node 22 strips TypeScript types natively; these hooks only teach it the
// project's import style: "@/x" → src/x.ts, extensionless relative imports
// from .ts files, the "server-only" marker package (a no-op here) and JSON
// imports without an import attribute (the bundler's style).
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = new URL("../../src/", import.meta.url);
const CANDIDATES = [".ts", ".tsx", "/index.ts", ".mjs", ".js"];

function withExtension(url) {
    const path = fileURLToPath(url);
    if (fs.existsSync(path) && fs.statSync(path).isFile()) return url.href;
    for (const suffix of CANDIDATES) {
        if (fs.existsSync(path + suffix)) return pathToFileURL(path + suffix).href;
    }
    return null;
}

export async function resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
        return { url: "data:text/javascript,export {};", shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
        const found = withExtension(new URL(specifier.slice(2), SRC));
        if (found) return { url: found, shortCircuit: true };
    }
    const parent = context.parentURL ?? "";
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && /\.tsx?$/.test(parent)) {
        const found = withExtension(new URL(specifier, parent));
        if (found) return { url: found, shortCircuit: true };
    }
    return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
    if (url.startsWith("file:") && url.endsWith(".json")) {
        return { format: "json", source: fs.readFileSync(fileURLToPath(url), "utf8"), shortCircuit: true };
    }
    return nextLoad(url, context);
}
