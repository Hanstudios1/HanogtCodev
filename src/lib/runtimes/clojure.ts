/**
 * Clojure in the browser through Scittle (EPL-1.0): the Small Clojure
 * Interpreter compiled to JavaScript, which runs ClojureScript source without
 * a compile step. The worker downloads the unmodified scittle.js once (it is
 * self-hosted under /runtimes/scittle/ with its licence) and this module
 * evaluates it afresh for every run, so definitions never leak from one run
 * into the next.
 *
 * println/print/prn write to the console (js/console.log too), read-line
 * reads the Input tab line by line, and format/printf use goog.string.format.
 * Errors name the line and column, like "at main.clj:3:5".
 */

export interface ClojureRunOptions {
    /** The source of scittle.js. */
    runtime: string;
    stdin?: string;
    onOutput: (text: string) => void;
    onError: (text: string) => void;
}

export interface ClojureRunResult {
    exitCode: number;
    error?: { message: string; line?: number; column?: number };
}

type Scittle = { core: { eval_string: (code: string) => unknown } };
type Bridge = { out: (text: string) => void; err: (text: string) => void; read: () => string | null; error?: unknown };
type Scope = { scittle?: Scittle; __hanogt_clojure?: Bridge; console: Console };

/** Wires printing and the Input tab to the console, and adds read-line, format and printf. */
const PRELUDE = `
(set! *print-newline* true)
(set! *print-fn* (fn [s] (.out js/__hanogt_clojure s)))
(set! *print-err-fn* (fn [s] (.err js/__hanogt_clojure s)))
(require '[goog.string :as hanogt-gstring] '[goog.string.format])
(intern 'clojure.core 'read-line (fn [] (.read js/__hanogt_clojure)))
(intern 'clojure.core 'format (fn [fmt & args] (apply hanogt-gstring/format (.replace fmt (js/RegExp. "(?<!%)%n" "g") "\n") args)))
(intern 'clojure.core 'printf (fn [fmt & args] (print (apply format fmt args))))
`;

/** Reads the location, phase and data of an error with Clojure itself (the error is a ClojureScript value). */
const DESCRIBE = `
(let [e (.-error js/__hanogt_clojure)
      d (ex-data e)
      c (ex-cause e)]
  (clj->js {:line (:line d)
            :column (:column d)
            :phase (some-> (:phase d) str)
            :name (when (and c (instance? js/Error c) (not (ex-data c))) (.-name c))
            :data (when-let [cd (and c (ex-data c))]
                    (when-not (#{:sci/error :sci.error/parse :edamame/error} (:type cd)) (pr-str cd)))}))
`;

type ErrorInfo = { line?: number | null; column?: number | null; phase?: string | null; name?: string | null; data?: string | null };

export function runClojure(source: string, options: ClojureRunOptions): ClojureRunResult {
    const scope = globalThis as unknown as Scope;
    const lines = (options.stdin ?? "").length ? (options.stdin ?? "").replace(/\r\n/g, "\n").split("\n") : [];
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    scope.__hanogt_clojure = { out: options.onOutput, err: options.onError, read: () => (lines.length ? lines.shift()! : null) };
    // A fresh interpreter (and so a fresh "user" namespace) for every run.
    (0, eval)(options.runtime);
    const scittle = scope.scittle;
    if (!scittle) throw new Error("Scittle did not load.");
    const evaluate = scittle.core.eval_string;

    // js/console.log goes to the console; Scittle's own error report (we print a shorter one) does not.
    const original = { log: scope.console.log, info: scope.console.info, debug: scope.console.debug, warn: scope.console.warn, error: scope.console.error };
    let silenced = false;
    const text = (args: unknown[]) => `${args.map((arg) => (typeof arg === "string" ? arg : String(arg))).join(" ")}\n`;
    scope.console.log = scope.console.info = scope.console.debug = (...args: unknown[]) => options.onOutput(text(args));
    scope.console.warn = (...args: unknown[]) => options.onError(text(args));
    scope.console.error = (...args: unknown[]) => {
        if (typeof args[0] === "string" && args[0].startsWith("----- Scittle error")) silenced = true;
        if (!silenced) options.onError(text(args));
    };
    try {
        evaluate(PRELUDE);
        try {
            evaluate(source);
            return { exitCode: 0 };
        } catch (error) {
            return { exitCode: 1, error: describe(error, evaluate, scope) };
        }
    } finally {
        Object.assign(scope.console, original);
        delete scope.__hanogt_clojure;
    }
}

function describe(error: unknown, evaluate: (code: string) => unknown, scope: Scope): ClojureRunResult["error"] {
    const message = error instanceof Error ? error.message : String(error);
    let info: ErrorInfo = {};
    try {
        scope.__hanogt_clojure!.error = error;
        info = (evaluate(DESCRIBE) as ErrorInfo | null) ?? {};
    } catch {
        // Not a Clojure error (e.g. the JavaScript stack overflowed): read what the message says.
        const printed = String((error as { data?: unknown })?.data ?? "");
        const match = /:line (\d+), :column (\d+)/.exec(printed);
        if (match) info = { line: Number(match[1]), column: Number(match[2]) };
    }
    const prefix = info.phase === "parse" ? "Syntax error: " : info.phase === "analysis" ? "Syntax error (analysis): " : info.name ? `${info.name}: ` : "";
    const data = info.data && info.data !== "{}" ? ` ${info.data}` : "";
    return {
        message: `${prefix}${message}${data}`,
        line: typeof info.line === "number" ? info.line : undefined,
        column: typeof info.column === "number" ? info.column : undefined,
    };
}
