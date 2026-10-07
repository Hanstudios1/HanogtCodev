/**
 * Runs code in the visitor's own browser through /runtimes/worker.js, so these
 * languages work without any server-side runner or sign-in. Everything else is
 * executed by /api/execute.
 */

import { BROWSER_LANGUAGES } from "./languages";

export { BROWSER_LANGUAGES };

export type BrowserStatusCode =
    | "loading_python" | "loading_sqlite" | "loading_lua" | "loading_prolog"
    | "loading_clojure" | "loading_sass" | "loading_jq" | "loading_wat" | "loading_coffeescript" | "loading_less";

export type BrowserRunNotice =
    | { code: "timeout"; seconds: number }
    | { code: "stopped" }
    | { code: "output_truncated"; limit?: number }
    | { code: "worker_crashed"; message: string }
    | { code: "worker_unavailable"; message: string };

export type BrowserRunResult = {
    stdout: string;
    stderr: string;
    code: number;
    version: string;
    durationMs: number;
    notices: BrowserRunNotice[];
};

export type BrowserRunOptions = {
    stdin?: string;
    timeoutMs?: number;
    /** Shown in error locations, e.g. "main.py". */
    fileName?: string;
    /** Language of the worker's own messages (SQL summaries, JSON reports). */
    locale?: "tr" | "en";
    /** Indentation used when formatting JSON. */
    indent?: number;
    onStatus?: (status: { code: BrowserStatusCode; text: string }) => void;
    /** Aborting stops the program (the worker is discarded) or skips it if it has not started. */
    signal?: AbortSignal;
};

type WorkerMessage =
    | { id: number; type: "stdout" | "stderr"; text: string }
    | { id: number; type: "status"; code: BrowserStatusCode; text: string }
    | { id: number; type: "notice"; code: "output_truncated" }
    | { id: number; type: "done"; exitCode: number; version: string };

let worker: Worker | null = null;
let nextId = 1;
/** Languages whose runtime the current worker has already downloaded. */
const loadedLanguages = new Set<string>();

/**
 * Hard limits of a language's first run, which downloads its runtime: Python
 * boots ~12 MB of WebAssembly, Sass is a ~1 MB chunk, the others are smaller.
 */
const FIRST_RUN_TIMEOUTS: Readonly<Record<string, number>> = {
    python: 90_000, scss: 60_000, clojure: 45_000, jq: 45_000, wat: 30_000, coffeescript: 30_000, less: 30_000,
};
/** Runs are serialised: the worker keeps per-run state such as the output budget. */
let queue: Promise<unknown> = Promise.resolve();

function getWorker() {
    if (!worker) worker = new Worker("/runtimes/worker.js", { type: "module", name: "hanogt-runtime" });
    return worker;
}

/** Stops a runaway program by discarding the whole worker; the next run starts a fresh one. */
function resetWorker() {
    worker?.terminate();
    worker = null;
    loadedLanguages.clear();
}

/** The hard limit after which the worker is terminated. */
export function browserTimeoutMs(language: string) {
    const firstRun = FIRST_RUN_TIMEOUTS[language];
    return firstRun && !loadedLanguages.has(language) ? firstRun : 15_000;
}

function execute(language: string, code: string, options: BrowserRunOptions): Promise<BrowserRunResult> {
    const id = nextId++;
    const timeoutMs = options.timeoutMs ?? browserTimeoutMs(language);
    const started = performance.now();
    return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        const notices: BrowserRunNotice[] = [];
        if (options.signal?.aborted) {
            resolve({ stdout, stderr, code: 130, version: "browser", durationMs: 0, notices: [{ code: "stopped" }] });
            return;
        }
        let active: Worker;
        try {
            active = getWorker();
        } catch (error) {
            resolve({
                stdout: "",
                stderr: "",
                code: 1,
                version: "browser",
                durationMs: 0,
                notices: [{ code: "worker_unavailable", message: error instanceof Error ? error.message : String(error) }],
            });
            return;
        }
        let settled = false;
        const finish = (result: Omit<BrowserRunResult, "durationMs" | "notices">) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            active.removeEventListener("message", onMessage);
            active.removeEventListener("error", onError);
            options.signal?.removeEventListener("abort", onAbort);
            resolve({ ...result, durationMs: Math.round(performance.now() - started), notices });
        };
        const onAbort = () => {
            resetWorker();
            notices.push({ code: "stopped" });
            finish({ stdout, stderr, code: 130, version: "browser" });
        };
        const onMessage = (event: MessageEvent<WorkerMessage>) => {
            const message = event.data;
            if (!message || message.id !== id) return;
            if (message.type === "stdout") stdout += message.text;
            else if (message.type === "stderr") stderr += message.text;
            else if (message.type === "status") options.onStatus?.({ code: message.code, text: message.text });
            else if (message.type === "notice") notices.push({ code: message.code });
            else if (message.type === "done") {
                loadedLanguages.add(language);
                finish({ stdout, stderr, code: message.exitCode, version: message.version });
            }
        };
        const onError = (event: ErrorEvent) => {
            resetWorker();
            notices.push({ code: "worker_crashed", message: event.message || "" });
            finish({ stdout, stderr, code: 1, version: "browser" });
        };
        const timer = window.setTimeout(() => {
            resetWorker();
            notices.push({ code: "timeout", seconds: Math.round(timeoutMs / 1000) });
            finish({ stdout, stderr, code: 124, version: "browser" });
        }, timeoutMs);
        active.addEventListener("message", onMessage);
        active.addEventListener("error", onError);
        options.signal?.addEventListener("abort", onAbort, { once: true });
        active.postMessage({
            id,
            type: "run",
            language,
            code,
            stdin: options.stdin ?? "",
            fileName: options.fileName,
            locale: options.locale ?? "en",
            indent: options.indent,
            // Interpreters stop themselves a little before the hard limit, which keeps the worker (and Pyodide) alive.
            softTimeoutMs: Math.max(1_000, timeoutMs - 3_000),
        });
    });
}

export function runInBrowser(language: string, code: string, options: BrowserRunOptions = {}): Promise<BrowserRunResult> {
    const run = queue.then(() => execute(language, code, options));
    queue = run.catch(() => undefined);
    return run;
}
