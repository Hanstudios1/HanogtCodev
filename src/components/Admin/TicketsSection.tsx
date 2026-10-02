"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
    AlertTriangle, ArrowLeft, Ban, Bug, CheckCircle2, ClipboardList, Copy as CopyIcon, ExternalLink, Gavel, HelpCircle, Inbox, KeyRound, LifeBuoy,
    MessageCircle, MessageSquareText, MessageSquareWarning, Monitor, RefreshCw, Send, ShieldAlert, ShieldCheck, Trash2, UserCog, UserRound,
    type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import ProfileModal, { type UserProfile } from "@/components/ProfileModal";
import { useI18n, type Copy } from "@/lib/i18n";
import {
    BAN_SCOPE_COPY,
    COMPLAINT_SUBJECT_COPY,
    LEGACY_TICKET_CATEGORIES,
    RECORD_REASON_COPY,
    RECORD_VERDICT_COPY,
    STORED_TICKET_CATEGORIES,
    TEAM_NAME,
    TICKET_CATEGORIES,
    TICKET_CATEGORY_COPY,
    TICKET_LIMITS,
    TICKET_PRIORITIES,
    TICKET_PRIORITY_COPY,
    TICKET_SEVERITY_COPY,
    TICKET_STATUSES,
    TICKET_STATUS_COPY,
    isTicketId,
    type RecordSeverity,
    type RecordVerdict,
    type StoredTicketCategory,
    type TicketCategoryIcon,
    type TicketPriority,
    type TicketSeverity,
    type TicketStatus,
} from "@/lib/support";
import { adminPost, adminRequest, type ApiFailure } from "./api";
import { COMMON } from "./copy";
import { useAdminResource, useDebouncedValue } from "./hooks";
import {
    ADMIN_TICKET_QUERY_MAX,
    TICKET_STATUS_FILTERS,
    type AdminTicketActionResponse,
    type AdminTicketDetail,
    type AdminTicketDetailResponse,
    type AdminTicketErrorCode,
    type AdminTicketListItem,
    type AdminTicketSender,
    type AdminTicketViewer,
    type AdminTicketsResponse,
    type TicketStatusFilter,
} from "./tickets-types";
import type { StaffRole } from "./types";
import {
    Avatar, Badge, Button, ConfirmDialog, EmptyState, ErrorNotice, FOCUS_RING, FilterChips, INPUT_CLASS, LoadingRows, Notice, Panel, RelativeTime,
    SearchInput, SectionHeader, TextArea, cx, useErrorText, useToast, type Tone,
} from "./ui";
import { RoleBadge } from "./UsersSection";

/** Components for the icon names in TICKET_CATEGORY_COPY. */
const CATEGORY_ICONS: Record<TicketCategoryIcon, LucideIcon> = { MessageSquareWarning, ClipboardList, ShieldAlert, Gavel, HelpCircle, MessageSquareText, Bug, UserCog, LifeBuoy };

/** Badge tone and list icon color per category; the old categories stay grey. */
const CATEGORY_STYLES: Record<StoredTicketCategory, { tone: Tone; icon: string }> = {
    complaint: { tone: "fuchsia", icon: "text-fuchsia-500" },
    request: { tone: "sky", icon: "text-sky-500" },
    security: { tone: "red", icon: "text-red-500" },
    unban: { tone: "amber", icon: "text-amber-500" },
    question: { tone: "indigo", icon: "text-indigo-500" },
    feedback: { tone: "violet", icon: "text-violet-500" },
    bug: { tone: "zinc", icon: "text-zinc-400" },
    account: { tone: "zinc", icon: "text-zinc-400" },
    other: { tone: "zinc", icon: "text-zinc-400" },
};

/*
 * The opened ticket lives in the address (#tickets?id=<id>): reloads keep it and
 * staff notifications link straight to it. Choosing a ticket replaces the
 * address rather than adding a history entry per ticket; replaceState fires no
 * event, so the listeners are told directly.
 */
const hashListeners = new Set<() => void>();

function subscribeHash(callback: () => void) {
    hashListeners.add(callback);
    window.addEventListener("hashchange", callback);
    return () => {
        hashListeners.delete(callback);
        window.removeEventListener("hashchange", callback);
    };
}

function ticketFromHash() {
    const hash = window.location.hash.slice(1);
    const index = hash.indexOf("?");
    if (index === -1 || hash.slice(0, index) !== "tickets") return null;
    const id = new URLSearchParams(hash.slice(index + 1)).get("id");
    return id && isTicketId(id) ? id : null;
}

function noTicket() {
    return null;
}

function showTicket(id: string | null) {
    if (ticketFromHash() === id) return;
    window.history.replaceState(null, "", id ? `#tickets?id=${id}` : "#tickets");
    hashListeners.forEach((listener) => listener());
}

const STATUS_TONES: Record<TicketStatus, Tone> = { open: "sky", in_progress: "amber", answered: "violet", resolved: "emerald", closed: "zinc" };
const PRIORITY_TONES: Record<TicketPriority, Tone> = { low: "zinc", normal: "sky", high: "amber", critical: "red" };
const SEVERITY_TONES: Record<TicketSeverity, Tone> = { low: "zinc", medium: "sky", high: "amber", critical: "red" };
const VERDICT_TONES: Record<RecordVerdict, Tone> = { clean: "emerald", notice: "amber", flagged: "red" };
const VERDICT_ICONS: Record<RecordVerdict, LucideIcon> = { clean: CheckCircle2, notice: AlertTriangle, flagged: Ban };
const REASON_DOTS: Record<RecordSeverity, string> = { info: "bg-zinc-400", notice: "bg-amber-500", flagged: "bg-red-500" };

const FILTER_COPY: Record<TicketStatusFilter, Copy> = {
    active: { TR: "Aktif", EN: "Active" },
    all: COMMON.all,
    open: TICKET_STATUS_COPY.open.label,
    in_progress: TICKET_STATUS_COPY.in_progress.label,
    answered: TICKET_STATUS_COPY.answered.label,
    resolved: TICKET_STATUS_COPY.resolved.label,
    closed: TICKET_STATUS_COPY.closed.label,
};

const TICKET_ERROR_COPY: Record<AdminTicketErrorCode, Copy> = {
    invalid_priority: { TR: "Geçersiz öncelik.", EN: "Invalid priority." },
    invalid_category: { TR: "Geçersiz kategori.", EN: "Invalid category." },
    thread_full: { TR: "Bu konuşma mesaj sınırına ulaştı. Kullanıcıdan yeni bir talep açmasını isteyin veya talebi kapatın.", EN: "This conversation reached its message limit. Ask the person to open a new ticket, or close this one." },
};

/** Badge of an appeal against a suspension (filed from the login page). */
const APPEAL_COPY: Copy = { TR: "İtiraz", EN: "Appeal" };

/** Badge of a 2FA recovery request (filed from the login page's two-step verification step). */
const TWO_FACTOR_RECOVERY_COPY: Copy = { TR: "2FA kurtarma", EN: "2FA recovery" };

/** /admin#users?q=<e-mail>: the Users section opens with this search, where "2FA sıfırla" is. */
function openUserInUsers(email: string) {
    window.location.hash = `users?q=${encodeURIComponent(email)}`;
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function useTicketErrorText() {
    const { tx } = useI18n();
    const base = useErrorText();
    return useCallback((error: ApiFailure) => (Object.prototype.hasOwnProperty.call(TICKET_ERROR_COPY, error.code)
        ? tx(TICKET_ERROR_COPY[error.code as AdminTicketErrorCode])
        : base(error)), [base, tx]);
}

function toListItem(ticket: AdminTicketDetail): AdminTicketListItem {
    return {
        id: ticket.id,
        reference: ticket.reference,
        category: ticket.category,
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
        severity: ticket.severity,
        authorEmail: ticket.authorEmail,
        authorName: ticket.authorName,
        authorAvatar: ticket.authorAvatar,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        lastMessageAt: ticket.lastMessageAt,
        lastMessageFrom: ticket.lastMessageFrom,
        lastMessagePreview: ticket.lastMessagePreview,
        messageCount: ticket.messageCount,
        unreadForStaff: ticket.unreadForStaff,
        unreadForUser: ticket.unreadForUser,
        appeal: ticket.appeal,
        twoFactorRecovery: ticket.twoFactorRecovery,
    };
}

/** "3 years", "5 months", "12 days" in the active language. */
function formatAge(days: number, locale: string) {
    const [value, unit] = days >= 365 ? [Math.floor(days / 365), "year"] : days >= 30 ? [Math.floor(days / 30), "month"] : [days, "day"];
    try {
        return new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "long" }).format(value);
    } catch {
        return String(value);
    }
}

function RecordCard({ sender }: { sender: AdminTicketSender }) {
    const { tx } = useI18n();
    const { record } = sender;
    const Icon = VERDICT_ICONS[record.verdict];
    return (
        <div className={cx(
            "rounded-2xl border p-3.5",
            record.verdict === "clean" ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/25 dark:bg-emerald-500/5"
                : record.verdict === "notice" ? "border-amber-200 bg-amber-50/60 dark:border-amber-500/25 dark:bg-amber-500/5"
                    : "border-red-200 bg-red-50/60 dark:border-red-500/25 dark:bg-red-500/5",
        )}>
            <div className="flex flex-wrap items-center gap-2">
                <Badge tone={VERDICT_TONES[record.verdict]} icon={Icon}>{tx(RECORD_VERDICT_COPY[record.verdict].label)}</Badge>
                <span className="text-[12px] text-zinc-500 dark:text-zinc-400">{tx(RECORD_VERDICT_COPY[record.verdict].hint)}</span>
            </div>
            {record.reasons.length ? (
                <ul className="mt-2.5 space-y-1.5 text-[12.5px]">
                    {record.reasons.map((reason) => {
                        const copy = RECORD_REASON_COPY[reason.code];
                        return (
                            <li key={reason.code} className={cx("flex items-start gap-2", reason.severity === "info" ? "text-zinc-500 dark:text-zinc-400" : "text-zinc-700 dark:text-zinc-200")}>
                                <span className={cx("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", REASON_DOTS[reason.severity])} aria-hidden="true" />
                                <span>{tx(copy, { ...(copy.vars ?? {}), count: reason.count })}</span>
                            </li>
                        );
                    })}
                </ul>
            ) : null}
            <p className="mt-2 text-[11px] text-zinc-400">
                {tx({ TR: "Kontrol edildi: ", EN: "Checked " })}<RelativeTime iso={record.checkedAt} />
            </p>
        </div>
    );
}

function SenderCard({ sender, viewer, onOpenProfile }: { sender: AdminTicketSender; viewer: AdminTicketViewer; onOpenProfile: () => void }) {
    const { tx, locale } = useI18n();
    const toast = useToast();
    const name = sender.username || sender.email.split("@")[0];

    const copyEmail = async () => {
        try {
            await navigator.clipboard.writeText(sender.email);
            toast("success", tx({ TR: "E-posta kopyalandı.", EN: "E-mail copied." }));
        } catch {
            toast("error", tx({ TR: "E-posta kopyalanamadı.", EN: "Couldn't copy the e-mail." }));
        }
    };

    // /admin#users?q=<e-mail>: the Users section opens with this search and runs it.
    const openInUsers = () => {
        window.location.hash = `users?q=${encodeURIComponent(sender.email)}`;
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    return (
        <section aria-label={tx({ TR: "Gönderen", EN: "Sender" })} className="space-y-3">
            <div className="flex items-start gap-3">
                <Avatar src={sender.avatarUrl} name={name} size={44} />
                <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate text-sm font-black text-zinc-900 dark:text-white">{name}</span>
                        {sender.nickname && sender.nicknameTag ? <span className="text-[12px] text-zinc-400" dir="ltr">{sender.nickname}#{sender.nicknameTag}</span> : null}
                    </p>
                    {sender.email ? (
                        <p className="flex min-w-0 items-center gap-1 text-[12px] text-zinc-500">
                            <span className="truncate" dir="ltr">{sender.email}</span>
                            <button type="button" onClick={() => void copyEmail()} className={cx("shrink-0 rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/[0.08] dark:hover:text-white", FOCUS_RING)} aria-label={tx({ TR: "E-postayı kopyala", EN: "Copy e-mail" })} title={tx({ TR: "E-postayı kopyala", EN: "Copy e-mail" })}>
                                <CopyIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                        </p>
                    ) : null}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <RoleBadge role={sender.role} />
                        {!sender.exists ? <Badge tone="zinc">{tx({ TR: "Hesap silinmiş", EN: "Account deleted" })}</Badge> : null}
                        {sender.suspended ? <Badge tone="red" icon={Ban}>{tx({ TR: "Askıda", EN: "Suspended" })}</Badge> : null}
                        {sender.twoFactorEnabled ? <Badge tone="emerald" icon={ShieldCheck}>2FA</Badge> : null}
                        {sender.provider ? <Badge tone={sender.provider === "google" ? "sky" : "zinc"}>{sender.provider === "google" ? "Google" : tx({ TR: "E-posta", EN: "E-mail" })}</Badge> : null}
                    </div>
                </div>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-[12px]">
                <div className="rounded-xl bg-zinc-50 px-3 py-2 dark:bg-white/[0.03]">
                    <dt className="text-zinc-500">{tx({ TR: "Hesap yaşı", EN: "Account age" })}</dt>
                    <dd className="mt-0.5 font-bold text-zinc-800 dark:text-zinc-100">{sender.accountAgeDays === null ? "—" : formatAge(sender.accountAgeDays, locale)}</dd>
                </div>
                <div className="rounded-xl bg-zinc-50 px-3 py-2 dark:bg-white/[0.03]">
                    <dt className="text-zinc-500">{tx({ TR: "Katıldı", EN: "Joined" })}</dt>
                    <dd className="mt-0.5 font-bold text-zinc-800 dark:text-zinc-100"><RelativeTime iso={sender.createdAt} /></dd>
                </div>
            </dl>
            <RecordCard sender={sender} />
            <div className="flex flex-wrap gap-2">
                {sender.profile ? <Button size="sm" icon={UserRound} onClick={onOpenProfile}>{tx({ TR: "Profili aç", EN: "Open profile" })}</Button> : null}
                {viewer.manageUsers && sender.exists ? (
                    <Button size="sm" variant="ghost" icon={ExternalLink} onClick={openInUsers}>
                        {tx({ TR: "Kullanıcılar bölümünde aç", EN: "Open in Users" })}
                    </Button>
                ) : null}
            </div>
        </section>
    );
}

function TicketDetailPane({ data, onUpdated, onDelete, onBack }: {
    data: AdminTicketDetailResponse;
    onUpdated: (ticket: AdminTicketDetail) => void;
    onDelete: () => void;
    onBack: () => void;
}) {
    const { tx } = useI18n();
    const toast = useToast();
    const errorText = useTicketErrorText();
    const { ticket, sender, viewer } = data;
    const [reply, setReply] = useState("");
    const [busy, setBusy] = useState<"reply" | "resolve" | "status" | "priority" | null>(null);
    const [error, setError] = useState<ApiFailure | null>(null);
    const [profileOpen, setProfileOpen] = useState(false);
    const Icon = CATEGORY_ICONS[TICKET_CATEGORY_COPY[ticket.category].icon];
    const meta = ticket.meta;
    const tooLong = reply.length > TICKET_LIMITS.message;

    const run = async (kind: "reply" | "resolve" | "status" | "priority", body: Record<string, unknown>, success: string) => {
        setBusy(kind);
        setError(null);
        const result = await adminPost<AdminTicketActionResponse>("/api/admin/tickets", { id: ticket.id, ...body });
        setBusy(null);
        if (!result.ok) {
            if (kind === "reply" || kind === "resolve") setError(result);
            else toast("error", errorText(result));
            return false;
        }
        if (result.data.ticket) onUpdated(result.data.ticket);
        if (result.data.changed) toast("success", success);
        return true;
    };

    const send = async (resolve: boolean) => {
        const text = reply.trim();
        if (!text || tooLong) return;
        const sent = await run(resolve ? "resolve" : "reply", resolve ? { action: "reply", text, status: "resolved" } : { action: "reply", text }, resolve
            ? tx({ TR: "Yanıt gönderildi ve talep çözüldü olarak işaretlendi.", EN: "Reply sent and the ticket marked as resolved." })
            : tx({ TR: "Yanıt gönderildi; kullanıcıya bildirim düştü.", EN: "Reply sent; the person was notified." }));
        if (sent) setReply("");
    };

    const profile: (UserProfile & { staffRole?: StaffRole | null }) | null = sender.profile
        ? { ...sender.profile, staffRole: sender.role === "user" ? null : sender.role }
        : null;

    return (
        <Panel bodyClassName="p-0">
            <div className="border-b border-zinc-100 p-5 dark:border-white/[0.06]">
                <button type="button" onClick={onBack} className={cx("mb-3 inline-flex items-center gap-1.5 rounded-lg text-[13px] font-semibold text-zinc-500 hover:text-zinc-900 lg:hidden dark:hover:text-white", FOCUS_RING)}>
                    <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />{tx({ TR: "Listeye dön", EN: "Back to list" })}
                </button>
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-zinc-500">
                    <Badge tone={CATEGORY_STYLES[ticket.category].tone} icon={Icon}>{tx(TICKET_CATEGORY_COPY[ticket.category].label)}</Badge>
                    {ticket.appeal ? <Badge tone="amber" icon={Gavel}>{tx(APPEAL_COPY)}</Badge> : null}
                    {ticket.twoFactorRecovery ? <Badge tone="indigo" icon={KeyRound}>{tx(TWO_FACTOR_RECOVERY_COPY)}</Badge> : null}
                    <Badge tone={STATUS_TONES[ticket.status]}>{tx(TICKET_STATUS_COPY[ticket.status].label)}</Badge>
                    <Badge tone={PRIORITY_TONES[ticket.priority]}>{tx(TICKET_PRIORITY_COPY[ticket.priority])}</Badge>
                    {ticket.severity ? <Badge tone={SEVERITY_TONES[ticket.severity]} icon={ShieldAlert}>{tx({ TR: "Önem: {level}", EN: "Severity: {level}" }, { level: tx(TICKET_SEVERITY_COPY[ticket.severity].label) })}</Badge> : null}
                    <span className="font-mono" dir="ltr">#{ticket.reference}</span>
                    <RelativeTime iso={ticket.createdAt} />
                </div>
                <h3 className="mt-3 whitespace-pre-wrap break-words text-lg font-black leading-snug text-zinc-900 dark:text-white" dir="auto">{ticket.title}</h3>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-700 dark:text-zinc-300" dir="auto">{ticket.description}</p>
                {ticket.appeal ? (
                    <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-[12.5px] leading-relaxed text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                        {tx({ TR: "Bu itiraz, askıya alınmış hesaptan giriş sayfası üzerinden gönderildi. Gönderen, hesabın sahibi olduğunu şifresiyle (açıksa iki adımlı doğrulamayla birlikte) ya da Google ile kanıtladı. Hesap askıdayken yanıtları göremez; hesap yeniden açılırsa yanıtınızı Taleplerim'de bulur.", EN: "This appeal was sent from the suspended account via the login page. The sender proved they own the account with its password (plus two-step verification, if enabled) or with Google. They can't read replies while the account is suspended; if it's reinstated, they'll find your reply under My tickets." })}
                    </p>
                ) : null}
                {ticket.twoFactorRecovery ? (
                    <div className="mt-3 space-y-2 rounded-2xl bg-indigo-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-indigo-900 dark:bg-indigo-500/10 dark:text-indigo-200">
                        <p>
                            {tx({ TR: "Bu talep giriş sayfasından, iki adımlı doğrulamayı tamamlayamayan biri tarafından gönderildi. Yalnızca hesabın şifresi doğrulandı, ikinci adım doğrulanmadı: 2FA'yı sıfırlamadan önce hesabın gerçekten gönderene ait olduğundan emin olun. Kullanıcı, 2FA sıfırlanana kadar yanıtları göremez; sıfırlandıktan sonra yalnızca şifresiyle giriş yapıp yanıtınızı Taleplerim'de bulur.", EN: "This request was sent from the login page by someone who couldn't complete two-step verification. Only the account's password was verified, not the second factor: make sure the account really belongs to the sender before resetting 2FA. The person can't read replies until 2FA is reset; afterwards they sign in with just their password and find your reply under My tickets." })}
                        </p>
                        {sender.exists && !sender.twoFactorEnabled ? (
                            <p className="font-semibold">{tx({ TR: "Bu hesapta iki adımlı doğrulama artık kapalı.", EN: "Two-step verification is already off for this account." })}</p>
                        ) : null}
                        {viewer.manageUsers && sender.exists && sender.email ? (
                            <Button size="sm" icon={ExternalLink} onClick={() => openUserInUsers(sender.email)}>
                                {tx({ TR: "2FA'yı sıfırlamak için kullanıcıyı aç", EN: "Open the user to reset 2FA" })}
                            </Button>
                        ) : !viewer.manageUsers ? (
                            <p>{tx({ TR: "2FA'yı yöneticiler ve sahipler, Kullanıcılar bölümünden sıfırlayabilir.", EN: "Admins and owners can reset 2FA from the Users section." })}</p>
                        ) : null}
                    </div>
                ) : null}
                {meta.complaintSubject || meta.reportedUser || meta.contentUrl || meta.banScope || meta.banReference || meta.steps || meta.pageUrl || meta.userAgent ? (
                    <dl className="mt-3 space-y-2 rounded-2xl bg-zinc-50 p-3 text-[12.5px] dark:bg-white/[0.03]">
                        {meta.complaintSubject ? (
                            <div className="flex flex-wrap items-center gap-2">
                                <dt className="font-bold text-zinc-600 dark:text-zinc-300">{tx({ TR: "Şikayet konusu", EN: "Complaint about" })}</dt>
                                <dd><Badge tone="fuchsia">{tx(COMPLAINT_SUBJECT_COPY[meta.complaintSubject])}</Badge></dd>
                            </div>
                        ) : null}
                        {meta.reportedUser ? (
                            <div>
                                <dt className="font-bold text-zinc-600 dark:text-zinc-300">{tx({ TR: "Şikayet edilen kullanıcı", EN: "User complained about" })}</dt>
                                <dd className="mt-0.5 break-words text-zinc-700 dark:text-zinc-300" dir="auto">{meta.reportedUser}</dd>
                            </div>
                        ) : null}
                        {meta.contentUrl ? (
                            <div>
                                <dt className="font-bold text-zinc-600 dark:text-zinc-300">{tx({ TR: "İçerik bağlantısı", EN: "Content link" })}</dt>
                                <dd className="mt-0.5 break-all text-zinc-600 dark:text-zinc-400" dir="ltr">
                                    {/* Site paths open here; outside addresses stay plain text so nobody opens them by accident. */}
                                    {meta.contentUrl.startsWith("/")
                                        ? <a href={meta.contentUrl} target="_blank" rel="noopener noreferrer" className={cx("text-indigo-600 underline underline-offset-2 dark:text-indigo-300", FOCUS_RING)}>{meta.contentUrl}</a>
                                        : meta.contentUrl}
                                </dd>
                            </div>
                        ) : null}
                        {meta.banScope ? (
                            <div className="flex flex-wrap items-center gap-2">
                                <dt className="font-bold text-zinc-600 dark:text-zinc-300">{tx({ TR: "Yasak türü", EN: "Type of ban" })}</dt>
                                <dd><Badge tone="amber">{tx(BAN_SCOPE_COPY[meta.banScope].label)}</Badge></dd>
                            </div>
                        ) : null}
                        {meta.banReference ? (
                            <div>
                                <dt className="font-bold text-zinc-600 dark:text-zinc-300">{meta.banScope === "group" ? tx({ TR: "Grup adı", EN: "Group name" }) : tx({ TR: "Ayrıntı", EN: "Reference" })}</dt>
                                <dd className="mt-0.5 break-words text-zinc-700 dark:text-zinc-300" dir="auto">{meta.banReference}</dd>
                            </div>
                        ) : null}
                        {meta.steps ? (
                            <div>
                                <dt className="font-bold text-zinc-600 dark:text-zinc-300">{tx({ TR: "Adımlar", EN: "Steps" })}</dt>
                                <dd className="mt-0.5 whitespace-pre-wrap break-words text-zinc-700 dark:text-zinc-300" dir="auto">{meta.steps}</dd>
                            </div>
                        ) : null}
                        {meta.pageUrl ? (
                            <div>
                                <dt className="font-bold text-zinc-600 dark:text-zinc-300">{tx({ TR: "Sayfa", EN: "Page" })}</dt>
                                <dd className="mt-0.5 break-all text-zinc-600 dark:text-zinc-400" dir="ltr">{meta.pageUrl}</dd>
                            </div>
                        ) : null}
                        {meta.userAgent ? (
                            <div>
                                <dt className="flex items-center gap-1 font-bold text-zinc-600 dark:text-zinc-300"><Monitor className="h-3.5 w-3.5" aria-hidden="true" />{tx({ TR: "Tarayıcı", EN: "Browser" })}</dt>
                                <dd className="mt-0.5 break-all text-zinc-600 dark:text-zinc-400" dir="ltr">{meta.userAgent}</dd>
                            </div>
                        ) : null}
                    </dl>
                ) : null}
            </div>

            <div className="border-b border-zinc-100 p-5 dark:border-white/[0.06]">
                <SenderCard sender={sender} viewer={viewer} onOpenProfile={() => setProfileOpen(true)} />
            </div>

            <div className="grid gap-4 border-b border-zinc-100 p-5 sm:grid-cols-2 dark:border-white/[0.06]">
                <div>
                    <p className="mb-2 text-[12px] font-bold uppercase tracking-wider text-zinc-400">{tx({ TR: "Durum", EN: "Status" })}</p>
                    <div role="group" aria-label={tx({ TR: "Durum", EN: "Status" })} className="flex flex-wrap gap-1.5">
                        {TICKET_STATUSES.map((status) => {
                            const active = ticket.status === status;
                            return (
                                <button
                                    key={status}
                                    type="button"
                                    aria-pressed={active}
                                    disabled={busy !== null}
                                    onClick={() => { if (!active) void run("status", { action: "setStatus", status }, tx({ TR: "Durum: {status}", EN: "Status: {status}" }, { status: tx(TICKET_STATUS_COPY[status].label) })); }}
                                    className={cx(
                                        "h-8 rounded-full px-3 text-[12px] font-bold transition disabled:opacity-60",
                                        active ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/[0.06] dark:text-zinc-300 dark:hover:bg-white/[0.1]",
                                        FOCUS_RING,
                                    )}
                                >
                                    {tx(TICKET_STATUS_COPY[status].label)}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div>
                    <p className="mb-2 text-[12px] font-bold uppercase tracking-wider text-zinc-400">{tx({ TR: "Öncelik", EN: "Priority" })}</p>
                    <div role="group" aria-label={tx({ TR: "Öncelik", EN: "Priority" })} className="flex flex-wrap gap-1.5">
                        {TICKET_PRIORITIES.map((priority) => {
                            const active = ticket.priority === priority;
                            return (
                                <button
                                    key={priority}
                                    type="button"
                                    aria-pressed={active}
                                    disabled={busy !== null}
                                    onClick={() => { if (!active) void run("priority", { action: "setPriority", priority }, tx({ TR: "Öncelik: {priority}", EN: "Priority: {priority}" }, { priority: tx(TICKET_PRIORITY_COPY[priority]) })); }}
                                    className={cx(
                                        "h-8 rounded-full px-3 text-[12px] font-bold transition disabled:opacity-60",
                                        active ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/[0.06] dark:text-zinc-300 dark:hover:bg-white/[0.1]",
                                        FOCUS_RING,
                                    )}
                                >
                                    {tx(TICKET_PRIORITY_COPY[priority])}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="p-5">
                <p className="mb-3 text-[12px] font-bold uppercase tracking-wider text-zinc-400">
                    {tx({ TR: "Konuşma ({count})", EN: "Conversation ({count})" }, { count: ticket.messages.length })}
                </p>
                {ticket.messages.length ? (
                    <ol className="space-y-2.5">
                        {ticket.messages.map((message) => {
                            const staff = message.from === "staff";
                            return (
                                <li key={message.id} className={cx("flex", staff ? "justify-end" : "justify-start")}>
                                    <div className={cx(
                                        "max-w-[92%] rounded-2xl border p-3",
                                        staff ? "border-indigo-200 bg-indigo-50/70 dark:border-indigo-500/30 dark:bg-indigo-500/10" : "border-zinc-100 bg-zinc-50 dark:border-white/[0.06] dark:bg-white/[0.03]",
                                    )}>
                                        <div className="flex flex-wrap items-center gap-2 text-[12px] text-zinc-500">
                                            <span className="font-bold text-zinc-800 dark:text-zinc-100">{staff ? tx(TEAM_NAME) : message.authorName || sender.username}</span>
                                            {staff ? <Badge tone="indigo" icon={ShieldCheck}>{tx({ TR: "Ekip", EN: "Team" })}</Badge> : null}
                                            <RelativeTime iso={message.createdAt} />
                                        </div>
                                        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-800 dark:text-zinc-200" dir="auto">{message.text}</p>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                ) : (
                    <p className="text-sm text-zinc-500">{tx({ TR: "Henüz mesaj yok; ilk yanıtı siz verin.", EN: "No messages yet; be the first to reply." })}</p>
                )}

                <div className="mt-5 space-y-3">
                    <TextArea
                        label={tx({ TR: "Yanıt", EN: "Reply" })}
                        value={reply}
                        onChange={(value) => { setReply(value); if (error) setError(null); }}
                        max={TICKET_LIMITS.message}
                        rows={4}
                        disabled={busy === "reply" || busy === "resolve"}
                        placeholder={tx({ TR: "Kullanıcıya ekip adına yanıt yazın…", EN: "Write a reply on behalf of the team…" })}
                        hint={tx({ TR: "Kullanıcıya yalnızca \"{name}\" adıyla gösterilir ve bildirim gönderilir.", EN: "Shown to the person only as \"{name}\", with a notification." }, { name: tx(TEAM_NAME) })}
                    />
                    {error ? <Notice tone="error">{errorText(error)}</Notice> : null}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Button size="sm" variant="ghost" icon={Trash2} className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10" onClick={onDelete}>
                            {tx({ TR: "Talebi sil", EN: "Delete ticket" })}
                        </Button>
                        <div className="flex flex-wrap gap-2">
                            {ticket.status !== "resolved" && ticket.status !== "closed" ? (
                                <Button variant="success" icon={CheckCircle2} busy={busy === "resolve"} disabled={busy !== null || !reply.trim() || tooLong} onClick={() => void send(true)}>
                                    {tx({ TR: "Yanıtla ve çöz", EN: "Reply and resolve" })}
                                </Button>
                            ) : null}
                            <Button variant="primary" icon={Send} busy={busy === "reply"} disabled={busy !== null || !reply.trim() || tooLong} onClick={() => void send(false)}>
                                {tx({ TR: "Yanıtı gönder", EN: "Send reply" })}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {profile ? <ProfileModal user={profile} isOpen={profileOpen} onClose={() => setProfileOpen(false)} /> : null}
        </Panel>
    );
}

export default function TicketsSection() {
    const { tx } = useI18n();
    const toast = useToast();
    const errorText = useTicketErrorText();
    const [status, setStatus] = useState<TicketStatusFilter>("active");
    const [category, setCategory] = useState<"all" | StoredTicketCategory>("all");
    const [priority, setPriority] = useState<"all" | TicketPriority>("all");
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [query, setQuery] = useState("");
    const debounced = useDebouncedValue(query.trim().slice(0, ADMIN_TICKET_QUERY_MAX), 350);
    const params = new URLSearchParams({ status, category, priority });
    if (unreadOnly) params.set("unread", "1");
    if (debounced) params.set("q", debounced);
    const path = `/api/admin/tickets?${params.toString()}`;
    const inbox = useAdminResource<AdminTicketsResponse>(path);
    const selectedId = useSyncExternalStore(subscribeHash, ticketFromHash, noTicket);
    const detail = useAdminResource<AdminTicketDetailResponse>(selectedId ? `/api/admin/tickets?id=${selectedId}` : null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [moreError, setMoreError] = useState<ApiFailure | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<AdminTicketListItem | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<ApiFailure | null>(null);
    const markedRead = useRef<string | null>(null);
    const { mutate: mutateInbox } = inbox;
    const { mutate: mutateDetail } = detail;

    // Unread tickets first; otherwise the inbox order (latest activity first).
    const tickets = useMemo(() => [...(inbox.data?.tickets ?? [])].sort((a, b) => Number(b.unreadForStaff) - Number(a.unreadForStaff)), [inbox.data]);
    const selected = detail.data && detail.data.ticket.id === selectedId ? detail.data : null;
    const filtersActive = status !== "active" || category !== "all" || priority !== "all" || unreadOnly || Boolean(query.trim());

    const applyTicket = useCallback((ticket: AdminTicketDetail) => {
        mutateDetail((current) => (current.ticket.id === ticket.id ? { ...current, ticket } : current));
        mutateInbox((current) => ({ ...current, tickets: current.tickets.map((item) => (item.id === ticket.id ? toListItem(ticket) : item)) }));
    }, [mutateDetail, mutateInbox]);

    // Opening a ticket the author updated marks it as seen by the team.
    useEffect(() => {
        const ticket = selected?.ticket;
        if (!ticket?.unreadForStaff || markedRead.current === ticket.id) return;
        markedRead.current = ticket.id;
        void adminPost<AdminTicketActionResponse>("/api/admin/tickets", { action: "markRead", id: ticket.id }).then((result) => {
            if (result.ok && result.data.ticket) applyTicket(result.data.ticket);
        });
    }, [applyTicket, selected]);

    const loadMore = async () => {
        const cursor = inbox.data?.nextCursor;
        if (!cursor) return;
        const forKey = inbox.dataKey;
        setLoadingMore(true);
        setMoreError(null);
        const result = await adminRequest<AdminTicketsResponse>(`${path}&cursor=${encodeURIComponent(cursor)}`);
        setLoadingMore(false);
        if (!result.ok) {
            setMoreError(result);
            return;
        }
        mutateInbox((current) => ({
            ...result.data,
            tickets: [...current.tickets, ...result.data.tickets.filter((ticket) => !current.tickets.some((existing) => existing.id === ticket.id))],
        }), forKey);
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        setDeleteError(null);
        const result = await adminPost<AdminTicketActionResponse>("/api/admin/tickets", { action: "delete", id: deleteTarget.id });
        setDeleting(false);
        if (!result.ok && result.code !== "not_found") {
            setDeleteError(result);
            return;
        }
        const removedId = deleteTarget.id;
        mutateInbox((current) => ({ ...current, tickets: current.tickets.filter((ticket) => ticket.id !== removedId) }));
        showTicket(null);
        setDeleteTarget(null);
        toast("success", tx({ TR: "Talep silindi.", EN: "Ticket deleted." }));
    };

    const clearFilters = () => {
        setStatus("active");
        setCategory("all");
        setPriority("all");
        setUnreadOnly(false);
        setQuery("");
    };

    const refresh = () => {
        inbox.reload();
        if (selectedId) detail.reload();
    };

    return (
        <div>
            <SectionHeader
                title={tx({ TR: "Destek Talepleri", EN: "Support Tickets" })}
                description={tx({ TR: "Geri Bildirim/SSS sayfasından ve giriş sayfasındaki itiraz formundan gelen özel talepler: şikayetler, istekler (KVKK başvuruları dahil), güvenlik açıkları, ban kaldırma istekleri, sorular ve geri bildirimler.", EN: "Private tickets from the Feedback/FAQ page and the appeal form on the sign-in page: complaints, requests (including KVKK requests), security reports, unban requests, questions and feedback." })}
                actions={<Button size="sm" icon={RefreshCw} busy={inbox.loading && Boolean(inbox.data)} onClick={refresh}>{tx(COMMON.refresh)}</Button>}
            />

            <div className="mb-4 space-y-3">
                <FilterChips
                    label={tx({ TR: "Durum filtresi", EN: "Status filter" })}
                    value={status}
                    onChange={(value) => { setStatus(value); showTicket(null); }}
                    options={TICKET_STATUS_FILTERS.map((value) => ({ value, label: tx(FILTER_COPY[value]) }))}
                />
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_minmax(0,1.6fr)]">
                    <label className="block">
                        <span className="sr-only">{tx({ TR: "Kategori", EN: "Category" })}</span>
                        <select value={category} onChange={(event) => setCategory(event.target.value === "all" ? "all" : STORED_TICKET_CATEGORIES.find((value) => value === event.target.value) ?? "all")} className={cx(INPUT_CLASS, "h-10")}>
                            <option value="all">{tx({ TR: "Tüm kategoriler", EN: "All categories" })}</option>
                            {TICKET_CATEGORIES.map((value) => <option key={value} value={value}>{tx(TICKET_CATEGORY_COPY[value].label)}</option>)}
                            {/* Tickets filed before the categories changed keep their old category. */}
                            <optgroup label={tx({ TR: "Eski kategoriler", EN: "Old categories" })}>
                                {LEGACY_TICKET_CATEGORIES.map((value) => <option key={value} value={value}>{tx(TICKET_CATEGORY_COPY[value].label)}</option>)}
                            </optgroup>
                        </select>
                    </label>
                    <label className="block">
                        <span className="sr-only">{tx({ TR: "Öncelik", EN: "Priority" })}</span>
                        <select value={priority} onChange={(event) => setPriority(event.target.value === "all" ? "all" : TICKET_PRIORITIES.find((value) => value === event.target.value) ?? "all")} className={cx(INPUT_CLASS, "h-10")}>
                            <option value="all">{tx({ TR: "Tüm öncelikler", EN: "All priorities" })}</option>
                            {TICKET_PRIORITIES.map((value) => <option key={value} value={value}>{tx(TICKET_PRIORITY_COPY[value])}</option>)}
                        </select>
                    </label>
                    <button
                        type="button"
                        aria-pressed={unreadOnly}
                        onClick={() => setUnreadOnly((value) => !value)}
                        className={cx(
                            "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-[13px] font-bold transition",
                            unreadOnly ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300",
                            FOCUS_RING,
                        )}
                    >
                        <span className={cx("h-2 w-2 rounded-full", unreadOnly ? "bg-white dark:bg-zinc-900" : "bg-violet-500")} aria-hidden="true" />
                        {tx({ TR: "Okunmamış", EN: "Unread" })}
                    </button>
                    <SearchInput
                        value={query}
                        onChange={setQuery}
                        className="sm:col-span-3 lg:col-span-1"
                        label={tx({ TR: "Taleplerde ara", EN: "Search tickets" })}
                        placeholder={tx({ TR: "Başlık, #kod, ad veya e-posta…", EN: "Title, #code, name or e-mail…" })}
                    />
                </div>
            </div>

            {inbox.error ? <ErrorNotice error={inbox.error} onRetry={inbox.reload} className="mb-4" /> : null}

            {!inbox.data && inbox.loading ? (
                <LoadingRows rows={5} />
            ) : (
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
                    <div className={cx(selectedId && "hidden lg:block")}>
                        {tickets.length === 0 ? (
                            <EmptyState
                                icon={Inbox}
                                title={filtersActive ? tx(COMMON.noResults) : tx({ TR: "Bekleyen talep yok", EN: "No tickets waiting" })}
                                description={debounced ? tx({ TR: "Arama, filtrelerle eşleşen en yeni 400 talebi tarar; daha eskiler için \"Daha fazla yükle\" kullanın.", EN: "Search scans the 400 newest tickets matching the filters; use \"Load more\" for older ones." }) : undefined}
                                action={filtersActive ? <Button size="sm" onClick={clearFilters}>{tx(COMMON.clearFilters)}</Button> : undefined}
                            />
                        ) : (
                            <ul className="space-y-2" aria-label={tx({ TR: "Talep listesi", EN: "Ticket list" })} aria-busy={inbox.loading || undefined}>
                                <AnimatePresence initial={false}>
                                    {tickets.map((ticket) => {
                                        const active = ticket.id === selectedId;
                                        const Icon = CATEGORY_ICONS[TICKET_CATEGORY_COPY[ticket.category].icon];
                                        return (
                                            <motion.li key={ticket.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                                                <button
                                                    type="button"
                                                    aria-current={active || undefined}
                                                    onClick={() => showTicket(ticket.id)}
                                                    className={cx(
                                                        "w-full rounded-2xl border p-3.5 text-start transition",
                                                        active
                                                            ? "border-indigo-400 bg-indigo-50/70 shadow-md dark:border-indigo-400/50 dark:bg-indigo-500/10"
                                                            : ticket.unreadForStaff
                                                                ? "border-violet-300 bg-violet-50/50 hover:shadow-sm dark:border-violet-500/40 dark:bg-violet-500/[0.07]"
                                                                : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm dark:border-white/10 dark:bg-zinc-900/60 dark:hover:border-white/20",
                                                        FOCUS_RING,
                                                    )}
                                                >
                                                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
                                                        <Icon className={cx("h-3.5 w-3.5", CATEGORY_STYLES[ticket.category].icon)} role="img" aria-label={tx(TICKET_CATEGORY_COPY[ticket.category].label)} />
                                                        <Badge tone={STATUS_TONES[ticket.status]}>{tx(TICKET_STATUS_COPY[ticket.status].label)}</Badge>
                                                        {ticket.appeal ? <Badge tone="amber" icon={Gavel}>{tx(APPEAL_COPY)}</Badge> : null}
                                                        {ticket.twoFactorRecovery ? <Badge tone="indigo" icon={KeyRound}>{tx(TWO_FACTOR_RECOVERY_COPY)}</Badge> : null}
                                                        {ticket.priority === "high" || ticket.priority === "critical" ? <Badge tone={PRIORITY_TONES[ticket.priority]}>{tx(TICKET_PRIORITY_COPY[ticket.priority])}</Badge> : null}
                                                        {ticket.unreadForStaff ? <Badge tone="violet">{tx({ TR: "Yeni", EN: "New" })}</Badge> : null}
                                                        <span className="ms-auto"><RelativeTime iso={ticket.lastMessageAt} /></span>
                                                    </div>
                                                    <p className="mt-1.5 line-clamp-2 break-words text-sm font-bold text-zinc-900 dark:text-white" dir="auto">{ticket.title}</p>
                                                    {ticket.lastMessagePreview ? <p className="mt-1 line-clamp-1 break-words text-[12px] text-zinc-500" dir="auto">{ticket.lastMessagePreview}</p> : null}
                                                    <div className="mt-1.5 flex items-center gap-3 text-[12px] text-zinc-500">
                                                        <span className="flex min-w-0 items-center gap-1.5">
                                                            <Avatar src={ticket.authorAvatar} name={ticket.authorName || ticket.authorEmail} size={18} />
                                                            <span className="truncate">{ticket.authorName || ticket.authorEmail}</span>
                                                        </span>
                                                        <span className="font-mono text-[11px]" dir="ltr">#{ticket.reference}</span>
                                                        <span className="ms-auto inline-flex shrink-0 items-center gap-1"><MessageCircle className="h-3 w-3" aria-hidden="true" />{ticket.messageCount}</span>
                                                    </div>
                                                </button>
                                            </motion.li>
                                        );
                                    })}
                                </AnimatePresence>
                            </ul>
                        )}
                        {inbox.data?.nextCursor || moreError ? (
                            <div className="mt-3 flex flex-col items-center gap-2">
                                {moreError ? <p className="text-sm text-red-600 dark:text-red-400" role="alert">{errorText(moreError)}</p> : null}
                                {inbox.data?.nextCursor ? <Button size="sm" busy={loadingMore} onClick={() => void loadMore()}>{tx(COMMON.loadMore)}</Button> : null}
                            </div>
                        ) : null}
                    </div>

                    <div className={cx(!selectedId && "hidden lg:block")}>
                        {selectedId && selected ? (
                            <div className="lg:sticky lg:top-24">
                                <TicketDetailPane
                                    key={selected.ticket.id}
                                    data={selected}
                                    onUpdated={applyTicket}
                                    onDelete={() => { setDeleteTarget(toListItem(selected.ticket)); setDeleteError(null); }}
                                    onBack={() => showTicket(null)}
                                />
                            </div>
                        ) : selectedId && detail.error ? (
                            <div className="space-y-3">
                                <button type="button" onClick={() => showTicket(null)} className={cx("inline-flex items-center gap-1.5 rounded-lg text-[13px] font-semibold text-zinc-500 hover:text-zinc-900 lg:hidden dark:hover:text-white", FOCUS_RING)}>
                                    <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />{tx({ TR: "Listeye dön", EN: "Back to list" })}
                                </button>
                                <ErrorNotice error={detail.error} onRetry={detail.reload} />
                            </div>
                        ) : selectedId ? (
                            <LoadingRows rows={3} />
                        ) : (
                            <EmptyState icon={LifeBuoy} title={tx({ TR: "Bir talep seçin", EN: "Select a ticket" })} description={tx({ TR: "Konuşmayı, gönderenin sicilini ve yanıt alanını görmek için listeden seçin.", EN: "Pick one from the list to see the conversation, the sender's record and the reply box." })} />
                        )}
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={Boolean(deleteTarget)}
                onClose={() => { if (!deleting) setDeleteTarget(null); }}
                onConfirm={() => void confirmDelete()}
                busy={deleting}
                error={deleteError}
                icon={Trash2}
                title={tx({ TR: "Talep silinsin mi?", EN: "Delete this ticket?" })}
                description={tx({ TR: "Talep ve tüm konuşması kalıcı olarak silinir; kullanıcı da artık göremez. Silme işlemi denetim kaydına yazılır.", EN: "The ticket and its whole conversation are deleted permanently and the person can no longer see it. The deletion is written to the audit log." })}
                confirmLabel={tx(COMMON.delete)}
            >
                {deleteTarget ? (
                    <blockquote className="rounded-xl border-s-4 border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-white/20 dark:bg-white/[0.03] dark:text-zinc-300" dir="auto">
                        {deleteTarget.title}
                    </blockquote>
                ) : null}
            </ConfirmDialog>
        </div>
    );
}
