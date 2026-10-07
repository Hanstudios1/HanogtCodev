import { RUN_FILES_PER_REQUEST } from "@/lib/plans";
import { BROWSER_LANGUAGES, runInBrowser, type BrowserRunNotice, type BrowserStatusCode } from "@/lib/runtimes/browser-runner";

export interface SecurityFinding {
    id: string;
    category: string;
    severity: "medium" | "high" | "critical";
    message: string;
    line?: number;
}

export type RunEngine = "browser" | "server";

/** Machine-readable reasons a server run failed; the editor translates them. */
export type RunErrorCode =
    | "auth_required" | "suspended" | "rate_limited" | "invalid_request" | "unsupported_language"
    | "too_large" | "empty_file" | "timeout" | "unavailable" | "no_compiler" | "invalid_origin" | "network" | "invalid_response" | "aborted" | "unknown";

export interface RunFailure {
    code: RunErrorCode;
    /** The server's own (Turkish) message, shown when the code is unknown to the UI. */
    message: string;
    status?: number;
    retryAfterSeconds?: number;
    /** A plan's run limit refused it: the files a minute it allows, and the plan that allows more (null after Pro). */
    limit?: { perMinute: number; upgrade: "plus" | "pro" | null };
    /** The run was bigger than the plan allows (too_large): its sizes in characters, and the plan that allows more. */
    sizes?: { fileChars: number; requestChars: number; stdinChars: number; upgrade: "plus" | "pro" | null; largest?: boolean };
}

export type RunNotice = BrowserRunNotice;

export interface ExecuteJob {
    name: string;
    language: string;
    version: string;
    run: { stdout: string; stderr: string; code: number; output: string };
    /** Where the job ran. */
    engine: RunEngine;
    /** Wall-clock duration in milliseconds. */
    durationMs: number;
    notices?: RunNotice[];
    /** Set when the job could not run at all (sign-in required, rate limit…). */
    failure?: RunFailure;
}

export interface ExecuteResponse {
    run: { stdout: string; stderr: string; code: number; output: string };
    language: string;
    version: string;
    security?: { blocked: false; risk: string };
    project?: boolean;
    jobs?: ExecuteJob[];
}

export interface SecurityCheck {
    risk: string;
    findings: SecurityFinding[];
    appealAvailable: boolean;
}

export interface SecureExecuteResult {
    response?: ExecuteResponse;
    blocked: boolean;
    securityCheck?: SecurityCheck;
}

export type RunFile = { name: string; language: string; code: string };

export interface ExecuteOptions {
    stdin?: string;
    /** Progress while a runtime loads (e.g. Python's first download). */
    onStatus?: (status: { code: BrowserStatusCode; text: string }) => void;
    /** Called as soon as each file finishes, in completion order. */
    onJob?: (job: ExecuteJob, index: number) => void;
    /** Language of runtime messages produced in the browser. */
    locale?: "tr" | "en";
    /** Indentation used by validators that format their input (JSON). */
    indent?: number;
    /** Stops browser programs and stops waiting for the server. */
    signal?: AbortSignal;
}

const KNOWN_CODES = new Set<RunErrorCode>([
    "auth_required", "suspended", "rate_limited", "invalid_request", "unsupported_language",
    "too_large", "empty_file", "timeout", "unavailable", "no_compiler", "invalid_origin", "network", "invalid_response", "aborted", "unknown",
]);

function failureFromResponse(status: number, body: Record<string, unknown>, headers: Headers): RunFailure {
    const message = typeof body.error === "string" ? body.error : "";
    const declared = typeof body.code === "string" && KNOWN_CODES.has(body.code as RunErrorCode) ? body.code as RunErrorCode : null;
    const retryAfter = Number.parseInt(headers.get("Retry-After") ?? "", 10);
    const perMinute = typeof body.limit === "number" && Number.isInteger(body.limit) && body.limit > 0 ? body.limit : null;
    const upgrade: "plus" | "pro" | null = body.upgrade === "plus" || body.upgrade === "pro" ? body.upgrade : null;
    const sizes = body.sizes && typeof body.sizes === "object" ? body.sizes as Record<string, unknown> : null;
    const positive = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value > 0;
    const runSizes = sizes && positive(sizes.fileChars) && positive(sizes.requestChars) && positive(sizes.stdinChars)
        ? { fileChars: Number(sizes.fileChars), requestChars: Number(sizes.requestChars), stdinChars: Number(sizes.stdinChars), upgrade, ...(body.largest === true ? { largest: true } : {}) }
        : null;
    const code: RunErrorCode = declared ?? (
        status === 401 ? "auth_required"
            : status === 429 ? "rate_limited"
                : status === 413 ? "too_large"
                    : status === 504 ? "timeout"
                        : status === 503 ? "unavailable"
                            : status === 400 ? "invalid_request"
                                : "unknown"
    );
    return { code, message, status, ...(Number.isFinite(retryAfter) ? { retryAfterSeconds: retryAfter } : {}), ...(code === "rate_limited" && perMinute ? { limit: { perMinute, upgrade } } : {}), ...(code === "too_large" && runSizes ? { sizes: runSizes } : {}) };
}

type ServerOutcome =
    | { kind: "jobs"; jobs: ExecuteJob[] }
    | { kind: "blocked"; security: SecurityCheck }
    | { kind: "failed"; failure: RunFailure; durationMs: number };

/** Failures the next group of the same run would meet too: it isn't sent. */
const STOPPING_FAILURES: ReadonlySet<RunErrorCode> = new Set(["auth_required", "suspended", "rate_limited", "invalid_origin", "aborted"]);

async function executeOnServer(files: RunFile[], stdin: string, signal?: AbortSignal): Promise<ServerOutcome> {
    const started = performance.now();
    let response: Response;
    try {
        response = await fetch("/api/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ files, stdin }),
            signal,
        });
    } catch (error) {
        const aborted = signal?.aborted || (error instanceof Error && error.name === "AbortError");
        return { kind: "failed", failure: { code: aborted ? "aborted" : "network", message: aborted ? "" : error instanceof Error ? error.message : String(error) }, durationMs: Math.round(performance.now() - started) };
    }
    const result = await response.json().catch(() => ({})) as Record<string, unknown>;
    const elapsed = Math.round(performance.now() - started);
    const security = result.security as (SecurityCheck & { blocked?: boolean }) | undefined;
    if (response.status === 422 && security?.blocked) {
        return { kind: "blocked", security: { risk: security.risk, findings: Array.isArray(security.findings) ? security.findings : [], appealAvailable: Boolean(security.appealAvailable) } };
    }
    if (!response.ok) return { kind: "failed", failure: failureFromResponse(response.status, result, response.headers), durationMs: elapsed };
    if (!Array.isArray(result.jobs)) return { kind: "failed", failure: { code: "invalid_response", message: "" }, durationMs: elapsed };
    const jobs = (result.jobs as Array<Partial<ExecuteJob> & { durationMs?: unknown; outputLimit?: unknown }>).map((job, index): ExecuteJob => {
        const run = job.run ?? { stdout: "", stderr: "", code: 1, output: "" };
        // The server cut the output to the plan's length (PLAN_RUN_SIZES.outputChars).
        const outputLimit = typeof job.outputLimit === "number" && Number.isInteger(job.outputLimit) && job.outputLimit > 0 ? job.outputLimit : null;
        return {
            name: typeof job.name === "string" ? job.name : files[index]?.name ?? "main",
            language: typeof job.language === "string" ? job.language : files[index]?.language ?? "",
            version: typeof job.version === "string" ? job.version : "",
            run: {
                stdout: typeof run.stdout === "string" ? run.stdout : "",
                stderr: typeof run.stderr === "string" ? run.stderr : "",
                code: Number.isInteger(run.code) ? Number(run.code) : 1,
                output: typeof run.output === "string" ? run.output : "",
            },
            engine: "server",
            durationMs: typeof job.durationMs === "number" && Number.isFinite(job.durationMs) ? Math.round(job.durationMs) : elapsed,
            ...(outputLimit ? { notices: [{ code: "output_truncated", limit: outputLimit }] } : {}),
        };
    });
    return { kind: "jobs", jobs };
}

/**
 * Runs one or more files. Browser languages (engine "browser" in
 * lib/runtimes/languages.ts: JavaScript, TypeScript, Python, SQL, Lua, Prolog,
 * BASIC, Forth, MIPS, the validators…) execute in the visitor's browser; every
 * other language goes to /api/execute (security scan + sandboxed runner),
 * eight files a request, one request after another, so results arrive as each
 * group finishes. Both start at once; results keep the order of `files`. How
 * many files a run may hold is the plan's (PLAN_RUN_LIMITS): the caller cuts
 * the list.
 */
export async function executeProjectSecure(files: RunFile[], options: ExecuteOptions = {}): Promise<SecureExecuteResult> {
    if (!files.length) throw new Error("No files to run.");
    const stdin = options.stdin ?? "";
    const results: Array<ExecuteJob | undefined> = new Array(files.length);
    const serverIndexes = files.map((file, index) => (BROWSER_LANGUAGES.has(file.language) ? -1 : index)).filter((index) => index >= 0);
    let security: SecurityCheck | undefined;

    const serverTask = (async () => {
        /** A failure that stops the groups after it (sign-in, limits, a stopped run): they get the same failure without a request. */
        let stopped: ServerOutcome & { kind: "failed" } | null = null;
        for (let start = 0; start < serverIndexes.length; start += RUN_FILES_PER_REQUEST) {
            const group = serverIndexes.slice(start, start + RUN_FILES_PER_REQUEST);
            const outcome: ServerOutcome = stopped ?? await executeOnServer(group.map((index) => files[index]), stdin, options.signal);
            if (outcome.kind === "blocked") {
                // The security scan refused this group: nothing more is sent.
                security = outcome.security;
                return;
            }
            group.forEach((fileIndex, position) => {
                const file = files[fileIndex];
                const job: ExecuteJob = outcome.kind === "jobs"
                    ? outcome.jobs[position] ?? { name: file.name, language: file.language, version: "", run: { stdout: "", stderr: "", code: 1, output: "" }, engine: "server", durationMs: 0, failure: { code: "invalid_response", message: "" } }
                    : { name: file.name, language: file.language, version: "", run: { stdout: "", stderr: outcome.failure.message, code: -1, output: outcome.failure.message }, engine: "server", durationMs: outcome.durationMs, failure: outcome.failure };
                results[fileIndex] = { ...job, name: file.name, language: file.language };
                options.onJob?.(results[fileIndex]!, fileIndex);
            });
            if (outcome.kind === "failed" && STOPPING_FAILURES.has(outcome.failure.code)) stopped = outcome;
        }
    })();

    const browserTask = (async () => {
        for (let index = 0; index < files.length; index += 1) {
            const file = files[index];
            if (!BROWSER_LANGUAGES.has(file.language)) continue;
            const result = await runInBrowser(file.language, file.code, { stdin, onStatus: options.onStatus, fileName: file.name, locale: options.locale, indent: options.indent, signal: options.signal });
            const job: ExecuteJob = {
                name: file.name,
                language: file.language,
                version: result.version,
                run: { stdout: result.stdout, stderr: result.stderr, code: result.code, output: result.stdout || result.stderr },
                engine: "browser",
                durationMs: result.durationMs,
                notices: result.notices.length ? result.notices : undefined,
            };
            results[index] = job;
            options.onJob?.(job, index);
        }
    })();

    await Promise.all([serverTask, browserTask]);
    const jobs = results.filter((job): job is ExecuteJob => Boolean(job));
    if (security) {
        return {
            blocked: true,
            securityCheck: security,
            response: jobs.length ? { run: jobs[0].run, language: jobs[0].language, version: jobs[0].version, jobs, project: files.length > 1 } : undefined,
        };
    }
    if (!jobs.length) throw new Error("No files could be run.");
    const first = jobs[0];
    return {
        blocked: false,
        response: { run: first.run, language: first.language, version: first.version, jobs, project: jobs.length > 1 },
    };
}

export async function executeCodeSecure(
    language: string,
    source: string,
    options: ExecuteOptions & { fileName?: string } = {},
): Promise<SecureExecuteResult> {
    return executeProjectSecure([{ name: options.fileName ?? "main", language, code: source }], options);
}

export async function executeCode(language: string, source: string): Promise<ExecuteResponse> {
    const result = await executeCodeSecure(language, source);
    if (result.blocked) throw new Error("The code was blocked by the security policy.");
    const job = result.response?.jobs?.[0];
    if (job?.failure) throw new Error(job.failure.message || job.failure.code);
    return result.response!;
}
