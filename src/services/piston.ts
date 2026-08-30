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

// Primary and fallback Piston API endpoints
const PISTON_APIS = [
    "https://emkc.org/api/v2/piston/execute",
    "https://piston.e2b.dev/api/v2/execute",
];

/**
 * Normalize any language identifier to the Piston API language name.
 * Handles: file extensions (py, js, cpp, cs, rb, rs, kt, ts),
 *          display names (C++, CSharp, JavaScript),
 *          and internal keys (python, javascript, cpp, csharp)
 */
const normalizeToPiston = (language: string): string | null => {
    const lower = language.toLowerCase().trim();

    // Comprehensive mapping: all possible input forms → Piston language name
    const langMap: Record<string, string> = {
        // Python
        python: "python", py: "python", python3: "python",
        // JavaScript
        javascript: "javascript", js: "javascript",
        // TypeScript
        typescript: "typescript", ts: "typescript",
        // C#
        csharp: "csharp", cs: "csharp", "c#": "csharp", "csharp.net": "csharp.net",
        // C
        c: "c",
        // C++
        "c++": "c++", cpp: "c++", "g++": "c++",
        // Java
        java: "java",
        // PHP
        php: "php",
        // Go
        go: "go", golang: "go",
        // Swift
        swift: "swift",
        // Ruby
        ruby: "ruby", rb: "ruby",
        // Rust
        rust: "rust", rs: "rust",
        // Kotlin
        kotlin: "kotlin", kt: "kotlin",
        // Lua
        lua: "lua",
        // SQL
        sql: "sqlite3", sqlite: "sqlite3", sqlite3: "sqlite3",
    };

    return langMap[lower] || null;
};

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
    // Handle browser-only languages
    if (language === 'html' || language === 'htm') {
        return { run: { stdout: "HTML is running in browser preview mode.", stderr: "", code: 0, output: "HTML Preview Active" }, language: "html", version: "5" };
    }
    if (language === 'css') {
        return { run: { stdout: "CSS is a styling language. Use it with HTML.", stderr: "", code: 0, output: "CSS Preview Mode" }, language: "css", version: "3" };
    }

    const pistonLang = normalizeToPiston(language);
    if (!pistonLang) throw new Error(`"${language}" dili desteklenmiyor. Desteklenen diller: Python, JavaScript, TypeScript, C++, C#, Java, PHP, Go, Swift, Ruby, Rust, Kotlin, Lua, SQL`);

    // Try each API endpoint in order
    let lastError: Error | null = null;

    for (const apiUrl of PISTON_APIS) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

            const response = await fetch(apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    language: pistonLang,
                    version: "*",
                    files: [{ content: source }]
                }),
                signal: controller.signal,
            });

            clearTimeout(timeout);

            if (!response.ok) {
                const errorBody = await response.text().catch(() => "");
                // If whitelist/auth error, try next endpoint
                if (response.status === 403 || response.status === 401) {
                    lastError = new Error(`API erişim hatası (${response.status})`);
                    continue;
                }
                throw new Error(`Çalıştırma hatası (${response.status}): ${response.statusText}${errorBody ? ` - ${errorBody}` : ""}`);
            }

            const result = await response.json();

            // Validate response structure
            if (!result.run) {
                throw new Error("API geçersiz yanıt döndü");
            }

            return result;
        } catch (error: any) {
            if (error.name === 'AbortError') {
                lastError = new Error("Kod çalıştırma zaman aşımına uğradı (30 saniye). Lütfen kodunuzu kontrol edip tekrar deneyin.");
                continue;
            }
            lastError = error;
            // If it's a network error (like API being down), try next endpoint
            if (error.message?.includes("fetch") || error.message?.includes("network") || error.message?.includes("API erişim")) {
                continue;
            }
            // For other errors, throw immediately
            throw error;
        }
    }

    // All endpoints failed
    throw lastError || new Error("Kod çalıştırma servisi şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.");
};
