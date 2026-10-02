"use client";

import OptimizedImage from "@/components/OptimizedImage";

import { Bell, BellOff, Check, Inbox, LifeBuoy, MessageCircle, Phone, RefreshCw, Star, Trash2, UserPlus, X, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useId, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { adminPost, adminRequest } from "@/components/Admin/api";
import { formatRelativeTime } from "@/components/Admin/hooks";
import { useRawSession } from "@/components/Provider";
import { useI18n, type Copy } from "@/lib/i18n";
import { STAFF_TICKET_NOTIFICATION_COPY, staffTicketEventOf } from "@/lib/support";

/**
 * "ticket_reply": the Hanogt team answered one of the user's support tickets (written by /api/admin/tickets).
 * "ticket_new": for staff, a new support ticket or a new message from its author (written by /api/support).
 */
export type NotificationType = "friend_request" | "message" | "call" | "like" | "system" | "ticket_reply" | "ticket_new";

/** One notification as GET /api/notifications returns it (validated on the server). */
export type NotificationItem = {
    id: string;
    type: NotificationType;
    title: string;
    body: string;
    read: boolean;
    createdAt: string | null;
    /** In-site path ("/…", never "//…"), or null. */
    actionUrl: string | null;
    fromAvatar: string | null;
};

export type NotificationsResponse = { items: NotificationItem[]; unread: number };
export type NotificationCountResponse = { unread: number };
export type NotificationActionResponse = { ok: true; changed: number; unread: number };
export type NotificationsErrorCode = "unauthorized" | "bad_origin" | "rate_limited" | "invalid_request" | "invalid_action" | "invalid_id" | "not_found" | "unavailable";

const POLL_MS = 60_000;
/** Every page renders its own header: a count from the previous page is reused while it is this recent. */
const REUSE_MS = 30_000;
const FOCUS_REFRESH_MS = 15_000;

const C = {
    clearRead: { TR: "Okunanları temizle", EN: "Clear read" },
    close: { TR: "Kapat", EN: "Close" },
    unread: { TR: "Okunmadı", EN: "Unread" },
    unreadCount: { TR: "{count} okunmamış", EN: "{count} unread" },
    remove: { TR: "Bildirimi sil", EN: "Delete notification" },
    loading: { TR: "Bildirimler yükleniyor…", EN: "Loading notifications…" },
    loadFailed: { TR: "Bildirimler yüklenemedi.", EN: "Couldn't load notifications." },
    offline: { TR: "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edin.", EN: "Couldn't connect. Check your internet connection." },
    rateLimited: { TR: "Çok fazla istek. Biraz sonra tekrar deneyin.", EN: "Too many requests. Try again shortly." },
    actionFailed: { TR: "İşlem tamamlanamadı. Tekrar deneyin.", EN: "That didn't work. Try again." },
    retry: { TR: "Tekrar dene", EN: "Try again" },
    ticketReply: { TR: "Destek talebinize yanıt geldi", EN: "The team replied to your support ticket" },
} satisfies Record<string, Copy>;

// ---------------------------------------------------------------------------
// Unread count shared by the header bell and the panel
// ---------------------------------------------------------------------------

type UnreadSnapshot = { email: string; count: number; checkedAt: number };

let unreadSnapshot: UnreadSnapshot | null = null;
let unreadRequest: { email: string; promise: Promise<void> } | null = null;
const unreadListeners = new Set<() => void>();

function publishUnread(email: string, count: number) {
    unreadSnapshot = { email, count: Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0, checkedAt: Date.now() };
    for (const listener of unreadListeners) listener();
}

function subscribeUnread(listener: () => void) {
    unreadListeners.add(listener);
    return () => {
        unreadListeners.delete(listener);
    };
}

function refreshUnread(email: string) {
    if (unreadRequest?.email === email) return unreadRequest.promise;
    const promise = adminRequest<NotificationCountResponse>("/api/notifications?view=count")
        .then((result) => {
            if (result.ok) publishUnread(email, Number(result.data.unread));
            // No active session (signed out or suspended): nothing to show. Rate limits and network errors keep the last count.
            else if (result.status === 401) publishUnread(email, 0);
        })
        .finally(() => {
            if (unreadRequest?.promise === promise) unreadRequest = null;
        });
    unreadRequest = { email, promise };
    return promise;
}

const CLOCK_STEP_MS = 30_000;

function subscribeClock(callback: () => void) {
    const timer = window.setInterval(callback, CLOCK_STEP_MS);
    return () => window.clearInterval(timer);
}

function subscribeNothing() {
    return () => undefined;
}

function clockSnapshot() {
    return Math.floor(Date.now() / CLOCK_STEP_MS) * CLOCK_STEP_MS;
}

/** Current time in 30-second steps for "5 minutes ago"; it only ticks while `active` (0 during server rendering). */
function useClock(active: boolean) {
    return useSyncExternalStore(active ? subscribeClock : subscribeNothing, clockSnapshot, () => 0);
}

function useUnreadSnapshot(email: string | null) {
    const snapshot = useSyncExternalStore(subscribeUnread, () => unreadSnapshot, () => null);
    return email && snapshot?.email === email ? snapshot.count : 0;
}

/**
 * Unread notifications of the signed-in account for the header bell: read on
 * mount, on focus and every minute while the tab is visible; pass null when
 * signed out to stop.
 */
export function useUnreadNotifications(email: string | null) {
    const count = useUnreadSnapshot(email);

    useEffect(() => {
        if (!email) return;
        const refreshIfOlder = (age: number) => {
            if (document.visibilityState !== "visible") return;
            const current = unreadSnapshot;
            if (current?.email === email && Date.now() - current.checkedAt < age) return;
            void refreshUnread(email);
        };
        refreshIfOlder(REUSE_MS);
        const timer = window.setInterval(() => refreshIfOlder(POLL_MS - 5_000), POLL_MS);
        const onFocus = () => refreshIfOlder(FOCUS_REFRESH_MS);
        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", onFocus);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("focus", onFocus);
            document.removeEventListener("visibilitychange", onFocus);
        };
    }, [email]);

    return count;
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

const TYPE_ICONS: Record<NotificationType, { icon: LucideIcon; className: string }> = {
    friend_request: { icon: UserPlus, className: "text-blue-500" },
    message: { icon: MessageCircle, className: "text-green-500" },
    call: { icon: Phone, className: "text-amber-500" },
    like: { icon: Star, className: "text-yellow-500" },
    system: { icon: Bell, className: "text-zinc-500" },
    ticket_reply: { icon: LifeBuoy, className: "text-violet-500" },
    ticket_new: { icon: Inbox, className: "text-amber-500" },
};

/** The API only returns in-site paths; checked again because the panel navigates with it. */
function isInSitePath(value: string | null): value is string {
    return typeof value === "string" && /^\/(?![/\\])/.test(value);
}

export default function NotificationCenter({ isOpen, onClose, returnFocusRef }: {
    isOpen: boolean;
    onClose: () => void;
    /** Focused after closing when the element that opened the panel is gone (e.g. the mobile menu). */
    returnFocusRef?: RefObject<HTMLElement | null>;
}) {
    const auth = useRawSession();
    const email = auth.status === "authenticated" ? auth.data?.user?.email?.toLowerCase() || null : null;
    const router = useRouter();
    const { t, tx, locale } = useI18n();
    const headingId = useId();
    const panelRef = useRef<HTMLDivElement>(null);
    const [list, setList] = useState<{ email: string; items: NotificationItem[] } | null>(null);
    const [failure, setFailure] = useState<{ email: string; status: number } | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [busy, setBusy] = useState<"all" | "clear" | null>(null);
    const [version, setVersion] = useState(0);
    const unread = useUnreadSnapshot(email);
    const open = isOpen && Boolean(email);
    const now = useClock(open);
    const items = list && list.email === email ? list.items : null;
    const loadFailure = failure && failure.email === email ? failure : null;

    // Read on open and every minute while the panel stays open and the tab is visible.
    useEffect(() => {
        if (!open || !email) return;
        let cancelled = false;
        const load = async () => {
            const result = await adminRequest<NotificationsResponse>("/api/notifications");
            if (cancelled) return;
            if (result.ok) {
                setList({ email, items: Array.isArray(result.data.items) ? result.data.items : [] });
                setFailure(null);
                publishUnread(email, Number(result.data.unread));
            } else {
                setFailure({ email, status: result.status });
            }
        };
        void load();
        const timer = window.setInterval(() => {
            if (document.visibilityState === "visible") void load();
        }, POLL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [open, email, version]);

    // A failed action is not shown again the next time the panel opens.
    const close = () => {
        setActionError(null);
        onClose();
    };
    const requestClose = useEffectEvent(close);

    // Focus moves into the panel and back to the opener; Escape closes it.
    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const fallback = returnFocusRef?.current ?? null;
        panelRef.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") requestClose();
        };
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("keydown", onKey);
            const target = previous?.isConnected ? previous : fallback;
            target?.focus();
        };
    }, [open, returnFocusRef]);

    if (!open || !email) return null;

    const updateItems = (update: (current: NotificationItem[]) => NotificationItem[]) => {
        setList((current) => (current && current.email === email ? { ...current, items: update(current.items) } : current));
    };

    const failureText = (status: number) => (status === 429 ? tx(C.rateLimited) : status === 0 ? tx(C.offline) : tx(C.actionFailed));

    const post = async (body: Record<string, unknown>) => {
        setActionError(null);
        const result = await adminPost<NotificationActionResponse>("/api/notifications", body);
        if (result.ok) publishUnread(email, Number(result.data.unread));
        return result;
    };

    const markRead = (item: NotificationItem) => {
        if (item.read) return;
        updateItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry)));
        publishUnread(email, Math.max(0, unread - 1));
        void post({ action: "markRead", id: item.id }).then((result) => {
            // Deleted in another tab meanwhile.
            if (!result.ok && result.status === 404) updateItems((current) => current.filter((entry) => entry.id !== item.id));
        });
    };

    const activate = (item: NotificationItem) => {
        markRead(item);
        if (!isInSitePath(item.actionUrl)) return;
        const target = new URL(item.actionUrl, window.location.href);
        // The router fires no "hashchange" when only the hash changes (/admin#tickets?id=… while on
        // /admin), and the admin panel follows the hash through that event.
        if (target.hash && target.pathname === window.location.pathname && target.search === window.location.search) {
            window.location.assign(target.href);
        } else {
            router.push(item.actionUrl);
        }
        close();
    };

    const markAllRead = async () => {
        setBusy("all");
        const result = await post({ action: "markRead", all: true });
        setBusy(null);
        if (result.ok) updateItems((current) => current.map((entry) => ({ ...entry, read: true })));
        else setActionError(failureText(result.status));
    };

    const clearRead = async () => {
        setBusy("clear");
        const result = await post({ action: "clear" });
        setBusy(null);
        if (result.ok) updateItems((current) => current.filter((entry) => !entry.read));
        else setActionError(failureText(result.status));
    };

    const remove = async (item: NotificationItem) => {
        updateItems((current) => current.filter((entry) => entry.id !== item.id));
        if (!item.read) publishUnread(email, Math.max(0, unread - 1));
        const result = await post({ action: "delete", id: item.id });
        if (!result.ok) {
            setActionError(failureText(result.status));
            setVersion((value) => value + 1);
        }
    };

    // Ticket notifications are stored with Turkish text; the title is shown in the reader's language.
    const titleOf = (item: NotificationItem) => (item.type === "ticket_reply"
        ? tx(C.ticketReply)
        : item.type === "ticket_new" ? tx(STAFF_TICKET_NOTIFICATION_COPY[staffTicketEventOf(item.title)]) : item.title);
    const hasRead = Boolean(items?.some((item) => item.read));
    const loading = items === null && !loadFailure;
    const iconButton = "grid h-8 w-8 place-items-center rounded-lg transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/[0.08]";

    return (
        <div className="fixed inset-0 z-[90]" onClick={close}>
            <div
                ref={panelRef}
                role="dialog"
                aria-labelledby={headingId}
                tabIndex={-1}
                onClick={(event) => event.stopPropagation()}
                className="absolute inset-x-4 top-[4.5rem] flex max-h-[calc(100dvh-6rem)] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white text-zinc-900 shadow-2xl shadow-black/10 outline-none sm:inset-x-auto sm:end-4 sm:max-h-[70vh] sm:w-96 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100"
            >
                <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-2.5 dark:border-white/10">
                    <div className="flex min-w-0 items-center gap-2">
                        <Bell className="h-5 w-5 shrink-0 text-indigo-500" aria-hidden="true" />
                        <h2 id={headingId} className="truncate text-[15px] font-bold">{t("notifications") || "Bildirimler"}</h2>
                        {unread > 0 ? (
                            <span className="shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white">
                                <span aria-hidden="true">{unread > 99 ? "99+" : unread}</span>
                                <span className="sr-only">{tx(C.unreadCount, { count: unread })}</span>
                            </span>
                        ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                        <button type="button" onClick={() => void markAllRead()} disabled={busy !== null || unread === 0} className={`${iconButton} text-indigo-600 dark:text-indigo-300`} title={t("mark_all_read") || "Tümünü okundu işaretle"} aria-label={t("mark_all_read") || "Tümünü okundu işaretle"}>
                            {busy === "all" ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                        </button>
                        <button type="button" onClick={() => void clearRead()} disabled={busy !== null || !hasRead} className={`${iconButton} text-red-600 dark:text-red-400`} title={tx(C.clearRead)} aria-label={tx(C.clearRead)}>
                            {busy === "clear" ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                        </button>
                        <button type="button" onClick={close} className={`${iconButton} text-zinc-500 dark:text-zinc-400`} title={tx(C.close)} aria-label={tx(C.close)}>
                            <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>
                </div>

                {actionError ? (
                    <p role="alert" className="border-b border-red-100 bg-red-50 px-4 py-2 text-[12.5px] text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">{actionError}</p>
                ) : null}

                <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={loading || undefined}>
                    {loading ? (
                        <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500" role="status">
                            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />{tx(C.loading)}
                        </div>
                    ) : items === null ? (
                        <div className="px-4 py-10 text-center" role="alert">
                            <p className="text-sm text-zinc-600 dark:text-zinc-300">{loadFailure?.status === 429 ? tx(C.rateLimited) : loadFailure?.status === 0 ? tx(C.offline) : tx(C.loadFailed)}</p>
                            <button type="button" onClick={() => { setFailure(null); setVersion((value) => value + 1); }} className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-1.5 text-[13px] font-semibold transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-white/10 dark:hover:bg-white/[0.06]">
                                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />{tx(C.retry)}
                            </button>
                        </div>
                    ) : items.length === 0 ? (
                        <div className="py-12 text-center">
                            <BellOff className="mx-auto mb-3 h-12 w-12 text-zinc-300 dark:text-zinc-700" aria-hidden="true" />
                            <p className="text-sm text-zinc-500">{t("no_notifications") || "Henüz bildirim yok."}</p>
                        </div>
                    ) : (
                        <ul>
                            {items.map((item) => {
                                const { icon: Icon, className } = TYPE_ICONS[item.type] ?? TYPE_ICONS.system;
                                const time = formatRelativeTime(item.createdAt, now, locale);
                                return (
                                    <li key={item.id} className={`group flex items-start border-b border-zinc-100 last:border-0 dark:border-white/[0.06] ${item.read ? "" : "bg-indigo-50/60 dark:bg-indigo-500/[0.07]"}`}>
                                        <button
                                            type="button"
                                            onClick={() => activate(item)}
                                            className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-start transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:hover:bg-white/[0.04]"
                                        >
                                            {item.fromAvatar ? (
                                                <OptimizedImage src={item.fromAvatar} alt="" className="mt-0.5 h-8 w-8 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />
                                            ) : (
                                                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-zinc-100 dark:bg-white/[0.08]">
                                                    <Icon className={`h-4 w-4 ${className}`} aria-hidden="true" />
                                                </span>
                                            )}
                                            <span className="min-w-0 flex-1">
                                                <span className={`block text-sm ${item.read ? "font-medium text-zinc-600 dark:text-zinc-400" : "font-semibold"}`}>{titleOf(item)}</span>
                                                {item.body ? <span className="mt-0.5 block truncate text-xs text-zinc-500" dir="auto">{item.body}</span> : null}
                                                {time && item.createdAt ? <time dateTime={item.createdAt} className="mt-1 block text-[11px] text-zinc-400">{time}</time> : null}
                                            </span>
                                            {item.read ? null : (
                                                <>
                                                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-indigo-500" aria-hidden="true" />
                                                    <span className="sr-only">{tx(C.unread)}</span>
                                                </>
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void remove(item)}
                                            className="me-2 mt-2.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100 dark:hover:bg-white/[0.08] dark:hover:text-red-400"
                                            title={tx(C.remove)}
                                            aria-label={tx(C.remove)}
                                        >
                                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
