// Self-hosts the in-browser code runtimes under /public/runtimes:
//  - Pyodide (CPython compiled to WebAssembly) for Python,
//  - sql.js (SQLite) and wasmoon (Lua 5.4) WebAssembly binaries,
//  - worker.js: the bundled Web Worker that runs JavaScript, TypeScript,
//    Python, SQL and Lua, plus Hanogt's own dependency-free Scheme and
//    Brainfuck interpreters and the JSON validator (src/lib/runtimes/worker.ts).
//    Runtimes added later (Prolog/Tau Prolog, Forth, BASIC, Befunge, Whitespace,
//    MIPS and the YAML/TOML/XML/INI/.env/.properties/CSV validators) are split
//    into chunks/ and only downloaded when a file of that language first runs.
//  - mermaid/ and katex/: libraries the live preview inlines into its sandboxed
//    frame for Mermaid diagrams and LaTeX math (KaTeX's fonts are embedded in
//    katex.css because the opaque-origin frame cannot fetch font files).
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

// Preview libraries (loaded by src/components/Editor/WebPreview.tsx on demand).
copy(path.join(nodeModules, "mermaid", "dist", "mermaid.min.js"), path.join(target, "mermaid", "mermaid.min.js"));
const katexDist = path.join(nodeModules, "katex", "dist");
copy(path.join(katexDist, "katex.min.js"), path.join(target, "katex", "katex.min.js"));
const katexCss = fs.readFileSync(path.join(katexDist, "katex.min.css"), "utf8").replace(
    /src:url\(fonts\/([\w-]+)\.woff2\) format\("woff2"\)(?:,url\(fonts\/[\w-]+\.woff\) format\("woff"\))?(?:,url\(fonts\/[\w-]+\.ttf\) format\("truetype"\))?/g,
    (_, font) => `src:url(data:font/woff2;base64,${fs.readFileSync(path.join(katexDist, "fonts", `${font}.woff2`)).toString("base64")}) format("woff2")`,
);
if (/url\(fonts\//.test(katexCss)) throw new Error("KaTeX font references changed; update scripts/copy-runtimes.mjs");
fs.writeFileSync(path.join(target, "katex", "katex.css"), katexCss);
fs.writeFileSync(path.join(target, "preview-versions.json"), `${JSON.stringify({
    mermaid: require(path.join(nodeModules, "mermaid", "package.json")).version,
    katex: require(path.join(nodeModules, "katex", "package.json")).version,
})}\n`);

// Tau Prolog is written for sloppy-mode scripts and assigns a few variables it
// never declares; the bundle is an ES module (strict mode), so declare them.
const TAU_UNDECLARED = [
    "indicator", "num_token", "group", "i", "tau_file_system", "tau_user_input", "tau_user_output", "tau_user_error",
    "nodejs_file_system", "nodejs_user_input", "nodejs_user_output", "nodejs_user_error",
];
const tauPrologStrictMode = {
    name: "tau-prolog-strict-mode",
    setup(builder) {
        builder.onLoad({ filter: /tau-prolog[\\/]modules[\\/][\w-]+\.js$/ }, async (args) => ({
            contents: `var ${TAU_UNDECLARED.join(", ")};\n${await fs.promises.readFile(args.path, "utf8")}`,
            loader: "js",
        }));
    },
};

// Old chunks are removed so stale hashes never pile up.
fs.rmSync(path.join(target, "chunks"), { recursive: true, force: true });
await build({
    entryPoints: { worker: path.join(root, "src", "lib", "runtimes", "worker.ts") },
    outdir: target,
    entryNames: "[name]",
    chunkNames: "chunks/[name]-[hash]",
    bundle: true,
    splitting: true,
    minify: true,
    format: "esm",
    target: ["es2020"],
    platform: "browser",
    // Keeps /*! license banners (BSD/MIT notices of the bundled libraries).
    legalComments: "eof",
    logLevel: "warning",
    // The runtimes probe for Node built-ins (and Tau Prolog for readline-sync); the browser code paths never use them.
    external: ["fs", "path", "crypto", "module", "url", "child_process", "ws", "readline-sync", "node:*"],
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [tauPrologStrictMode],
});
const size = (file) => Math.round(fs.statSync(path.join(target, file)).size / 1024);
const chunks = fs.readdirSync(path.join(target, "chunks"));
const chunkSize = Math.round(chunks.reduce((total, file) => total + fs.statSync(path.join(target, "chunks", file)).size, 0) / 1024);
console.log(`Tarayıcı çalışma zamanları hazır: public/runtimes (worker ${size("worker.js")} KB + ${chunks.length} parça ${chunkSize} KB, Pyodide ${pyodideVersion}, Mermaid ${size("mermaid/mermaid.min.js")} KB, KaTeX ${size("katex/katex.min.js") + size("katex/katex.css")} KB, ${Date.now() - started} ms).`);
