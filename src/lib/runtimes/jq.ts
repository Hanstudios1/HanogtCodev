/**
 * jq in the browser: the jq C sources compiled to WebAssembly (jq-wasm, MIT),
 * loaded on first use from /runtimes/jq/jq.wasm.
 *
 * The program is the jq filter and the Input tab is the JSON it reads; several
 * JSON values in the input are read one after another, like `jq` reading a
 * file, and an empty Input tab is `null`. Results are printed the way the jq
 * command line prints them: pretty JSON, one value per line.
 */
import { loadJq, type Jq } from "jq-wasm";

export interface JqRunOptions {
    /** The Input tab: the JSON the filter reads. */
    stdin?: string;
    /** Where jq.wasm is served (the worker passes its self-hosted copy; tests pass a file path). */
    wasmUrl?: string;
    /** Shown in error locations, e.g. "filter.jq". */
    fileName?: string;
    locale?: "tr" | "en";
}

export interface JqRunResult {
    stdout: string;
    stderr: string;
    /** 0, or jq's own exit status (3: the filter does not compile, 5: a run-time or input error). */
    exitCode: number;
    version: string;
}

let jqPromise: Promise<Jq> | null = null;
let loadedFrom: string | undefined;

/** Compiles jq.wasm once per worker; a failed download can be retried. */
export function loadJqRuntime(wasmUrl?: string): Promise<Jq> {
    if (!jqPromise || loadedFrom !== wasmUrl) {
        loadedFrom = wasmUrl;
        const promise = loadJq(wasmUrl ? { wasmURL: wasmUrl } : {});
        jqPromise = promise;
        promise.catch(() => {
            if (jqPromise === promise) jqPromise = null;
        });
    }
    return jqPromise;
}

/** "jq-1.8.2" → "jq 1.8.2". */
function versionLabel(jq: Jq) {
    return `${jq.version.replace(/^jq-/, "jq ")} (WebAssembly)`;
}

/**
 * Adds an "at filter.jq:LINE:COLUMN" line (the console turns it into a link)
 * and names the Input tab in errors about the input JSON.
 */
function describeErrors(stderr: string, fileName: string, locale: "tr" | "en") {
    const lines = stderr.replace(/\/dev\/stdin/g, "<stdin>").split("\n");
    const output: string[] = [];
    for (const line of lines) {
        output.push(line);
        const compile = /^jq: error: .* at <top-level>, line (\d+)(?:, column (\d+))?:$/.exec(line);
        if (compile) output.push(`    at ${fileName}:${compile[1]}${compile[2] ? `:${compile[2]}` : ""}`);
        if (/^jq: (?:error \(at <stdin>:\d+\): )?parse error: /.test(line)) {
            output.push(locale === "tr" ? "    (Girdi sekmesindeki JSON okunamadı)" : "    (the JSON in the Input tab could not be read)");
        }
    }
    return output.join("\n");
}

/** Runs `filter` on the Input tab's JSON. */
export async function runJq(filter: string, options: JqRunOptions = {}): Promise<JqRunResult> {
    const jq = await loadJqRuntime(options.wasmUrl);
    const input = options.stdin && options.stdin.trim() ? options.stdin : "null";
    const result = jq.raw(input, filter, []);
    const fileName = options.fileName || "filter.jq";
    return {
        stdout: result.stdout ? `${result.stdout}\n` : "",
        stderr: result.stderr ? `${describeErrors(result.stderr, fileName, options.locale === "tr" ? "tr" : "en")}\n` : "",
        exitCode: result.exitCode,
        version: versionLabel(jq),
    };
}
