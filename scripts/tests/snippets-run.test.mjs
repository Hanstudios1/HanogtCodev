// Every Python and JavaScript example of Hanogt AI Core (src/lib/ai/snippets.ts)
// runs: the examples the offline Core shows, and that training/build-dataset.mjs
// teaches a fine-tuned model, are real working code. Each runs in its own
// temporary folder with a little input and the file the file-reading example
// opens; the HTTP example (it needs the network) is left out.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { load } from "./setup.mjs";

const { SNIPPETS } = await load("lib/ai/snippets.ts");
const PYTHON = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const python = spawnSync(PYTHON, ["--version"], { stdio: "ignore" }).status === 0;

function run(command, args, cwd) {
    return new Promise((resolve) => {
        const child = spawn(command, args, { cwd, stdio: ["pipe", "ignore", "pipe"] });
        let stderr = "";
        child.stderr.on("data", (chunk) => {
            stderr += chunk;
        });
        const timer = setTimeout(() => child.kill("SIGKILL"), 15_000);
        child.on("close", (code) => {
            clearTimeout(timer);
            resolve({ code, stderr });
        });
        child.stdin.end("Ada\n20\n");
    });
}

for (const language of ["javascript", "python"]) {
    test(`every ${language} example runs`, { skip: language === "python" && !python && "python3 not found" }, async () => {
        const cases = SNIPPETS.filter((snippet) => snippet.code[language] && snippet.id !== "http");
        assert.ok(cases.length >= 25, `${cases.length} examples`);
        const results = await Promise.all(cases.map(async (snippet) => {
            const dir = await mkdtemp(path.join(tmpdir(), "hanogt-snippet-"));
            try {
                await writeFile(path.join(dir, "notlar.txt"), "birinci satır\nikinci satır\n");
                const result = language === "python" ? await run(PYTHON, ["-c", snippet.code.python], dir) : await run(process.execPath, ["-e", snippet.code.javascript], dir);
                return { id: snippet.id, ...result };
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        }));
        for (const result of results) assert.equal(result.code, 0, `${result.id}: ${result.stderr.split("\n").filter(Boolean).slice(-2).join(" | ")}`);
    });
}
