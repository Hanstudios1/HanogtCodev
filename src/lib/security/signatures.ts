/**
 * High-confidence abuse signatures for the online code runner, Media posts and Arcade publishing.
 * Shared by the server guard (which blocks) and the in-browser Security Advisor (which only informs).
 * They are a guardrail, not a sandbox and not a malware verdict.
 */

export type SignatureCategory =
    | "destructive" | "resource_abuse" | "remote_access" | "credential_access" | "obfuscation" | "container_escape"
    | "cryptomining" | "privilege_escalation" | "surveillance" | "defense_evasion";

export interface SignatureFinding {
    id: string;
    category: SignatureCategory;
    severity: "medium" | "high" | "critical";
    message: string;
    line?: number;
}

type SignatureRule = Omit<SignatureFinding, "line"> & { pattern: RegExp };

export const SIGNATURE_RULES: SignatureRule[] = [
    {
        id: "destructive-root-delete",
        category: "destructive",
        severity: "critical",
        message: "Kök veya geniş bir dizini geri döndürülemez biçimde silme girişimi algılandı.",
        // The delete target must be a root: "/", a bare top-level system dir,
        // ~ or $HOME, or --no-preserve-root. An earlier version matched any "rm
        // -rf" whose path merely contained a slash, so "rm -rf ./node_modules"
        // and "rm -rf build/" (the most common cleanup commands) were blocked.
        pattern: /(?:\brm\s+(?:-{1,2}[\w-]+\s+)*(?:--no-preserve-root|\/(?:\s|$|\*)|\/(?:etc|usr|bin|boot|lib|lib64|sbin|var|home|root|sys|proc|dev)(?:\s|$|\/\*|\/(?=\s|$))|~\/?(?:\s|$|\*)|\$\{?HOME\}?(?:\s|$|\/\*))|(?:format|mkfs(?:\.[a-z0-9]+)?)\s+(?:[a-z]:|\/dev\/)|shutil\.rmtree\s*\(\s*["']\/["']|del\s+\/[sfq]\s+[^\n]*[a-z]:\\\s*(?:\*|$)|rd\s+\/s\s+\/q\s+[a-z]:\\)/i,
    },
    {
        id: "disk-wipe",
        category: "destructive",
        severity: "critical",
        message: "Disk veya bölümün üzerine veri yazarak silme girişimi algılandı.",
        pattern: /\bdd\s+[^\n]*if=\/dev\/(?:zero|urandom|random)[^\n]*of=\/dev\/(?:sd|nvme|hd|xvd|vd)[a-z0-9]*/i,
    },
    {
        id: "fork-bomb",
        category: "resource_abuse",
        severity: "critical",
        message: "İşlem çoğaltarak kaynak tüketmeye yönelik bilinen bir imza algılandı.",
        pattern: /(?::\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;?\s*:|%0\s*\|\s*%0|while\s*\(\s*(?:1|true)\s*\)\s*\{?\s*fork\s*\(\s*\)|for\s*\(\s*;\s*;\s*\)\s*\{?\s*fork\s*\(\s*\)|while\s+True\s*:\s*\n?\s*os\.fork\s*\(\s*\))/i,
    },
    {
        id: "network-flood",
        category: "resource_abuse",
        severity: "high",
        message: "Bilinen bir ağ taşkını (DoS) aracı veya saldırı imzası algılandı.",
        pattern: /(?:hping3\s+[^\n]*--flood|\bslowloris\.py\b|\bimport\s+slowloris\b)/i,
    },
    {
        id: "reverse-shell",
        category: "remote_access",
        severity: "critical",
        message: "Ters kabuk veya uzak komut kanalı oluşturmaya yönelik imza algılandı.",
        pattern: /(?:bash\s+-i\s+>&\s*\/dev\/tcp\/|nc(?:at)?\s+[^\n]*(?:-e\s+|--exec)|socket\.[^\n]{0,180}dup2[^\n]{0,180}(?:\/bin\/sh|cmd\.exe)|powershell[^\n]{0,240}(?:downloadstring|iex\s*\()|\/bin\/sh\s+-i\s*[<>]&?\s*\/dev\/tcp)/i,
    },
    {
        id: "download-and-execute",
        category: "remote_access",
        severity: "high",
        message: "Uzak içeriği doğrudan komut yorumlayıcısına aktaran zincir algılandı.",
        pattern: /(?:curl|wget|invoke-webrequest)[^\n|;]{0,400}(?:\||;)\s*(?:sh|bash|zsh|powershell|cmd)\b/i,
    },
    {
        id: "credential-harvesting",
        category: "credential_access",
        severity: "high",
        message: "Kimlik bilgisi dosyalarını toplama ve dışarı aktarma zinciri algılandı.",
        pattern: /(?:\.ssh[\\/](?:id_rsa|id_ed25519)|\.aws[\\/]credentials|login data|keychain)[^\n]{0,500}(?:requests?\.(?:post|put)|fetch\s*\(|curl\s+)/i,
    },
    {
        id: "browser-token-stealer",
        category: "credential_access",
        severity: "critical",
        message: "Tarayıcı veya Discord/Telegram oturum verilerini toplayıp webhook'a gönderen hırsız deseni algılandı.",
        pattern: /(?:(?:Local Storage[\\/]+leveldb|Login Data|Cookies|CryptUnprotectData|tdata)[\s\S]{0,1500}(?:discord(?:app)?\.com\/api\/webhooks|api\.telegram\.org\/bot)|(?:discord(?:app)?\.com\/api\/webhooks|api\.telegram\.org\/bot)[\s\S]{0,1500}(?:Local Storage[\\/]+leveldb|Login Data|CryptUnprotectData|tdata))/i,
    },
    {
        id: "shadow-file-access",
        category: "privilege_escalation",
        severity: "high",
        message: "Sistem parola özetlerine (/etc/shadow, SAM) erişme girişimi algılandı.",
        pattern: /(?:\/etc\/shadow\b|\\config\\SAM\b|reg\s+save\s+hklm\\sam)/i,
    },
    {
        id: "privilege-escalation",
        category: "privilege_escalation",
        severity: "high",
        message: "Yetki yükseltmeye yönelik (setuid kabuk, sudoers değişikliği) bir imza algılandı.",
        pattern: /(?:chmod\s+(?:u\+s|[2-7][0-7]{3})\s+\/bin\/(?:ba)?sh|echo\s+[^\n]*NOPASSWD[^\n]*>>?\s*\/etc\/sudoers|setuid\s*\(\s*0\s*\)\s*;?[^\n]{0,80}(?:execl?|system)\s*\()/i,
    },
    {
        id: "keylogger",
        category: "surveillance",
        severity: "high",
        message: "Tuş vuruşlarını gizlice kaydedip dosyaya veya ağa aktaran keylogger deseni algılandı.",
        pattern: /(?:pynput\.keyboard[\s\S]{0,800}(?:Listener|on_press)[\s\S]{0,800}(?:open\s*\(|requests\.post|smtplib|webhook)|GetAsyncKeyState[\s\S]{0,800}(?:fopen|WriteFile|send\s*\(|InternetOpen)|SetWindowsHookEx(?:A|W)?\s*\(\s*WH_KEYBOARD_LL)/i,
    },
    {
        id: "defense-evasion",
        category: "defense_evasion",
        severity: "high",
        message: "Antivirüs veya güvenlik günlüklerini devre dışı bırakma girişimi algılandı.",
        pattern: /(?:Set-MpPreference\s+[^\n]*-Disable(?:RealtimeMonitoring|IOAVProtection|BehaviorMonitoring)\s+\$?true|wevtutil\s+cl\s+(?:security|system|application)|auditpol\s+\/clear|history\s+-c\s*;?\s*rm\s+[^\n]*\.bash_history)/i,
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
        pattern: /(?:stratum\+(?:tcp|ssl):\/\/|\bxmrig\b|\bminerd\b[^\n]{0,120}(?:-o|--url)|coinhive|cryptonight)/i,
    },
];

/** Removes invisible characters used to split signatures. */
export function normalizeForScan(code: string) {
    return code.normalize("NFKC").replace(/[​-‏⁠﻿]/g, "");
}

export function detectSignatures(code: string): SignatureFinding[] {
    const normalized = normalizeForScan(code);
    const findings: SignatureFinding[] = [];
    for (const rule of SIGNATURE_RULES) {
        const match = rule.pattern.exec(normalized);
        if (!match) continue;
        findings.push({ id: rule.id, category: rule.category, severity: rule.severity, message: rule.message, line: normalized.slice(0, match.index).split("\n").length });
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
        // Informational only (not blocking): downloading a file and then running
        // a tool on it — e.g. fetch a video, run ffmpeg — is an extremely common
        // legitimate workflow. The clearly malicious forms (piping a download
        // straight into a shell, reverse shells) are caught by their own rules.
        findings.push({ id: "network-process-chain", category: "remote_access", severity: "medium", message: "Ağdan veri alma ile işletim sistemi süreci başlatma davranışları birlikte algılandı." });
    }
    return findings;
}

export function riskForSignatures(findings: SignatureFinding[]): "low" | "medium" | "high" | "critical" {
    if (findings.some((finding) => finding.severity === "critical")) return "critical";
    if (findings.some((finding) => finding.severity === "high")) return "high";
    if (findings.length) return "medium";
    return "low";
}
