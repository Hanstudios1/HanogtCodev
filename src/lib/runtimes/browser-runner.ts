/**
 * Runs code in the visitor's own browser through /runtimes/worker.js, so these
 * languages work without any server-side runner or sign-in. Everything else is
 * executed by /api/execute.
 */

import { BROWSER_LANGUAGES } from "./languages";

export { BROWSER_LANGUAGES };

export type BrowserRunResult = { stdout: string; stderr: string; code: number; version: string };

type WorkerMessage =
    | { id: number; type: "stdout" | "stderr"; text: string }
    | { id: number; type: "status"; text: string }
    | { id: number; type: "done"; exitCode: number; version: string };

let worker: Worker | null = null;
let nextId = 1;
let pythonLoaded = false;

function getWorker() {
    if (!worker) worker = new Worker("/runtimes/worker.js", { type: "module", name: "hanogt-runtime" });
    return worker;
}

/** Stops a runaway program by discarding the whole worker; the next run starts a fresh one. */
function resetWorker() {
    worker?.terminate();
    worker = null;
    pythonLoaded = false;
}

export function runInBrowser(
    language: string,
    code: string,
    options: { stdin?: string; timeoutMs?: number; onStatus?: (text: string) => void } = {},
): Promise<BrowserRunResult> {
    const id = nextId++;
    // The first Python run downloads and boots ~12 MB of WebAssembly.
    const timeoutMs = options.timeoutMs ?? (language === "python" && !pythonLoaded ? 90_000 : 15_000);
    return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        let active: Worker;
        try {
            active = getWorker();
        } catch (error) {
            resolve({ stdout: "", stderr: `Tarayıcı çalışma ortamı başlatılamadı: ${error instanceof Error ? error.message : String(error)}\n`, code: 1, version: "browser" });
            return;
        }
        const finish = (result: BrowserRunResult) => {
            window.clearTimeout(timer);
            active.removeEventListener("message", onMessage);
            active.removeEventListener("error", onError);
            resolve(result);
        };
        const onMessage = (event: MessageEvent<WorkerMessage>) => {
            const message = event.data;
            if (!message || message.id !== id) return;
            if (message.type === "stdout") stdout += message.text;
            else if (message.type === "stderr") stderr += message.text;
            else if (message.type === "status") options.onStatus?.(message.text);
            else if (message.type === "done") {
                if (language === "python") pythonLoaded = true;
                finish({ stdout, stderr, code: message.exitCode, version: message.version });
            }
        };
        const onError = (event: ErrorEvent) => {
            resetWorker();
            finish({ stdout, stderr: `${stderr}${event.message || "Çalışma ortamı beklenmedik biçimde durdu."}\n`, code: 1, version: "browser" });
        };
        const timer = window.setTimeout(() => {
            resetWorker();
            finish({
                stdout,
                stderr: `${stderr}Program ${Math.round(timeoutMs / 1000)} saniye içinde bitmediği için durduruldu (sonsuz döngü olabilir).\n`,
                code: 124,
                version: "browser",
            });
        }, timeoutMs);
        active.addEventListener("message", onMessage);
        active.addEventListener("error", onError);
        active.postMessage({ id, type: "run", language, code, stdin: options.stdin ?? "" });
    });
}
