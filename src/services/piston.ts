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

export async function executeCodeSecure(language: string, source: string): Promise<SecureExecuteResult> {
    const response = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, code: source }),
    });
    const result = await response.json();
    if (response.status === 422 && result.security?.blocked) {
        return { blocked: true, securityCheck: result.security };
    }
    if (!response.ok) throw new Error(result.error || `Çalıştırma hatası (${response.status})`);
    if (!result?.run) throw new Error("Çalıştırma hizmeti geçersiz yanıt döndürdü.");
    return { blocked: false, response: result as ExecuteResponse };
}

export async function executeProjectSecure(files: Array<{ name: string; language: string; code: string }>): Promise<SecureExecuteResult> {
    const response = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
    });
    const result = await response.json();
    if (response.status === 422 && result.security?.blocked) return { blocked: true, securityCheck: result.security };
    if (!response.ok) throw new Error(result.error || `Çalıştırma hatası (${response.status})`);
    if (!result?.run || !Array.isArray(result.jobs)) throw new Error("Proje çalıştırıcısı geçersiz yanıt döndürdü.");
    return { blocked: false, response: result as ExecuteResponse };
}

export async function executeCode(language: string, source: string): Promise<ExecuteResponse> {
    const result = await executeCodeSecure(language, source);
    if (result.blocked) throw new Error("Kod güvenlik ilkeleri nedeniyle engellendi.");
    return result.response!;
}
