import "server-only";

import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
    ANNOUNCEMENT_LEVELS,
    ANNOUNCEMENT_TEXT_MAX,
    isSafeAnnouncementLink,
    type AdminAnnouncement,
    type AdminAuditAction,
    type AdminErrorCode,
    type AdminPermissions,
    type AnnouncementLevel,
    type AssignableRole,
    type AuditDetailValue,
    type PublicAnnouncement,
    type StaffRole,
    type UserRole,
} from "@/components/Admin/types";
import { getActiveSession } from "./active-session";
import { commitServerMutations, countServerQuery, getServerDocument, patchServerDocument, runServerQuery } from "./firebase-rest";
import { enforceRateLimitWithFallback } from "./rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "./request-security";
import { isDocId, normalizeEmail } from "./validate";

/*
 * Role model
 * ----------
 * - Owners are the built-in founder accounts below plus the ADMIN_EMAILS
 *   environment variable (comma, semicolon or whitespace separated). They
 *   always have full access and can never be demoted or suspended from the
 *   panel. Owner addresses can't be claimed with an e-mail/password sign-up
 *   (see /api/auth/signup), only with a provider that verifies the address.
 * - Staff roles are stored in the server-only field users/{email}.role
 *   ("admin" | "moderator"). Firestore rules never let clients write it.
 * - Moderators: moderation queues, feedback, statistics, security events and
 *   the audit log. Admins and owners: additionally users (suspend, roles) and
 *   site announcements. Admins manage moderators and regular users; only
 *   owners grant, revoke or suspend admins.
 */

const ROLE_RANK: Record<StaffRole, number> = { moderator: 1, admin: 2, owner: 3 };
const READ_LIMIT_PER_MINUTE = 180;
const WRITE_LIMIT_PER_MINUTE = 40;

export type AdminSession = { email: string; role: StaffRole };

/**
 * The site founder. Always an owner, also on deployments where ADMIN_EMAILS
 * was never set (the Admin Panel used to stay hidden there).
 */
export const BUILT_IN_OWNER_EMAILS: readonly string[] = ["oguzhanguluzade21@gmail.com"];

let ownerCache: { raw: string; emails: ReadonlySet<string> } | null = null;

/** Built-in owners plus ADMIN_EMAILS, lower-cased (parsed once per value). */
export function getOwnerEmails(): ReadonlySet<string> {
    const raw = process.env.ADMIN_EMAILS ?? "";
    if (!ownerCache || ownerCache.raw !== raw) {
        const emails = raw
            .split(/[\s,;]+/)
            .map((entry) => normalizeEmail(entry.replace(/^["']+|["']+$/g, "")))
            .filter(Boolean);
        ownerCache = { raw, emails: new Set([...BUILT_IN_OWNER_EMAILS, ...emails]) };
    }
    return ownerCache.emails;
}

export function isOwnerEmail(email: string) {
    return getOwnerEmails().has(email.trim().toLowerCase());
}

/** The staff role stored in Firestore; anything unexpected counts as none. */
export function parseStoredRole(value: unknown): "admin" | "moderator" | null {
    return value === "admin" || value === "moderator" ? value : null;
}

export function resolveUserRole(email: string, storedRole: unknown): UserRole {
    if (isOwnerEmail(email)) return "owner";
    return parseStoredRole(storedRole) ?? "user";
}

export function roleAtLeast(role: UserRole, minimum: StaffRole) {
    return role !== "user" && ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/** Any staff member (moderator or higher) with an active, non-suspended session. */
export async function getStaffSession(): Promise<AdminSession | null> {
    const active = await getActiveSession();
    if (!active) return null;
    const role = resolveUserRole(active.email, (active.user as Record<string, unknown>).role);
    return role === "user" ? null : { email: active.email, role };
}

/** Staff session with at least `minRole`, or null (signed out, suspended, not staff or lower role). */
export async function getAdminSession(minRole: "moderator" | "admin" = "moderator"): Promise<AdminSession | null> {
    const staff = await getStaffSession();
    return staff && roleAtLeast(staff.role, minRole) ? staff : null;
}

export function adminPermissions(role: StaffRole): AdminPermissions {
    const admin = roleAtLeast(role, "admin");
    return {
        moderate: true,
        feedback: true,
        viewStats: true,
        viewSecurityEvents: true,
        viewAuditLog: true,
        manageUsers: admin,
        manageAnnouncements: admin,
        tickets: true,
        deleteUserData: admin,
        cloudHealth: role === "owner",
        managePlans: admin,
    };
}

// ---------------------------------------------------------------------------
// Public staff badge (public_profiles/{email}.staffRole)
// ---------------------------------------------------------------------------

/** The badge other people see on a profile: the staff role, or null for everyone else. */
export function staffBadgeFor(email: string, storedRole: unknown): StaffRole | null {
    const role = resolveUserRole(email, storedRole);
    return role === "user" ? null : role;
}

/**
 * Brings public_profiles/{email}.staffRole in line with `role` (null removes
 * it). Only the server writes the field: firestore.rules keep it out of the
 * keys clients may change. The profile is read unless the caller passes it
 * and written only when the value differs; accounts without a public profile
 * are left alone (sign-up and Google sign-in create it).
 */
export async function syncStaffRoleBadge(email: string, role: StaffRole | null, knownProfile?: Record<string, unknown> | null) {
    const profile = knownProfile === undefined ? await getServerDocument<Record<string, unknown>>(`public_profiles/${email}`) : knownProfile;
    if (!profile || (profile.staffRole ?? null) === role) return false;
    try {
        await patchServerDocument(`public_profiles/${email}`, role ? { staffRole: role } : {}, { updateFields: ["staffRole"], exists: true });
    } catch (error) {
        // The profile disappeared in the meantime: there is nothing left to label.
        if (firestoreStatus(error) === 404) return false;
        throw error;
    }
    return true;
}

const BADGE_SYNC_INTERVAL_MS = 10 * 60_000;
const badgeSyncedAt = new Map<string, number>();

/**
 * syncStaffRoleBadge for GET /api/admin/me, which the header calls on page
 * loads: at most once per account and role every ten minutes per instance.
 */
export async function syncStaffRoleBadgeThrottled(email: string, role: StaffRole | null) {
    const key = `${email}|${role ?? ""}`;
    const last = badgeSyncedAt.get(key);
    if (last !== undefined && Date.now() - last < BADGE_SYNC_INTERVAL_MS) return;
    await syncStaffRoleBadge(email, role);
    if (badgeSyncedAt.size >= 1_000) badgeSyncedAt.clear();
    badgeSyncedAt.set(key, Date.now());
}

export type UserPolicy = { canSuspend: boolean; assignableRoles: AssignableRole[]; denial: AdminErrorCode | null };

/** What `actor` may do with the account of `target` (suspension and role changes). */
export function userManagementPolicy(actor: AdminSession, target: { email: string; role: UserRole }): UserPolicy {
    if (!roleAtLeast(actor.role, "admin")) return { canSuspend: false, assignableRoles: [], denial: "forbidden" };
    if (actor.email === target.email) return { canSuspend: false, assignableRoles: [], denial: "cannot_target_self" };
    if (target.role === "owner") return { canSuspend: false, assignableRoles: [], denial: "cannot_modify_owner" };
    if (actor.role === "owner") return { canSuspend: true, assignableRoles: ["admin", "moderator", "user"], denial: null };
    // Admins manage moderators and regular users only.
    if (target.role === "admin") return { canSuspend: false, assignableRoles: [], denial: "insufficient_role" };
    return { canSuspend: true, assignableRoles: ["moderator", "user"], denial: null };
}

// ---------------------------------------------------------------------------
// Responses and errors
// ---------------------------------------------------------------------------

const ERROR_MESSAGES: Record<AdminErrorCode, string> = {
    not_found: "Kayıt bulunamadı.",
    forbidden: "Bu işlem için yetkiniz yok.",
    bad_origin: "Geçersiz istek kaynağı.",
    rate_limited: "Çok fazla istek. Biraz sonra tekrar deneyin.",
    unsupported_media_type: "İstek gövdesi JSON olmalıdır.",
    payload_too_large: "İstek gövdesi çok büyük.",
    invalid_json: "Geçerli bir JSON nesnesi gönderilmelidir.",
    unknown_field: "İstek desteklenmeyen bir alan içeriyor.",
    invalid_action: "Geçersiz işlem.",
    invalid_id: "Geçersiz kayıt kimliği.",
    invalid_email: "Geçerli bir e-posta adresi girin.",
    invalid_role: "Geçersiz rol.",
    invalid_status: "Geçersiz durum.",
    invalid_text: "Metin alanı geçersiz.",
    text_required: "Metin boş olamaz.",
    too_long: "Metin izin verilen uzunluğu aşıyor.",
    invalid_level: "Geçersiz duyuru seviyesi.",
    invalid_link: "Bağlantı göreli bir yol (/...) veya https adresi olmalıdır.",
    invalid_dates: "Tarih aralığı geçersiz.",
    invalid_query: "Arama ifadesi geçersiz.",
    invalid_cursor: "Sayfa imleci geçersiz.",
    invalid_boolean: "Açık/kapalı değeri geçersiz.",
    user_not_found: "Kullanıcı bulunamadı.",
    cannot_target_self: "Bu işlemi kendi hesabınıza uygulayamazsınız.",
    cannot_modify_owner: "Sahip hesapları panelden değiştirilemez.",
    insufficient_role: "Bu hesabı yönetmek için daha yüksek bir rol gerekir.",
    already_suspended: "Hesap zaten askıya alınmış.",
    not_suspended: "Hesap askıda değil.",
    no_change: "Değişiklik yok.",
    already_handled: "Bu kayıt başka bir yönetici tarafından zaten işlendi.",
    conflict: "Kayıt aynı anda değişti; yenileyip tekrar deneyin.",
    confirmation_mismatch: "Onay metni eşleşmiyor.",
    deploy_failed: "Güvenlik kuralları yayımlanamadı.",
    invalid_plan: "Geçersiz plan.",
    invalid_price: "Fiyat 0 ile 100.000 arasında olmalıdır.",
    invalid_number: "Sayı geçersiz ya da izin verilen aralığın dışında.",
    invalid_coupon: "Kupon kodu 3-24 karakter olmalı; yalnızca büyük harf, rakam, - ve _ içerebilir.",
    coupon_exists: "Bu kupon kodu zaten var.",
    paddle_unconfigured: "Paddle yapılandırılmamış.",
    operator_required: "Satışları herkese açmadan önce İşletme bilgilerini (yasal ad ve iletişim e-postası) doldurun; Paddle'ın site incelemesi ve yasal metinler bunu istiyor.",
    paddle_error: "Paddle isteği tamamlanamadı.",
    paddle_coupon_code: "Paddle'a aktarılan kupon kodları yalnızca harf ve rakam içerebilir.",
    paddle_coupon_taken: "Bu kod Paddle'da başka bir indirime ait; silinmiş bir kuponunsa geri yükleyin, değilse başka bir kod seçin.",
    coupon_restore_expired: "Kuponun bitiş tarihi geçmiş; ileri bir tarih seçin ya da süresiz bırakın.",
    coupon_restore_used_up: "Kuponun kullanım hakkı dolmuş; daha yüksek bir sayı girin ya da sınırsız bırakın.",
    invalid_price_id: "Geçersiz Paddle fiyat kimliği.",
    price_mismatch: "Seçilen Paddle fiyatı bu plana veya faturalama aralığına uymuyor.",
    already_linked: "Bu Paddle müşterisi başka bir hesaba bağlı.",
    too_many_active: "Aynı anda en fazla 5 etkin duyuru olabilir.",
    unavailable: "Yönetim hizmeti şu anda kullanılamıyor.",
};

export class AdminHttpError extends Error {
    constructor(public readonly status: number, public readonly code: AdminErrorCode) {
        super(ERROR_MESSAGES[code]);
        this.name = "AdminHttpError";
    }
}

export function adminJson(payload: unknown, status = 200, headers: Record<string, string> = {}) {
    return NextResponse.json(payload, { status, headers: jsonSecurityHeaders({ "X-Robots-Tag": "noindex, nofollow", ...headers }) });
}

export function adminError(status: number, code: AdminErrorCode, headers: Record<string, string> = {}) {
    return adminJson({ error: ERROR_MESSAGES[code], code }, status, headers);
}

/** HTTP status attached to errors thrown by the Firestore REST helpers (0 if none). */
export function firestoreStatus(error: unknown) {
    if (!(error instanceof Error) || error instanceof AdminHttpError || !("status" in error)) return 0;
    const status = Number((error as Error & { status?: unknown }).status);
    return Number.isFinite(status) ? status : 0;
}

/** Failed write precondition (stale updateTime, document already exists, aborted transaction). */
export function isFirestoreConflict(error: unknown) {
    const status = firestoreStatus(error);
    return status === 400 || status === 409 || status === 412;
}

/**
 * Runs a read-check-commit operation again when its write precondition fails
 * (another write landed in between). The operation must re-read its documents.
 */
export async function withConflictRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            if (!isFirestoreConflict(error)) throw error;
            if (attempt >= attempts) throw new AdminHttpError(409, "conflict");
        }
    }
}

/** Turns anything thrown inside an admin route into a JSON error response. */
export function adminFailure(error: unknown, context: string) {
    if (error instanceof AdminHttpError) return adminError(error.status, error.code);
    if (firestoreStatus(error) === 404) return adminError(404, "not_found");
    console.error(`[admin:${context}]`, error instanceof Error ? error.message : error);
    return adminError(503, "unavailable");
}

// ---------------------------------------------------------------------------
// Request guard and validation
// ---------------------------------------------------------------------------

export type AdminGuard = { ok: true; admin: AdminSession } | { ok: false; response: NextResponse };

/**
 * First step of every admin route: non-staff get 404 (the panel is not
 * revealed), staff below `minRole` get 403, mutations must be same-origin and
 * everything is rate limited per staff account.
 */
export async function authorizeAdminRequest(request: NextRequest, options: { minRole: "moderator" | "admin"; mutation?: boolean }): Promise<AdminGuard> {
    const staff = await getStaffSession();
    if (!staff) return { ok: false, response: adminError(404, "not_found") };
    if (!roleAtLeast(staff.role, options.minRole)) return { ok: false, response: adminError(403, "forbidden") };
    if (options.mutation && !isSameOrigin(request)) return { ok: false, response: adminError(403, "bad_origin") };
    const bucket = options.mutation ? "write" : "read";
    const rate = await enforceRateLimitWithFallback(
        `admin:${bucket}:${staff.email}`,
        options.mutation ? WRITE_LIMIT_PER_MINUTE : READ_LIMIT_PER_MINUTE,
        60_000,
    );
    if (!rate.allowed) {
        return { ok: false, response: adminError(429, "rate_limited", { "Retry-After": String(rate.retryAfterSeconds) }) };
    }
    return { ok: true, admin: staff };
}

/** Parses a small JSON object body and rejects fields outside `allowedKeys`. */
export async function readAdminBody(request: NextRequest, allowedKeys: readonly string[], maxBytes = 16_384): Promise<Record<string, unknown>> {
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) throw new AdminHttpError(415, "unsupported_media_type");
    const declared = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(declared) && declared > maxBytes) throw new AdminHttpError(413, "payload_too_large");
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > maxBytes) throw new AdminHttpError(413, "payload_too_large");
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new AdminHttpError(400, "invalid_json");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new AdminHttpError(400, "invalid_json");
    const body = parsed as Record<string, unknown>;
    if (Object.keys(body).some((key) => !allowedKeys.includes(key))) throw new AdminHttpError(400, "unknown_field");
    return body;
}

export function requireEnum<T extends string>(value: unknown, allowed: readonly T[], code: AdminErrorCode): T {
    if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
    throw new AdminHttpError(400, code);
}

export function requireDocId(value: unknown, maxLength = 128): string {
    if (isDocId(value, maxLength)) return value;
    throw new AdminHttpError(400, "invalid_id");
}

export function requireEmail(value: unknown): string {
    const email = normalizeEmail(value);
    if (!email) throw new AdminHttpError(400, "invalid_email");
    return email;
}

export function requireBoolean(value: unknown): boolean {
    if (typeof value === "boolean") return value;
    throw new AdminHttpError(400, "invalid_boolean");
}

// Control characters and bidi overrides (which can disguise text) are removed.
const UNSAFE_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g;

export function sanitizeText(value: string, multiline: boolean) {
    const text = value.replace(/\r\n?/g, "\n").replace(UNSAFE_CHARACTERS, "");
    return (multiline ? text.replace(/\n{4,}/g, "\n\n\n") : text.replace(/[\n\t]+/g, " ")).trim();
}

/** Validated, sanitized text; absent values become "" unless `required`. */
export function readText(value: unknown, options: { max: number; required?: boolean; multiline?: boolean }): string {
    if (value === undefined || value === null) {
        if (options.required) throw new AdminHttpError(400, "text_required");
        return "";
    }
    if (typeof value !== "string") throw new AdminHttpError(400, "invalid_text");
    const text = sanitizeText(value, Boolean(options.multiline));
    if (options.required && !text) throw new AdminHttpError(400, "text_required");
    if (text.length > options.max) throw new AdminHttpError(400, "too_long");
    return text;
}

/** Firestore timestamps, ISO strings, Dates and epoch milliseconds as ISO strings. */
export function toIso(value: unknown): string | null {
    let time = Number.NaN;
    if (typeof value === "string" && value) time = Date.parse(value);
    else if (typeof value === "number") time = value;
    else if (value instanceof Date) time = value.getTime();
    return Number.isFinite(time) && Math.abs(time) <= 8.64e15 ? new Date(time).toISOString() : null;
}

export function stringOr(value: unknown, fallback = "", max = 300) {
    return typeof value === "string" ? value.slice(0, max) : fallback;
}

export function numberOr(value: unknown, fallback = 0) {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? number : fallback;
}

/** User-supplied image or link URL: only https is ever rendered by the panel. */
export function httpsUrlOrNull(value: unknown, max = 2_048) {
    return typeof value === "string" && value.length <= max && /^https:\/\/[^\s"'<>`]+$/.test(value) ? value : null;
}

// ---------------------------------------------------------------------------
// Audit log (server-only collection admin_audit_log)
// ---------------------------------------------------------------------------

export type AuditDetails = Record<string, AuditDetailValue | undefined>;

function auditRecord(actorEmail: string, action: AdminAuditAction, target: string, details: AuditDetails) {
    const clean: Record<string, AuditDetailValue> = {};
    for (const [key, value] of Object.entries(details)) {
        if (Object.keys(clean).length >= 16) break;
        if (value === undefined || !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key)) continue;
        if (typeof value === "string") clean[key] = sanitizeText(value, false).slice(0, 300);
        else if (typeof value === "number") clean[key] = Number.isFinite(value) ? value : null;
        else clean[key] = value;
    }
    return {
        path: `admin_audit_log/${randomUUID()}`,
        data: { actor: actorEmail, action, target: target.slice(0, 300), details: clean, createdAt: new Date() },
    };
}

/** Audit entry as a commitServerMutations write, so it commits atomically with the action. */
export function auditLogMutation(actorEmail: string, action: AdminAuditAction, target: string, details: AuditDetails = {}) {
    return { type: "create" as const, ...auditRecord(actorEmail, action, target, details) };
}

/** Audit entry as a commitServerPatches write (create-only). */
export function auditLogPatch(actorEmail: string, action: AdminAuditAction, target: string, details: AuditDetails = {}) {
    return { ...auditRecord(actorEmail, action, target, details), exists: false };
}

/** Standalone audit entry for actions that cannot share a commit with it. */
export async function writeAuditLog(actorEmail: string, action: AdminAuditAction, target: string, details: AuditDetails = {}) {
    await commitServerMutations([auditLogMutation(actorEmail, action, target, details)]);
}

// ---------------------------------------------------------------------------
// Firestore helpers
// ---------------------------------------------------------------------------

export type AdminQueryFilter = NonNullable<Parameters<typeof runServerQuery>[0]["where"]>[number];

/**
 * Exact COUNT() aggregation that stops at COUNT_CAP; `capped` then means
 * "at least COUNT_CAP".
 */
export const COUNT_CAP = 100_000;

export async function countDocuments(collectionId: string, where: AdminQueryFilter[] = []) {
    const count = await countServerQuery({ collectionId, where, upTo: COUNT_CAP });
    return { count, capped: count >= COUNT_CAP };
}

/** Deletes documents in atomic batches below Firestore's 500-write commit limit. */
export async function deleteDocumentsInChunks(paths: readonly string[], chunkSize = 400) {
    for (let index = 0; index < paths.length; index += chunkSize) {
        await commitServerMutations(paths.slice(index, index + chunkSize).map((path) => ({ type: "delete" as const, path })));
    }
    return paths.length;
}

// ---------------------------------------------------------------------------
// Site announcements (site_announcements, server-only)
// ---------------------------------------------------------------------------

const LEVEL_PRIORITY: Record<AnnouncementLevel, number> = { danger: 4, warning: 3, success: 2, info: 1 };

export function normalizeAnnouncement(record: Record<string, unknown> & { _id: string }): AdminAnnouncement | null {
    const text = record.text && typeof record.text === "object" && !Array.isArray(record.text) ? record.text as Record<string, unknown> : {};
    const tr = typeof text.TR === "string" ? text.TR.slice(0, ANNOUNCEMENT_TEXT_MAX) : "";
    const en = typeof text.EN === "string" ? text.EN.slice(0, ANNOUNCEMENT_TEXT_MAX) : "";
    if (!tr && !en) return null;
    const level = (ANNOUNCEMENT_LEVELS as readonly unknown[]).includes(record.level) ? record.level as AnnouncementLevel : "info";
    return {
        id: record._id,
        text: { TR: tr || en, EN: en || tr },
        level,
        link: typeof record.link === "string" && isSafeAnnouncementLink(record.link) ? record.link : null,
        active: record.active === true,
        startsAt: toIso(record.startsAt),
        endsAt: toIso(record.endsAt),
        createdBy: stringOr(record.createdBy, "", 254),
        createdAt: toIso(record.createdAt),
        updatedBy: typeof record.updatedBy === "string" ? record.updatedBy.slice(0, 254) : null,
        updatedAt: toIso(record.updatedAt),
    };
}

/** Active flag set and inside the optional [startsAt, endsAt) window. */
export function isAnnouncementLive(announcement: Pick<AdminAnnouncement, "active" | "startsAt" | "endsAt">, now = Date.now()) {
    if (!announcement.active) return false;
    if (announcement.startsAt && Date.parse(announcement.startsAt) > now) return false;
    if (announcement.endsAt && Date.parse(announcement.endsAt) <= now) return false;
    return true;
}

/** Counts toward the limit of simultaneously active announcements (scheduled ones included). */
export function occupiesActiveSlot(announcement: Pick<AdminAnnouncement, "active" | "endsAt">, now = Date.now()) {
    return announcement.active && (!announcement.endsAt || Date.parse(announcement.endsAt) > now);
}

/** Most important first: level, then the most recent start. */
export function compareAnnouncements(a: AdminAnnouncement, b: AdminAnnouncement) {
    const byLevel = LEVEL_PRIORITY[b.level] - LEVEL_PRIORITY[a.level];
    if (byLevel) return byLevel;
    return (Date.parse(b.startsAt || b.createdAt || "") || 0) - (Date.parse(a.startsAt || a.createdAt || "") || 0);
}

export function toPublicAnnouncement(announcement: AdminAnnouncement): PublicAnnouncement {
    return { id: announcement.id, text: announcement.text, level: announcement.level, link: announcement.link };
}
