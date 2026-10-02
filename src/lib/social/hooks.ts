"use client";

/**
 * Data layer of Hanogt Social.
 *
 * With a working Firebase bridge ("live") the browser listens to Firestore
 * directly, as the old friends, messages and groups pages did: chats and their
 * messages, friend requests, profiles (presence) and the newest group
 * messages. Without it ("fallback": the bridge failed, timed out or a listener
 * was refused) the same data comes from the Social API routes, polled every
 * few seconds while the tab is visible, so Social keeps working.
 */
import {
    Timestamp,
    addDoc,
    collection,
    doc,
    documentId,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where,
    writeBatch,
    type DocumentData,
    type FirestoreError,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { db } from "@/lib/firebase";
import { mentionsUser, type GroupInvitationItem, type GroupListItem, type GroupListResponse } from "@/lib/groups";
import { effectiveStatus, lastSeenTime } from "@/lib/presence";
import { SocialRequestError, socialApi, type VoiceTarget } from "./api";
import {
    SOCIAL_LIMITS,
    SOCIAL_POLL,
    compareMessages,
    dmChatId,
    dmMessageFromData,
    groupUnreadState,
    mergeMessages,
    previewText,
    timeOf,
    type DmMessage,
    type DmReply,
    type FriendsOverview,
    type GroupUnread,
    type SocialMode,
    type SocialPerson,
    type StaffRoleBadge,
} from "./model";

/* -------------------------------------------------------------------------- */
/* Generic helpers                                                            */
/* -------------------------------------------------------------------------- */

/** Keeps the latest value in a ref so subscriptions don't restart when it changes. */
export function useLatest<T>(value: T) {
    const ref = useRef(value);
    useEffect(() => {
        ref.current = value;
    });
    return ref;
}

function subscribeVisibility(listener: () => void) {
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
}

export function usePageVisible() {
    return useSyncExternalStore(subscribeVisibility, () => document.visibilityState === "visible", () => true);
}

/**
 * Runs `task` every `intervalMs` while the tab is visible and `enabled`
 * (one run at a time); coming back to the tab runs it at once.
 */
export function usePoll(task: () => unknown, intervalMs: number, enabled: boolean) {
    const visible = usePageVisible();
    const taskRef = useLatest(task);
    const hiddenRef = useRef(false);
    useEffect(() => {
        if (!enabled || !intervalMs) return;
        if (!visible) {
            hiddenRef.current = true;
            return;
        }
        let stopped = false;
        let timer = 0;
        const tick = async () => {
            if (stopped) return;
            try {
                await taskRef.current();
            } catch {
                // The next run tries again.
            }
            if (!stopped) timer = window.setTimeout(() => void tick(), intervalMs);
        };
        const returning = hiddenRef.current;
        hiddenRef.current = false;
        timer = window.setTimeout(() => void tick(), returning ? 0 : intervalMs);
        return () => {
            stopped = true;
            window.clearTimeout(timer);
        };
    }, [enabled, intervalMs, taskRef, visible]);
}

function isPermissionError(error: unknown) {
    return (error as FirestoreError | null)?.code === "permission-denied";
}

/** A wall clock that ticks every `ms` (presence expires without a new snapshot). */
export function useNow(ms = 30_000) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), ms);
        return () => window.clearInterval(timer);
    }, [ms]);
    return now;
}

/**
 * A clock for short-lived indicators (typing): it only moves when one of the
 * `stamps` (Date.now() values) becomes older than `ms`, so a stamp is fresh
 * while `stamp + ms > clock` without re-rendering every second.
 */
function useExpiryClock(stamps: readonly number[], ms: number) {
    const [clock, setClock] = useState(0);
    const key = stamps.filter((stamp) => stamp > 0).join(",");
    useEffect(() => {
        if (!key) return;
        const current = Date.now();
        // Stamps the clock hasn't passed yet; an overdue one (a throttled background timer) moves it at once.
        const waits = key.split(",").map(Number).filter((stamp) => stamp + ms > clock).map((stamp) => Math.max(0, stamp + ms - current));
        if (!waits.length) return;
        const timer = window.setTimeout(() => setClock(Date.now()), Math.min(...waits) + 25);
        return () => window.clearTimeout(timer);
    }, [clock, key, ms]);
    return clock;
}

/* -------------------------------------------------------------------------- */
/* Mode                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * "live" once the Firebase bridge is ready; "fallback" when it failed, took
 * longer than a few seconds, or a listener that must work was refused.
 */
export function useSocialModeState(bridge: { ready: boolean; failed: boolean }) {
    const [broken, setBroken] = useState(false);
    const [timedOut, setTimedOut] = useState(false);
    const waiting = !bridge.ready && !bridge.failed;
    useEffect(() => {
        if (!waiting) return;
        const timer = window.setTimeout(() => setTimedOut(true), SOCIAL_POLL.bridgeGraceMs);
        return () => window.clearTimeout(timer);
    }, [waiting]);
    const markBroken = useCallback(() => setBroken(true), []);
    const mode: SocialMode = bridge.ready && !broken ? "live" : bridge.failed || broken || timedOut ? "fallback" : "connecting";
    return { mode, markBroken };
}

/* -------------------------------------------------------------------------- */
/* Friends                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Friends, requests and blocks from GET /api/social/friends. In live mode the
 * user document and the pending requests are watched, and any change there
 * reloads the overview at once; otherwise it is polled.
 */
export function useFriendsOverview(email: string, mode: SocialMode, onBroken: () => void) {
    const [data, setData] = useState<FriendsOverview | null>(null);
    const [error, setError] = useState<unknown>(null);
    const [loaded, setLoaded] = useState(false);
    const onBrokenRef = useLatest(onBroken);

    const refresh = useCallback(async () => {
        if (!email) return;
        try {
            setData(await socialApi.friends());
            setError(null);
        } catch (failure) {
            setError(failure);
        } finally {
            setLoaded(true);
        }
    }, [email]);

    useEffect(() => {
        if (!email) return;
        const timer = window.setTimeout(() => void refresh(), 0);
        return () => window.clearTimeout(timer);
    }, [email, refresh]);

    useEffect(() => {
        if (mode !== "live" || !email) return;
        let timer = 0;
        const schedule = () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => void refresh(), 400);
        };
        const onError = (failure: FirestoreError) => {
            if (isPermissionError(failure)) onBrokenRef.current();
        };
        let graphKey: string | null = null;
        let incomingPrimed = false;
        let outgoingPrimed = false;
        const unsubscribers = [
            // The presence heartbeat touches this document often: only the friend graph matters here.
            onSnapshot(doc(db, "users", email), (snapshot) => {
                const key = JSON.stringify([snapshot.get("friends") ?? [], snapshot.get("blockedUsers") ?? []]);
                if (graphKey !== null && key !== graphKey) schedule();
                graphKey = key;
            }, onError),
            onSnapshot(query(collection(db, "friendRequests"), where("toEmail", "==", email), where("status", "==", "pending")), () => {
                if (incomingPrimed) schedule();
                incomingPrimed = true;
            }, onError),
            onSnapshot(query(collection(db, "friendRequests"), where("fromEmail", "==", email), where("status", "==", "pending")), () => {
                if (outgoingPrimed) schedule();
                outgoingPrimed = true;
            }, onError),
        ];
        return () => {
            window.clearTimeout(timer);
            unsubscribers.forEach((unsubscribe) => unsubscribe());
        };
    }, [email, mode, onBrokenRef, refresh]);

    usePoll(refresh, mode === "live" ? SOCIAL_POLL.friendsLiveMs : SOCIAL_POLL.friendsFallbackMs, Boolean(email) && mode !== "connecting");

    return { data, error, loaded, refresh };
}

export type LiveProfile = Omit<SocialPerson, "email">;

const PROFILE_CHUNK = 30;

function text(value: unknown, max: number) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

const STAFF_ROLES: readonly StaffRoleBadge[] = ["owner", "admin", "moderator"];

function liveProfile(data: DocumentData, now: number): LiveProfile {
    const nickname = text(data.nickname, 100);
    const tag = typeof data.nicknameTag === "string" && /^[0-9]{4}$/.test(data.nicknameTag) ? data.nicknameTag : "";
    const avatar = typeof data.avatarUrl === "string" && /^https:\/\/[^\s"'<>`]+$/.test(data.avatarUrl) ? data.avatarUrl : null;
    const seen = lastSeenTime(data);
    return {
        username: text(data.username, 60),
        avatarUrl: avatar,
        nickname: nickname && tag ? nickname : "",
        nicknameTag: nickname && tag ? tag : "",
        staffRole: STAFF_ROLES.find((role) => role === data.staffRole) ?? null,
        customStatus: text(data.customStatus, 120),
        statusEmoji: text(data.statusEmoji, 16),
        status: effectiveStatus(data, now),
        lastSeenAt: seen ? new Date(seen).toISOString() : null,
    };
}

/**
 * Realtime public profiles (names, avatars, Discord-style presence) of the
 * given people, 30 per listener. Live mode only; empty otherwise.
 */
export function useLiveProfiles(emails: readonly string[], enabled: boolean, onBroken: () => void): Map<string, LiveProfile> {
    const [raw, setRaw] = useState<Record<string, DocumentData>>({});
    const onBrokenRef = useLatest(onBroken);
    const key = useMemo(() => [...new Set(emails)].filter(Boolean).sort().join("\n"), [emails]);
    const now = useNow(30_000);

    useEffect(() => {
        if (!enabled || !key) return;
        const list = key.split("\n");
        const unsubscribers: Array<() => void> = [];
        for (let index = 0; index < list.length; index += PROFILE_CHUNK) {
            const chunk = list.slice(index, index + PROFILE_CHUNK);
            unsubscribers.push(onSnapshot(query(collection(db, "public_profiles"), where(documentId(), "in", chunk)), (snapshot) => {
                setRaw((current) => {
                    const next = { ...current };
                    for (const change of snapshot.docChanges()) {
                        if (change.type === "removed") delete next[change.doc.id];
                        else next[change.doc.id] = change.doc.data();
                    }
                    return next;
                });
            }, (failure) => {
                if (isPermissionError(failure)) onBrokenRef.current();
            }));
        }
        return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    }, [enabled, key, onBrokenRef]);

    return useMemo(() => {
        const map = new Map<string, LiveProfile>();
        if (!enabled) return map;
        for (const [email, data] of Object.entries(raw)) map.set(email, liveProfile(data, now));
        return map;
    }, [enabled, now, raw]);
}

/* -------------------------------------------------------------------------- */
/* Direct message list                                                        */
/* -------------------------------------------------------------------------- */

/** One conversation before the partner's profile is attached (live) or with it (fallback). */
export type DmEntry = {
    chatId: string;
    partnerEmail: string;
    lastMessage: string;
    lastMessageAt: number;
    lastFromMe: boolean;
    unread: number;
    typing: boolean;
    person: SocialPerson | null;
    isFriend: boolean | null;
};

const TYPING_SHOW_MS = 6_000;

/**
 * The user's conversations: chats/ where they participate (live) or GET
 * /api/social/dms (fallback). Unread counts come from the messages' `read`
 * flags (the existing read receipts).
 */
export function useDmList(email: string, mode: SocialMode, onBroken: () => void) {
    const [liveChats, setLiveChats] = useState<Array<Omit<DmEntry, "unread" | "typing"> & { typingSeen: number }>>([]);
    const [liveLoaded, setLiveLoaded] = useState(false);
    const [serverEntries, setServerEntries] = useState<DmEntry[]>([]);
    const [serverLoaded, setServerLoaded] = useState(false);
    const onBrokenRef = useLatest(onBroken);
    const live = mode === "live";

    useEffect(() => {
        if (!live || !email) return;
        const typingState = new Map<string, { user: string; at: number; seen: number }>();
        let primed = false;
        return onSnapshot(query(collection(db, "chats"), where("participants", "array-contains", email)), (snapshot) => {
            const received = Date.now();
            const next = snapshot.docs.flatMap((item) => {
                const data = item.data({ serverTimestamps: "estimate" });
                const participants = Array.isArray(data.participants) ? data.participants.filter((entry): entry is string => typeof entry === "string") : [];
                const partner = participants.length === 2 && participants.includes(email) ? participants.find((entry) => entry !== email) ?? "" : "";
                const lastMessageAt = timeOf(data.lastMessageAt);
                if (!partner || item.id !== dmChatId(email, partner) || !lastMessageAt) return [];
                const typingUser = typeof data.typingUser === "string" ? data.typingUser : "";
                const stamp = timeOf(data.updatedAt);
                const previous = typingState.get(item.id);
                // Only a change seen while listening counts as typing (a stale flag from the first snapshot doesn't).
                const changed = !previous || previous.user !== typingUser || previous.at !== stamp;
                const typingSeen = typingUser !== partner ? 0 : changed ? (primed ? received : 0) : previous.seen;
                typingState.set(item.id, { user: typingUser, at: stamp, seen: typingSeen });
                return [{
                    chatId: item.id,
                    partnerEmail: partner,
                    lastMessage: previewText(data.lastMessage),
                    lastMessageAt,
                    lastFromMe: data.lastSender === email,
                    person: null,
                    isFriend: null,
                    typingSeen,
                }];
            });
            primed = true;
            setLiveChats(next);
            setLiveLoaded(true);
        }, (failure) => {
            if (isPermissionError(failure)) onBrokenRef.current();
            setLiveLoaded(true);
        });
    }, [email, live, onBrokenRef]);

    const candidates = useMemo(() => liveChats.filter((chat) => !chat.lastFromMe).map((chat) => ({ chatId: chat.chatId, partner: chat.partnerEmail })), [liveChats]);
    const liveUnread = useDmUnreadLive(candidates, live);

    const refresh = useCallback(async () => {
        if (!email) return;
        try {
            const { dms } = await socialApi.dms();
            setServerEntries(dms.map((dm) => ({
                chatId: dm.chatId,
                partnerEmail: dm.partner.email,
                lastMessage: dm.lastMessage,
                lastMessageAt: dm.lastMessageAt,
                lastFromMe: dm.lastFromMe,
                unread: dm.unread,
                typing: dm.typing,
                person: dm.partner,
                isFriend: dm.isFriend,
            })));
        } finally {
            setServerLoaded(true);
        }
    }, [email]);

    useEffect(() => {
        if (mode !== "fallback" || !email) return;
        const timer = window.setTimeout(() => void refresh().catch(() => undefined), 0);
        return () => window.clearTimeout(timer);
    }, [email, mode, refresh]);
    usePoll(refresh, SOCIAL_POLL.dmListMs, mode === "fallback" && Boolean(email));

    const clock = useExpiryClock(liveChats.map((chat) => chat.typingSeen), TYPING_SHOW_MS);
    const entries: DmEntry[] = useMemo(() => {
        if (!live) return serverEntries;
        return liveChats.map(({ typingSeen, ...chat }) => ({
            ...chat,
            unread: chat.lastFromMe ? 0 : liveUnread[chat.chatId] ?? 0,
            typing: typingSeen > 0 && typingSeen + TYPING_SHOW_MS > clock,
        }));
    }, [clock, live, liveChats, liveUnread, serverEntries]);

    return { entries, loaded: live ? liveLoaded : serverLoaded, refresh };
}

/**
 * Unread messages per conversation (live): one small listener for each chat
 * whose newest message came from the partner.
 */
function useDmUnreadLive(candidates: ReadonlyArray<{ chatId: string; partner: string }>, enabled: boolean) {
    const [counts, setCounts] = useState<Record<string, number>>({});
    const listenersRef = useRef(new Map<string, () => void>());
    const key = candidates.map((entry) => `${entry.chatId}\u0001${entry.partner}`).sort().join("\n");

    useEffect(() => {
        const listeners = listenersRef.current;
        const wanted = new Map(enabled && key ? key.split("\n").map((line) => {
            const [chatId, partner] = line.split("\u0001");
            return [chatId, partner] as const;
        }) : []);
        for (const [chatId, unsubscribe] of listeners) {
            if (wanted.has(chatId)) continue;
            unsubscribe();
            listeners.delete(chatId);
        }
        for (const [chatId, partner] of wanted) {
            if (listeners.has(chatId)) continue;
            listeners.set(chatId, onSnapshot(query(collection(db, "chats", chatId, "messages"), where("read", "==", false), limit(50)), (snapshot) => {
                const count = snapshot.docs.filter((item) => item.get("fromEmail") === partner && item.get("deleted") !== true).length;
                setCounts((current) => (current[chatId] === count ? current : { ...current, [chatId]: count }));
            }, () => undefined));
        }
    }, [enabled, key]);

    useEffect(() => () => {
        for (const unsubscribe of listenersRef.current.values()) unsubscribe();
        listenersRef.current.clear();
    }, []);

    return counts;
}

/* -------------------------------------------------------------------------- */
/* One conversation                                                           */
/* -------------------------------------------------------------------------- */

type ConversationOptions = {
    me: string;
    partner: string;
    mode: SocialMode;
    /** chats/{id} exists (from the conversation list); listening to a missing chat is refused by the rules. */
    chatExists: boolean;
    /** The conversation is on screen: messages from the partner are marked read. */
    active: boolean;
    onError: (error: unknown) => void;
};

const TYPING_REFRESH_MS = 3_000;
const TYPING_IDLE_MS = 4_000;

/**
 * Messages of one direct conversation with sending, editing, deleting, read
 * receipts and the typing indicator, through the client SDK (live) or the
 * /api/social/dm endpoint (fallback).
 */
export function useConversation({ me, partner, mode, chatExists, active, onError }: ConversationOptions) {
    const chatId = dmChatId(me, partner);
    const live = mode === "live";
    const [liveMessages, setLiveMessages] = useState<DmMessage[]>([]);
    const [liveLoaded, setLiveLoaded] = useState(false);
    const [windowSize, setWindowSize] = useState<number>(SOCIAL_LIMITS.dmPage);
    const [liveHasMore, setLiveHasMore] = useState(false);
    const [optimistic, setOptimistic] = useState<DmMessage[]>([]);
    const [server, setServer] = useState<{ messages: DmMessage[]; hasMore: boolean; loaded: boolean; typing: boolean; canSend: boolean | null; exists: boolean }>({ messages: [], hasMore: false, loaded: false, typing: false, canSend: null, exists: false });
    const [typingSeen, setTypingSeen] = useState(0);
    /** Deleted here, until the listener reports it (deleting goes through the server). */
    const [removed, setRemoved] = useState<Record<string, true>>({});
    const onErrorRef = useLatest(onError);
    const visible = usePageVisible();

    /* ---- live: messages and typing ---- */

    useEffect(() => {
        if (!live || !chatExists) return;
        return onSnapshot(query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "desc"), limit(windowSize)), (snapshot) => {
            const received = Date.now();
            const next = snapshot.docs
                .map((item) => dmMessageFromData(item.id, item.data({ serverTimestamps: "estimate" }), item.metadata.hasPendingWrites, received))
                .sort(compareMessages);
            setLiveMessages(next);
            setLiveHasMore(snapshot.size >= windowSize);
            setLiveLoaded(true);
            setOptimistic((current) => (current.length ? current.filter((entry) => !next.some((message) => message.id === entry.id)) : current));
        }, (failure) => {
            setLiveLoaded(true);
            onErrorRef.current(failure);
        });
    }, [chatExists, chatId, live, onErrorRef, windowSize]);

    useEffect(() => {
        if (!live || !chatExists) return;
        let primed = false;
        let previous = "";
        return onSnapshot(doc(db, "chats", chatId), (snapshot) => {
            const data = snapshot.data({ serverTimestamps: "estimate" }) ?? {};
            const typingUser = typeof data.typingUser === "string" ? data.typingUser : "";
            const signature = `${typingUser}|${timeOf(data.updatedAt)}`;
            if (typingUser !== partner) setTypingSeen(0);
            else if (primed && signature !== previous) setTypingSeen(Date.now());
            previous = signature;
            primed = true;
        }, () => undefined);
    }, [chatExists, chatId, live, partner]);

    /* ---- fallback: polling ---- */

    const serverRef = useLatest(server);
    const loadServer = useCallback(async (kind: "initial" | "since" | "full") => {
        const current = serverRef.current;
        const newest = current.messages[current.messages.length - 1]?.createdAt ?? 0;
        // A small overlap catches messages committed with a slightly older server time.
        const cursor = kind === "since" && newest ? { since: Math.max(1, newest - 2_000) } : { limit: SOCIAL_LIMITS.dmPage };
        const data = await socialApi.conversation(partner, cursor);
        setServer((state) => ({
            messages: kind === "initial" ? data.messages : mergeMessages(state.messages, data.messages),
            hasMore: kind === "since" ? state.hasMore : data.hasMore || (kind === "full" && state.hasMore),
            loaded: true,
            typing: data.typing,
            canSend: data.canSend,
            exists: data.exists,
        }));
    }, [partner, serverRef]);

    useEffect(() => {
        if (mode !== "fallback") return;
        let active = true;
        loadServer("initial").catch((failure: unknown) => {
            if (!active) return;
            setServer((state) => ({ ...state, loaded: true }));
            onErrorRef.current(failure);
        });
        return () => { active = false; };
    }, [loadServer, mode, onErrorRef]);

    const fullAtRef = useRef(0);
    usePoll(async () => {
        const full = Date.now() - fullAtRef.current > SOCIAL_POLL.conversationFullMs;
        if (full) fullAtRef.current = Date.now();
        await loadServer(full ? "full" : "since");
    }, SOCIAL_POLL.conversationMs, mode === "fallback" && server.loaded);

    /* ---- combined view ---- */

    const baseMessages = live ? liveMessages : server.messages;
    const messages = useMemo(() => {
        const merged = optimistic.length ? mergeMessages(baseMessages, optimistic) : baseMessages;
        if (!Object.keys(removed).length) return merged;
        return merged.map((message) => (removed[message.id] && !message.deleted ? { ...message, deleted: true, text: "", voicePath: null, replyTo: null } : message));
    }, [baseMessages, optimistic, removed]);
    const loaded = live ? (!chatExists || liveLoaded) : server.loaded;
    const hasMore = live ? liveHasMore : server.hasMore;
    const clock = useExpiryClock([typingSeen], TYPING_SHOW_MS);
    const typing = live ? typingSeen > 0 && typingSeen + TYPING_SHOW_MS > clock : server.typing;

    const loadOlder = useCallback(() => {
        if (live) {
            setWindowSize((value) => Math.min(value + SOCIAL_LIMITS.dmPage, SOCIAL_LIMITS.dmWindowMax));
            return;
        }
        const oldest = serverRef.current.messages[0]?.createdAt;
        if (!oldest) return;
        socialApi.conversation(partner, { before: oldest, limit: SOCIAL_LIMITS.dmPage })
            .then((data) => setServer((state) => ({ ...state, messages: mergeMessages(state.messages, data.messages, SOCIAL_LIMITS.dmWindowMax * 2), hasMore: data.hasMore })))
            .catch((failure: unknown) => onErrorRef.current(failure));
    }, [live, onErrorRef, partner, serverRef]);

    /* ---- read receipts ---- */

    const unreadIds = useMemo(() => messages.filter((message) => message.fromEmail === partner && !message.read && !message.deleted && !message.pending).map((message) => message.id), [messages, partner]);
    const unreadKey = unreadIds.join(",");
    const markedRef = useRef("");
    useEffect(() => {
        if (!active || !visible || !unreadKey || markedRef.current === unreadKey) return;
        markedRef.current = unreadKey;
        if (live) {
            const batch = writeBatch(db);
            unreadKey.split(",").slice(0, 100).forEach((id) => batch.update(doc(db, "chats", chatId, "messages", id), { read: true }));
            void batch.commit().catch(() => { markedRef.current = ""; });
        } else if (mode === "fallback") {
            void socialApi.dmAction({ action: "read", with: partner })
                .then(() => setServer((state) => ({ ...state, messages: state.messages.map((message) => (message.fromEmail === partner ? { ...message, read: true } : message)) })))
                .catch(() => { markedRef.current = ""; });
        }
    }, [active, chatId, live, mode, partner, unreadKey, visible]);

    /* ---- typing (outgoing) ---- */

    const typingRef = useRef({ active: false, sentAt: 0, timer: 0 });
    const exists = live ? chatExists : server.exists;
    const writeTyping = useCallback((on: boolean) => {
        if (!exists) return;
        if (live) {
            void updateDoc(doc(db, "chats", chatId), on ? { typingUser: me, updatedAt: serverTimestamp() } : { typingUser: null }).catch(() => undefined);
        } else if (mode === "fallback") {
            void socialApi.dmAction({ action: "typing", with: partner, active: on }, !on).catch(() => undefined);
        }
    }, [chatId, exists, live, me, mode, partner]);

    const stopTyping = useCallback(() => {
        const state = typingRef.current;
        window.clearTimeout(state.timer);
        if (!state.active) return;
        state.active = false;
        state.sentAt = 0;
        writeTyping(false);
    }, [writeTyping]);

    const notifyTyping = useCallback((draft: string) => {
        const state = typingRef.current;
        if (!draft.trim()) {
            stopTyping();
            return;
        }
        window.clearTimeout(state.timer);
        state.timer = window.setTimeout(stopTyping, TYPING_IDLE_MS);
        const stamp = Date.now();
        if (state.active && stamp - state.sentAt < TYPING_REFRESH_MS) return;
        state.active = true;
        state.sentAt = stamp;
        writeTyping(true);
    }, [stopTyping, writeTyping]);

    useEffect(() => () => stopTyping(), [stopTyping]);

    /* ---- sending ---- */

    const ensureChat = useCallback(async () => {
        if (chatExists) return;
        await setDoc(doc(db, "chats", chatId), { participants: [me, partner].sort(), updatedAt: serverTimestamp() }, { merge: true });
    }, [chatExists, chatId, me, partner]);

    // Shown until the listener delivers the message (a brand-new chat subscribes only after its first message).
    const addOptimistic = useCallback((id: string, data: Partial<DmMessage>) => {
        const message = dmMessageFromData(id, { fromEmail: me, read: false, ...data }, true, Date.now());
        setOptimistic((current) => [...current.filter((entry) => entry.id !== id), message]);
    }, [me]);

    const sendMessage = useCallback(async (body: { text: string; type: "text" | "sticker"; replyTo: DmReply | null }) => {
        stopTyping();
        if (!live) {
            const message = await socialApi.send(partner, { text: body.text, type: body.type, replyTo: body.replyTo ? { id: body.replyTo.id } : null });
            if (message) setServer((state) => ({ ...state, exists: true, messages: mergeMessages(state.messages, [message]) }));
            return;
        }
        await ensureChat();
        const data: Record<string, unknown> = { fromEmail: me, text: body.text, type: body.type, createdAt: serverTimestamp(), read: false };
        if (body.replyTo) data.replyTo = { id: body.replyTo.id, text: body.replyTo.text.slice(0, SOCIAL_LIMITS.replyExcerptMax), fromEmail: body.replyTo.fromEmail };
        const created = await addDoc(collection(db, "chats", chatId, "messages"), data);
        addOptimistic(created.id, { text: body.text, type: body.type, replyTo: body.replyTo });
        await updateDoc(doc(db, "chats", chatId), { lastMessage: previewText(body.text), lastMessageAt: serverTimestamp(), lastSender: me, typingUser: null, updatedAt: serverTimestamp() }).catch(() => undefined);
    }, [addOptimistic, chatId, ensureChat, live, me, partner, stopTyping]);

    /**
     * Voice messages always go through POST /api/social/voice (the server
     * stores the recording and writes the message), with or without the
     * Firebase bridge and whatever the Storage rules allow.
     */
    const sendVoice = useCallback(async (blob: Blob, mimeType: string, seconds: number, label: string) => {
        stopTyping();
        const message = await socialApi.sendDmVoice(partner, blob, { seconds, label, type: mimeType });
        if (!message) return;
        // Shown at once; the listener (live) or the next poll confirms it.
        if (live) setOptimistic((current) => [...current.filter((entry) => entry.id !== message.id), message]);
        else setServer((state) => ({ ...state, exists: true, messages: mergeMessages(state.messages, [message]) }));
    }, [live, partner, stopTyping]);

    const isNewest = useCallback((message: DmMessage) => {
        const newest = messages[messages.length - 1];
        return Boolean(newest && newest.id === message.id);
    }, [messages]);

    const editMessage = useCallback(async (message: DmMessage, nextText: string) => {
        if (!live) {
            await socialApi.dmAction({ action: "edit", with: partner, messageId: message.id, text: nextText });
            setServer((state) => ({ ...state, messages: state.messages.map((entry) => (entry.id === message.id ? { ...entry, text: nextText, edited: true } : entry)) }));
            return;
        }
        await updateDoc(doc(db, "chats", chatId, "messages", message.id), { text: nextText, edited: true });
        if (isNewest(message)) await updateDoc(doc(db, "chats", chatId), { lastMessage: previewText(nextText) }).catch(() => undefined);
    }, [chatId, isNewest, live, partner]);

    // Deleting goes through the server, which also removes a voice recording from Storage.
    const deleteMessage = useCallback(async (message: DmMessage) => {
        await socialApi.dmAction({ action: "delete", with: partner, messageId: message.id });
        setRemoved((current) => ({ ...current, [message.id]: true }));
        if (!live) setServer((state) => ({ ...state, messages: state.messages.map((entry) => (entry.id === message.id ? { ...entry, deleted: true, text: "", voicePath: null } : entry)) }));
    }, [live, partner]);

    return {
        chatId,
        messages,
        loaded,
        hasMore,
        loadOlder,
        typing,
        /** From the server in fallback mode; null when the caller decides from the friends list. */
        canSend: live ? null : server.canSend,
        exists,
        sendMessage,
        sendVoice,
        editMessage,
        deleteMessage,
        notifyTyping,
        stopTyping,
    };
}

/**
 * Plays one voice message at a time. The recording comes from GET
 * /api/social/voice (checked like the conversation itself), so it plays with
 * or without the Firebase bridge.
 */
export function useVoiceMessagePlayer(target: VoiceTarget, onError: (error: unknown) => void) {
    const [playingId, setPlayingId] = useState("");
    const [loadingId, setLoadingId] = useState("");
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const urlRef = useRef("");
    const requestRef = useRef(0);
    const onErrorRef = useLatest(onError);
    // Plain strings, so a new target object each render doesn't restart anything.
    const partner = "with" in target ? target.with : "";
    const group = "group" in target ? target.group : "";

    const release = useCallback(() => {
        audioRef.current?.pause();
        audioRef.current = null;
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = "";
    }, []);

    const stop = useCallback(() => {
        requestRef.current += 1;
        release();
        setPlayingId("");
        setLoadingId("");
    }, [release]);

    const toggle = useCallback(async (message: { id: string; voicePath: string | null }) => {
        if (playingId === message.id) {
            stop();
            return;
        }
        if (!message.voicePath) {
            onErrorRef.current(new SocialRequestError("voice_unavailable"));
            return;
        }
        release();
        setPlayingId("");
        const request = ++requestRef.current;
        setLoadingId(message.id);
        try {
            const blob = await socialApi.voiceBlob(group ? { group } : { with: partner }, message.id);
            // Another message was started (or the player stopped) meanwhile.
            if (request !== requestRef.current) return;
            urlRef.current = URL.createObjectURL(blob);
            const audio = new Audio(urlRef.current);
            audioRef.current = audio;
            audio.onended = () => setPlayingId((current) => (current === message.id ? "" : current));
            setPlayingId(message.id);
            await audio.play();
        } catch (error) {
            if (request !== requestRef.current) return;
            release();
            setPlayingId("");
            onErrorRef.current(error instanceof SocialRequestError ? error : new SocialRequestError("voice_unavailable"));
        } finally {
            if (request === requestRef.current) setLoadingId("");
        }
    }, [group, onErrorRef, partner, playingId, release, stop]);

    useEffect(() => () => {
        audioRef.current?.pause();
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    }, []);

    return { playingId, loadingId, toggle, stop };
}

/* -------------------------------------------------------------------------- */
/* Groups                                                                     */
/* -------------------------------------------------------------------------- */

/** The user's groups and pending group invitations (GET /api/groups), polled. */
export function useGroupsList(email: string, mode: SocialMode) {
    const [groups, setGroups] = useState<GroupListItem[]>([]);
    const [invites, setInvites] = useState<GroupInvitationItem[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(false);

    const refresh = useCallback(async () => {
        if (!email) return;
        try {
            const response = await fetch("/api/groups", { cache: "no-store", credentials: "same-origin" });
            if (!response.ok) throw new Error(String(response.status));
            const data = await response.json() as GroupListResponse;
            setGroups(Array.isArray(data.groups) ? data.groups : []);
            setInvites(Array.isArray(data.invites) ? data.invites : []);
            setError(false);
        } catch {
            setError(true);
        } finally {
            setLoaded(true);
        }
    }, [email]);

    useEffect(() => {
        if (!email) return;
        const timer = window.setTimeout(() => void refresh(), 0);
        return () => window.clearTimeout(timer);
    }, [email, refresh]);

    usePoll(refresh, mode === "live" ? SOCIAL_POLL.groupsLiveMs : SOCIAL_POLL.groupsFallbackMs, Boolean(email) && mode !== "connecting");

    /** Applies a change seen in the open group (name, icon…) before the next poll. */
    const patchGroup = useCallback((groupId: string, patch: Partial<GroupListItem>) => {
        setGroups((current) => {
            const index = current.findIndex((group) => group.id === groupId);
            if (index < 0) return current;
            const before = current[index];
            if (Object.entries(patch).every(([key, value]) => before[key as keyof GroupListItem] === value)) return current;
            const next = [...current];
            next[index] = { ...before, ...patch };
            return next;
        });
    }, []);

    return { groups, invites, loaded, error, refresh, patchGroup };
}

const UNREAD_WINDOW = 30;

/**
 * Unread messages and mentions per group for the server rail. Live: a
 * listener per group on the messages after the last-read time (only unread
 * messages are read). Fallback: the group list's last message time (a dot,
 * no mention count).
 */
export function useGroupUnread(options: {
    groups: readonly GroupListItem[];
    me: string;
    myName: string;
    activeGroupId: string;
    readMap: Readonly<Record<string, number>>;
    live: boolean;
}) {
    const { groups, me, myName, activeGroupId, readMap, live } = options;
    const [liveState, setLiveState] = useState<Record<string, GroupUnread>>({});
    const listenersRef = useRef(new Map<string, { readAt: number; unsubscribe: () => void }>());
    const nameRef = useLatest(myName);
    const wantedKey = live ? groups.filter((group) => group.id !== activeGroupId).map((group) => `${group.id}:${readMap[group.id] || 0}`).join(",") : "";

    useEffect(() => {
        const listeners = listenersRef.current;
        const wanted = new Map(wantedKey ? wantedKey.split(",").map((entry) => {
            const index = entry.lastIndexOf(":");
            return [entry.slice(0, index), Number(entry.slice(index + 1)) || 0] as const;
        }) : []);
        for (const [groupId, listener] of listeners) {
            if (wanted.get(groupId) === listener.readAt) continue;
            listener.unsubscribe();
            listeners.delete(groupId);
            if (!wanted.has(groupId)) setLiveState((current) => {
                if (!(groupId in current)) return current;
                const next = { ...current };
                delete next[groupId];
                return next;
            });
        }
        for (const [groupId, readAt] of wanted) {
            if (listeners.has(groupId)) continue;
            const unsubscribe = onSnapshot(query(
                collection(db, "groups", groupId, "messages"),
                where("createdAt", ">", Timestamp.fromMillis(readAt)),
                orderBy("createdAt", "asc"),
                limit(UNREAD_WINDOW),
            ), (snapshot) => {
                const name = nameRef.current;
                const recent = snapshot.docs.map((item) => {
                    const data = item.data({ serverTimestamps: "estimate" });
                    const body = typeof data.text === "string" ? data.text : "";
                    return {
                        createdAt: timeOf(data.createdAt) || Date.now(),
                        fromEmail: typeof data.fromEmail === "string" ? data.fromEmail : "",
                        system: data.type === "system",
                        mentionsMe: Boolean(name) && data.type === "text" && mentionsUser(body, name, [name]),
                    };
                });
                const state = groupUnreadState(recent, readAt, me);
                setLiveState((current) => (current[groupId]?.unread === state.unread && current[groupId]?.mentions === state.mentions ? current : { ...current, [groupId]: state }));
            }, () => undefined);
            listeners.set(groupId, { readAt, unsubscribe });
        }
    }, [me, nameRef, wantedKey]);

    useEffect(() => () => {
        for (const listener of listenersRef.current.values()) listener.unsubscribe();
        listenersRef.current.clear();
    }, []);

    return useMemo(() => {
        const result: Record<string, GroupUnread> = {};
        for (const group of groups) {
            if (group.id === activeGroupId) continue;
            if (live) {
                if (liveState[group.id]) result[group.id] = liveState[group.id];
            } else if (group.lastMessageAt && !group.lastMessageFromMe && timeOf(group.lastMessageAt) > (readMap[group.id] || 0)) {
                result[group.id] = { unread: 1, mentions: 0 };
            }
        }
        return result;
    }, [activeGroupId, groups, live, liveState, readMap]);
}
