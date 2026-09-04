import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/server/active-session";
import { createServerDocument } from "@/lib/server/firebase-rest";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { scanUntrustedCode } from "@/lib/server/security-scanner";

const SUPPORTED_LANGUAGES = new Set([
    "python", "javascript", "typescript", "csharp", "c", "c++", "cpp", "java",
    "php", "go", "swift", "ruby", "rust", "kotlin", "lua", "sql", "sqlite3",
]);
const MAX_CODE_LENGTH = 50_000;
const MAX_PROJECT_LENGTH = 150_000;
const MAX_RUNNABLE_FILES = 8;
const MAX_OUTPUT_LENGTH = 64_000;

type RunFile = { name: string; language: string; code: string };

function cleanOutput(value: unknown) {
    return typeof value === "string" ? value.slice(0, MAX_OUTPUT_LENGTH) : "";
}

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
    const activeSession = await getActiveSession();
    if (!activeSession) return NextResponse.json({ error: "Kod çalıştırmak için etkin bir oturum açın." }, { status: 401 });
    const { email } = activeSession;

    const rate = await enforceRateLimit(`execute:${email}`, 20, 60_000);
    if (!rate.allowed) {
        return NextResponse.json({ error: "Çalıştırma sınırına ulaştınız. Kısa süre sonra tekrar deneyin." }, {
            status: 429,
            headers: jsonSecurityHeaders({ "Retry-After": String(rate.retryAfterSeconds) }),
        });
    }

    const body = await request.json() as { language?: unknown; code?: unknown; files?: unknown };
    const requestedFiles: RunFile[] = Array.isArray(body.files)
        ? body.files.slice(0, MAX_RUNNABLE_FILES + 1).map((value, index) => {
            const file = value && typeof value === "object" ? value as Record<string, unknown> : {};
            const language = typeof file.language === "string" ? file.language.trim().toLowerCase() : "";
            return {
                name: typeof file.name === "string" ? file.name.trim().slice(0, 120) || `file-${index + 1}` : `file-${index + 1}`,
                language,
                code: typeof file.code === "string" ? file.code : "",
            };
        })
        : [{
            name: "main",
            language: typeof body.language === "string" ? body.language.trim().toLowerCase() : "",
            code: typeof body.code === "string" ? body.code : "",
        }];
    if (!requestedFiles.length || requestedFiles.length > MAX_RUNNABLE_FILES) return NextResponse.json({ error: "Tek çalıştırmada 1-8 yürütülebilir dosya kullanılabilir." }, { status: 400 });
    if (requestedFiles.some((file) => !SUPPORTED_LANGUAGES.has(file.language))) return NextResponse.json({ error: "Dosyalardan biri desteklenmeyen programlama dili kullanıyor." }, { status: 400 });
    if (requestedFiles.some((file) => !file.code.trim())) return NextResponse.json({ error: "Çalıştırılacak dosyalar boş olamaz." }, { status: 400 });
    if (requestedFiles.some((file) => file.code.length > MAX_CODE_LENGTH) || requestedFiles.reduce((total, file) => total + file.code.length, 0) > MAX_PROJECT_LENGTH) {
        return NextResponse.json({ error: "Çalıştırma, dosya başına 50.000 ve toplam 150.000 karakter sınırını aşıyor." }, { status: 413 });
    }
    const combinedCode = requestedFiles.map((file) => `// ${file.name} (${file.language})\n${file.code}`).join("\n");

    const scan = scanUntrustedCode(combinedCode);
    if (!scan.allowed) {
        await createServerDocument("security_events", {
            actor: email,
            action: "execution_blocked",
            risk: scan.risk,
            findingIds: scan.findings.map((finding) => finding.id),
            codeHash: scan.codeHash,
            codeLength: combinedCode.length,
            fileCount: requestedFiles.length,
            createdAt: new Date(),
            reviewStatus: "pending",
        }).catch(() => undefined);
        return NextResponse.json({
            error: "Kod, çalıştırma ortamına yönelik yüksek riskli bir işlem içerdiği için engellendi.",
            security: {
                blocked: true,
                risk: scan.risk,
                findings: scan.findings.map(({ id, category, severity, message, line }) => ({ id, category, severity, message, line })),
                appealAvailable: true,
            },
        }, { status: 422, headers: jsonSecurityHeaders() });
    }

    const runnerUrl = process.env.CODE_RUNNER_URL;
    if (!runnerUrl) {
        return NextResponse.json({
            error: "Güvenli kod çalıştırma altyapısı henüz yapılandırılmadı.",
            detail: "Yönetici, izole edilmiş CODE_RUNNER_URL hizmetini tanımlamalıdır.",
        }, { status: 503, headers: jsonSecurityHeaders() });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
        const jobs = await Promise.all(requestedFiles.map(async (file) => {
            const response = await fetch(runnerUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(process.env.CODE_RUNNER_TOKEN ? { Authorization: `Bearer ${process.env.CODE_RUNNER_TOKEN}` } : {}),
                },
                body: JSON.stringify({
                    language: file.language === "sql" ? "sqlite3" : file.language,
                    version: "*",
                    files: [{ name: file.name, content: file.code }],
                    limits: { wallTimeMs: 15_000, outputBytes: MAX_OUTPUT_LENGTH },
                }),
                signal: controller.signal,
                cache: "no-store",
            });
            if (!response.ok) throw new Error("runner_unavailable");
            const result = await response.json() as {
                run?: { stdout?: unknown; stderr?: unknown; output?: unknown; code?: unknown };
                language?: unknown;
                version?: unknown;
            };
            if (!result.run) throw new Error("invalid_runner_response");
            const stdout = cleanOutput(result.run.stdout);
            const stderr = cleanOutput(result.run.stderr);
            return {
                name: file.name,
                language: typeof result.language === "string" ? result.language : file.language,
                version: typeof result.version === "string" ? result.version : "managed",
                run: {
                    stdout,
                    stderr,
                    output: cleanOutput(result.run.output) || stdout || stderr,
                    code: Number.isInteger(result.run.code) ? result.run.code : 1,
                },
            };
        }));
        const first = jobs[0];
        return NextResponse.json({
            run: first.run,
            language: first.language,
            version: first.version,
            jobs,
            project: jobs.length > 1,
            security: { blocked: false, risk: scan.risk },
        }, { headers: jsonSecurityHeaders({ "X-RateLimit-Remaining": String(rate.remaining) }) });
    } catch (error) {
        const timedOut = error instanceof Error && error.name === "AbortError";
        return NextResponse.json({ error: timedOut ? "Kod çalıştırma zaman aşımına uğradı." : "Kod çalıştırma hizmeti şu anda kullanılamıyor." }, {
            status: timedOut ? 504 : 503,
            headers: jsonSecurityHeaders(),
        });
    } finally {
        clearTimeout(timeout);
    }
}
