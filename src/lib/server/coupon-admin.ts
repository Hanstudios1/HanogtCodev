import "server-only";

import type { AdminDeletedCoupon, AuditDetailValue } from "@/components/Admin/types";
import { isPaddleId, type PaddleEnvironment } from "@/lib/paddle";
import { normalizeCouponCode, normalizeCouponRecur, type CouponRecur, type PaidPlanId } from "@/lib/plans";
import { couponPath } from "./coupons";
import { commitServerMutations, getServerDocument, runServerQuery } from "./firebase-rest";
import { PaddleApiError, getPaddleConfig, isPaddleConfigured } from "./paddle";
import {
    PaddleAdminError,
    couponDiscountId,
    createPaddleDiscount,
    getPaddleDiscount,
    reopenPaddleDiscount,
    setPaddleDiscountActive,
    type PaddleDiscountInput,
} from "./paddle-admin";

/*
 * Deleted coupons can come back (Admin › Subscriptions › Coupons › "Silinen
 * kuponlar"). Deleting keeps no document, but the audit log keeps the coupon:
 * since this change the "coupon.delete" entry holds a full copy of it, and for
 * coupons deleted before, the terms come from their "coupon.create" entry.
 * Restoring writes the coupon again and reopens its Paddle discount (or makes
 * a new one when Paddle won't reopen it). Kept free of next/server and ./admin
 * so the plain-Node tests can load it; the route passes its audit entry in.
 */

type Mutation = Parameters<typeof commitServerMutations>[0][number];
type AuditEntry = { action?: unknown; target?: unknown; actor?: unknown; details?: unknown; createdAt?: unknown };

const AUDIT_COLLECTION = "admin_audit_log";
/** Audit entries read per list; the panel shows the newest fifty deleted coupons. */
const AUDIT_READ_MAX = 500;
const DELETED_MAX = 50;

type CouponTerms = {
    percentOff: number;
    plan: PaidPlanId | "any";
    maxUses: number | null;
    expiresAt: string | null;
    recur: CouponRecur;
    note: string;
    createdBy: string | null;
};

function isoOf(value: unknown): string | null {
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
    if (typeof value === "string") {
        const time = Date.parse(value);
        return Number.isFinite(time) ? new Date(time).toISOString() : null;
    }
    if (value && typeof value === "object" && typeof (value as { seconds?: unknown }).seconds === "number") return new Date((value as { seconds: number }).seconds * 1000).toISOString();
    return null;
}

function timeOf(entry: AuditEntry) {
    return Date.parse(isoOf(entry.createdAt) ?? "") || 0;
}

function detailsOf(entry: AuditEntry): Record<string, unknown> {
    return entry.details && typeof entry.details === "object" ? entry.details as Record<string, unknown> : {};
}

/** The coupon an audit entry is about (its target, plan_coupons/CODE). */
function codeOf(entry: AuditEntry) {
    const target = typeof entry.target === "string" && entry.target.startsWith("plan_coupons/") ? entry.target.slice("plan_coupons/".length) : detailsOf(entry).code;
    return normalizeCouponCode(target);
}

function planOf(value: unknown): PaidPlanId | "any" {
    return value === "plus" || value === "pro" ? value : "any";
}

function usesOf(value: unknown) {
    return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

/** A coupon's terms as an audit entry recorded them; null without a valid percentage. */
function termsOf(details: Record<string, unknown>): CouponTerms | null {
    const percentOff = typeof details.percentOff === "number" && Number.isInteger(details.percentOff) && details.percentOff >= 1 && details.percentOff <= 100 ? details.percentOff : null;
    if (percentOff === null) return null;
    return {
        percentOff,
        plan: planOf(details.plan),
        maxUses: usesOf(details.maxUses),
        expiresAt: isoOf(details.expiresAt),
        // Entries from before "Geçerli ödemeler" have none: the first payment, as those coupons were.
        recur: normalizeCouponRecur(details.recur),
        note: typeof details.note === "string" ? details.note.slice(0, 300) : "",
        createdBy: typeof details.createdBy === "string" ? details.createdBy.slice(0, 254) : null,
    };
}

/**
 * What the "coupon.delete" audit entry keeps of a coupon, so it can be
 * restored: its terms, note, Paddle discount (of the configured environment)
 * and who made it. At most 16 keys (auditRecord's limit).
 */
export function couponDeletionDetails(record: Record<string, unknown>, code: string, environment: PaddleEnvironment): Record<string, AuditDetailValue> {
    const percentOff = typeof record.percentOff === "number" && Number.isInteger(record.percentOff) ? record.percentOff : null;
    return {
        code,
        percentOff,
        plan: planOf(record.plan),
        maxUses: usesOf(record.maxUses),
        expiresAt: isoOf(record.expiresAt),
        recur: String(normalizeCouponRecur(record.recur)),
        note: typeof record.note === "string" ? record.note.slice(0, 300) : "",
        active: record.active === true,
        paddleDiscountId: couponDiscountId(record, environment),
        environment,
        createdBy: typeof record.createdBy === "string" ? record.createdBy.slice(0, 254) : null,
        createdAt: isoOf(record.createdAt),
    };
}

type DeletedCoupon = AdminDeletedCoupon & { terms: CouponTerms | null; environment: PaddleEnvironment | null };

/** One deleted coupon from its newest "coupon.delete" entry and, when that has no copy, its newest earlier "coupon.create" entry. */
function deletedCouponOf(code: string, deletion: AuditEntry, creations: AuditEntry[]): DeletedCoupon {
    const details = detailsOf(deletion);
    const deletedAt = timeOf(deletion);
    const snapshot = termsOf(details);
    const creation = snapshot ? null : creations.filter((entry) => timeOf(entry) <= deletedAt).sort((a, b) => timeOf(b) - timeOf(a))[0] ?? null;
    const created = creation ? termsOf(detailsOf(creation)) : null;
    const terms = snapshot ?? (created ? { ...created, createdBy: typeof creation?.actor === "string" ? creation.actor : null } : null);
    const discount = [details.paddleDiscountId, creation ? detailsOf(creation).paddleDiscountId : null].find((id) => isPaddleId("discount", id));
    return {
        code,
        percentOff: terms?.percentOff ?? null,
        plan: terms?.plan ?? "any",
        recur: terms?.recur ?? "first",
        maxUses: terms?.maxUses ?? null,
        expiresAt: terms?.expiresAt ?? null,
        note: terms?.note ?? "",
        deletedAt: isoOf(deletion.createdAt),
        deletedBy: typeof deletion.actor === "string" ? deletion.actor : "",
        paddleDiscountId: typeof discount === "string" ? discount : null,
        paddleTimesUsed: null,
        source: snapshot ? "snapshot" : created ? "created" : "unknown",
        terms,
        environment: details.environment === "sandbox" || details.environment === "production" ? details.environment : null,
    };
}

/** What the panel gets (no internal fields). */
function publicView(coupon: DeletedCoupon): AdminDeletedCoupon {
    const { code, percentOff, plan, recur, maxUses, expiresAt, note, deletedAt, deletedBy, paddleDiscountId, paddleTimesUsed, source } = coupon;
    return { code, percentOff, plan, recur, maxUses, expiresAt, note, deletedAt, deletedBy, paddleDiscountId, paddleTimesUsed, source };
}

/** Deleted coupons whose code isn't in use again, newest deletion first (at most fifty). */
export async function listDeletedCoupons(existingCodes: ReadonlySet<string>): Promise<AdminDeletedCoupon[]> {
    // Two equality queries (no composite index needed), sorted here.
    const [deletions, creations] = await Promise.all([
        runServerQuery<AuditEntry>({ collectionId: AUDIT_COLLECTION, where: [{ field: "action", op: "EQUAL", value: "coupon.delete" }], limit: AUDIT_READ_MAX }),
        runServerQuery<AuditEntry>({ collectionId: AUDIT_COLLECTION, where: [{ field: "action", op: "EQUAL", value: "coupon.create" }], limit: AUDIT_READ_MAX }),
    ]);
    const newest = new Map<string, AuditEntry>();
    for (const entry of deletions) {
        const code = codeOf(entry);
        if (!code || existingCodes.has(code)) continue;
        const known = newest.get(code);
        if (!known || timeOf(entry) > timeOf(known)) newest.set(code, entry);
    }
    return [...newest.entries()]
        .sort(([, a], [, b]) => timeOf(b) - timeOf(a))
        .slice(0, DELETED_MAX)
        .map(([code, entry]) => publicView(deletedCouponOf(code, entry, creations.filter((creation) => codeOf(creation) === code))));
}

/** The newest deletion of one code, with its terms; null when the audit log has none. */
async function deletedCoupon(code: string): Promise<DeletedCoupon | null> {
    const entries = await runServerQuery<AuditEntry>({ collectionId: AUDIT_COLLECTION, where: [{ field: "target", op: "EQUAL", value: couponPath(code) }], limit: AUDIT_READ_MAX });
    const deletion = entries.filter((entry) => entry.action === "coupon.delete").sort((a, b) => timeOf(b) - timeOf(a))[0];
    return deletion ? deletedCouponOf(code, deletion, entries.filter((entry) => entry.action === "coupon.create")) : null;
}

export type CouponRestoreInput = {
    code: unknown;
    /** A new end date (validated by the route), null for none; left out: the old one. */
    expiresAt?: Date | null;
    /** A new usage limit, null for unlimited; left out: the old one. */
    maxUses?: number | null;
};

export type CouponRestoreResult = { code: string; paddle: "reactivated" | "created" | "none"; paddleDiscountId: string | null };

/**
 * Writes a deleted coupon again with its recorded terms (a new end date or
 * usage limit when given) and reopens its Paddle discount, or makes a new one
 * when it's gone, belongs to the other environment or Paddle won't reopen it.
 * `audit` turns the outcome into the "coupon.restore" entry, committed with
 * the coupon. If that write fails, a discount opened here is archived again.
 */
export async function restoreCoupon(input: CouponRestoreInput, actor: string, audit: (details: Record<string, AuditDetailValue>) => Mutation, now = new Date()): Promise<CouponRestoreResult> {
    const code = normalizeCouponCode(input.code);
    if (!code) throw new PaddleAdminError("invalid_coupon");
    const path = couponPath(code);
    if (await getServerDocument(path)) throw new PaddleAdminError("coupon_exists");
    const deleted = await deletedCoupon(code);
    if (!deleted?.terms) throw new PaddleAdminError("not_found");
    const terms = deleted.terms;
    const maxUses = input.maxUses !== undefined ? input.maxUses : terms.maxUses;
    const expiresAt = input.expiresAt !== undefined ? input.expiresAt : terms.expiresAt ? new Date(terms.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= now.getTime()) throw new PaddleAdminError("coupon_restore_expired");

    const config = getPaddleConfig();
    let paddle: CouponRestoreResult["paddle"] = "none";
    let discountId: string | null = null;
    if (isPaddleConfigured(config)) {
        const known = deleted.paddleDiscountId && (!deleted.environment || deleted.environment === config.environment) ? deleted.paddleDiscountId : null;
        if (known) {
            const discount = await getPaddleDiscount(known).catch((error: unknown) => {
                // Gone, or the other environment's id: a new discount below.
                if (error instanceof PaddleApiError && (error.status === 404 || error.status === 400)) return null;
                throw error;
            });
            if (discount) {
                const used = typeof discount.times_used === "number" && Number.isFinite(discount.times_used) ? discount.times_used : 0;
                if (maxUses !== null && used >= maxUses) throw new PaddleAdminError("coupon_restore_used_up");
                try {
                    await reopenPaddleDiscount(known, { plan: terms.plan, maxUses, expiresAt });
                    discountId = known;
                    paddle = "reactivated";
                } catch (error) {
                    // Refused (an expired or used discount may not reopen): a new one below. Paddle down: fail.
                    if (!(error instanceof PaddleApiError) || error.status === 0 || error.status >= 500) throw error;
                }
            }
        }
        if (!discountId) {
            const discountInput: PaddleDiscountInput = { code, percentOff: terms.percentOff, plan: terms.plan, maxUses, expiresAt, recur: terms.recur };
            discountId = await createPaddleDiscount(discountInput).catch((error: unknown) => {
                // The old discount keeps the code (archived ones too): this one gets a code Paddle makes up.
                if (error instanceof PaddleApiError && error.code === "discount_code_conflict") return createPaddleDiscount({ ...discountInput, checkoutCode: false });
                throw error;
            });
            paddle = "created";
        }
    }

    const data = {
        code,
        percentOff: terms.percentOff,
        plan: terms.plan,
        maxUses,
        used: 0,
        expiresAt,
        recur: terms.recur,
        active: true,
        note: terms.note,
        createdBy: terms.createdBy ?? actor,
        createdAt: now,
        restoredAt: now,
        restoredBy: actor,
        paddleDiscountId: discountId,
        ...(discountId ? { paddleEnvironment: config.environment } : {}),
    };
    try {
        await commitServerMutations([
            { type: "create", path, data },
            audit({
                code,
                percentOff: terms.percentOff,
                plan: terms.plan,
                maxUses,
                expiresAt: expiresAt?.toISOString() ?? null,
                recur: String(terms.recur),
                paddleDiscountId: discountId,
                paddleResult: paddle,
            }),
        ]);
    } catch (error) {
        // No discount left open that no coupon points to (a reopened one was archived before).
        if (discountId) await setPaddleDiscountActive(discountId, false).catch(() => undefined);
        throw error;
    }
    return { code, paddle, paddleDiscountId: discountId };
}
