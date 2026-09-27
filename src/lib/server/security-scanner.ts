import "server-only";

import { createHash } from "node:crypto";
import { detectSignatures, riskForSignatures, type SignatureFinding } from "@/lib/security/signatures";

export type SecurityFinding = SignatureFinding;

export type SecurityScanResult = {
    allowed: boolean;
    risk: "low" | "medium" | "high" | "critical";
    findings: SecurityFinding[];
    codeHash: string;
};

/**
 * Server-side guard for untrusted code (runner, Media posts, Arcade publishing).
 * High and critical findings block the request; medium ones are only reported.
 */
export function scanUntrustedCode(code: string): SecurityScanResult {
    const findings = detectSignatures(code);
    const risk = riskForSignatures(findings);
    return {
        allowed: risk !== "critical" && risk !== "high",
        risk,
        findings,
        codeHash: createHash("sha256").update(code).digest("hex"),
    };
}
