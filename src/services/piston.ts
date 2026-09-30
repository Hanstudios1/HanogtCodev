import { BROWSER_LANGUAGES, runInBrowser } from "@/lib/runtimes/browser-runner";

export interface SecurityFinding {
    id: string;
    category: string;
    severity: "medium" | "high" | "critical";
    message: string;
    line?: number;
}

export interface ExecuteResponse {
    run: { stdout: string; stderr: string; code: number; output: string };
    language: string;
    version: string;
    security?: { blocked: false; risk: string };
    project?: boolean;
    jobs?: Array<{
        name: string;
        language: string;
        version: string;
        run: { stdout: string; stderr: string; code: number; output: string };
    }>;
}

export interface SecureExecuteResult {
    response?: ExecuteResponse;
    blocked: boolean;
    securityCheck?: { risk: string; findings: SecurityFinding[]; appealAvailable: boolean };
}

type RunFile = { name: string; language: string; code: string };
type Job = NonNullable<ExecuteResponse["jobs"]>[number];

async function executeOnServer(files: RunFile[], stdin: string): Promise<SecureExecuteResult> {
    const response = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files, stdin }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 422 && result.security?.blocked) return { blocked: true, securityCheck: result.security };
    if (!response.ok) throw new Error(result.error || `Çalıştırma hatası (${response.status})`);
    if (!result?.run || !Array.isArray(result.jobs)) throw new Error("Çalıştırma hizmeti geçersiz yanıt döndürdü.");
    return { blocked: false, response: result as ExecuteResponse };
}

async function executeInBrowser(file: RunFile, stdin: string, onStatus?: (text: string) => void): Promise<Job> {
    const result = await runInBrowser(file.language, file.code, { stdin, onStatus });
    return {
        name: file.name,
        language: file.language,
        version: result.version,
        run: { stdout: result.stdout, stderr: result.stderr, code: result.code, output: result.stdout || result.stderr },
    };
}

/**
 * Runs one or more files. JavaScript, TypeScript, Python, SQL and Lua execute in
 * the visitor's browser; every other language goes to /api/execute (security
 * scan + sandboxed runner). Results keep the order of `files`.
 */
export async function executeProjectSecure(
    files: RunFile[],
    options: { stdin?: string; onStatus?: (text: string) => void } = {},
): Promise<SecureExecuteResult> {
    const stdin = options.stdin ?? "";
    const serverFiles = files.filter((file) => !BROWSER_LANGUAGES.has(file.language));
    const jobs = new Map<RunFile, Job>();
    if (serverFiles.length) {
        const server = await executeOnServer(serverFiles, stdin);
        if (server.blocked) return server;
        const serverJobs = server.response?.jobs ?? [];
        serverFiles.forEach((file, index) => {
            if (serverJobs[index]) jobs.set(file, serverJobs[index]);
        });
    }
    for (const file of files) {
        if (BROWSER_LANGUAGES.has(file.language)) jobs.set(file, await executeInBrowser(file, stdin, options.onStatus));
    }
    const ordered = files.map((file) => jobs.get(file)).filter((job): job is Job => Boolean(job));
    if (!ordered.length) throw new Error("Çalıştırılacak dosya bulunamadı.");
    const first = ordered[0];
    return {
        blocked: false,
        response: { run: first.run, language: first.language, version: first.version, jobs: ordered, project: ordered.length > 1 },
    };
}

export async function executeCodeSecure(
    language: string,
    source: string,
    options: { stdin?: string; onStatus?: (text: string) => void } = {},
): Promise<SecureExecuteResult> {
    return executeProjectSecure([{ name: "main", language, code: source }], options);
}

export async function executeCode(language: string, source: string): Promise<ExecuteResponse> {
    const result = await executeCodeSecure(language, source);
    if (result.blocked) throw new Error("Kod güvenlik ilkeleri nedeniyle engellendi.");
    return result.response!;
}
