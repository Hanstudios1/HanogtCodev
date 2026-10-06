import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import {
    ANNOUNCEMENT_LEVELS,
    ANNOUNCEMENT_TEXT_MAX,
    MAX_ACTIVE_ANNOUNCEMENTS,
    isSafeAnnouncementLink,
    type AdminAnnouncementActionResponse,
    type AdminAnnouncementsResponse,
    type AnnouncementLevel,
} from "@/components/Admin/types";
import {
    AdminHttpError,
    adminFailure,
    adminJson,
    auditLogMutation,
    authorizeAdminRequest,
    claimAnnouncementSlot,
    isFirestoreConflict,
    listAnnouncements,
    normalizeAnnouncement,
    occupiesActiveSlot,
    readAdminBody,
    readText,
    requireBoolean,
    requireDocId,
    requireEnum,
} from "@/lib/server/admin";
import { commitServerMutations, getServerDocument } from "@/lib/server/firebase-rest";

export const runtime = "nodejs";

const ACTIONS = ["create", "update", "setActive", "delete"] as const;
const BODY_KEYS = ["action", "id", "text", "level", "link", "active", "startsAt", "endsAt"];
const CONTENT_KEYS = ["text", "level", "link", "startsAt", "endsAt"];
const MIN_DATE = Date.UTC(2020, 0, 1);
const MAX_DATE = Date.UTC(2100, 0, 1);

type AnnouncementInput = {
    text: { TR: string; EN: string };
    level: AnnouncementLevel;
    link: string | null;
    active: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
};

function readDate(value: unknown): Date | null {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string" || value.length > 40) throw new AdminHttpError(400, "invalid_dates");
    const time = Date.parse(value);
    if (!Number.isFinite(time) || time < MIN_DATE || time > MAX_DATE) throw new AdminHttpError(400, "invalid_dates");
    return new Date(time);
}

function readLink(value: unknown): string | null {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string") throw new AdminHttpError(400, "invalid_link");
    const link = value.trim();
    if (!link) return null;
    if (!isSafeAnnouncementLink(link)) throw new AdminHttpError(400, "invalid_link");
    return link;
}

function readInput(body: Record<string, unknown>): AnnouncementInput {
    if (!body.text || typeof body.text !== "object" || Array.isArray(body.text)) throw new AdminHttpError(400, "text_required");
    const text = body.text as Record<string, unknown>;
    if (Object.keys(text).some((key) => key !== "TR" && key !== "EN")) throw new AdminHttpError(400, "unknown_field");
    const input: AnnouncementInput = {
        text: {
            TR: readText(text.TR, { max: ANNOUNCEMENT_TEXT_MAX, required: true }),
            EN: readText(text.EN, { max: ANNOUNCEMENT_TEXT_MAX, required: true }),
        },
        level: requireEnum(body.level, ANNOUNCEMENT_LEVELS, "invalid_level"),
        link: readLink(body.link),
        active: requireBoolean(body.active),
        startsAt: readDate(body.startsAt),
        endsAt: readDate(body.endsAt),
    };
    if (input.startsAt && input.endsAt && input.endsAt.getTime() <= input.startsAt.getTime()) throw new AdminHttpError(400, "invalid_dates");
    // An active announcement that has already ended would never be shown.
    if (input.active && input.endsAt && input.endsAt.getTime() <= Date.now()) throw new AdminHttpError(400, "invalid_dates");
    return input;
}

async function loadAnnouncement(id: string) {
    const record = await getServerDocument<Record<string, unknown>>(`site_announcements/${id}`);
    const announcement = record ? normalizeAnnouncement({ ...record, _id: id }) : null;
    if (!record || !announcement) throw new AdminHttpError(404, "not_found");
    return { record, announcement };
}

function auditSummary(input: { text: { TR: string; EN: string }; level: AnnouncementLevel; active: boolean; link: string | null }) {
    return { level: input.level, active: input.active, link: input.link, textTR: input.text.TR.slice(0, 120), textEN: input.text.EN.slice(0, 120) };
}

export async function GET(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "admin" });
    if (!guard.ok) return guard.response;
    try {
        const payload: AdminAnnouncementsResponse = { announcements: await listAnnouncements(), maxActive: MAX_ACTIVE_ANNOUNCEMENTS };
        return adminJson(payload);
    } catch (error) {
        return adminFailure(error, "announcements:get");
    }
}

export async function POST(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "admin", mutation: true });
    if (!guard.ok) return guard.response;
    const actor = guard.admin.email;
    try {
        const body = await readAdminBody(request, BODY_KEYS, 8_192);
        const action = requireEnum(body.action, ACTIONS, "invalid_action");
        const now = new Date();

        if (action === "create") {
            if (body.id !== undefined) throw new AdminHttpError(400, "unknown_field");
            const input = readInput(body);
            const slot = input.active ? await claimAnnouncementSlot() : null;
            const id = randomUUID();
            const path = `site_announcements/${id}`;
            const data = { id, ...input, createdBy: actor, createdAt: now };
            await commitServerMutations([
                { type: "create", path, data },
                ...(slot ? [slot] : []),
                auditLogMutation(actor, "announcement.create", path, auditSummary(input)),
            ]);
            const response: AdminAnnouncementActionResponse = { id, announcement: normalizeAnnouncement({ ...data, _id: id }) ?? undefined };
            return adminJson(response, 201);
        }

        const id = requireDocId(body.id, 64);
        const path = `site_announcements/${id}`;
        const { record, announcement } = await loadAnnouncement(id);

        if (action === "update") {
            const input = readInput(body);
            const slot = input.active && !occupiesActiveSlot(announcement) ? await claimAnnouncementSlot(id) : null;
            const data = { ...input, updatedBy: actor, updatedAt: now };
            await commitServerMutations([
                {
                    type: "update",
                    path,
                    data,
                    updateFields: Object.keys(data),
                    // Two admins editing at once: the second save is refused, not merged.
                    ...(record._updateTime ? { updateTime: record._updateTime } : {}),
                },
                ...(slot ? [slot] : []),
                auditLogMutation(actor, "announcement.update", path, auditSummary(input)),
            ]);
            const response: AdminAnnouncementActionResponse = { id, announcement: normalizeAnnouncement({ ...record, ...data, _id: id }) ?? undefined };
            return adminJson(response);
        }

        if (CONTENT_KEYS.some((key) => body[key] !== undefined)) throw new AdminHttpError(400, "unknown_field");

        if (action === "setActive") {
            const active = requireBoolean(body.active);
            if (active === announcement.active) throw new AdminHttpError(409, "no_change");
            if (active && announcement.endsAt && Date.parse(announcement.endsAt) <= now.getTime()) throw new AdminHttpError(400, "invalid_dates");
            const slot = active ? await claimAnnouncementSlot(id) : null;
            const data = { active, updatedBy: actor, updatedAt: now };
            await commitServerMutations([
                { type: "update", path, data, updateFields: Object.keys(data), ...(record._updateTime ? { updateTime: record._updateTime } : {}) },
                ...(slot ? [slot] : []),
                auditLogMutation(actor, "announcement.set_active", path, { active, level: announcement.level, textTR: announcement.text.TR.slice(0, 120) }),
            ]);
            const response: AdminAnnouncementActionResponse = { id, announcement: normalizeAnnouncement({ ...record, ...data, _id: id }) ?? undefined };
            return adminJson(response);
        }

        if (body.active !== undefined) throw new AdminHttpError(400, "unknown_field");
        await commitServerMutations([
            { type: "delete", path },
            auditLogMutation(actor, "announcement.delete", path, auditSummary(announcement)),
        ]);
        const response: AdminAnnouncementActionResponse = { id, deleted: true };
        return adminJson(response);
    } catch (error) {
        if (isFirestoreConflict(error)) return adminFailure(new AdminHttpError(409, "conflict"), "announcements:post");
        return adminFailure(error, "announcements:post");
    }
}
