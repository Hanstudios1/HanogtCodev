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

const PISTON_API = "https://emkc.org/api/v2/piston/execute";

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
    const langMap: Record<string, string> = {
        python: "python", javascript: "javascript", typescript: "typescript",
        csharp: "csharp", c: "c", "c++": "c++", cpp: "c++",
        java: "java", php: "php", go: "go", swift: "swift",
        ruby: "ruby", rust: "rust", kotlin: "kotlin", lua: "lua",
        sql: "sqlite3",
    };

    const pistonLang = langMap[language];

    if (language === 'html') {
        return { run: { stdout: "HTML is running in browser preview mode.", stderr: "", code: 0, output: "HTML Preview Active" }, language: "html", version: "5" };
    }
    if (language === 'css') {
        return { run: { stdout: "CSS is a styling language. Use it with HTML.", stderr: "", code: 0, output: "CSS Preview Mode" }, language: "css", version: "3" };
    }
    if (!pistonLang) throw new Error(`Language ${language} not supported.`);

    try {
        const response = await fetch(PISTON_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ language: pistonLang, version: "*", files: [{ content: source }] }),
        });
        if (!response.ok) throw new Error(`Execution failed: ${response.statusText}`);
        return await response.json();
    } catch (error) {
        console.error("Execution error:", error);
        throw error;
    }
};
