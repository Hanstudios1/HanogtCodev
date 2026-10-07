import { after, NextRequest, NextResponse } from "next/server";
import { PLAN_RUN_LIMITS, PLAN_RUN_SIZES, RUN_FILES_PER_REQUEST } from "@/lib/plans";
import { normalizeLanguageId } from "@/lib/runtimes/languages";
import { RunnerError, SERVER_LANGUAGES, runFiles, runnerName, type RunFile } from "@/lib/server/code-runner";
import { createServerDocument, getServerDocument, isFirebaseServerConfigured } from "@/lib/server/firebase-rest";
import { memoryRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { checkRunSize, enforceRunQuota } from "@/lib/server/run-limits";
import { scanUntrustedCode } from "@/lib/server/security-scanner";
import { getSignedInSession } from "@/lib/server/active-session";

// Compiling on the public runner can take a while (Rust, Swift, Haskell).
export const maxDuration = 60;

/** Files one request runs; the editor splits a bigger run (up to the plan's PLAN_RUN_LIMITS) into several requests. */
const MAX_RUNNABLE_FILES = RUN_FILES_PER_REQUEST;
/** Sizes are the plan's (PLAN_RUN_SIZES); a request bigger than any plan allows is refused before anything is read. */
const ANY_PLAN_SIZES = PLAN_RUN_SIZES.pro;
const count = (value: number) => value.toLocaleString("tr-TR");
/** Requests a minute from one person on one server instance, before anything is read: the plan's file count is the real limit. */
const REQUESTS_PER_MINUTE = Math.ceil(Math.max(...Object.values(PLAN_RUN_LIMITS).map((limits) => limits.perMinute)) / 2);

type ErrorCode =
    | "auth_required" | "suspended" | "rate_limited" | "invalid_request" | "unsupported_language"
    | "too_large" | "empty_file" | "timeout" | "unavailable" | "no_compiler" | "invalid_origin" | "security_blocked";

/** `code` is stable and machine-readable so the editor can show a translated message. */
function fail(error: string, status: number, code: ErrorCode, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
    return NextResponse.json({ error, code, ...extra }, { status, headers: jsonSecurityHeaders(headers) });
}

/** Ids, aliases and extensions ("c++", "py", "golang") become registry ids (src/lib/runtimes/languages.ts). */
function normalizeLanguage(value: unknown) {
    const raw = typeof value === "string" ? value.trim().toLowerCase().slice(0, 40) : "";
    return normalizeLanguageId(raw) ?? raw;
}

/**
 * Who is running code. The signed NextAuth session proves the identity; when
 * Firebase is configured the profile is also checked for bans. A database
 * outage must not stop everyone from coding, so it only skips the ban check.
 */
async function resolveRunner(): Promise<{ email: string } | { error: string; status: number; code: ErrorCode }> {
    const session = await getSignedInSession();
    const email = session?.user?.email?.toLowerCase();
    if (!email) {
        return { error: "Derlenen dilleri (C, C++, Java, Go…) çalıştırmak için giriş yapın. JavaScript, TypeScript, Python, SQL, Lua, Prolog, BASIC, Forth, MIPS gibi tarayıcı dilleri ve dosya doğrulayıcıları girişsiz de çalışır.", status: 401, code: "auth_required" };
    }
    if (!isFirebaseServerConfigured()) return { email };
    try {
        const user = await getServerDocument<{ banned?: boolean; suspended?: boolean }>(`users/${email}`);
        if (!user) return { error: "Hesap profiliniz bulunamadı. Çıkış yapıp yeniden giriş yapın.", status: 401, code: "auth_required" };
        if (user.banned || user.suspended) return { error: "Hesabınız askıya alındığı için kod çalıştıramazsınız.", status: 403, code: "suspended" };
    } catch (error) {
        console.warn("[execute] profile check skipped:", error instanceof Error ? error.message : error);
    }
    return { email };
}

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return fail("Geçersiz istek kaynağı.", 403, "invalid_origin");
    const runner = await resolveRunner();
    if ("error" in runner) return fail(runner.error, runner.status, runner.code);
    const { email } = runner;

    // A cheap guard against floods; the plan's files a minute are counted once the request is known to be valid.
    const burst = memoryRateLimit(`execute:${email}`, REQUESTS_PER_MINUTE, 60_000);
    if (!burst.allowed) {
        return fail("Çok sık çalıştırma isteği gönderildi. Kısa süre sonra tekrar deneyin.", 429, "rate_limited", {}, { "Retry-After": String(burst.retryAfterSeconds) });
    }

    let body: { language?: unknown; code?: unknown; files?: unknown; stdin?: unknown };
    try {
        body = await request.json();
    } catch {
        return fail("İstek gövdesi geçerli JSON değil.", 400, "invalid_request");
    }
    const requestedFiles: RunFile[] = Array.isArray(body.files)
        ? body.files.slice(0, MAX_RUNNABLE_FILES + 1).map((value, index) => {
            const file = value && typeof value === "object" ? value as Record<string, unknown> : {};
            return {
                name: typeof file.name === "string" ? file.name.trim().slice(0, 120) || `file-${index + 1}` : `file-${index + 1}`,
                language: normalizeLanguage(file.language),
                code: typeof file.code === "string" ? file.code : "",
            };
        })
        : [{ name: "main", language: normalizeLanguage(body.language), code: typeof body.code === "string" ? body.code : "" }];
    const stdin = typeof body.stdin === "string" ? body.stdin : "";

    if (!requestedFiles.length || requestedFiles.length > MAX_RUNNABLE_FILES) return fail(`Bir istekte 1-${MAX_RUNNABLE_FILES} yürütülebilir dosya gönderilebilir.`, 400, "invalid_request");
    const unsupported = requestedFiles.find((file) => !SERVER_LANGUAGES.has(file.language));
    if (unsupported) return fail(`"${unsupported.language || "?"}" dili çalıştırılamıyor.`, 400, "unsupported_language", { language: unsupported.language.slice(0, 40) });
    if (requestedFiles.some((file) => !file.code.trim())) return fail("Çalıştırılacak dosyalar boş olamaz.", 400, "empty_file");
    // How big a run may be is the plan's: Free 50,000 characters a file, 150,000 a request and 10,000 of input; Plus and Pro more.
    const fileChars = requestedFiles.map((file) => file.code.length);
    const onLate = (work: Promise<unknown>) => after(() => work.then(() => undefined, () => undefined));
    const tooBigForAnyPlan = fileChars.some((chars) => chars > ANY_PLAN_SIZES.fileChars) || fileChars.reduce((total, chars) => total + chars, 0) > ANY_PLAN_SIZES.requestChars || stdin.length > ANY_PLAN_SIZES.stdinChars;
    const size = tooBigForAnyPlan ? null : await checkRunSize(email, fileChars, stdin.length, { onLate });
    if (!size || !size.ok) {
        // Bigger than every plan allows: the largest sizes are shown (largest: true) and no plan is read.
        const sizes = size?.sizes ?? ANY_PLAN_SIZES;
        return fail(
            `${size ? "Çalıştırma, planınızın sınırını aşıyor" : "Çalıştırma, en büyük planın sınırını da aşıyor"}: dosya başına ${count(sizes.fileChars)}, toplam ${count(sizes.requestChars)} karakter ve ${count(sizes.stdinChars)} karakter girdi.`,
            413,
            "too_large",
            { sizes: { fileChars: sizes.fileChars, requestChars: sizes.requestChars, stdinChars: sizes.stdinChars }, ...(size ? { plan: size.plan, upgrade: size.upgrade } : { upgrade: null, largest: true }) },
        );
    }

    // Every file counts in the plan's minute (Free 40, Plus 150, Pro 400 files); a purchase Paddle hasn't reported is looked up first.
    const quota = await enforceRunQuota(email, requestedFiles.length, { subscription: size.subscription, onLate });
    if (!quota.allowed) {
        return fail(`Planınızın çalıştırma sınırına ulaştınız (dakikada ${quota.limit} dosya). Kısa süre sonra tekrar deneyin.`, 429, "rate_limited", { limit: quota.limit, plan: quota.plan, upgrade: quota.upgrade }, { "Retry-After": String(quota.retryAfterSeconds) });
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
        return fail("Kod, çalıştırma ortamına yönelik yüksek riskli bir işlem içerdiği için engellendi.", 422, "security_blocked", {
            security: {
                blocked: true,
                risk: scan.risk,
                findings: scan.findings.map(({ id, category, severity, message, line }) => ({ id, category, severity, message, line })),
                appealAvailable: true,
            },
        });
    }

    try {
        const jobs = await runFiles(requestedFiles, stdin, { outputChars: size.sizes.outputChars });
        const first = jobs[0];
        return NextResponse.json({
            run: first.run,
            language: first.language,
            version: first.version,
            jobs,
            project: jobs.length > 1,
            security: { blocked: false, risk: scan.risk },
        }, { headers: jsonSecurityHeaders({ "X-RateLimit-Limit": String(quota.limit), "X-RateLimit-Remaining": String(quota.remaining) }) });
    } catch (error) {
        if (error instanceof RunnerError) return fail(error.message, 400, "no_compiler");
        const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
        console.error(`[execute] ${runnerName()} runner failed:`, error);
        return fail(
            timedOut
                ? "Kod çalıştırma zaman aşımına uğradı (25 sn). Sonsuz döngü olmadığından emin olup tekrar deneyin."
                : "Kod çalıştırma hizmetine şu anda ulaşılamıyor. Biraz sonra tekrar deneyin.",
            // 503 for both (the code tells them apart): Cloudflare replaces 504 answers with its own page.
            503,
            timedOut ? "timeout" : "unavailable",
        );
    }
}
