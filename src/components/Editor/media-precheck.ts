/**
 * The in-browser twin of the server's publishing guard, used by the publish
 * dialog before anything is sent: Security Advisor findings per file plus the
 * guard signatures over the same combined text /api/media scans, so `blocked`
 * matches the server's decision. The rule sets are imported on demand.
 * Tested in scripts/tests/editor-media-publish.test.mjs.
 */
import { advisorLanguageFor, locateScanLine, mediaScanText } from "@/components/Editor/media-publish";
import type { Copy } from "@/lib/i18n";
import type { AdvisorReport, AdvisorSeverity } from "@/lib/security/advisor";

export interface PrecheckFile {
    id: string;
    name: string;
    lang: string;
    code: string;
}

export type CheckFinding = { key: string; severity: AdvisorSeverity; title: Copy; detail: Copy; fix?: Copy; file: string; line: number };

export type Precheck = {
    /** The selection the result belongs to (see {@link precheckKey}). */
    key: string;
    /** The check could not run; the server still scans on publish. */
    failed: boolean;
    /** Guard findings that make the server refuse the post. */
    blocked: CheckFinding[];
    /** Likely credentials (critical/high); publishing needs an acknowledgement. */
    secrets: CheckFinding[];
    /** Everything else, most severe first. */
    advice: CheckFinding[];
    perFile: Record<string, { count: number; worst: AdvisorSeverity }>;
};

export const GUARD_TITLE: Copy = { TR: "Hanogt güvenlik koruması bu kodu engeller", EN: "The Hanogt guard blocks this code" };
const GUARD_FALLBACK_EN = "A pattern that is blocked in public posts was found.";
const SEVERITY_ORDER: AdvisorSeverity[] = ["critical", "high", "medium", "low", "info"];

export const severityRank = (severity: AdvisorSeverity) => SEVERITY_ORDER.indexOf(severity);

export function precheckKey(files: ReadonlyArray<{ id: string }>): string {
    return files.map((file) => file.id).join("\n");
}

export function failedPrecheck(files: ReadonlyArray<{ id: string }>): Precheck {
    return { key: precheckKey(files), failed: true, blocked: [], secrets: [], advice: [], perFile: {} };
}

/** Checks the files; `cache` keeps per-file reports between selection changes (code doesn't change meanwhile). */
export async function runPrecheck(files: readonly PrecheckFile[], cache: Map<string, AdvisorReport> = new Map()): Promise<Precheck> {
    const [{ analyzeCode }, { detectSignatures }] = await Promise.all([import("@/lib/security/advisor"), import("@/lib/security/signatures")]);
    const perFile: Precheck["perFile"] = {};
    const note = (id: string, severity: AdvisorSeverity) => {
        const entry = perFile[id];
        perFile[id] = { count: (entry?.count ?? 0) + 1, worst: entry && severityRank(entry.worst) <= severityRank(severity) ? entry.worst : severity };
    };
    const blocked: CheckFinding[] = [];
    const secrets: CheckFinding[] = [];
    const advice: CheckFinding[] = [];
    const guardText = new Map<string, Copy>();
    for (const file of files) {
        let report = cache.get(file.id);
        if (!report) {
            report = analyzeCode(file.code, advisorLanguageFor(file.lang));
            cache.set(file.id, report);
        }
        for (const finding of report.findings) {
            const item: CheckFinding = { key: `${file.id}:${finding.id}:${finding.line}`, severity: finding.severity, title: finding.title, detail: finding.why, fix: finding.fix, file: file.name, line: finding.line };
            if (finding.id.startsWith("guard:")) {
                // Guard signatures are reported from the combined scan below; blocking ones also per file.
                guardText.set(finding.id.slice(6), finding.why);
                if (finding.severity === "critical" || finding.severity === "high") blocked.push({ ...item, title: GUARD_TITLE, fix: undefined });
            } else if (finding.category === "secret" && (finding.severity === "critical" || finding.severity === "high")) {
                secrets.push(item);
            } else {
                advice.push(item);
            }
            note(file.id, finding.severity);
        }
    }
    for (const signature of detectSignatures(mediaScanText(files))) {
        const place = signature.line ? locateScanLine(files, signature.line) : null;
        const file = place ? files[place.index] : undefined;
        const item: CheckFinding = {
            key: `guard:${signature.id}`,
            severity: signature.severity,
            title: GUARD_TITLE,
            detail: guardText.get(signature.id) ?? { TR: signature.message, EN: GUARD_FALLBACK_EN },
            file: file?.name ?? "",
            line: Math.max(1, place?.line ?? 1),
        };
        if (signature.severity === "medium") {
            if (!advice.some((entry) => entry.title === GUARD_TITLE && entry.detail.TR === item.detail.TR)) advice.push(item);
        } else if (!blocked.some((entry) => entry.file === item.file && entry.detail.TR === item.detail.TR)) {
            // Only the combined text shows patterns split across files.
            blocked.push(item);
        }
    }
    const bySeverity = (a: CheckFinding, b: CheckFinding) => severityRank(a.severity) - severityRank(b.severity) || a.file.localeCompare(b.file) || a.line - b.line;
    return { key: precheckKey(files), failed: false, blocked: blocked.sort(bySeverity), secrets: secrets.sort(bySeverity), advice: advice.sort(bySeverity), perFile };
}
