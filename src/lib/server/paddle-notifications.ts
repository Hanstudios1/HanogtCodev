import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import type {
    AdminPaddleDelivery,
    AdminPaddleDeliveryAttempt,
    AdminPaddleDeliveryCause,
    AdminPaddleDestination,
    AdminPaddleNotificationCheck,
    AdminPaddleNotificationProblem,
} from "@/components/Admin/types";
import { PaddleApiError, getPaddleConfig, paddleRequest, reportText, type PaddleConfig } from "./paddle";

/*
 * "Bildirimleri kontrol et" in Admin › Subscriptions › Paddle: why Paddle's
 * notifications don't reach the webhook, read from Paddle itself — the
 * notification destinations (address, active, real or simulated events,
 * subscribed events, whether their secret is PADDLE_WEBHOOK_SECRET) and the
 * delivery log of the newest notification that didn't arrive (the response
 * code and body Paddle got). Only GET requests: nothing in Paddle changes.
 * Secrets are compared here and dropped; notification payloads (which carry
 * customer details) are never read into the answer.
 * Kept free of next/server so the plain-Node tests can load it.
 */

export const WEBHOOK_PATH = "/api/paddle/webhook";

/** The events the webhook acts on (docs/ENVIRONMENT.md: subscription.* and transaction.completed). */
export const REQUIRED_EVENTS = [
    "subscription.created",
    "subscription.activated",
    "subscription.updated",
    "subscription.canceled",
    "subscription.past_due",
    "subscription.paused",
    "subscription.resumed",
    "subscription.trialing",
    "transaction.completed",
] as const;

/** Problems that keep notifications from arriving (the rest only deserve a look). */
const BLOCKING: ReadonlySet<AdminPaddleNotificationProblem> = new Set([
    "no_permission_settings",
    "no_destination",
    "inactive",
    "simulation_only",
    "insecure_url",
    "missing_events",
    "secret_unset",
    "secret_mismatch",
    "deliveries_failing",
]);

type SettingEntity = {
    id?: unknown;
    description?: unknown;
    type?: unknown;
    destination?: unknown;
    active?: unknown;
    traffic_source?: unknown;
    subscribed_events?: unknown;
    endpoint_secret_key?: unknown;
};
type NotificationEntity = {
    id?: unknown;
    type?: unknown;
    status?: unknown;
    occurred_at?: unknown;
    last_attempt_at?: unknown;
    retry_at?: unknown;
    times_attempted?: unknown;
    notification_setting_id?: unknown;
};
type LogEntity = { response_code?: unknown; response_content_type?: unknown; response_body?: unknown; attempted_at?: unknown };

const DELIVERY_STATUSES = ["delivered", "failed", "needs_retry", "not_attempted"] as const;
const ID = /^[a-z]{2,10}_[a-z0-9]{10,64}$/;

/** Constant time, whatever the lengths. */
function sameSecret(a: string, b: string) {
    const digest = (value: string) => createHash("sha256").update(value).digest();
    return timingSafeEqual(digest(a), digest(b));
}

function iso(value: unknown) {
    if (typeof value !== "string") return null;
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function idOf(value: unknown) {
    return typeof value === "string" && ID.test(value) ? value : null;
}

function isPermissionError(error: unknown) {
    return error instanceof PaddleApiError && error.status === 403;
}

/**
 * An answer's body as one line of text: an HTML page is reduced to its title
 * and visible text. No control characters or e-mail addresses (reportText).
 */
export function deliveryBodyText(body: unknown, max = 160): string {
    if (typeof body !== "string" || !body) return "";
    let text = body.slice(0, 20_000);
    if (/<[a-z!/]/i.test(text)) {
        const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text)?.[1] ?? "";
        const visible = text.replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ");
        text = `${title} ${visible}`
            .replace(/&nbsp;/g, " ")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, "\"")
            .replace(/&#0?39;/g, "'")
            .replace(/&amp;/g, "&");
    }
    return reportText(text, max);
}

/** Why a delivery failed, from the response Paddle got: our webhook's own JSON answers first, then the platforms in front of it. */
export function classifyDelivery(attempt: { responseCode: number | null; contentType: string | null; body: string }): AdminPaddleDeliveryCause {
    const code = attempt.responseCode ?? 0;
    const body = attempt.body.toLowerCase();
    const json = (attempt.contentType ?? "").toLowerCase().includes("json") || body.trimStart().startsWith("{");
    if (json) {
        // src/app/api/paddle/webhook/route.ts
        if (body.includes("invalid_signature")) return body.includes("expired") ? "signature_expired" : "signature";
        if (code === 403 && body.includes("\"forbidden\"")) return "ip_allowlist";
        if (body.includes("not_configured")) return "not_configured";
        if (body.includes("retry_later")) return code === 503 ? "ip_list" : "processing";
    }
    if (!code) return "no_response";
    if (code >= 300 && code < 400) return "redirect";
    if (/cloudflare|attention required|just a moment|ray id|cf-ray|cf-chl/.test(body)) return "cloudflare";
    if ((code === 401 || code === 403) && /vercel|authentication required|\bsso\b/.test(body)) return "vercel_protection";
    if (code === 404) return "not_found";
    if (code === 429) return "rate_limited";
    if (code >= 500) return "server_error";
    return "other";
}

function destinationOf(entity: SettingEntity, site: URL, secret: string | null): AdminPaddleDestination | null {
    const id = idOf(entity.id);
    if (!id || entity.type !== "url" || typeof entity.destination !== "string") return null;
    let url: URL;
    try {
        url = new URL(entity.destination.trim());
    } catch {
        return null;
    }
    if (url.pathname.replace(/\/+$/, "") !== WEBHOOK_PATH) return null;
    const events = Array.isArray(entity.subscribed_events)
        ? entity.subscribed_events.map((event) => (event && typeof event === "object" ? (event as { name?: unknown }).name : event)).filter((name): name is string => typeof name === "string")
        : [];
    const traffic = entity.traffic_source === "platform" || entity.traffic_source === "simulation" || entity.traffic_source === "all" ? entity.traffic_source : null;
    const key = typeof entity.endpoint_secret_key === "string" ? entity.endpoint_secret_key : "";
    return {
        id,
        description: reportText(entity.description, 80),
        url: `${url.protocol}//${url.host}${url.pathname}`.slice(0, 200),
        canonicalHost: url.origin === site.origin,
        active: entity.active === true,
        trafficSource: traffic,
        missingEvents: REQUIRED_EVENTS.filter((name) => !events.includes(name)),
        secretMatches: secret ? Boolean(key) && sameSecret(key, secret) : null,
    };
}

/** The destination that matters: an active one with the right secret on the site's address, if there is one. */
function primaryOf(destinations: AdminPaddleDestination[]) {
    const score = (entry: AdminPaddleDestination) => (entry.active ? 8 : 0) + (entry.secretMatches ? 4 : 0) + (entry.canonicalHost ? 2 : 0) + (entry.trafficSource !== "simulation" ? 1 : 0);
    return [...destinations].sort((a, b) => score(b) - score(a))[0] ?? null;
}

function deliveryOf(entity: NotificationEntity): AdminPaddleDelivery | null {
    const id = idOf(entity.id);
    const status = DELIVERY_STATUSES.find((value) => value === entity.status);
    if (!id || !status) return null;
    const attempts = Number(entity.times_attempted);
    return {
        id,
        type: reportText(entity.type, 60),
        status,
        occurredAt: iso(entity.occurred_at),
        lastAttemptAt: iso(entity.last_attempt_at),
        retryAt: iso(entity.retry_at),
        attempts: Number.isInteger(attempts) && attempts >= 0 ? Math.min(attempts, 1_000) : 0,
        destinationId: idOf(entity.notification_setting_id),
    };
}

/** Paddle's answers for one notification, newest first; the newest attempt as the panel shows it. */
async function lastAttemptOf(delivery: AdminPaddleDelivery, config: PaddleConfig): Promise<AdminPaddleDeliveryAttempt | null> {
    const { data } = await paddleRequest<{ data?: LogEntity[] }>("GET", `/notifications/${delivery.id}/logs?per_page=3`, undefined, config);
    const logs = (Array.isArray(data) ? data : []).sort((a, b) => (Date.parse(String(b.attempted_at)) || 0) - (Date.parse(String(a.attempted_at)) || 0));
    const newest = logs[0];
    if (!newest) return null;
    const code = Number(newest.response_code);
    const responseCode = Number.isInteger(code) && code >= 0 && code <= 599 ? code : null;
    const contentType = typeof newest.response_content_type === "string" ? reportText(newest.response_content_type, 80) || null : null;
    // Classified on more of the body than the panel shows.
    const cause = classifyDelivery({ responseCode, contentType, body: deliveryBodyText(newest.response_body, 2_000) });
    return { notificationId: delivery.id, type: delivery.type, attemptedAt: iso(newest.attempted_at), responseCode, contentType, body: deliveryBodyText(newest.response_body), cause };
}

/**
 * Reads the configured environment's notification destinations and recent
 * deliveries from Paddle and says what keeps notifications from arriving.
 * Needs notification_setting.read (destinations) and notification.read
 * (deliveries); without them the answer says which permission is missing.
 */
export async function checkPaddleNotifications(options: { siteUrl: string; config?: PaddleConfig; now?: Date }): Promise<AdminPaddleNotificationCheck> {
    const config = options.config ?? getPaddleConfig();
    const site = new URL(options.siteUrl);
    const check: AdminPaddleNotificationCheck = {
        checkedAt: (options.now ?? new Date()).toISOString(),
        environment: config.environment,
        expectedUrl: `${site.origin}${WEBHOOK_PATH}`,
        access: { settings: "ok", notifications: "skipped" },
        errorCode: null,
        destinations: [],
        deliveries: [],
        lastFailure: null,
        problems: [],
        ok: false,
    };
    const problems = new Set<AdminPaddleNotificationProblem>();

    try {
        const { data } = await paddleRequest<{ data?: SettingEntity[] }>("GET", "/notification-settings?per_page=200", undefined, config);
        // Secrets are compared inside destinationOf and go no further.
        check.destinations = (Array.isArray(data) ? data : []).map((entity) => destinationOf(entity, site, config.webhookSecret)).filter((entry): entry is AdminPaddleDestination => Boolean(entry));
    } catch (error) {
        check.access.settings = isPermissionError(error) ? "no_permission" : "error";
        check.errorCode = error instanceof PaddleApiError ? error.code : "error";
        if (check.access.settings === "no_permission") problems.add("no_permission_settings");
        check.problems = [...problems];
        return check;
    }

    const primary = primaryOf(check.destinations);
    if (!config.webhookSecret) problems.add("secret_unset");
    if (!primary) problems.add("no_destination");
    else {
        if (!primary.active) problems.add("inactive");
        if (primary.trafficSource === "simulation") problems.add("simulation_only");
        if (primary.url.startsWith("http:")) problems.add("insecure_url");
        if (!primary.canonicalHost) problems.add("other_host");
        if (primary.missingEvents.length) problems.add("missing_events");
        if (primary.secretMatches === false) problems.add("secret_mismatch");
        if (check.destinations.filter((entry) => entry.active).length > 1) problems.add("several_destinations");
    }

    if (check.destinations.length) {
        try {
            const ids = check.destinations.map((entry) => entry.id).join(",");
            const { data } = await paddleRequest<{ data?: NotificationEntity[] }>("GET", `/notifications?notification_setting_id=${ids}&per_page=10`, undefined, config);
            check.deliveries = (Array.isArray(data) ? data : []).map(deliveryOf).filter((entry): entry is AdminPaddleDelivery => Boolean(entry)).slice(0, 10);
            check.access.notifications = "ok";
            const undelivered = check.deliveries.find((entry) => entry.status === "failed" || entry.status === "needs_retry");
            if (undelivered) check.lastFailure = await lastAttemptOf(undelivered, config);
            const newest = check.deliveries[0];
            if (newest && (newest.status === "failed" || newest.status === "needs_retry")) problems.add("deliveries_failing");
        } catch (error) {
            check.access.notifications = isPermissionError(error) ? "no_permission" : "error";
            if (check.access.notifications === "no_permission") problems.add("no_permission_notifications");
            else check.errorCode = error instanceof PaddleApiError ? error.code : "error";
        }
    }

    check.problems = [...problems];
    check.ok = check.problems.every((problem) => !BLOCKING.has(problem));
    return check;
}
