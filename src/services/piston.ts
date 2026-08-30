import { checkMaliciousCode, analyzeCodeBehavior, SecurityCheckResult } from "@/lib/hanogtBot";

export interface ExecuteResponse {
    run: { stdout: string; stderr: string; code: number; output: string; };
    language: string;
    version: string;
}

export interface SecureExecuteResult {
    response?: ExecuteResponse;
    blocked: boolean;
    securityCheck?: SecurityCheckResult;
    behaviorWarnings?: string[];
}

/**
 * Execute code with full security scan (no rate limit, no code size limit)
 * Malicious code = blocked + auto ban
 */
export const executeCodeSecure = async (
    language: string,
    source: string,
    userEmail?: string
): Promise<SecureExecuteResult> => {
    // Full security check: pattern matching + deobfuscation + behavioral analysis
    const securityCheck = checkMaliciousCode(source);
    const behavior = analyzeCodeBehavior(source);

    if (securityCheck.isMalicious) {
        return {
            blocked: true,
            securityCheck,
            behaviorWarnings: behavior.reasons,
        };
    }

    // If behavioral warnings exist but not blocked, log them
    const response = await executeCode(language, source);
    return {
        response,
        blocked: false,
        behaviorWarnings: behavior.suspicious ? behavior.reasons : undefined,
    };
};

export const executeCode = async (language: string, source: string): Promise<ExecuteResponse> => {
    // Handle browser-only languages client-side
    if (language === 'html' || language === 'htm') {
        return { run: { stdout: "HTML tarayıcı önizleme modunda çalışıyor.", stderr: "", code: 0, output: "HTML Preview Active" }, language: "html", version: "5" };
    }
    if (language === 'css') {
        return { run: { stdout: "CSS bir stil dilidir. HTML ile birlikte kullanın.", stderr: "", code: 0, output: "CSS Preview Mode" }, language: "css", version: "3" };
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 35000); // 35s timeout

        // Call our own Next.js API route — handles Piston + fallbacks server-side
        const response = await fetch("/api/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ language, code: source }),
            signal: controller.signal,
        });

        clearTimeout(timeout);

        const result = await response.json();

        if (!response.ok) {
            // API returned an error but with structured data
            if (result?.run) {
                return result as ExecuteResponse;
            }
            throw new Error(result?.error || `Çalıştırma hatası (${response.status})`);
        }

        // Validate response structure
        if (!result?.run) {
            throw new Error("API geçersiz yanıt döndü");
        }

        return result as ExecuteResponse;
    } catch (error: any) {
        if (error.name === 'AbortError') {
            throw new Error("Kod çalıştırma zaman aşımına uğradı (35 saniye). Lütfen kodunuzu kontrol edip tekrar deneyin.");
        }
        throw error;
    }
};
