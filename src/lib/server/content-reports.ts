import "server-only";

import { REPORT_REASON_MAX, normalizeReportCategory, type ReportKind } from "@/lib/reports";
import { patchServerDocument } from "./firebase-rest";
import { emailId } from "./media";
import { cleanText } from "./validate";

/** The fields a staff decision leaves on a report (cleared when the same person reports it again). */
const RESOLUTION_FIELDS = ["resolution", "resolvedAt", "resolvedBy", "moderatorNote"];

/** One report per person and target: reporting again replaces the earlier one and puts it back in the queue. */
export function contentReportId(kind: ReportKind, targetId: string, email: string) {
    return kind === "arcade" ? `arcade_${targetId}_${emailId(email)}` : `${targetId}_${emailId(email)}`;
}

export type ContentReportInput = { kind: ReportKind; targetId: string; email: string; category: unknown; reason: unknown; now?: Date };

/**
 * Files a report of a Media post or an Arcade game in media_reports, the
 * queue staff review in the Admin Panel (Reports). Returns null when the
 * reason is empty.
 */
export async function fileContentReport(input: ContentReportInput) {
    const reason = cleanText(input.reason, REPORT_REASON_MAX);
    if (!reason) return null;
    const id = contentReportId(input.kind, input.targetId, input.email);
    const data = {
        kind: input.kind,
        ...(input.kind === "arcade" ? { gameId: input.targetId } : { postId: input.targetId }),
        reporterEmail: input.email,
        category: normalizeReportCategory(input.category),
        reason,
        status: "open",
        createdAt: input.now ?? new Date(),
    };
    await patchServerDocument(`media_reports/${id}`, data, { updateFields: [...Object.keys(data), ...RESOLUTION_FIELDS] });
    return { id, ...data };
}
