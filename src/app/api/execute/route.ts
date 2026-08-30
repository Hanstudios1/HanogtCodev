import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side code execution proxy.
 * Tries multiple Piston-compatible backends and Wandbox as fallback.
 * This avoids CORS issues and handles API failures gracefully.
 */

interface ExecuteRequest {
    language: string;
    code: string;
}

interface ExecuteResult {
    stdout: string;
    stderr: string;
    code: number;
    output: string;
    language: string;
    version: string;
}

// Piston-compatible API endpoints (tried in order)
const PISTON_ENDPOINTS = [
    "https://emkc.org/api/v2/piston/execute",
];

// Language mapping for Piston API
const PISTON_LANG_MAP: Record<string, string> = {
    python: "python", py: "python",
    javascript: "javascript", js: "javascript",
    typescript: "typescript", ts: "typescript",
    csharp: "csharp", cs: "csharp", "c#": "csharp",
    c: "c",
    "c++": "c++", cpp: "c++",
    java: "java",
    php: "php",
    go: "go",
    swift: "swift",
    ruby: "ruby", rb: "ruby",
    rust: "rust", rs: "rust",
    kotlin: "kotlin", kt: "kotlin",
    lua: "lua",
    sql: "sqlite3", sqlite3: "sqlite3",
};

// Wandbox compiler mapping
const WANDBOX_COMPILERS: Record<string, string> = {
    python: "cpython-3.12.0",
    javascript: "nodejs-20.11.0",
    typescript: "typescript-5.3.3",
    cpp: "gcc-13.2.0",
    "c++": "gcc-13.2.0",
    c: "gcc-13.2.0",
    csharp: "mono-6.12.0.200",
    ruby: "ruby-3.3.0",
    rust: "rust-1.75.0",
    go: "go-1.21.5",
    lua: "lua-5.4.6",
    java: "openjdk-jdk-21+35",
    swift: "swift-5.9.2",
    php: "php-8.3.1",
    kotlin: "kotlin-1.9.22",
};

// File name mapping for Wandbox (some compilers need specific file names)
const WANDBOX_FILENAMES: Record<string, string> = {
    java: "Main.java",
    kotlin: "main.kt",
    csharp: "prog.cs",
};

/**
 * Try executing code via a Piston-compatible API endpoint
 */
async function tryPiston(language: string, code: string): Promise<ExecuteResult | null> {
    const pistonLang = PISTON_LANG_MAP[language.toLowerCase()];
    if (!pistonLang) return null;

    for (const endpoint of PISTON_ENDPOINTS) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);

            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    language: pistonLang,
                    version: "*",
                    files: [{ content: code }],
                }),
                signal: controller.signal,
            });

            clearTimeout(timeout);

            if (response.status === 403 || response.status === 401) {
                continue; // Whitelist error, try next
            }

            if (!response.ok) {
                continue; // Try next endpoint
            }

            const result = await response.json();
            if (result?.run) {
                return {
                    stdout: result.run.stdout || "",
                    stderr: result.run.stderr || "",
                    code: result.run.code ?? 0,
                    output: result.run.output || "",
                    language: result.language || language,
                    version: result.version || "unknown",
                };
            }
        } catch {
            continue; // Network error, try next
        }
    }

    return null;
}

/**
 * Try executing code via Wandbox API
 */
async function tryWandbox(language: string, code: string): Promise<ExecuteResult | null> {
    const langLower = language.toLowerCase();
    const compiler = WANDBOX_COMPILERS[langLower];
    if (!compiler) return null;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const body: Record<string, string> = {
            code,
            compiler,
            options: "",
            stdin: "",
        };

        // Some languages need specific file names
        const filename = WANDBOX_FILENAMES[langLower];
        if (filename) {
            body["filename"] = filename;
        }

        // C++ specific options
        if (langLower === "cpp" || langLower === "c++") {
            body["options"] = "warning,gnu++2b";
        }

        const response = await fetch("https://wandbox.org/api/compile.json", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) return null;

        const result = await response.json();

        const stdout = result.program_message || "";
        const stderr = result.compiler_message || "";
        const exitCode = parseInt(result.status || "0", 10);

        return {
            stdout,
            stderr,
            code: exitCode,
            output: stdout || stderr,
            language,
            version: compiler,
        };
    } catch {
        return null;
    }
}

export async function POST(request: NextRequest) {
    try {
        const body: ExecuteRequest = await request.json();
        const { language, code } = body;

        if (!language || !code) {
            return NextResponse.json(
                { error: "Dil ve kod parametreleri gereklidir." },
                { status: 400 }
            );
        }

        // HTML/CSS are client-side only
        const langLower = language.toLowerCase();
        if (langLower === "html" || langLower === "css") {
            return NextResponse.json({
                run: {
                    stdout: langLower === "html"
                        ? "HTML tarayıcı önizleme modunda çalışıyor."
                        : "CSS bir stil dilidir. HTML ile birlikte kullanın.",
                    stderr: "",
                    code: 0,
                    output: "",
                },
                language: langLower,
                version: langLower === "html" ? "5" : "3",
            });
        }

        // Try Piston first
        const pistonResult = await tryPiston(langLower, code);
        if (pistonResult) {
            return NextResponse.json({
                run: {
                    stdout: pistonResult.stdout,
                    stderr: pistonResult.stderr,
                    code: pistonResult.code,
                    output: pistonResult.output,
                },
                language: pistonResult.language,
                version: pistonResult.version,
            });
        }

        // Fallback: Try Wandbox
        const wandboxResult = await tryWandbox(langLower, code);
        if (wandboxResult) {
            return NextResponse.json({
                run: {
                    stdout: wandboxResult.stdout,
                    stderr: wandboxResult.stderr,
                    code: wandboxResult.code,
                    output: wandboxResult.output,
                },
                language: wandboxResult.language,
                version: wandboxResult.version,
            });
        }

        // All backends failed
        return NextResponse.json(
            {
                error: "Kod çalıştırma servisi şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.",
                run: {
                    stdout: "",
                    stderr: "Tüm kod çalıştırma servisleri şu anda yanıt vermiyor. Lütfen birkaç dakika sonra tekrar deneyin.",
                    code: 1,
                    output: "",
                },
                language,
                version: "N/A",
            },
            { status: 503 }
        );
    } catch (error: any) {
        return NextResponse.json(
            {
                error: error?.message || "Bilinmeyen bir hata oluştu.",
                run: {
                    stdout: "",
                    stderr: error?.message || "Bilinmeyen hata",
                    code: 1,
                    output: "",
                },
                language: "unknown",
                version: "N/A",
            },
            { status: 500 }
        );
    }
}
