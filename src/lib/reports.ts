/**
 * Reports of public content (Media posts and Arcade games) share one queue,
 * media_reports, which staff review in the Admin Panel's Reports section.
 * A report's `kind` says what it is about ("arcade" reports carry a gameId,
 * Media reports a postId; older documents have no kind and are Media ones).
 */

export const REPORT_CATEGORIES = ["malware", "copyright", "personal_data", "inappropriate", "spam", "other"] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];
export type ReportKind = "media" | "arcade";

export const REPORT_REASON_MAX = 1200;

export function normalizeReportCategory(value: unknown): ReportCategory {
    return (REPORT_CATEGORIES as readonly unknown[]).includes(value) ? value as ReportCategory : "other";
}

export function reportKindOf(record: { kind?: unknown }): ReportKind {
    return record.kind === "arcade" ? "arcade" : "media";
}
