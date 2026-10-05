// Module resolution hooks for the plain-Node tests in this folder.
// Node 22 strips TypeScript types natively; these hooks only teach it the
// project's import style: "@/x" → src/x.ts, extensionless relative imports
// from .ts files, the "server-only" marker package (a no-op here), JSON
// imports without an import attribute, package subpaths without an exports
// map ("next/server") and the default export of CommonJS modules compiled
// from ES modules (next-auth's providers), all as the bundler does.
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

/** CommonJS packages whose `exports.default` the bundler hands to a default import. */
const DEFAULT_INTEROP = /^next-auth\/providers\/[a-z0-9-]+$/;
const INTEROP_SHIM = new URL("./cjs-default.mjs", import.meta.url);

export async function resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
        return { url: "data:text/javascript,export {};", shortCircuit: true };
    }
    // The shim itself loads the real module.
    if (DEFAULT_INTEROP.test(specifier) && !(context.parentURL ?? "").startsWith(INTEROP_SHIM.href)) {
        const shim = new URL(INTEROP_SHIM);
        shim.searchParams.set("module", specifier);
        return { url: shim.href, shortCircuit: true };
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
    try {
        return await nextResolve(specifier, context);
    } catch (error) {
        // A package without an exports map ("next/server"): the bundler adds the extension.
        if (error?.code === "ERR_MODULE_NOT_FOUND" && /^(?:@[\w.-]+\/)?[\w.-]+\/[\w./-]+$/.test(specifier) && !/\.[cm]?js$/.test(specifier)) {
            return nextResolve(`${specifier}.js`, context);
        }
        throw error;
    }
}

export async function load(url, context, nextLoad) {
    if (url.startsWith("file:") && url.endsWith(".json")) {
        return { format: "json", source: fs.readFileSync(fileURLToPath(url), "utf8"), shortCircuit: true };
    }
    return nextLoad(url, context);
}
