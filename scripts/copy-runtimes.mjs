// Self-hosts the in-browser code runtimes under /public/runtimes:
//  - Pyodide (CPython compiled to WebAssembly) for Python,
//  - sql.js (SQLite) and wasmoon (Lua 5.4) WebAssembly binaries,
//  - worker.js: the bundled Web Worker that runs JavaScript, TypeScript,
//    Python, SQL and Lua, plus Hanogt's own dependency-free Scheme and
//    Brainfuck interpreters and the JSON validator (src/lib/runtimes/worker.ts).
// Everything is served from our own origin so the site's CSP stays strict.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const nodeModules = path.join(root, "node_modules");
const target = path.join(root, "public", "runtimes");
const started = Date.now();

function copy(from, to) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
}

const pyodideVersion = require(path.join(nodeModules, "pyodide", "package.json")).version;
const marker = path.join(target, "pyodide", ".version");
if (!fs.existsSync(marker) || fs.readFileSync(marker, "utf8").trim() !== pyodideVersion) {
    fs.rmSync(path.join(target, "pyodide"), { recursive: true, force: true });
    for (const file of ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"]) {
        copy(path.join(nodeModules, "pyodide", file), path.join(target, "pyodide", file));
    }
    fs.writeFileSync(marker, `${pyodideVersion}\n`);
}
copy(path.join(nodeModules, "sql.js", "dist", "sql-wasm-browser.wasm"), path.join(target, "sql-wasm.wasm"));
copy(path.join(nodeModules, "wasmoon", "dist", "glue.wasm"), path.join(target, "lua-glue.wasm"));

await build({
    entryPoints: [path.join(root, "src", "lib", "runtimes", "worker.ts")],
    outfile: path.join(target, "worker.js"),
    bundle: true,
    minify: true,
    format: "esm",
    target: ["es2020"],
    platform: "browser",
    legalComments: "none",
    logLevel: "warning",
    // The runtimes probe for Node built-ins; the browser code paths never use them.
    external: ["fs", "path", "crypto", "module", "url", "child_process", "ws", "node:*"],
    define: { "process.env.NODE_ENV": '"production"' },
});
const size = (file) => Math.round(fs.statSync(path.join(target, file)).size / 1024);
console.log(`Tarayıcı çalışma zamanları hazır: public/runtimes (worker ${size("worker.js")} KB, Pyodide ${pyodideVersion}, ${Date.now() - started} ms).`);
