import { NextRequest } from "next/server";
import { canModerate, isManagerRole } from "@/lib/groups";
import { deleteServerDocument, getServerDocument, patchServerDocument, queryServerCollection } from "@/lib/server/firebase-rest";
import { mutePath } from "@/lib/server/group-moderation";
import { AUTOMOD_LIMITS, sanitizeAutoMod, sanitizeCustomWords } from "@/lib/social/automod-config";
import { forgetAutoMod, loadAutoMod } from "../_messages";
import {
    GroupApiError,
    assertRateLimit,
    assertSameOrigin,
    groupErrorResponse,
    groupJson,
    loadProfiles,
    profileName,
    readEmail,
    readId,
    readJsonBody,
    requireGroupMember,
    requireGroupUser,
} from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * The group's safety screen (group settings › Safety): AutoMod settings,
 * open reports, active mutes and the latest AutoMod stops. Moderators read
 * it and handle reports and mutes; owners and admins also change AutoMod
 * and see the group's own banned words (members never do).
 */

type ReportRecord = { reporter?: string; target?: string; reason?: string; status?: string; createdAt?: unknown };
type MuteRecord = { email?: string; until?: unknown; by?: string; reason?: string };
type EventRecord = { email?: string; rule?: string; createdAt?: unknown };

const iso = (value: unknown) => {
    const time = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : Number.NaN;
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
};

export async function GET(request: NextRequest) {
    try {
        const user = await requireGroupUser();
        await assertRateLimit(`groups:moderation-read:${user.email}`, 60, 60_000);
        const groupId = readId(request.nextUrl.searchParams.get("groupId"), "Grup kimliği");
        const { role } = await requireGroupMember(groupId, user.email);
        if (!canModerate(role)) throw new GroupApiError(403, "forbidden", "Bu bölümü moderatörler görür.");
        const now = Date.now();
        const [automod, reports, mutes, events] = await Promise.all([
            loadAutoMod(groupId, true),
            queryServerCollection<ReportRecord>("group_reports", "groupId", "EQUAL", groupId, { limit: 100 }),
            queryServerCollection<MuteRecord>("group_mutes", "groupId", "EQUAL", groupId, { limit: 100 }),
            queryServerCollection<EventRecord>("automod_events", "groupId", "EQUAL", groupId, { limit: 100 }),
        ]);
        const openReports = reports.filter((report) => report.status === "open").sort((a, b) => String(iso(b.createdAt)).localeCompare(String(iso(a.createdAt)))).slice(0, 50);
        const activeMutes = mutes.filter((mute) => (iso(mute.until) ?? "") > new Date(now).toISOString()).slice(0, 50);
        const latest = events.sort((a, b) => String(iso(b.createdAt)).localeCompare(String(iso(a.createdAt)))).slice(0, 20);
        const people = [...new Set([
            ...openReports.flatMap((report) => [report.reporter, report.target]),
            ...activeMutes.map((mute) => mute.email),
            ...latest.map((event) => event.email),
        ].filter((email): email is string => typeof email === "string"))];
        const profiles = await loadProfiles(people);
        const person = (email: string | undefined) => (email ? { email, name: profileName(email, profiles.get(email)) } : null);
        return groupJson({
            automod: automod.config,
            // The group's own banned words: owners and admins only.
            customWords: isManagerRole(role) ? automod.words : null,
            canEdit: isManagerRole(role),
            reports: openReports.map((report) => ({ id: report._id, reporter: person(report.reporter), target: person(report.target), reason: report.reason ?? "", createdAt: iso(report.createdAt) })),
            mutes: activeMutes.map((mute) => ({ person: person(mute.email), until: iso(mute.until), reason: mute.reason ?? "", byAutoMod: mute.by === "automod" })),
            events: latest.map((event) => ({ person: person(event.email), rule: event.rule ?? "", createdAt: iso(event.createdAt) })),
        });
    } catch (error) {
        return groupErrorResponse(error);
    }
}

export async function POST(request: NextRequest) {
    try {
        assertSameOrigin(request);
        const user = await requireGroupUser();
        await assertRateLimit(`groups:moderation:${user.email}`, 30, 60_000);
        const body = await readJsonBody(request, 16_384);
        const groupId = readId(body.groupId, "Grup kimliği");
        const { role } = await requireGroupMember(groupId, user.email);
        switch (body.action) {
            case "save-automod": {
                if (!isManagerRole(role)) throw new GroupApiError(403, "forbidden", "AutoMod'u grup sahibi ve yöneticiler değiştirir.");
                const config = sanitizeAutoMod(body.config);
                const words = Array.isArray(body.customWords) ? sanitizeCustomWords(body.customWords) : (await loadAutoMod(groupId, true)).words;
                if (Array.isArray(body.customWords) && body.customWords.length > AUTOMOD_LIMITS.customWords * 2) throw new GroupApiError(400, "invalid_request", "Çok fazla kelime.");
                await patchServerDocument(`group_automod/${groupId}`, { groupId, config, customWords: words, updatedAt: new Date(), updatedBy: user.email });
                forgetAutoMod(groupId);
                return groupJson({ success: true, automod: config, customWords: words });
            }
            case "resolve-report": {
                if (!canModerate(role)) throw new GroupApiError(403, "forbidden", "Raporları moderatörler kapatır.");
                const reportId = readId(body.reportId, "Rapor kimliği");
                // Only this group's reports: an id from another group is treated as missing.
                const report = await getServerDocument<{ groupId?: unknown }>(`group_reports/${reportId}`);
                if (!report || report.groupId !== groupId) throw new GroupApiError(404, "not_found", "Rapor bulunamadı.");
                await patchServerDocument(`group_reports/${reportId}`, { status: "resolved", resolvedBy: user.email, resolvedAt: new Date() }, { updateFields: ["status", "resolvedBy", "resolvedAt"], updateTime: report._updateTime });
                return groupJson({ success: true });
            }
            case "unmute": {
                if (!canModerate(role)) throw new GroupApiError(403, "forbidden", "Susturmayı moderatörler kaldırır.");
                await deleteServerDocument(mutePath(groupId, readEmail(body.targetEmail)));
                return groupJson({ success: true });
            }
            default:
                throw new GroupApiError(400, "invalid_request", "Geçersiz işlem.");
        }
    } catch (error) {
        return groupErrorResponse(error);
    }
}
