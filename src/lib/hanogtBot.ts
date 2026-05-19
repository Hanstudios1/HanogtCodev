/**
 * Hanogt Security Bot v2.0
 * Enhanced malicious code detection with advanced threat analysis
 * 🛡️ Zero tolerance policy - Any malicious code = Permanent ban
 */

import { db } from "@/lib/firebase";
import { doc, setDoc, getDoc, collection, serverTimestamp, updateDoc, increment } from "firebase/firestore";

// ═══════════════════════════════════════════════════════════════
// THREAT CATEGORIES WITH SEVERITY WEIGHTS
// ═══════════════════════════════════════════════════════════════

const MALICIOUS_PATTERNS: Record<string, { patterns: RegExp[]; weight: number; description: string }> = {
    systemCommands: {
        weight: 10,
        description: "System command execution",
        patterns: [
            /os\.system\s*\(/gi, /subprocess\.(call|run|Popen|check_output)\s*\(/gi,
            /exec\s*\(/gi, /eval\s*\(/gi, /shell_exec\s*\(/gi, /system\s*\(/gi,
            /passthru\s*\(/gi, /popen\s*\(/gi, /proc_open\s*\(/gi,
            /Runtime\.getRuntime\(\)\.exec/gi, /ProcessBuilder/gi,
            /child_process/gi, /spawn\s*\(/gi, /execSync\s*\(/gi, /execFile\s*\(/gi,
        ],
    },
    fileAttacks: {
        weight: 10,
        description: "File system destruction",
        patterns: [
            /rm\s+-rf/gi, /rm\s+-f/gi, /rm\s+--no-preserve-root/gi,
            /del\s+\/[fqs]/gi, /rmdir\s+\/[sq]/gi, /format\s+[a-z]:/gi,
            /mkfs\./gi, /dd\s+if=.*of=/gi, /shutil\.rmtree\s*\(/gi,
            /os\.remove\s*\(/gi, /os\.unlink\s*\(/gi, /os\.rmdir\s*\(/gi,
            /pathlib.*unlink/gi, /fs\.unlinkSync\s*\(/gi, /fs\.rmdirSync\s*\(/gi,
            /fs\.rmSync\s*\(/gi, /File\.delete\s*\(/gi, /Files\.delete\s*\(/gi,
            /rimraf/gi, /deltree/gi,
        ],
    },
    resourceAttacks: {
        weight: 10,
        description: "Fork bomb / resource exhaustion",
        patterns: [
            /:\(\)\{\s*:\|:\s*&\s*\}/gi, /while\s*\(\s*true\s*\)\s*\{\s*fork/gi,
            /\bfork\s*\(\s*\)/gi, /while\s*\(\s*1\s*\)\s*\{[^}]*malloc/gi,
            /\%0\|\%0/gi, /bomb/gi, /infinite.*loop/gi, /memory.*leak/gi, /oom.*killer/gi,
        ],
    },
    networkAttacks: {
        weight: 10,
        description: "Network attack / reverse shell",
        patterns: [
            /reverse.*shell/gi, /bind.*shell/gi, /nc\s+-[el]/gi, /ncat/gi,
            /curl\s+.*\|.*sh/gi, /wget\s+.*\|.*sh/gi, /powershell.*download/gi,
            /Invoke-WebRequest/gi, /DDoS/gi, /syn.*flood/gi, /ping\s+-f/gi,
        ],
    },
    dataTheft: {
        weight: 10,
        description: "Data theft / spyware",
        patterns: [
            /keylogger/gi, /key.*log/gi, /pyautogui\.screenshot/gi,
            /ImageGrab\.grab/gi, /mss\.mss/gi, /GetAsyncKeyState/gi,
            /SetWindowsHookEx/gi, /stealer/gi, /grabber/gi,
            /cv2\.VideoCapture/gi, /screen.*capture/gi,
            /cookie.*steal/gi, /session.*hijack/gi,
        ],
    },
    cryptoMining: {
        weight: 10,
        description: "Cryptocurrency mining",
        patterns: [
            /coinhive/gi, /cryptonight/gi, /stratum\+tcp/gi, /xmrig/gi,
            /crypto-?loot/gi, /minergate/gi, /hashrate/gi,
            /mining.*pool/gi, /cpu.*miner/gi, /gpu.*miner/gi,
        ],
    },
    ransomware: {
        weight: 10,
        description: "Ransomware / file encryption attack",
        patterns: [
            /ransom/gi, /your files.*encrypted/gi, /pay.*bitcoin/gi,
            /decrypt.*key/gi, /cryptolocker/gi, /wannacry/gi,
            /locky/gi, /file.*hostage/gi,
        ],
    },
    backdoor: {
        weight: 10,
        description: "Backdoor / RAT / Trojan",
        patterns: [
            /backdoor/gi, /reverse.*connect/gi, /remote.*access/gi,
            /\bRAT\b/g, /trojan/gi, /rootkit/gi, /autorun/gi,
            /registry.*run/gi, /crontab/gi, /schtasks/gi,
            /c2.*server/gi, /command.*control/gi, /beacon/gi, /implant/gi,
        ],
    },
    privilegeEscalation: {
        weight: 9,
        description: "Privilege escalation",
        patterns: [
            /privilege.*escalat/gi, /setuid/gi, /chmod\s+4/gi,
            /chmod\s+777/gi, /mimikatz/gi, /hashdump/gi,
            /lsass/gi, /token.*impersonat/gi, /SAM.*database/gi,
        ],
    },
    exploits: {
        weight: 10,
        description: "Exploit / vulnerability abuse",
        patterns: [
            /exploit/gi, /shellcode/gi, /buffer.*overflow/gi,
            /heap.*spray/gi, /ROP.*chain/gi, /stack.*smash/gi,
            /use.*after.*free/gi, /CVE-\d{4}/gi, /0day/gi,
            /zero.*day/gi, /metasploit/gi, /msfvenom/gi, /cobalt.*strike/gi,
        ],
    },
    malwareIndicators: {
        weight: 9,
        description: "Malware indicators",
        patterns: [
            /virus/gi, /malware/gi, /worm/gi, /spyware/gi,
            /botnet/gi, /zombie/gi, /phishing/gi,
            /dll.*inject/gi, /code.*cave/gi, /pe.*infect/gi,
            /obfuscat/gi, /anti.*debug/gi, /anti.*vm/gi, /sandbox.*detect/gi,
        ],
    },
    // ═══ NEW v2.0 CATEGORIES ═══
    sqlInjection: {
        weight: 8,
        description: "SQL Injection attack",
        patterns: [
            /'\s*OR\s+['"]?1['"]?\s*=\s*['"]?1/gi,
            /UNION\s+(ALL\s+)?SELECT/gi,
            /DROP\s+TABLE/gi, /DROP\s+DATABASE/gi,
            /DELETE\s+FROM/gi, /TRUNCATE\s+TABLE/gi,
            /INSERT\s+INTO.*VALUES.*\(/gi,
            /ALTER\s+TABLE/gi, /UPDATE\s+.*SET\s+/gi,
            /;\s*--/gi, /EXEC\s+xp_/gi, /xp_cmdshell/gi,
            /WAITFOR\s+DELAY/gi, /BENCHMARK\s*\(/gi,
            /LOAD_FILE\s*\(/gi, /INTO\s+(OUT|DUMP)FILE/gi,
            /information_schema/gi, /SLEEP\s*\(\d+\)/gi,
        ],
    },
    xssAttacks: {
        weight: 8,
        description: "Cross-Site Scripting (XSS)",
        patterns: [
            /<script[\s>]/gi, /<\/script>/gi,
            /javascript\s*:/gi, /on(error|load|click|mouseover|focus|blur)\s*=/gi,
            /document\.(cookie|write|location)/gi,
            /window\.(location|open|eval)/gi,
            /innerHTML\s*=/gi, /outerHTML\s*=/gi,
            /insertAdjacentHTML/gi, /\.fromCharCode/gi,
            /atob\s*\(/gi, /decodeURIComponent/gi,
            /src\s*=\s*['"]?javascript:/gi,
            /data\s*:\s*text\/html/gi,
        ],
    },
    commandInjection: {
        weight: 10,
        description: "Command injection",
        patterns: [
            /;\s*(cat|ls|pwd|whoami|id|uname|ifconfig|netstat)\b/gi,
            /\|\s*(cat|ls|pwd|whoami|id|uname)\b/gi,
            /&&\s*(cat|ls|pwd|whoami|id|rm|wget|curl)\b/gi,
            /`[^`]*(cat|ls|pwd|whoami|id|rm|wget|curl)[^`]*`/gi,
            /\$\([^)]*(cat|ls|pwd|whoami|id|rm|wget|curl)[^)]*\)/gi,
            /os\.popen\s*\(/gi,
        ],
    },
    encodedPayloads: {
        weight: 9,
        description: "Encoded / obfuscated malicious payload",
        patterns: [
            /eval\s*\(\s*(atob|Buffer\.from|base64_decode|decode)/gi,
            /exec\s*\(\s*(atob|Buffer\.from|base64_decode)/gi,
            /\\x[0-9a-f]{2}\\x[0-9a-f]{2}\\x[0-9a-f]{2}\\x[0-9a-f]{2}/gi,
            /\\u[0-9a-f]{4}\\u[0-9a-f]{4}\\u[0-9a-f]{4}/gi,
            /String\.fromCharCode\s*\(\s*\d+\s*(,\s*\d+\s*){3,}/gi,
            /base64_decode\s*\(/gi,
            /charCodeAt|codePointAt.*fromCharCode/gi,
            /eval\s*\(\s*['"][^'"]{50,}['"]\s*\)/gi,
        ],
    },
    filelessMalware: {
        weight: 10,
        description: "Fileless malware / in-memory execution",
        patterns: [
            /powershell.*-enc\s/gi, /powershell.*-encodedcommand/gi,
            /powershell.*downloadstring/gi, /powershell.*iex\s/gi,
            /Invoke-Expression/gi, /IEX\s*\(/gi,
            /New-Object\s+Net\.WebClient/gi,
            /\[System\.Reflection\.Assembly\]::Load/gi,
            /VirtualAlloc/gi, /WriteProcessMemory/gi,
            /CreateRemoteThread/gi, /NtCreateThreadEx/gi,
            /RtlMoveMemory/gi, /Marshal\.Copy/gi,
        ],
    },
    containerEscape: {
        weight: 10,
        description: "Container / sandbox escape",
        patterns: [
            /docker.*--privileged/gi, /docker\.sock/gi,
            /nsenter/gi, /mount.*proc/gi,
            /\/proc\/self\/exe/gi, /breakout/gi,
            /chroot.*escape/gi, /unshare\s+-/gi,
            /seccomp.*bypass/gi, /apparmor.*disable/gi,
            /cgroup.*escape/gi,
        ],
    },
    dnsExfiltration: {
        weight: 9,
        description: "DNS data exfiltration",
        patterns: [
            /dns.*exfil/gi, /dns.*tunnel/gi,
            /nslookup.*\$\(/gi, /dig\s+.*\$\(/gi,
            /dnscat/gi, /iodine\s+-f/gi,
            /dns2tcp/gi, /heyoka/gi,
        ],
    },
    socialEngineering: {
        weight: 7,
        description: "Phishing / social engineering",
        patterns: [
            /phish/gi, /credential.*harvest/gi,
            /fake.*login/gi, /password.*form.*submit/gi,
            /clone.*site/gi, /spoofing/gi,
            /social.*engineer/gi,
        ],
    },
};

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface SecurityCheckResult {
    isMalicious: boolean;
    threats: string[];
    severity: "low" | "medium" | "high" | "critical";
    shouldBan: boolean;
    detectedPatterns: string[];
    totalScore: number;
    categories: string[];
}

// ═══════════════════════════════════════════════════════════════
// CORE ANALYSIS ENGINE
// ═══════════════════════════════════════════════════════════════

/**
 * Check code for malicious patterns with weighted scoring
 * 🛡️ ZERO TOLERANCE - Any malicious code = IMMEDIATE BAN
 */
export function checkMaliciousCode(code: string): SecurityCheckResult {
    const threats: string[] = [];
    const detectedPatterns: string[] = [];
    const categories: string[] = [];
    let totalScore = 0;

    // Decode potential obfuscation layers first
    const decodedCode = deobfuscateCode(code);
    const codeToCheck = code + "\n" + decodedCode;

    // Check each category
    for (const [category, { patterns, weight, description }] of Object.entries(MALICIOUS_PATTERNS)) {
        for (const pattern of patterns) {
            const match = codeToCheck.match(pattern);
            if (match) {
                threats.push(description);
                detectedPatterns.push(match[0]);
                categories.push(category);
                totalScore += weight;
                break; // One match per category
            }
        }
    }

    const uniqueThreats = [...new Set(threats)];
    const isMalicious = uniqueThreats.length > 0;

    // Determine severity based on score
    let severity: "low" | "medium" | "high" | "critical" = "low";
    if (totalScore >= 15) severity = "critical";
    else if (totalScore >= 10) severity = "high";
    else if (totalScore >= 5) severity = "medium";

    // ZERO TOLERANCE - ANY malicious code = PERMANENT BAN
    const shouldBan = isMalicious;

    return {
        isMalicious,
        threats: uniqueThreats,
        severity,
        shouldBan,
        detectedPatterns: [...new Set(detectedPatterns)],
        totalScore,
        categories: [...new Set(categories)],
    };
}

/**
 * Attempt to deobfuscate code to detect hidden payloads
 */
function deobfuscateCode(code: string): string {
    let decoded = "";
    
    // Try Base64 decode
    const b64Matches = code.match(/['"]([A-Za-z0-9+/=]{20,})['"]/g);
    if (b64Matches) {
        for (const match of b64Matches) {
            try {
                const clean = match.replace(/['"]/g, "");
                decoded += " " + atob(clean);
            } catch { /* not valid base64 */ }
        }
    }

    // Detect hex-encoded strings
    const hexMatches = code.match(/\\x[0-9a-fA-F]{2}/g);
    if (hexMatches && hexMatches.length > 4) {
        try {
            const hexStr = hexMatches.map(h => String.fromCharCode(parseInt(h.slice(2), 16))).join("");
            decoded += " " + hexStr;
        } catch { /* ignore */ }
    }

    // Detect String.fromCharCode patterns
    const charCodeMatch = code.match(/String\.fromCharCode\s*\(([0-9,\s]+)\)/gi);
    if (charCodeMatch) {
        for (const m of charCodeMatch) {
            try {
                const nums = m.match(/\d+/g);
                if (nums) decoded += " " + nums.map(n => String.fromCharCode(parseInt(n))).join("");
            } catch { /* ignore */ }
        }
    }

    return decoded;
}

/**
 * Behavioral analysis - detects suspicious code patterns
 */
export function analyzeCodeBehavior(code: string): { suspicious: boolean; reasons: string[] } {
    const reasons: string[] = [];

    // Excessive string concatenation (obfuscation attempt)
    const concatCount = (code.match(/\+\s*['"]/g) || []).length;
    if (concatCount > 20) reasons.push("Excessive string concatenation (possible obfuscation)");

    // Very long single line (packed/minified malware)
    const lines = code.split("\n");
    if (lines.some(l => l.length > 2000)) reasons.push("Suspiciously long single line detected");

    // Multiple eval/exec in single code
    const evalCount = (code.match(/\b(eval|exec)\s*\(/gi) || []).length;
    if (evalCount > 2) reasons.push("Multiple eval/exec calls detected");

    // Network + file system access together
    const hasNetwork = /socket|requests?\.|fetch|http|urllib/gi.test(code);
    const hasFileSystem = /open\s*\(|fs\.|File\.|fopen/gi.test(code);
    if (hasNetwork && hasFileSystem) reasons.push("Combined network + filesystem access");

    // Encoding + execution together
    const hasEncoding = /base64|atob|btoa|encode|decode|fromCharCode/gi.test(code);
    const hasExecution = /eval|exec|system|spawn/gi.test(code);
    if (hasEncoding && hasExecution) reasons.push("Encoded payload with execution");

    // Entropy analysis - high entropy = possible encrypted/obfuscated payload
    const entropy = calculateEntropy(code);
    if (entropy > 5.5) reasons.push(`High entropy score (${entropy.toFixed(2)}) — possible encrypted payload`);

    // Polymorphic code detection
    const varNames = code.match(/(?:var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g) || [];
    const randomLookingVars = varNames.filter(v => {
        const name = v.replace(/^(var|let|const)\s+/, '');
        return name.length > 8 && /^[a-z]{2,4}\d{2,}$/i.test(name);
    });
    if (randomLookingVars.length > 5) reasons.push("Polymorphic variable naming pattern detected");

    // Attack chain detection (recon → exploit → payload → persistence)
    const hasRecon = /navigator\.|screen\.|platform|userAgent|cpuClass/gi.test(code);
    const hasExploit = /overflow|exploit|payload|shellcode/gi.test(code);
    const hasPersistence = /localStorage|sessionStorage|cookie|indexedDB|ServiceWorker/gi.test(code);
    if (hasRecon && hasExploit) reasons.push("Attack chain: Reconnaissance + Exploit pattern");
    if (hasExploit && hasPersistence) reasons.push("Attack chain: Exploit + Persistence pattern");

    // Suspicious API usage patterns
    const hasWebRTC = /RTCPeerConnection|createDataChannel|getUserMedia/gi.test(code);
    const hasCanvas = /canvas.*toDataURL|getImageData|fingerprint/gi.test(code);
    if (hasWebRTC && hasCanvas) reasons.push("Browser fingerprinting attempt detected");

    // Timing attack patterns
    const hasTimingAttack = /performance\.now|Date\.now.*-.*Date\.now|setTimeout.*\d{4,}/gi.test(code);
    if (hasTimingAttack && hasExecution) reasons.push("Timing-based attack pattern");

    return { suspicious: reasons.length > 0, reasons };
}

/**
 * Calculate Shannon entropy of a string
 * Higher entropy = more randomness = possible encryption/obfuscation
 */
function calculateEntropy(str: string): number {
    const len = str.length;
    if (len === 0) return 0;
    const freq: Record<string, number> = {};
    for (const ch of str) freq[ch] = (freq[ch] || 0) + 1;
    let entropy = 0;
    for (const count of Object.values(freq)) {
        const p = count / len;
        if (p > 0) entropy -= p * Math.log2(p);
    }
    return entropy;
}

/**
 * Deep scan - performs multi-pass analysis for sophisticated threats
 */
export function deepScanCode(code: string): {
    threatLevel: "safe" | "suspicious" | "dangerous" | "critical";
    findings: string[];
    recommendation: string;
} {
    const findings: string[] = [];
    
    // Pass 1: Standard pattern check
    const patternResult = checkMaliciousCode(code);
    if (patternResult.isMalicious) {
        findings.push(...patternResult.threats.map(t => `[PATTERN] ${t}`));
    }

    // Pass 2: Behavioral analysis
    const behavior = analyzeCodeBehavior(code);
    if (behavior.suspicious) {
        findings.push(...behavior.reasons.map(r => `[BEHAVIOR] ${r}`));
    }

    // Pass 3: Deobfuscation + re-scan
    const deobfuscated = deobfuscateCode(code);
    if (deobfuscated.length > 10) {
        const deobResult = checkMaliciousCode(deobfuscated);
        if (deobResult.isMalicious) {
            findings.push(...deobResult.threats.map(t => `[HIDDEN] ${t} (found after deobfuscation)`));
        }
    }

    // Pass 4: Unicode/homoglyph attack detection
    const hasHomoglyphs = /[\u0410-\u044F]/.test(code) && /[a-zA-Z]/.test(code);
    if (hasHomoglyphs) findings.push("[UNICODE] Mixed Cyrillic/Latin characters — possible homoglyph attack");

    const hasInvisibleChars = /[\u200B-\u200F\u2028-\u202F\uFEFF]/.test(code);
    if (hasInvisibleChars) findings.push("[UNICODE] Invisible/zero-width characters detected");

    // Determine threat level
    let threatLevel: "safe" | "suspicious" | "dangerous" | "critical" = "safe";
    if (findings.some(f => f.startsWith("[PATTERN]") || f.startsWith("[HIDDEN]"))) {
        threatLevel = "critical";
    } else if (findings.length > 3) {
        threatLevel = "dangerous";
    } else if (findings.length > 0) {
        threatLevel = "suspicious";
    }

    const recommendation = threatLevel === "critical" 
        ? "PERMANENT BAN — Malicious code confirmed"
        : threatLevel === "dangerous"
        ? "HIGH RISK — Multiple suspicious indicators"
        : threatLevel === "suspicious"
        ? "MONITOR — Suspicious patterns detected"
        : "SAFE — No threats detected";

    return { threatLevel, findings, recommendation };
}

// ═══════════════════════════════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════════════════════════════

const rateLimitMap = new Map<string, { count: number; resetTime: number; blockedAttempts: number }>();

/**
 * Check rate limit for a user
 * Max 10 code executions per minute, 3 blocked attempts = auto ban
 */
export function checkRateLimit(email: string): { allowed: boolean; blockedAttempts: number } {
    const now = Date.now();
    const limit = rateLimitMap.get(email);

    if (!limit || now > limit.resetTime) {
        rateLimitMap.set(email, { count: 1, resetTime: now + 60000, blockedAttempts: limit?.blockedAttempts || 0 });
        return { allowed: true, blockedAttempts: limit?.blockedAttempts || 0 };
    }

    if (limit.count >= 10) {
        return { allowed: false, blockedAttempts: limit.blockedAttempts };
    }

    limit.count++;
    return { allowed: true, blockedAttempts: limit.blockedAttempts };
}

/**
 * Increment blocked attempts counter
 */
export function incrementBlockedAttempts(email: string): number {
    const limit = rateLimitMap.get(email);
    if (limit) {
        limit.blockedAttempts++;
        return limit.blockedAttempts;
    }
    rateLimitMap.set(email, { count: 0, resetTime: Date.now() + 60000, blockedAttempts: 1 });
    return 1;
}

// ═══════════════════════════════════════════════════════════════
// BAN SYSTEM
// ═══════════════════════════════════════════════════════════════

/**
 * Ban a user PERMANENTLY
 */
export async function banUser(email: string, reason: string, maliciousCode: string): Promise<boolean> {
    try {
        const banRef = doc(db, "banned_users", email);
        await setDoc(banRef, {
            email, reason,
            maliciousCode: maliciousCode.substring(0, 2000),
            bannedAt: serverTimestamp(),
            permanent: true,
            bannedBy: "Hanogt Security Bot v2.0",
            banType: "PERMANENT_MALICIOUS_CODE"
        });

        const userRef = doc(db, "users", email);
        await setDoc(userRef, {
            banned: true, banReason: reason, bannedAt: serverTimestamp()
        }, { merge: true });

        console.log(`🛡️ [Hanogt Bot v2.0] USER PERMANENTLY BANNED: ${email}`);
        return true;
    } catch (error) {
        console.error("[Hanogt Bot] Error banning user:", error);
        return false;
    }
}

/**
 * Check if a user is banned
 */
export async function isUserBanned(email: string): Promise<{ banned: boolean; reason?: string; bannedAt?: Date }> {
    try {
        const banRef = doc(db, "banned_users", email);
        const banDoc = await getDoc(banRef);
        if (banDoc.exists()) {
            const data = banDoc.data();
            return { banned: true, reason: data.reason, bannedAt: data.bannedAt?.toDate() };
        }
        const userRef = doc(db, "users", email);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists() && userDoc.data().banned) {
            return { banned: true, reason: userDoc.data().banReason || "Security violation" };
        }
        return { banned: false };
    } catch (error) {
        console.error("[Hanogt Bot] Error checking ban:", error);
        return { banned: false };
    }
}

/**
 * Unban a user - Admin only
 */
export async function unbanUser(email: string): Promise<boolean> {
    try {
        const banRef = doc(db, "banned_users", email);
        const { deleteDoc } = await import("firebase/firestore");
        await deleteDoc(banRef);
        const userRef = doc(db, "users", email);
        await setDoc(userRef, { banned: false, banReason: null, unbannedAt: serverTimestamp() }, { merge: true });
        console.log(`🛡️ [Hanogt Bot] User unbanned: ${email}`);
        return true;
    } catch (error) {
        console.error("[Hanogt Bot] Error unbanning:", error);
        return false;
    }
}

/**
 * Log security event
 */
export async function logSecurityEvent(
    email: string,
    eventType: "warning" | "block" | "ban",
    details: SecurityCheckResult,
    code: string
): Promise<void> {
    try {
        const eventRef = doc(collection(db, "security_logs"));
        await setDoc(eventRef, {
            email, eventType,
            threats: details.threats,
            severity: details.severity,
            detectedPatterns: details.detectedPatterns,
            totalScore: details.totalScore,
            categories: details.categories,
            codeSnippet: code.substring(0, 1000),
            timestamp: serverTimestamp(),
            bannedBy: "Hanogt Security Bot v2.0"
        });
    } catch (error) {
        console.error("[Hanogt Bot] Error logging:", error);
    }
}

// ═══════════════════════════════════════════════════════════════
// SECURITY SHIELDS
// ═══════════════════════════════════════════════════════════════

export const SECURITY_SHIELDS = {
    dangerousImports: [
        "os", "sys", "subprocess", "socket", "ctypes", "winreg",
        "win32api", "win32con", "win32gui", "pyautogui", "pynput",
        "keyboard", "mouse", "cv2", "PIL", "mss", "pyperclip",
        "shutil", "signal", "pty", "fcntl", "resource",
        "importlib", "runpy", "code", "codeop", "compileall",
    ],
    dangerousBuiltins: [
        "__import__", "open", "exec", "eval", "compile",
        "globals", "locals", "vars", "__builtins__",
        "getattr", "setattr", "delattr", "type", "memoryview",
    ],
    maxCodeLength: 50000,
    maxExecutionTime: 30000,
    maxBlockedAttempts: 3,
};

/**
 * Quick check for dangerous imports
 */
export function checkDangerousImports(code: string): string[] {
    const dangerousFound: string[] = [];
    for (const imp of SECURITY_SHIELDS.dangerousImports) {
        const importPattern = new RegExp(`(import\\s+${imp}|from\\s+${imp}\\s+import)`, 'gi');
        if (importPattern.test(code)) dangerousFound.push(imp);
    }
    // Dynamic imports
    if (/__import__\s*\(/gi.test(code)) dangerousFound.push("__import__");
    if (/importlib\.(import_module|__import__)/gi.test(code)) dangerousFound.push("importlib");
    return dangerousFound;
}

/**
 * Full security scan - combines all checks
 */
export function fullSecurityScan(code: string, email: string): {
    result: SecurityCheckResult;
    rateLimit: { allowed: boolean; blockedAttempts: number };
    behavior: { suspicious: boolean; reasons: string[] };
    dangerousImports: string[];
    codeTooLong: boolean;
} {
    const result = checkMaliciousCode(code);
    const rateLimit = checkRateLimit(email);
    const behavior = analyzeCodeBehavior(code);
    const dangerousImports = checkDangerousImports(code);
    const codeTooLong = code.length > SECURITY_SHIELDS.maxCodeLength;

    return { result, rateLimit, behavior, dangerousImports, codeTooLong };
}
