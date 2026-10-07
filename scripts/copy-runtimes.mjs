// Self-hosts the in-browser code runtimes under /public/runtimes:
//  - Pyodide (CPython compiled to WebAssembly) for Python, in a folder named
//    after its version (pyodide/<version>/),
//  - sql.js (SQLite), wasmoon (Lua 5.4) and jq-wasm (jq) WebAssembly binaries,
//  - scittle/: Scittle (Clojure), served unmodified with its EPL-1.0 licence,
//  - worker.js: the bundled Web Worker that runs JavaScript, TypeScript,
//    Python, SQL and Lua, plus Hanogt's own dependency-free Scheme and
//    Brainfuck interpreters and the JSON validator (src/lib/runtimes/worker.ts).
//    Runtimes added later (Prolog/Tau Prolog, Forth, BASIC, Befunge, Whitespace,
//    MIPS, jq, Less, SCSS/Dart Sass, WAT/wabt, Clojure, CoffeeScript and the
//    YAML/TOML/XML/INI/.env/.properties/CSV validators) are split into chunks/
//    and only downloaded when a file of that language first runs.
//  - mermaid/, katex/, graphviz/, abcjs/ and asciidoctor/: libraries the live
//    preview inlines into its sandboxed frame for Mermaid diagrams, LaTeX math,
//    Graphviz DOT graphs, ABC sheet music and AsciiDoc documents (KaTeX's fonts
//    are embedded in katex.css and Graphviz's WebAssembly in graphviz.js
//    because the opaque-origin frame cannot fetch anything).
// Everything is served from our own origin so the site's CSP stays strict.
// next.config.ts lets browsers cache /runtimes/* for a week; worker.js is
// always revalidated, and every binary it loads gets a content hash (?v=…) or
// a versioned folder, so a cached copy can never be paired with a newer one.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
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

const packageVersion = (name) => require(path.join(nodeModules, name, "package.json")).version;

/** "/runtimes/<file>?v=<first 10 hex digits of its SHA-256>" */
function hashedUrl(file) {
    const hash = createHash("sha256").update(fs.readFileSync(path.join(target, file))).digest("hex").slice(0, 10);
    return `/runtimes/${file}?v=${hash}`;
}

// ------------------------------------------------------------------ Pyodide
const pyodideVersion = packageVersion("pyodide");
const pyodideRoot = path.join(target, "pyodide");
const pyodideDir = path.join(pyodideRoot, pyodideVersion);
const pyodideFiles = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];
const marker = path.join(pyodideDir, ".complete");
if (!fs.existsSync(marker)) {
    fs.rmSync(pyodideDir, { recursive: true, force: true });
    for (const file of pyodideFiles) copy(path.join(nodeModules, "pyodide", file), path.join(pyodideDir, file));
    fs.writeFileSync(marker, `${pyodideVersion}\n`);
}
// Older versions (and the flat layout used before versioned folders) are removed.
for (const entry of fs.readdirSync(pyodideRoot)) {
    if (entry !== pyodideVersion) fs.rmSync(path.join(pyodideRoot, entry), { recursive: true, force: true });
}

// ------------------------------------------------------------------ binaries loaded by the worker
copy(path.join(nodeModules, "sql.js", "dist", "sql-wasm-browser.wasm"), path.join(target, "sql-wasm.wasm"));
copy(path.join(nodeModules, "wasmoon", "dist", "glue.wasm"), path.join(target, "lua-glue.wasm"));
copy(path.join(nodeModules, "jq-wasm", "dist", "build", "jq.wasm"), path.join(target, "jq", "jq.wasm"));
copy(path.join(nodeModules, "jq-wasm", "LICENSE"), path.join(target, "jq", "LICENSE"));
// Scittle stays byte-for-byte unmodified, next to its licence (EPL-1.0).
copy(path.join(nodeModules, "scittle", "dist", "scittle.js"), path.join(target, "scittle", "scittle.js"));
copy(path.join(nodeModules, "scittle", "LICENSE"), path.join(target, "scittle", "LICENSE"));

const runtimeAssets = {
    pyodide: `/runtimes/pyodide/${pyodideVersion}/`,
    sqlWasm: hashedUrl("sql-wasm.wasm"),
    luaWasm: hashedUrl("lua-glue.wasm"),
    jqWasm: hashedUrl("jq/jq.wasm"),
    scittle: hashedUrl("scittle/scittle.js"),
    scittleVersion: packageVersion("scittle"),
};

// ------------------------------------------------------------------ preview libraries
// Loaded by src/components/Editor/WebPreview.tsx on demand and inlined into the frame.
copy(path.join(nodeModules, "mermaid", "dist", "mermaid.min.js"), path.join(target, "mermaid", "mermaid.min.js"));
const katexDist = path.join(nodeModules, "katex", "dist");
copy(path.join(katexDist, "katex.min.js"), path.join(target, "katex", "katex.min.js"));
const katexCss = fs.readFileSync(path.join(katexDist, "katex.min.css"), "utf8").replace(
    /src:url\(fonts\/([\w-]+)\.woff2\) format\("woff2"\)(?:,url\(fonts\/[\w-]+\.woff\) format\("woff"\))?(?:,url\(fonts\/[\w-]+\.ttf\) format\("truetype"\))?/g,
    (_, font) => `src:url(data:font/woff2;base64,${fs.readFileSync(path.join(katexDist, "fonts", `${font}.woff2`)).toString("base64")}) format("woff2")`,
);
if (/url\(fonts\//.test(katexCss)) throw new Error("KaTeX font references changed; update scripts/copy-runtimes.mjs");
fs.writeFileSync(path.join(target, "katex", "katex.css"), katexCss);

// abcjs is already a minified UMD script that defines window.ABCJS.
copy(path.join(nodeModules, "abcjs", "dist", "abcjs-basic-min.js"), path.join(target, "abcjs", "abcjs-basic-min.js"));
copy(path.join(nodeModules, "abcjs", "dist", "abcjs-basic-min.js.LICENSE"), path.join(target, "abcjs", "abcjs-basic-min.js.LICENSE"));

// Graphviz (WebAssembly embedded in the JavaScript) and Asciidoctor ship as ES
// modules; the frame needs plain scripts with a global, so they are rebundled.
const previewBundle = (entry, globalName, outfile) => build({
    entryPoints: [entry],
    outfile: path.join(target, outfile),
    bundle: true,
    format: "iife",
    globalName,
    minify: true,
    target: ["es2020"],
    platform: "browser",
    legalComments: "eof",
    logLevel: "warning",
    // Node-only code paths (file system, async hooks) never run in the browser.
    external: ["node:*"],
});
await Promise.all([
    previewBundle(path.join(nodeModules, "@hpcc-js", "wasm-graphviz", "dist", "index.js"), "HanogtGraphviz", path.join("graphviz", "graphviz.js")),
    previewBundle(path.join(nodeModules, "@asciidoctor", "core", "build", "browser", "index.js"), "HanogtAsciidoctor", path.join("asciidoctor", "asciidoctor.js")),
]);

fs.writeFileSync(path.join(target, "preview-versions.json"), `${JSON.stringify({
    mermaid: packageVersion("mermaid"),
    katex: packageVersion("katex"),
    graphviz: packageVersion("@hpcc-js/wasm-graphviz"),
    abcjs: packageVersion("abcjs"),
    asciidoctor: packageVersion("@asciidoctor/core"),
})}\n`);

// ------------------------------------------------------------------ worker
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
    define: { "process.env.NODE_ENV": '"production"', __HANOGT_RUNTIME_ASSETS__: JSON.stringify(runtimeAssets) },
    plugins: [tauPrologStrictMode],
});
const size = (file) => Math.round(fs.statSync(path.join(target, file)).size / 1024);
const chunks = fs.readdirSync(path.join(target, "chunks"));
const chunkSize = Math.round(chunks.reduce((total, file) => total + fs.statSync(path.join(target, "chunks", file)).size, 0) / 1024);
console.log(`Tarayıcı çalışma zamanları hazır: public/runtimes (worker ${size("worker.js")} KB + ${chunks.length} parça ${chunkSize} KB, Pyodide ${pyodideVersion}, Mermaid ${size("mermaid/mermaid.min.js")} KB, KaTeX ${size("katex/katex.min.js") + size("katex/katex.css")} KB, Graphviz ${size("graphviz/graphviz.js")} KB, abcjs ${size("abcjs/abcjs-basic-min.js")} KB, Asciidoctor ${size("asciidoctor/asciidoctor.js")} KB, Scittle ${size("scittle/scittle.js")} KB, jq ${size("jq/jq.wasm")} KB, ${Date.now() - started} ms).`);
