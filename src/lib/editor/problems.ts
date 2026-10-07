/**
 * The Problems panel's data: Monaco markers of the open files, grouped by
 * file and sorted (errors first, then by position). Dependency-free (tested
 * in scripts/tests); the component reads the markers from Monaco.
 */

export type ProblemSeverity = "error" | "warning" | "info";

/** The fields of a Monaco marker this module reads (monaco.editor.IMarkerData). */
export interface MarkerLike {
    severity: number;
    message: string;
    source?: string;
    code?: string | { value: string };
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
}

export interface Problem {
    /** Stable within one list (React key). */
    key: string;
    tabId: string;
    severity: ProblemSeverity;
    message: string;
    source: string;
    code: string;
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
}

export type ProblemCounts = Record<ProblemSeverity, number>;

export interface ProblemGroup {
    tabId: string;
    name: string;
    language: string;
    problems: Problem[];
    counts: ProblemCounts;
}

export const PROBLEM_SEVERITIES: readonly ProblemSeverity[] = ["error", "warning", "info"];

/** Monaco's MarkerSeverity: Hint 1, Info 2, Warning 4, Error 8. Hints aren't problems. */
export function severityOf(markerSeverity: number): ProblemSeverity | null {
    if (markerSeverity >= 8) return "error";
    if (markerSeverity >= 4) return "warning";
    if (markerSeverity >= 2) return "info";
    return null;
}

const RANK: Record<ProblemSeverity, number> = { error: 0, warning: 1, info: 2 };

export function emptyCounts(): ProblemCounts {
    return { error: 0, warning: 0, info: 0 };
}

/** The open files' markers as problem groups (in tab order) and totals. */
export function groupProblems(files: ReadonlyArray<{ tabId: string; name: string; language: string; markers: readonly MarkerLike[] }>): { groups: ProblemGroup[]; counts: ProblemCounts } {
    const counts = emptyCounts();
    const groups: ProblemGroup[] = [];
    for (const file of files) {
        const problems: Problem[] = [];
        const seen = new Set<string>();
        for (const marker of file.markers) {
            const severity = severityOf(marker.severity);
            if (!severity) continue;
            const code = typeof marker.code === "string" ? marker.code : marker.code?.value ?? "";
            const identity = `${severity}|${marker.startLineNumber}:${marker.startColumn}-${marker.endLineNumber}:${marker.endColumn}|${code}|${marker.message}`;
            // Two checkers can report the same thing; list it once.
            if (seen.has(identity)) continue;
            seen.add(identity);
            problems.push({
                key: `${file.tabId}|${identity}`,
                tabId: file.tabId,
                severity,
                message: marker.message.trim(),
                source: marker.source?.trim() ?? "",
                code,
                line: Math.max(1, marker.startLineNumber),
                column: Math.max(1, marker.startColumn),
                endLine: Math.max(1, marker.endLineNumber),
                endColumn: Math.max(1, marker.endColumn),
            });
        }
        if (!problems.length) continue;
        problems.sort((a, b) => RANK[a.severity] - RANK[b.severity] || a.line - b.line || a.column - b.column || a.message.localeCompare(b.message));
        const groupCounts = emptyCounts();
        for (const problem of problems) {
            groupCounts[problem.severity] += 1;
            counts[problem.severity] += 1;
        }
        groups.push({ tabId: file.tabId, name: file.name, language: file.language, problems, counts: groupCounts });
    }
    return { groups, counts };
}

/** The groups with only the chosen severities (groups left empty are dropped). */
export function filterProblems(groups: readonly ProblemGroup[], shown: ReadonlySet<ProblemSeverity>): ProblemGroup[] {
    const result: ProblemGroup[] = [];
    for (const group of groups) {
        const problems = group.problems.filter((problem) => shown.has(problem.severity));
        if (problems.length) result.push(problems.length === group.problems.length ? group : { ...group, problems });
    }
    return result;
}
