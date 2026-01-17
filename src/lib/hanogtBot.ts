/**
 * Hanogt Security Bot
 * Detects malicious code patterns and PERMANENTLY bans users who attempt to run harmful code
 * 🛡️ Zero tolerance policy - Any malicious code = Permanent ban
 */

import { db } from "@/lib/firebase";
import { doc, setDoc, getDoc, collection, serverTimestamp } from "firebase/firestore";

// Malicious code patterns to detect - COMPREHENSIVE LIST
const MALICIOUS_PATTERNS = {
    // System command execution - CRITICAL
    systemCommands: [
        /os\.system\s*\(/gi,
        /subprocess\.(call|run|Popen|check_output)\s*\(/gi,
        /exec\s*\(/gi,
        /eval\s*\(/gi,
        /shell_exec\s*\(/gi,
        /system\s*\(/gi,
        /passthru\s*\(/gi,
        /popen\s*\(/gi,
        /proc_open\s*\(/gi,
        /Runtime\.getRuntime\(\)\.exec/gi,
        /ProcessBuilder/gi,
        /child_process/gi,
        /spawn\s*\(/gi,
        /execSync\s*\(/gi,
        /execFile\s*\(/gi,
    ],

    // File system attacks - CRITICAL
    fileAttacks: [
        /rm\s+-rf/gi,
        /rm\s+-f/gi,
        /rm\s+--no-preserve-root/gi,
        /del\s+\/[fqs]/gi,
        /rmdir\s+\/[sq]/gi,
        /format\s+[a-z]:/gi,
        /mkfs\./gi,
        /dd\s+if=.*of=/gi,
        /shutil\.rmtree\s*\(/gi,
        /os\.remove\s*\(/gi,
        /os\.unlink\s*\(/gi,
        /os\.rmdir\s*\(/gi,
        /pathlib.*unlink/gi,
        /fs\.unlinkSync\s*\(/gi,
        /fs\.rmdirSync\s*\(/gi,
        /fs\.rmSync\s*\(/gi,
        /File\.delete\s*\(/gi,
        /Files\.delete\s*\(/gi,
        /Files\.deleteIfExists/gi,
        /FileUtils\.deleteDirectory/gi,
        /rimraf/gi,
        /deltree/gi,
    ],

    // Fork bombs and resource exhaustion - CRITICAL
    resourceAttacks: [
        /:\(\)\{\s*:\|:\s*&\s*\}/gi,
        /while\s*\(\s*true\s*\)\s*\{\s*fork/gi,
        /for\s*\(\s*;\s*;\s*\)\s*fork/gi,
        /\bfork\s*\(\s*\)/gi,
        /while\s*\(\s*1\s*\)\s*\{[^}]*malloc/gi,
        /while\s*True\s*:/gi,
        /while\s*\(\s*true\s*\)/gi,
        /for\s*\(\s*;\s*;\s*\)/gi,
        /\%0\|\%0/gi, // Windows fork bomb
        /bomb/gi,
        /infinite.*loop/gi,
        /memory.*leak/gi,
        /oom.*killer/gi,
    ],

    // Network attacks - CRITICAL
    networkAttacks: [
        /socket\.connect/gi,
        /socket\.socket/gi,
        /urllib\.request/gi,
        /requests\.(get|post|put|delete|patch)/gi,
        /http\.client/gi,
        /httplib/gi,
        /XMLHttpRequest/gi,
        /net\.connect/gi,
        /new\s+Socket/gi,
        /WebSocket/gi,
        /reverse.*shell/gi,
        /bind.*shell/gi,
        /nc\s+-[el]/gi, // netcat
        /ncat/gi,
        /telnet/gi,
        /ssh.*-R/gi,
        /curl\s+.*\|.*sh/gi,
        /wget\s+.*\|.*sh/gi,
        /powershell.*download/gi,
        /Invoke-WebRequest/gi,
        /DDoS/gi,
        /syn.*flood/gi,
        /ping\s+-f/gi,
    ],

    // Data theft and spying - CRITICAL
    dataTheft: [
        /keyboard/gi,
        /pynput/gi,
        /keylogger/gi,
        /key.*log/gi,
        /pyautogui\.screenshot/gi,
        /ImageGrab\.grab/gi,
        /mss\.mss/gi,
        /win32clipboard/gi,
        /pyperclip/gi,
        /ctypes\.windll/gi,
        /GetAsyncKeyState/gi,
        /SetWindowsHookEx/gi,
        /subprocess.*password/gi,
        /os\.environ/gi,
        /getenv/gi,
        /credential/gi,
        /stealer/gi,
        /grabber/gi,
        /webcam/gi,
        /microphone/gi,
        /cv2\.VideoCapture/gi,
        /screen.*capture/gi,
        /clipboard/gi,
        /browser.*data/gi,
        /cookie.*steal/gi,
        /session.*hijack/gi,
    ],

    // Crypto mining - CRITICAL
    cryptoMining: [
        /coinhive/gi,
        /cryptonight/gi,
        /minero/gi,
        /stratum\+tcp/gi,
        /xmrig/gi,
        /crypto-?loot/gi,
        /minergate/gi,
        /nicehash/gi,
        /hashrate/gi,
        /mining.*pool/gi,
        /monero/gi,
        /bitcoin.*mine/gi,
        /ethereum.*mine/gi,
        /cpu.*miner/gi,
        /gpu.*miner/gi,
    ],

    // Ransomware - CRITICAL
    ransomware: [
        /\.encrypt\s*\(/gi,
        /AES\.new\s*\(/gi,
        /Fernet\s*\(/gi,
        /RSA.*encrypt/gi,
        /bitcoin.*wallet/gi,
        /ransom/gi,
        /your files.*encrypted/gi,
        /pay.*bitcoin/gi,
        /decrypt.*key/gi,
        /cryptolocker/gi,
        /wannacry/gi,
        /locky/gi,
        /\.locked$/gi,
        /\.encrypted$/gi,
        /file.*hostage/gi,
    ],

    // Backdoor and RAT - CRITICAL
    backdoor: [
        /backdoor/gi,
        /reverse.*connect/gi,
        /remote.*access/gi,
        /RAT/g,
        /trojan/gi,
        /rootkit/gi,
        /persistence/gi,
        /autorun/gi,
        /startup.*folder/gi,
        /registry.*run/gi,
        /crontab/gi,
        /scheduled.*task/gi,
        /schtasks/gi,
        /hidden.*service/gi,
        /c2.*server/gi,
        /command.*control/gi,
        /beacon/gi,
        /implant/gi,
    ],

    // Privilege escalation - CRITICAL
    privilegeEscalation: [
        /sudo\s+/gi,
        /su\s+-/gi,
        /runas/gi,
        /privilege.*escalat/gi,
        /setuid/gi,
        /setgid/gi,
        /chmod\s+4/gi,
        /chmod\s+777/gi,
        /chown.*root/gi,
        /passwd/gi,
        /shadow/gi,
        /SAM.*database/gi,
        /mimikatz/gi,
        /hashdump/gi,
        /lsass/gi,
        /token.*impersonat/gi,
    ],

    // Exploit and vulnerability abuse - CRITICAL
    exploits: [
        /exploit/gi,
        /payload/gi,
        /shellcode/gi,
        /buffer.*overflow/gi,
        /heap.*spray/gi,
        /ROP.*chain/gi,
        /return.*oriented/gi,
        /stack.*smash/gi,
        /format.*string/gi,
        /use.*after.*free/gi,
        /CVE-\d{4}/gi,
        /0day/gi,
        /zero.*day/gi,
        /metasploit/gi,
        /msfvenom/gi,
        /cobalt.*strike/gi,
    ],

    // Malware indicators - CRITICAL
    malwareIndicators: [
        /virus/gi,
        /malware/gi,
        /worm/gi,
        /spyware/gi,
        /adware/gi,
        /botnet/gi,
        /zombie/gi,
        /phishing/gi,
        /inject/gi,
        /hook/gi,
        /patch.*memory/gi,
        /dll.*inject/gi,
        /code.*cave/gi,
        /pe.*infect/gi,
        /elf.*infect/gi,
        /obfuscat/gi,
        /pack.*executable/gi,
        /upx.*-d/gi,
        /anti.*debug/gi,
        /anti.*vm/gi,
        /sandbox.*detect/gi,
    ],
};

export interface SecurityCheckResult {
    isMalicious: boolean;
    threats: string[];
    severity: "low" | "medium" | "high" | "critical";
    shouldBan: boolean;
    detectedPatterns: string[];
}

/**
 * Check code for malicious patterns
 * 🛡️ ZERO TOLERANCE - Any malicious code = IMMEDIATE BAN
 */
export function checkMaliciousCode(code: string): SecurityCheckResult {
    const threats: string[] = [];
    const detectedPatterns: string[] = [];
    let severity: "low" | "medium" | "high" | "critical" = "low";

    // Check each category of patterns
    for (const [category, patterns] of Object.entries(MALICIOUS_PATTERNS)) {
        for (const pattern of patterns) {
            const match = code.match(pattern);
            if (match) {
                threats.push(category);
                detectedPatterns.push(match[0]);

                // ALL categories are now CRITICAL - Zero tolerance
                severity = "critical";

                break; // Found one pattern in this category, move to next
            }
        }
    }

    const uniqueThreats = [...new Set(threats)];
    const isMalicious = uniqueThreats.length > 0;

    // 🛡️ ZERO TOLERANCE - ANY malicious code = PERMANENT BAN
    const shouldBan = isMalicious;

    return {
        isMalicious,
        threats: uniqueThreats,
        severity,
        shouldBan,
        detectedPatterns: [...new Set(detectedPatterns)]
    };
}

/**
 * Ban a user PERMANENTLY - No appeals, no exceptions
 */
export async function banUser(email: string, reason: string, maliciousCode: string): Promise<boolean> {
    try {
        const banRef = doc(db, "banned_users", email);
        await setDoc(banRef, {
            email,
            reason,
            maliciousCode: maliciousCode.substring(0, 2000), // Store first 2000 chars
            bannedAt: serverTimestamp(),
            permanent: true,
            bannedBy: "Hanogt Security Bot",
            banType: "PERMANENT_MALICIOUS_CODE"
        });

        // Also update user document with ban flag
        const userRef = doc(db, "users", email);
        await setDoc(userRef, {
            banned: true,
            banReason: reason,
            bannedAt: serverTimestamp()
        }, { merge: true });

        console.log(`🛡️ [Hanogt Bot] USER PERMANENTLY BANNED: ${email}`);
        console.log(`🛡️ [Hanogt Bot] Reason: ${reason}`);
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
            return {
                banned: true,
                reason: data.reason,
                bannedAt: data.bannedAt?.toDate()
            };
        }

        // Also check user document
        const userRef = doc(db, "users", email);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists() && userDoc.data().banned) {
            return {
                banned: true,
                reason: userDoc.data().banReason || "Güvenlik ihlali"
            };
        }

        return { banned: false };
    } catch (error) {
        console.error("[Hanogt Bot] Error checking ban status:", error);
        return { banned: false };
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
            email,
            eventType,
            threats: details.threats,
            severity: details.severity,
            detectedPatterns: details.detectedPatterns,
            codeSnippet: code.substring(0, 1000),
            timestamp: serverTimestamp(),
            bannedBy: "Hanogt Security Bot"
        });
    } catch (error) {
        console.error("[Hanogt Bot] Error logging security event:", error);
    }
}

/**
 * Additional security shields
 */
export const SECURITY_SHIELDS = {
    // Block dangerous imports
    dangerousImports: [
        "os", "sys", "subprocess", "socket", "ctypes", "winreg",
        "win32api", "win32con", "win32gui", "pyautogui", "pynput",
        "keyboard", "mouse", "cv2", "PIL", "mss", "pyperclip"
    ],

    // Block dangerous built-ins
    dangerousBuiltins: [
        "__import__", "open", "exec", "eval", "compile",
        "globals", "locals", "vars", "__builtins__"
    ],

    // Maximum code length allowed
    maxCodeLength: 50000,

    // Maximum execution time (ms)
    maxExecutionTime: 30000
};

/**
 * Quick check for dangerous imports at the top of code
 */
export function checkDangerousImports(code: string): string[] {
    const dangerousFound: string[] = [];

    for (const imp of SECURITY_SHIELDS.dangerousImports) {
        const importPattern = new RegExp(`(import\\s+${imp}|from\\s+${imp}\\s+import)`, 'gi');
        if (importPattern.test(code)) {
            dangerousFound.push(imp);
        }
    }

    return dangerousFound;
}
