/**
 * Data shapes of the support-ticket admin API (/api/admin/tickets) shared by
 * the route and TicketsSection. Types and plain constants only, so server and
 * client code can both import it. Categories, statuses, limits, labels and the
 * sender-record rules live in "@/lib/support".
 */
import type {
    SupportTicketMessage,
    SupportTicketMeta,
    TicketCategory,
    TicketMessageFrom,
    TicketPriority,
    TicketSeverity,
    TicketStatus,
    UserRecordSummary,
} from "@/lib/support";
import type { UserRole } from "./types";

/** Status filter of the inbox: one status, every active one (default) or all. */
export type TicketStatusFilter = TicketStatus | "active" | "all";
export const TICKET_STATUS_FILTERS: readonly TicketStatusFilter[] = ["active", "open", "in_progress", "answered", "resolved", "closed", "all"];

export const ADMIN_TICKET_PAGE_SIZE = 25;
export const ADMIN_TICKET_QUERY_MAX = 80;

export type AdminTicketListItem = {
    id: string;
    reference: string;
    category: TicketCategory;
    title: string;
    status: TicketStatus;
    priority: TicketPriority;
    severity: TicketSeverity | null;
    authorEmail: string;
    authorName: string;
    authorAvatar: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    lastMessageAt: string | null;
    lastMessageFrom: TicketMessageFrom | null;
    lastMessagePreview: string;
    messageCount: number;
    /** The author wrote something the team hasn't opened yet. */
    unreadForStaff: boolean;
    /** The team replied and the author hasn't opened it yet. */
    unreadForUser: boolean;
    /** Appeal against a suspension, filed from the login page (meta.appeal). */
    appeal: boolean;
};

export type AdminTicketDetail = AdminTicketListItem & {
    description: string;
    meta: SupportTicketMeta;
    messages: SupportTicketMessage[];
};

/** Public-profile fields for ProfileModal (all optional except the name). */
export type TicketSenderProfile = {
    username: string;
    nickname?: string;
    nicknameTag?: string;
    avatarUrl?: string;
    bannerUrl?: string;
    bio?: string;
    customStatus?: string;
    statusEmoji?: string;
    accentColor?: string;
    favoriteLangs?: string[];
    socialGithub?: string;
    socialLinkedin?: string;
    socialTwitter?: string;
    socialWebsite?: string;
    badges?: string[];
    dndMode?: boolean;
    isOnline?: boolean;
    publicProfile?: boolean;
    publicProjects?: boolean;
    email?: string;
};

export type AdminTicketSender = {
    email: string;
    /** False when the account was deleted after the ticket was sent. */
    exists: boolean;
    username: string;
    nickname: string;
    nicknameTag: string;
    avatarUrl: string | null;
    role: UserRole;
    provider: string | null;
    createdAt: string | null;
    accountAgeDays: number | null;
    suspended: boolean;
    twoFactorEnabled: boolean;
    profile: TicketSenderProfile | null;
    record: UserRecordSummary;
};

export type AdminTicketViewer = {
    /** May open the Users section (admins and owners). */
    manageUsers: boolean;
};

export type AdminTicketsResponse = {
    tickets: AdminTicketListItem[];
    nextCursor: string | null;
    viewer: AdminTicketViewer;
};

export type AdminTicketDetailResponse = {
    ticket: AdminTicketDetail;
    sender: AdminTicketSender;
    viewer: AdminTicketViewer;
};

export type AdminTicketActionResponse = {
    id: string;
    ticket?: AdminTicketDetail;
    deleted?: boolean;
    changed: boolean;
};

/** Error codes of /api/admin/tickets beyond the shared AdminErrorCode set. */
export type AdminTicketErrorCode = "invalid_priority" | "invalid_category" | "thread_full";
