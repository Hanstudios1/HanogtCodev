import "server-only";

import { createHash } from "node:crypto";

export type SecurityFinding = {
    id: string;
    category: "destructive" | "resource_abuse" | "remote_access" | "credential_access" | "obfuscation" | "container_escape" | "cryptomining";
    severity: "medium" | "high" | "critical";
    message: string;
    line?: number;
};

export type SecurityScanResult = {
    allowed: boolean;
    risk: "low" | "medium" | "high" | "critical";
    findings: SecurityFinding[];
    codeHash: string;
};

type Rule = SecurityFinding & { pattern: RegExp };

// These signatures target high-confidence abuse of an execution service. They
// are a guardrail, not a sandbox and not a malware verdict.
const RULES: Rule[] = [
    {
        id: "destructive-root-delete",
        category: "destructive",
        severity: "critical",
        message: "Kök veya geniş bir dizini geri döndürülemez biçimde silme girişimi algılandı.",
        pattern: /(?:rm\s+-[^\n]*r[^\n]*f[^\n]*(?:\/|--no-preserve-root)|(?:format|mkfs(?:\.[a-z0-9]+)?)\s+(?:[a-z]:|\/dev\/)|shutil\.rmtree\s*\(\s*["']\/["'])/i,
    },
    {
        id: "fork-bomb",
        category: "resource_abuse",
        severity: "critical",
        message: "İşlem çoğaltarak kaynak tüketmeye yönelik bilinen bir imza algılandı.",
        pattern: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;?\s*:|%0\s*\|\s*%0/i,
    },
    {
        id: "reverse-shell",
        category: "remote_access",
        severity: "critical",
        message: "Ters kabuk veya uzak komut kanalı oluşturmaya yönelik imza algılandı.",
        pattern: /(?:bash\s+-i\s+>&\s*\/dev\/tcp\/|nc(?:at)?\s+[^\n]*(?:-e\s+|--exec)|socket\.[^\n]{0,180}dup2[^\n]{0,180}(?:\/bin\/sh|cmd\.exe)|powershell[^\n]{0,240}(?:downloadstring|iex\s*\())/i,
    },
    {
        id: "download-and-execute",
        category: "remote_access",
        severity: "high",
        message: "Uzak içeriği doğrudan komut yorumlayıcısına aktaran zincir algılandı.",
        pattern: /(?:curl|wget|invoke-webrequest)[^\n|;]{0,400}(?:\||;)\s*(?:sh|bash|zsh|powershell|cmd)/i,
    },
    {
        id: "credential-harvesting",
        category: "credential_access",
        severity: "high",
        message: "Kimlik bilgisi dosyalarını toplama ve dışarı aktarma zinciri algılandı.",
        pattern: /(?:\.ssh[\\/](?:id_rsa|id_ed25519)|\.aws[\\/]credentials|login data|keychain)[^\n]{0,500}(?:requests?\.(?:post|put)|fetch\s*\(|curl\s+)/i,
    },
    {
        id: "encoded-execution",
        category: "obfuscation",
        severity: "high",
        message: "Kodlanmış içeriği çözerek dinamik biçimde çalıştıran zincir algılandı.",
        pattern: /(?:(?:atob|frombase64string|b64decode)\s*\([^)]{1,400}\)[^\n]{0,300}(?:eval|exec|invoke-expression)|(?:eval|exec|invoke-expression)\s*\([^\n]{0,300}(?:atob|frombase64string|b64decode))/i,
    },
    {
        id: "container-control-socket",
        category: "container_escape",
        severity: "critical",
        message: "Konteyner denetim soketine veya ana makine köküne erişme girişimi algılandı.",
        pattern: /(?:\/var\/run\/docker\.sock|\/proc\/1\/root|nsenter\s+[^\n]*(?:--mount|-m)|docker\s+run\s+[^\n]*(?:--privileged|-v\s*\/:))/i,
    },
    {
        id: "cloud-metadata-credential-access",
        category: "credential_access",
        severity: "high",
        message: "Bulut örnek kimlik bilgisi uç noktasına erişim girişimi algılandı.",
        pattern: /(?:169\.254\.169\.254|metadata\.google\.internal)[^\n]{0,220}(?:security-credentials|service-accounts|metadata\/identity)/i,
    },
    {
        id: "cryptomining-protocol",
        category: "cryptomining",
        severity: "high",
        message: "Kripto para madenciliği protokolü veya bilinen madenci çalıştırma imzası algılandı.",
        pattern: /(?:stratum\+(?:tcp|ssl):\/\/|\bxmrig\b|\bminerd\b[^\n]{0,120}(?:-o|--url))/i,
    },
];

function riskFor(findings: SecurityFinding[]): SecurityScanResult["risk"] {
    if (findings.some((finding) => finding.severity === "critical")) return "critical";
    if (findings.some((finding) => finding.severity === "high")) return "high";
    if (findings.length) return "medium";
    return "low";
}

export function scanUntrustedCode(code: string): SecurityScanResult {
    const normalized = code.normalize("NFKC").replace(/[\u200B-\u200F\u2060\uFEFF]/g, "");
    const findings: SecurityFinding[] = [];
    for (const rule of RULES) {
        const match = rule.pattern.exec(normalized);
        if (!match) continue;
        findings.push({
            id: rule.id,
            category: rule.category,
            severity: rule.severity,
            message: rule.message,
            line: normalized.slice(0, match.index).split("\n").length,
        });
    }

    // Compound signals reduce easy signature splitting: neither primitive is
    // blocked alone, but decoding + dynamic execution or process spawn + a
    // network downloader is high-confidence abuse in an online runner.
    const hasDecoder = /(?:atob|frombase64string|b64decode|base64\s+-d)/i.test(normalized);
    const hasDynamicExecution = /(?:\beval\s*\(|\bexec\s*\(|invoke-expression|new\s+Function\s*\()/i.test(normalized);
    const hasLargeEncodedBlob = /[A-Za-z0-9+/]{1800,}={0,2}/.test(normalized);
    if (hasDynamicExecution && (hasDecoder || hasLargeEncodedBlob) && !findings.some((finding) => finding.id === "encoded-execution")) {
        findings.push({ id: "compound-obfuscated-execution", category: "obfuscation", severity: "high", message: "Kod çözme veya uzun kodlanmış veri ile dinamik çalıştırma birlikte algılandı." });
    }
    const hasProcessSpawn = /(?:child_process|subprocess\.(?:run|popen|call)|processbuilder|system\.diagnostics\.process|os\.system)/i.test(normalized);
    const hasNetworkFetch = /(?:curl|wget|invoke-webrequest|requests?\.(?:get|post)|https?\.get|fetch\s*\()/i.test(normalized);
    if (hasProcessSpawn && hasNetworkFetch) {
        findings.push({ id: "network-process-chain", category: "remote_access", severity: "high", message: "Ağdan veri alma ile işletim sistemi süreci başlatma davranışları birlikte algılandı." });
    }
    const risk = riskFor(findings);
    return {
        allowed: risk !== "critical" && risk !== "high",
        risk,
        findings,
        codeHash: createHash("sha256").update(code).digest("hex"),
    };
}
