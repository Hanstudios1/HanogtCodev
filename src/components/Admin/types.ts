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
    | "report.resolve"
    | "report.dismiss"
    | "report.remove_content"
    | "media.cleanup_incomplete"
    | "news_comment.delete"
    | "arcade.unpublish"
    | "arcade.feature"
    | "arcade.unfeature"
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
    | "subscription.set_plan"
    | "subscription.block"
    | "subscription.unblock"
    | "subscription.remove"
    | "subscription.reset_ai"
    | "subscription.grant_ai";

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
// Plans ("coming soon"): prices, coupons, people's plans and Hanogt AI limits
// ---------------------------------------------------------------------------

export type AdminPriceChange = {
    plan: "plus" | "pro";
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
};

export type AdminPlansResponse = {
    catalog: import("@/lib/plans").PlanCatalog;
    history: AdminPriceChange[];
    coupons: AdminCoupon[];
    waitlist: { plus: number | null; pro: number | null };
};

export type AdminUserPlanResponse = {
    email: string;
    exists: boolean;
    subscription: import("@/lib/plans").UserSubscription;
    effectivePlan: import("@/lib/plans").PlanId;
    aiLimits: { perMinute: number; perDay: number };
    aiUsage: { minute: { count: number; resetsAt: string } | null; day: { count: number; resetsAt: string } | null };
};
