import type { NextRequest } from "next/server";
import type { AdminPaddleCatalogResponse, AdminPaddleCouponResponse, AdminPaddleResponse, AdminPaddleResyncResponse, AdminPaddleWarning } from "@/components/Admin/types";
import { OPERATOR_LIMITS, operatorInfoErrors } from "@/lib/legal-info";
import { isPaddleId, type PaddleEnvironment } from "@/lib/paddle";
import { normalizeCouponCode } from "@/lib/plans";
import {
    AdminHttpError,
    adminError,
    adminFailure,
    adminJson,
    auditLogMutation,
    authorizeAdminRequest,
    isFirestoreConflict,
    readAdminBody,
    readText,
    requireBoolean,
    requireEmail,
    requireEnum,
    toIso,
    writeAuditLog,
} from "@/lib/server/admin";
import { commitServerMutations, getServerDocument } from "@/lib/server/firebase-rest";
import { LEGAL_INFO_PATH, getOperatorInfo, saveOperatorInfo } from "@/lib/server/legal-info";
import {
    PADDLE_SETTINGS_PATH,
    PaddleApiError,
    getPaddleConfig,
    isPaddleConfigured,
    normalizePaddleSettings,
    paddleDashboardUrl,
    unlinkedPath,
} from "@/lib/server/paddle";
import {
    EMPTY_WEBHOOK_STATUS,
    EXPECTED_PRICES,
    adminPersonPlan,
    couponDiscountId,
    createPaddleDiscount,
    ensurePaddleCatalog,
    isPaddleDiscountCode,
    linkSubscription,
    listPaddlePrices,
    listUnlinked,
    paddleAdminFailure,
    paddleCustomerEmails,
    readPaddleStatus,
    resyncAccount,
    savePaddlePrices,
    setPaddleDiscountActive,
    setSalesOpen,
    suggestPriceMapping,
    validatePriceMapping,
    type AdminPaddlePrice,
} from "@/lib/server/paddle-admin";

export const runtime = "nodejs";

const ACTIONS = ["setPrices", "setSalesOpen", "createCatalog", "link", "dismissUnlinked", "resync", "setLegal", "syncCoupon"] as const;
const LEGAL_FIELDS = ["legalName", "brand", "contactEmail", "address", "taxId", "kep"] as const;
const BODY_KEYS = ["action", "prices", "open", "subscriptionId", "email", "code", ...LEGAL_FIELDS];

const EXPECTED_AMOUNTS: AdminPaddleResponse["expectedPrices"] = {
    currency: EXPECTED_PRICES.currency,
    plus: { month: String(EXPECTED_PRICES.plus.month), year: String(EXPECTED_PRICES.plus.year) },
    pro: { month: String(EXPECTED_PRICES.pro.month), year: String(EXPECTED_PRICES.pro.year) },
};

/** The prices and the API check in one: listing the prices is the check. */
async function priceListing(apiKey: boolean): Promise<{ prices: AdminPaddlePrice[]; api: AdminPaddleResponse["api"] }> {
    if (!apiKey) return { prices: [], api: { ok: false, error: { status: 0, code: "not_configured" } } };
    try {
        return { prices: await listPaddlePrices(), api: { ok: true, error: null } };
    } catch (error) {
        const failure = error instanceof PaddleApiError ? { status: error.status, code: error.code } : { status: 0, code: "unexpected" };
        console.error("[admin:paddle:prices]", failure.status || "network", failure.code);
        return { prices: [], api: { ok: false, error: failure } };
    }
}

async function overview(origin: string, owner: boolean): Promise<AdminPaddleResponse> {
    const config = getPaddleConfig();
    const [settingsRecord, status, unlinked, legal, listing] = await Promise.all([
        getServerDocument<Record<string, unknown>>(PADDLE_SETTINGS_PATH),
        readPaddleStatus().catch(() => EMPTY_WEBHOOK_STATUS),
        listUnlinked(20, config.environment).catch(() => []),
        getOperatorInfo(true),
        priceListing(Boolean(config.apiKey)),
    ]);
    const settings = normalizePaddleSettings(settingsRecord, config.environment);
    const environmentSettings = (environment: PaddleEnvironment) => {
        const scoped = normalizePaddleSettings(settingsRecord, environment);
        return { prices: scoped.prices, products: scoped.products, salesOpen: scoped.salesOpen };
    };
    if (listing.api.ok && unlinked.length) {
        // Best effort: Paddle's e-mail for the customer helps to find the account.
        const emails = await paddleCustomerEmails(unlinked.flatMap((entry) => (entry.customerId ? [entry.customerId] : []))).catch(() => null);
        for (const entry of unlinked) entry.customerEmail = (entry.customerId && emails?.get(entry.customerId)) || null;
    }
    const warnings: AdminPaddleWarning[] = config.warnings;
    return {
        config: {
            apiKey: Boolean(config.apiKey),
            clientToken: Boolean(config.clientToken),
            webhookSecret: Boolean(config.webhookSecret),
            environment: config.environment,
            warnings,
            ready: isPaddleConfigured(config),
        },
        api: listing.api,
        prices: listing.prices,
        mapping: settings.prices,
        suggestions: suggestPriceMapping(listing.prices),
        products: settings.products,
        environments: { sandbox: environmentSettings("sandbox"), production: environmentSettings("production") },
        mappingUpdatedAt: toIso(settings.updatedAt),
        mappingUpdatedBy: settings.updatedBy,
        status,
        urls: { webhook: `${origin}/api/paddle/webhook`, paymentLink: `${origin}/plans` },
        unlinked,
        legal,
        owner,
        salesOpen: settings.salesOpen,
        expectedPrices: EXPECTED_AMOUNTS,
        dashboard: { base: paddleDashboardUrl(config.environment, "") },
    };
}

/** Paddle and this module's errors first: their `status` would otherwise read as a Firestore status. */
function failure(error: unknown, context: string) {
    const paddle = paddleAdminFailure(error);
    if (paddle) {
        if (error instanceof PaddleApiError) console.error(`[admin:${context}]`, error.status || "network", error.code);
        return adminError(paddle.status, paddle.code);
    }
    if (isFirestoreConflict(error)) return adminError(409, "conflict");
    return adminFailure(error, context);
}

function requireSubscriptionId(value: unknown) {
    if (isPaddleId("subscription", value)) return value;
    throw new AdminHttpError(400, "invalid_id");
}

/**
 * GET /api/admin/paddle: the Paddle connection (which variables are set,
 * whether the API answers, the last webhook delivery), the configured
 * environment's prices and their mapping, subscriptions without an account
 * and the business details shown in the legal texts.
 */
export async function GET(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "admin" });
    if (!guard.ok) return guard.response;
    try {
        return adminJson(await overview(request.nextUrl.origin, guard.admin.role === "owner"));
    } catch (error) {
        return failure(error, "paddle:get");
    }
}

/**
 * POST /api/admin/paddle (everything about Paddle is for the environment the keys belong to)
 *   { action: "setPrices", prices: { plus: { month, year }, pro: { month, year } } }
 *   { action: "setSalesOpen", open }              owners only; closed = staff and testers only
 *   { action: "createCatalog" }                   owners only; adds what's missing in Paddle (+ report)
 *   { action: "link", subscriptionId, email }     an unlinked subscription → that account
 *   { action: "dismissUnlinked", subscriptionId }
 *   { action: "resync", email }                   → the person's plan (AdminPaddleResyncResponse)
 *   { action: "setLegal", legalName, brand, contactEmail, address, taxId, kep }   owners only
 *   { action: "syncCoupon", code }                creates the coupon's Paddle discount
 * The others answer with the fresh GET payload.
 */
export async function POST(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "admin", mutation: true });
    if (!guard.ok) return guard.response;
    const actor = guard.admin.email;
    const owner = guard.admin.role === "owner";
    const origin = request.nextUrl.origin;
    try {
        const body = await readAdminBody(request, BODY_KEYS, 8_192);
        const action = requireEnum(body.action, ACTIONS, "invalid_action");
        const config = getPaddleConfig();

        if (action === "setPrices") {
            // Without the price list (no key, or Paddle unreachable) only the form of the ids can be checked.
            const known = config.apiKey ? await listPaddlePrices().catch(() => null) : null;
            const prices = validatePriceMapping(body.prices, known);
            await savePaddlePrices(prices, actor, known, [
                auditLogMutation(actor, "paddle.set_prices", PADDLE_SETTINGS_PATH, {
                    environment: config.environment,
                    plusMonth: prices.plus.month,
                    plusYear: prices.plus.year,
                    proMonth: prices.pro.month,
                    proYear: prices.pro.year,
                    checked: known !== null,
                }),
            ], { environment: config.environment });
            return adminJson(await overview(origin, owner));
        }

        if (action === "setSalesOpen") {
            if (!owner) throw new AdminHttpError(403, "forbidden");
            const open = requireBoolean(body.open);
            const changed = await setSalesOpen(open, actor, [auditLogMutation(actor, "paddle.set_sales_open", PADDLE_SETTINGS_PATH, { environment: config.environment, open })], config.environment);
            if (!changed) throw new AdminHttpError(409, "no_change");
            return adminJson(await overview(origin, owner));
        }

        if (action === "setLegal") {
            if (!owner) throw new AdminHttpError(403, "forbidden");
            const input = Object.fromEntries(LEGAL_FIELDS.map((key) => [key, readText(body[key], { max: OPERATOR_LIMITS[key] })])) as Record<(typeof LEGAL_FIELDS)[number], string>;
            // Lengths were checked above; what is left are the e-mail and KEP addresses.
            if (operatorInfoErrors(input).length) throw new AdminHttpError(400, "invalid_email");
            await saveOperatorInfo(input, actor, [auditLogMutation(actor, "legal.set_info", LEGAL_INFO_PATH, input)]);
            return adminJson(await overview(origin, owner));
        }

        if (action === "dismissUnlinked") {
            const subscriptionId = requireSubscriptionId(body.subscriptionId);
            const path = unlinkedPath(subscriptionId);
            const record = await getServerDocument<Record<string, unknown>>(path);
            if (!record) throw new AdminHttpError(404, "not_found");
            await commitServerMutations([
                { type: "delete", path, ...(record._updateTime ? { updateTime: record._updateTime } : {}) },
                auditLogMutation(actor, "paddle.dismiss", path, { subscriptionId, customerId: isPaddleId("customer", record.customerId) ? record.customerId : null }),
            ]);
            return adminJson(await overview(origin, owner));
        }

        // The remaining actions talk to Paddle.
        if (!config.apiKey) throw new AdminHttpError(409, "paddle_unconfigured");

        if (action === "createCatalog") {
            if (!owner) throw new AdminHttpError(403, "forbidden");
            const report = await ensurePaddleCatalog(actor);
            const count = (outcome: string) => report.prices.filter((entry) => entry.outcome === outcome).length;
            // Its own entry once the report is known, since the counts go into it.
            await writeAuditLog(actor, "paddle.create_catalog", PADDLE_SETTINGS_PATH, {
                environment: report.environment,
                created: report.products.filter((entry) => entry.created).length + count("created"),
                reused: report.products.filter((entry) => !entry.created).length + count("reused"),
                conflicts: count("conflict"),
            });
            return adminJson({ ...(await overview(origin, owner)), report } satisfies AdminPaddleCatalogResponse);
        }

        if (action === "link") {
            const subscriptionId = requireSubscriptionId(body.subscriptionId);
            const email = requireEmail(body.email);
            const result = await linkSubscription(subscriptionId, email);
            await writeAuditLog(actor, "paddle.link", `subscriptions/${email}`, { email, subscriptionId, result: result.status, environment: config.environment });
            return adminJson(await overview(origin, owner));
        }

        if (action === "resync") {
            const email = requireEmail(body.email);
            const found = await resyncAccount(email);
            await writeAuditLog(actor, "paddle.resync", `subscriptions/${email}`, { email, found, environment: config.environment });
            return adminJson({ ...(await adminPersonPlan(email)), found } satisfies AdminPaddleResyncResponse);
        }

        // syncCoupon: an existing coupon gets its Paddle discount (e.g. one made before Paddle was connected).
        if (!isPaddleConfigured(config)) throw new AdminHttpError(409, "paddle_unconfigured");
        const code = normalizeCouponCode(body.code);
        if (!code) throw new AdminHttpError(400, "invalid_coupon");
        if (!isPaddleDiscountCode(code)) throw new AdminHttpError(400, "paddle_coupon_code");
        const path = `plan_coupons/${code}`;
        const record = await getServerDocument<Record<string, unknown>>(path);
        if (!record) throw new AdminHttpError(404, "not_found");
        if (couponDiscountId(record, config.environment)) throw new AdminHttpError(409, "no_change");
        // A switched-off coupon is turned on first (which then has nothing to mirror).
        if (record.active !== true) throw new AdminHttpError(409, "invalid_status");
        const expiresAt = toIso(record.expiresAt);
        if (expiresAt && Date.parse(expiresAt) <= Date.now()) throw new AdminHttpError(409, "invalid_dates");
        const percentOff = typeof record.percentOff === "number" && Number.isInteger(record.percentOff) && record.percentOff >= 1 && record.percentOff <= 100 ? record.percentOff : null;
        if (percentOff === null) throw new AdminHttpError(409, "invalid_number");
        const discountId = await createPaddleDiscount({
            code,
            percentOff,
            plan: record.plan === "plus" || record.plan === "pro" ? record.plan : "any",
            maxUses: typeof record.maxUses === "number" && Number.isInteger(record.maxUses) && record.maxUses > 0 ? record.maxUses : null,
            expiresAt,
        });
        try {
            await commitServerMutations([
                {
                    type: "update",
                    path,
                    data: { paddleDiscountId: discountId, paddleEnvironment: config.environment, updatedAt: new Date(), updatedBy: actor },
                    updateFields: ["paddleDiscountId", "paddleEnvironment", "updatedAt", "updatedBy"],
                    ...(record._updateTime ? { updateTime: record._updateTime } : {}),
                },
                auditLogMutation(actor, "coupon.sync", path, { code, paddleDiscountId: discountId, environment: config.environment }),
            ]);
        } catch (error) {
            // No live discount the panel doesn't know about.
            await setPaddleDiscountActive(discountId, false).catch(() => undefined);
            throw error;
        }
        return adminJson({ code, paddleDiscountId: discountId } satisfies AdminPaddleCouponResponse);
    } catch (error) {
        return failure(error, "paddle:post");
    }
}
