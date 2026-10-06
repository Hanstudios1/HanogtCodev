/**
 * Data shapes shared by the admin API routes (src/app/api/admin/**), the public
 * announcements route and the admin UI. Only types and plain constants live
 * here so both server and client code can import it.
 */

export type StaffRole = "owner" | "admin" | "moderator";
export type UserRole = StaffRole | "user";
/** Roles that can be stored in users/{email}.role ("user" removes the field). */
export type AssignableRole = "admin" | "moderator" | "user";
export const ASSIGNABLE_ROLES: readonly AssignableRole[] = ["admin", "moderator", "user"];

export type AdminPermissions = {
    /** Media reports, news comments and Arcade moderation. */
    moderate: boolean;
    feedback: boolean;
    viewStats: boolean;
    viewSecurityEvents: boolean;
    viewAuditLog: boolean;
    /** Suspend / unsuspend accounts and change roles. */
    manageUsers: boolean;
    manageAnnouncements: boolean;
    /** Support tickets sent from Feedback/FAQ (questions, bug and security reports). */
    tickets: boolean;
    /** Permanently delete a user's account and data (admins and owners). */
    deleteUserData: boolean;
    /** Cloud health diagnostics and one-click security-rules deployment (owners only). */
    cloudHealth: boolean;
    /** Plan prices, coupons and people's plans / Hanogt AI limits (admins and owners). */
    managePlans: boolean;
};

export type AdminSectionId = "overview" | "users" | "moderation" | "tickets" | "feedback" | "announcements" | "plans" | "security" | "cloud" | "audit";

export type AdminIdentity = { isAdmin: true; email: string; role: StaffRole; permissions: AdminPermissions };
export type AdminMeResponse = { isAdmin: false } | AdminIdentity;

/** Stable machine-readable error codes returned as `{ error, code }`. */
export type AdminErrorCode =
    | "not_found"
    | "forbidden"
    | "bad_origin"
    | "rate_limited"
    | "unsupported_media_type"
    | "payload_too_large"
    | "invalid_json"
    | "unknown_field"
    | "invalid_action"
    | "invalid_id"
    | "invalid_email"
    | "invalid_role"
    | "invalid_status"
    | "invalid_text"
    | "text_required"
    | "too_long"
    | "invalid_level"
    | "invalid_link"
    | "invalid_dates"
    | "invalid_query"
    | "invalid_cursor"
    | "invalid_boolean"
    | "user_not_found"
    | "cannot_target_self"
    | "cannot_modify_owner"
    | "insufficient_role"
    | "already_suspended"
    | "not_suspended"
    | "no_change"
    | "already_handled"
    | "conflict"
    | "too_many_active"
    | "confirmation_mismatch"
    | "deploy_failed"
    | "invalid_plan"
    | "invalid_price"
    | "invalid_number"
    | "invalid_coupon"
    | "coupon_exists"
    | "paddle_unconfigured"
    | "operator_required"
    | "paddle_error"
    | "paddle_coupon_code"
    | "paddle_coupon_taken"
    // Restoring a deleted coupon whose end date has passed or whose uses are spent needs new values.
    | "coupon_restore_expired"
    | "coupon_restore_used_up"
    | "invalid_price_id"
    | "price_mismatch"
    | "already_linked"
    | "unavailable";

export type AdminErrorBody = { error: string; code: AdminErrorCode };

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export type StatKey =
    | "users"
    | "projects"
    | "mediaPosts"
    | "arcadeGames"
    | "groups"
    | "feedbackOpen"
    | "reportsOpen"
    | "newsComments"
    | "gameProjects"
    | "securityEvents7d"
    | "ticketsOpen";

/** `null` when that count could not be computed. `capped` means "at least `count`". */
export type StatCount = { count: number; capped: boolean } | null;

export type RecentSignup = {
    email: string;
    username: string;
    avatarUrl: string | null;
    provider: string | null;
    createdAt: string | null;
};

export type AdminStatsResponse = {
    counts: Record<StatKey, StatCount>;
    recentSignups: RecentSignup[];
    countCap: number;
    generatedAt: string;
};

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export type AdminUser = {
    email: string;
    username: string;
    nickname: string;
    nicknameTag: string;
    avatarUrl: string | null;
    provider: string | null;
    createdAt: string | null;
    lastLoginAt: string | null;
    lastSeenAt: string | null;
    isOnline: boolean;
    role: UserRole;
    isOwner: boolean;
    suspended: boolean;
    suspendedAt: string | null;
    suspendedBy: string | null;
    suspendReason: string | null;
    /** Two-step verification is on (only staff who may suspend can reset it). */
    twoFactorEnabled: boolean;
    /** The account has a password (asked for again after every Google sign-in); staff who may suspend can remove it. */
    hasPassword: boolean;
    /** What the requesting staff member may do with this account. */
    canSuspend: boolean;
    assignableRoles: AssignableRole[];
};

export type AdminUsersResponse = { users: AdminUser[]; nextCursor: string | null; mode: "recent" | "email" | "username" };
export type AdminUserActionResponse = { user: AdminUser; sessionsRevoked?: boolean };
export const SUSPEND_REASON_MAX = 500;

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------

export type ReportCategory = "malware" | "copyright" | "personal_data" | "spam" | "other";
export type ReportStatus = "open" | "resolved" | "dismissed";

export type AdminReportPost = {
    title: string;
    description: string;
    ownerEmail: string;
    ownerName: string;
    language: string;
    fileCount: number;
    likeCount: number;
    commentCount: number;
    createdAt: string | null;
};

export type AdminReport = {
    id: string;
    postId: string;
    category: ReportCategory;
    reason: string;
    status: ReportStatus;
    reporterEmail: string;
    createdAt: string | null;
    resolution: string | null;
    resolvedAt: string | null;
    resolvedBy: string | null;
    moderatorNote: string | null;
    /** Open reports about the same post in this result. */
    postReportCount: number;
    /** `null` when the post no longer exists. */
    post: AdminReportPost | null;
};

export type AdminReportsResponse = { reports: AdminReport[] };
export type AdminReportActionResponse = {
    reportId: string;
    status: ReportStatus;
    /** Reports closed by this action (removeContent closes every open report of the post). */
    closedReportIds: string[];
    cleanup?: "complete" | "partial";
};
export const MODERATOR_NOTE_MAX = 500;

export type AdminNewsComment = {
    id: string;
    newsId: string;
    newsTitle: string;
    newsLink: string | null;
    authorEmail: string;
    authorName: string;
    text: string;
    createdAt: string | null;
};
export type AdminNewsCommentsResponse = { comments: AdminNewsComment[] };

export type AdminArcadeGame = {
    id: string;
    title: string;
    description: string;
    dimension: "2d" | "3d";
    thumbnail: string | null;
    authorName: string;
    ownerEmail: string;
    plays: number;
    likes: number;
    featured: boolean;
    createdAt: string | null;
    updatedAt: string | null;
};
export type AdminArcadeResponse = { games: AdminArcadeGame[] };
export type AdminArcadeActionResponse = { gameId: string; featured?: boolean; unpublished?: boolean; changed: boolean };

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export type FeedbackStatus = "open" | "planned" | "in-progress" | "done" | "closed";
export const FEEDBACK_STATUSES: readonly FeedbackStatus[] = ["open", "planned", "in-progress", "done", "closed"];
export const FEEDBACK_REPLY_MAX = 1_000;
export const OFFICIAL_AUTHOR = "Hanogt Team";

export type AdminFeedbackComment = {
    id: string;
    author: string;
    content: string;
    createdAt: string | null;
    official: boolean;
    replyToContent: string | null;
};

export type AdminFeedbackItem = {
    id: string;
    type: "feedback" | "question";
    content: string;
    description: string | null;
    author: string;
    authorEmail: string;
    authorPhoto: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    likeCount: number;
    comments: AdminFeedbackComment[];
    status: FeedbackStatus;
    statusUpdatedAt: string | null;
};

export type AdminFeedbackResponse = { items: AdminFeedbackItem[] };
export type AdminFeedbackActionResponse = {
    id: string;
    status?: FeedbackStatus;
    comment?: AdminFeedbackComment;
    deleted?: boolean;
    changed: boolean;
};

// ---------------------------------------------------------------------------
// Security events and audit log
// ---------------------------------------------------------------------------

export type SecurityRisk = "low" | "medium" | "high" | "critical" | "unknown";

export type AdminSecurityEvent = {
    id: string;
    action: string;
    actor: string;
    risk: SecurityRisk;
    findingIds: string[];
    codeLength: number | null;
    fileCount: number | null;
    /** Shortened code fingerprint (never the code itself). */
    codeHash: string | null;
    reviewStatus: string | null;
    createdAt: string | null;
    /** Other small scalar fields of the event. */
    details: Record<string, string | number | boolean>;
};
export type AdminSecurityEventsResponse = { events: AdminSecurityEvent[] };

export type AdminAuditAction =
    | "user.suspend"
    | "user.unsuspend"
    | "user.set_role"
    | "user.reset_2fa"
    | "user.remove_password"
    | "report.resolve"
    | "report.dismiss"
    | "report.remove_content"
    | "media.cleanup_incomplete"
    | "news_comment.delete"
    | "arcade.unpublish"
    | "arcade.feature"
    | "arcade.unfeature"
    | "arcade.remove_scores"
    | "feedback.set_status"
    | "feedback.reply"
    | "feedback.delete"
    | "announcement.create"
    | "announcement.update"
    | "announcement.set_active"
    | "announcement.delete"
    | "ticket.reply"
    | "ticket.set_status"
    | "ticket.set_priority"
    | "ticket.delete"
    | "user.delete_data"
    | "cloud.deploy_rules"
    | "plan.set_price"
    | "coupon.create"
    | "coupon.set_active"
    | "coupon.delete"
    | "coupon.sync"
    | "coupon.restore"
    | "feature.set"
    | "ai_engine.set"
    | "paddle.set_prices"
    | "paddle.set_sales_open"
    | "paddle.create_catalog"
    | "paddle.fix_quantity"
    | "paddle.link"
    | "paddle.dismiss"
    | "paddle.resync"
    | "legal.set_info"
    | "subscription.set_plan"
    | "subscription.block"
    | "subscription.unblock"
    | "subscription.remove"
    | "subscription.reset_ai"
    | "subscription.grant_ai"
    | "ai_api.revoke_all";

export type AuditDetailValue = string | number | boolean | null;

export type AdminAuditEntry = {
    id: string;
    actor: string;
    action: string;
    target: string;
    details: Record<string, AuditDetailValue>;
    createdAt: string | null;
};
export type AdminAuditResponse = { entries: AdminAuditEntry[] };

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export type AnnouncementLevel = "info" | "success" | "warning" | "danger";
export const ANNOUNCEMENT_LEVELS: readonly AnnouncementLevel[] = ["info", "success", "warning", "danger"];
export type AnnouncementText = { TR: string; EN: string };
export const ANNOUNCEMENT_TEXT_MAX = 280;
export const ANNOUNCEMENT_LINK_MAX = 300;
export const MAX_ACTIVE_ANNOUNCEMENTS = 5;

export type AdminAnnouncement = {
    id: string;
    text: AnnouncementText;
    level: AnnouncementLevel;
    link: string | null;
    active: boolean;
    startsAt: string | null;
    endsAt: string | null;
    createdBy: string;
    createdAt: string | null;
    updatedBy: string | null;
    updatedAt: string | null;
};
export type AdminAnnouncementsResponse = { announcements: AdminAnnouncement[]; maxActive: number };
export type AdminAnnouncementActionResponse = { announcement?: AdminAnnouncement; deleted?: boolean; id: string };

/** What the public /api/announcements route exposes. */
export type PublicAnnouncement = { id: string; text: AnnouncementText; level: AnnouncementLevel; link: string | null };
export type PublicAnnouncementsResponse = { announcements: PublicAnnouncement[] };

/** Relative app path ("/news") or an https URL; anything else is rejected. */
export function isSafeAnnouncementLink(value: string) {
    if (!value || value.length > ANNOUNCEMENT_LINK_MAX || /[\u0000-\u001f\u007f\s\\<>"'`]/.test(value)) return false;
    if (value.startsWith("/")) return !value.startsWith("//");
    try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password && Boolean(url.hostname);
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Plans: prices, coupons, people's plans and Hanogt AI limits
// ---------------------------------------------------------------------------

export type AdminPriceChange = {
    plan: "plus" | "pro";
    /** Currency of the prices in this change (older entries were in TRY). */
    currency: string;
    by: string;
    at: string | null;
    from: { monthly: number | null; yearly: number | null; discountPercent: number; visible: boolean };
    to: { monthly: number | null; yearly: number | null; discountPercent: number; visible: boolean };
};

export type AdminCoupon = {
    code: string;
    percentOff: number;
    plan: "plus" | "pro" | "any";
    maxUses: number | null;
    used: number;
    expiresAt: string | null;
    active: boolean;
    note: string;
    createdBy: string;
    createdAt: string | null;
    /** The Paddle discount (dsc_…) checkout uses for this code, in the environment Paddle is set up for. */
    paddleDiscountId: string | null;
    /** Redemptions Paddle counted; null when unknown. */
    paddleTimesUsed: number | null;
    /** Payments it discounts: the first, every one, or the first 2–24. */
    recur: import("@/lib/plans").CouponRecur;
};

/** A coupon deleted in the panel, from the audit log; it can be restored. */
export type AdminDeletedCoupon = {
    code: string;
    /** null: its terms weren't recorded (created outside the panel), so it can't be restored. */
    percentOff: number | null;
    plan: "plus" | "pro" | "any";
    recur: import("@/lib/plans").CouponRecur;
    maxUses: number | null;
    expiresAt: string | null;
    note: string;
    deletedAt: string | null;
    deletedBy: string;
    /** Its Paddle discount when deleted (archived then). */
    paddleDiscountId: string | null;
    /** Redemptions Paddle counted for that discount; null when unknown. */
    paddleTimesUsed: number | null;
    /** "snapshot": recorded whole when deleted; "created": from its creation entry (deleted before snapshots). */
    source: "snapshot" | "created" | "unknown";
};

export type AdminPlansResponse = {
    catalog: import("@/lib/plans").PlanCatalog;
    history: AdminPriceChange[];
    coupons: AdminCoupon[];
    /** Newest first, at most fifty; codes in use again are left out. */
    deletedCoupons: AdminDeletedCoupon[];
    waitlist: { plus: number | null; pro: number | null };
    /** Who sees each feature that is opened step by step (src/lib/features.ts). */
    features: { audiences: import("@/lib/features").FeatureFlags; updatedAt: string | null; updatedBy: string | null };
};

/** POST /api/admin/plans { action: "restoreCoupon" }: the overview plus what happened in Paddle. */
export type AdminCouponRestoreResponse = AdminPlansResponse & { restored: { code: string; paddle: "reactivated" | "created" | "none"; paddleDiscountId: string | null } };

export type AdminUserPlanResponse = {
    email: string;
    exists: boolean;
    subscription: import("@/lib/plans").UserSubscription;
    effectivePlan: import("@/lib/plans").PlanId;
    /** Where the plan in effect comes from: the Paddle subscription or a staff assignment (null for Free). */
    planSource: "paddle" | "staff" | null;
    aiLimits: import("@/lib/plans").AiPlanLimits;
    aiUsage: { minute: { count: number; resetsAt: string } | null; window: { count: number; resetsAt: string } | null };
    /** Hanogt AI API keys the account keeps; null when they couldn't be read. */
    apiKeys: number | null;
    /** The environment Paddle is set up for; `subscription` only holds Paddle data from it. */
    paddleEnvironment: import("@/lib/paddle").PaddleEnvironment;
    /** Paddle's dashboard for that environment (links to the customer and subscription). */
    paddleDashboard: string;
};

// ---------------------------------------------------------------------------
// Paddle Billing (Admin › Subscriptions)
// ---------------------------------------------------------------------------

/** Which Paddle price (pri_…) sells each plan and billing period. */
export type AdminPaddlePlanPrices = Record<"plus" | "pro", Record<"month" | "year", string | null>>;

/** An active recurring price in Paddle, for the price mapping. */
export type AdminPaddlePrice = {
    id: string;
    productId: string;
    productName: string;
    description: string;
    interval: "month" | "year" | null;
    /** Paddle's billing cycle, e.g. "1 month" or "3 month". */
    cycle: string;
    /** Lowest currency unit, as Paddle sends it ("19900"). */
    amount: string;
    currency: string;
    trialDays: number | null;
    /** The plan the price seems to sell (hanogt_plan custom data, then the names). */
    suggestedPlan: "plus" | "pro" | null;
    /** The most one checkout may buy (Paddle's default is 100); null when Paddle didn't say. */
    quantityMax: number | null;
};

/** Configuration problems src/lib/server/paddle.ts detects (PaddleConfigWarning). */
export type AdminPaddleWarning =
    | "key_token_mismatch"
    | "environment_override_ignored"
    | "public_secret"
    | "token_is_api_key"
    | "api_key_format"
    | "client_token_format"
    | "webhook_secret_format";

/** A Paddle subscription no account could be found for (paddle_unlinked). */
export type AdminPaddleUnlinked = {
    subscriptionId: string;
    customerId: string | null;
    /** The customer's e-mail at Paddle, when it could be read. */
    customerEmail: string | null;
    status: string;
    plan: "plus" | "pro" | null;
    priceId: string | null;
    seenAt: string | null;
};

/**
 * Whether the client-side token (NEXT_PUBLIC_PADDLE_CLIENT_TOKEN) is one of
 * the API key's Paddle account (GET /client-tokens). "missing": it belongs to
 * another account or the other environment; "no_permission": the key lacks
 * client_token.read; "error": Paddle failed (see `code`).
 */
export type AdminPaddleClientTokenCheck = {
    result: "active" | "revoked" | "missing" | "no_permission" | "error";
    /** Paddle's error, e.g. "500 internal_error" (results no_permission and error). */
    code: string | null;
    /** The token's name in Paddle, when it was found. */
    name: string | null;
    checkedAt: string;
};

/** A checkout failure a browser reported (site_config/paddle_status.clientErrors); nothing about who reported it. */
export type AdminPaddleClientError = import("@/lib/paddle").PaddleClientError;

/** A billing request that failed on the server (site_config/paddle_status.serverErrors); nothing about whose it was. */
export type AdminPaddleServerError = import("@/lib/paddle").PaddleServerError;

/** GET /api/admin/paddle (and the answer to its POST actions, except resync and syncCoupon). */
export type AdminPaddleResponse = {
    /** Which variables are set (never their values). */
    config: {
        apiKey: boolean;
        clientToken: boolean;
        webhookSecret: boolean;
        environment: import("@/lib/paddle").PaddleEnvironment;
        warnings: AdminPaddleWarning[];
        /** API key and client-side token present: checkouts can be opened. */
        ready: boolean;
    };
    /** Result of listing the prices (the API check); error.code is Paddle's or "not_configured". */
    api: { ok: boolean; error: { status: number; code: string } | null };
    /** Prices, mapping and products below all belong to config.environment. */
    prices: AdminPaddlePrice[];
    mapping: AdminPaddlePlanPrices;
    suggestions: AdminPaddlePlanPrices;
    /** Products whose subscriptions unlock each plan (prices replaced earlier included). */
    products: Record<"plus" | "pro", string[]>;
    /** Both environments' settings, read-only (to carry the sandbox mapping over to live). */
    environments: Record<import("@/lib/paddle").PaddleEnvironment, AdminPaddleEnvironmentSettings>;
    /** Last change of either environment's mapping. */
    mappingUpdatedAt: string | null;
    mappingUpdatedBy: string | null;
    /** The webhook: last accepted notification and last refused delivery (with the reason). */
    status: { lastEventAt: string | null; lastEventType: string | null; lastEventResult: string | null; lastRejectedAt: string | null; lastRejectedReason: string | null };
    /** Null without an API key or a client-side token. */
    clientTokenCheck: AdminPaddleClientTokenCheck | null;
    /** The newest checkout failures browsers reported (at most ten), newest first. */
    clientErrors: AdminPaddleClientError[];
    /** The newest billing requests that failed on the server (at most ten), newest first. */
    serverErrors: AdminPaddleServerError[];
    /** Addresses to enter in Paddle. */
    urls: { webhook: string; paymentLink: string };
    unlinked: AdminPaddleUnlinked[];
    legal: import("@/lib/legal-info").OperatorInfo;
    /** Owners may change the business details, open sales and create the catalog in Paddle. */
    owner: boolean;
    /** Plans are on sale to everyone in this environment; closed, only staff and PADDLE_TESTER_EMAILS see them. */
    salesOpen: boolean;
    /** What "create the catalog" sets up: amounts in the currency's smallest unit ("2000" = $20.00). */
    expectedPrices: { currency: string } & AdminPaddleAmounts;
    dashboard: { base: string };
};

export type AdminPaddleAmounts = Record<"plus" | "pro", Record<"month" | "year", string>>;

export type AdminPaddleEnvironmentSettings = { prices: AdminPaddlePlanPrices; products: Record<"plus" | "pro", string[]>; salesOpen: boolean };

/** What POST { action: "createCatalog" } found, created and left alone in Paddle. */
export type AdminPaddleCatalogReport = {
    environment: import("@/lib/paddle").PaddleEnvironment;
    products: Array<{ plan: "plus" | "pro"; productId: string; created: boolean }>;
    prices: Array<{
        plan: "plus" | "pro";
        interval: "month" | "year";
        /** conflict: a price for this period exists with another amount or currency; nothing was created. */
        outcome: "created" | "reused" | "conflict";
        /** The price now mapped to the slot (null on a conflict). */
        priceId: string | null;
        expected: { amount: string; currency: string };
        found: Array<{ id: string; amount: string; currency: string }>;
    }>;
};

export type AdminPaddleCatalogResponse = AdminPaddleResponse & { report: AdminPaddleCatalogReport };

/** POST /api/admin/paddle { action: "resync" }: the person's plan and how many Paddle subscriptions were found. */
export type AdminPaddleResyncResponse = AdminUserPlanResponse & { found: number };

/** POST /api/admin/paddle { action: "syncCoupon" }. */
export type AdminPaddleCouponResponse = { code: string; paddleDiscountId: string };

/** Why Paddle couldn't deliver a notification, read from its delivery log (response code and body). */
export type AdminPaddleDeliveryCause =
    | "signature"
    | "signature_expired"
    | "ip_allowlist"
    | "not_configured"
    | "ip_list"
    | "processing"
    | "cloudflare"
    | "vercel_protection"
    | "redirect"
    | "not_found"
    | "rate_limited"
    | "server_error"
    | "no_response"
    | "other";

/** Something to fix so Paddle's notifications reach the site. */
export type AdminPaddleNotificationProblem =
    | "no_permission_settings"
    | "no_permission_notifications"
    | "no_destination"
    | "inactive"
    | "simulation_only"
    | "insecure_url"
    | "other_host"
    | "missing_events"
    | "secret_unset"
    | "secret_mismatch"
    | "several_destinations"
    | "deliveries_failing";

/** A notification destination in Paddle whose address ends in /api/paddle/webhook. */
export type AdminPaddleDestination = {
    id: string;
    description: string;
    /** Origin and path only. */
    url: string;
    /** Same address as the site's (SITE_URL). */
    canonicalHost: boolean;
    active: boolean;
    trafficSource: "platform" | "simulation" | "all" | null;
    /** Events the webhook needs that this destination doesn't send. */
    missingEvents: string[];
    /** Whether its secret is PADDLE_WEBHOOK_SECRET; null when that isn't set. The secret itself never leaves the server. */
    secretMatches: boolean | null;
};

/** One recent notification (nothing from its payload). */
export type AdminPaddleDelivery = {
    id: string;
    type: string;
    status: "delivered" | "failed" | "needs_retry" | "not_attempted";
    occurredAt: string | null;
    lastAttemptAt: string | null;
    retryAt: string | null;
    attempts: number;
    destinationId: string | null;
};

/** The newest delivery attempt of the newest notification that didn't arrive. */
export type AdminPaddleDeliveryAttempt = {
    notificationId: string;
    type: string;
    attemptedAt: string | null;
    /** 0 or null: no answer. */
    responseCode: number | null;
    contentType: string | null;
    /** The answer, cleaned and cut to 160 characters (HTML reduced to its title and text). */
    body: string;
    cause: AdminPaddleDeliveryCause;
};

/** POST /api/admin/paddle { action: "checkNotifications" }: read-only, nothing in Paddle changes. */
export type AdminPaddleNotificationCheck = {
    checkedAt: string;
    environment: import("@/lib/paddle").PaddleEnvironment;
    expectedUrl: string;
    access: { settings: "ok" | "no_permission" | "error"; notifications: "ok" | "no_permission" | "error" | "skipped" };
    /** Paddle's error code when a request failed for another reason than permissions. */
    errorCode: string | null;
    destinations: AdminPaddleDestination[];
    deliveries: AdminPaddleDelivery[];
    lastFailure: AdminPaddleDeliveryAttempt | null;
    problems: AdminPaddleNotificationProblem[];
    /** A working destination and no failing deliveries. */
    ok: boolean;
};

export type AdminPaddleNotificationsResponse = { check: AdminPaddleNotificationCheck };
