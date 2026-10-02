/**
 * Realtime receiving for a live session through the Firestore client SDK
 * (used while useFirebaseBridge().ready). firestore.rules let participants
 * read the session's live documents; every write still goes through
 * /api/collab. Any listener error (rules not deployed, permission revoked,
 * offline) is reported once, and CollabSession falls back to polling
 * GET /api/collab/[id].
 */
import { collection, doc, limit, onSnapshot, orderBy, query, where, type DocumentSnapshot, type QuerySnapshot, type Unsubscribe } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
    COLLAB_LIMITS,
    readChatMessage,
    readMeta,
    readPresenceItem,
    readSignal,
    readUpdateItem,
    type CollabChatMessage,
    type CollabMeta,
    type CollabPresenceItem,
    type CollabSignal,
    type CollabUpdateItem,
} from "./protocol";

export type RealtimeHandlers = {
    onMeta: (meta: CollabMeta) => void;
    onUpdates: (items: CollabUpdateItem[]) => void;
    /** Added or changed presence documents, and ids of removed ones. */
    onPresence: (items: CollabPresenceItem[], removed: string[]) => void;
    onChat: (messages: CollabChatMessage[]) => void;
    onSignals: (signals: CollabSignal[]) => void;
    onError: (error: unknown) => void;
};

export type RealtimeHandle = {
    stop: () => void;
    /** Listens to the caller's signalling inbox only while they are in the voice chat. */
    setSignals: (on: boolean) => void;
};

export function startRealtime(options: { sessionId: string; key: string; afterSeq: number; signals: boolean; handlers: RealtimeHandlers }): RealtimeHandle {
    const { sessionId, key, afterSeq, handlers } = options;
    let stopped = false;
    let failed = false;
    const unsubscribers: Unsubscribe[] = [];
    let signalsUnsubscribe: Unsubscribe | null = null;
    const fail = (error: unknown) => {
        if (stopped || failed) return;
        failed = true;
        handlers.onError(error);
    };
    const guard = <T>(handler: (value: T) => void) => (value: T) => {
        if (!stopped && !failed) handler(value);
    };

    unsubscribers.push(onSnapshot(doc(db, "collab_sessions", sessionId, "live", "meta"), guard((snapshot: DocumentSnapshot) => {
        const meta = readMeta(snapshot.data());
        if (meta) handlers.onMeta(meta);
    }), fail));

    unsubscribers.push(onSnapshot(
        query(collection(db, "collab_sessions", sessionId, "updates"), where("seq", ">", Math.max(0, afterSeq)), orderBy("seq")),
        guard((snapshot: QuerySnapshot) => {
            const items = snapshot.docChanges().flatMap((change) => {
                if (change.type !== "added") return [];
                const item = readUpdateItem(change.doc.data());
                return item ? [item] : [];
            });
            if (items.length) handlers.onUpdates(items);
        }),
        fail,
    ));

    unsubscribers.push(onSnapshot(collection(db, "collab_sessions", sessionId, "presence"), guard((snapshot: QuerySnapshot) => {
        const items: CollabPresenceItem[] = [];
        const removed: string[] = [];
        for (const change of snapshot.docChanges()) {
            if (change.type === "removed") {
                removed.push(change.doc.id);
                continue;
            }
            const item = readPresenceItem(change.doc.id, change.doc.data());
            if (item) items.push(item);
        }
        if (items.length || removed.length) handlers.onPresence(items, removed);
    }), fail));

    unsubscribers.push(onSnapshot(
        query(collection(db, "collab_sessions", sessionId, "chat"), orderBy("at", "desc"), limit(COLLAB_LIMITS.chatPage)),
        guard((snapshot: QuerySnapshot) => {
            const messages = snapshot.docs.flatMap((entry) => {
                const message = readChatMessage(entry.id, entry.data());
                return message ? [message] : [];
            });
            handlers.onChat(messages.reverse());
        }),
        fail,
    ));

    const setSignals = (on: boolean) => {
        if (stopped || failed) return;
        if (on && !signalsUnsubscribe) {
            signalsUnsubscribe = onSnapshot(collection(db, "collab_sessions", sessionId, "inbox", key, "signals"), guard((snapshot: QuerySnapshot) => {
                const signals = snapshot.docChanges().flatMap((change) => {
                    if (change.type !== "added") return [];
                    const signal = readSignal(change.doc.id, change.doc.data());
                    return signal ? [signal] : [];
                });
                if (signals.length) handlers.onSignals(signals);
            }), fail);
        } else if (!on && signalsUnsubscribe) {
            signalsUnsubscribe();
            signalsUnsubscribe = null;
        }
    };
    setSignals(options.signals);

    return {
        stop: () => {
            if (stopped) return;
            stopped = true;
            unsubscribers.forEach((unsubscribe) => unsubscribe());
            signalsUnsubscribe?.();
            signalsUnsubscribe = null;
        },
        setSignals,
    };
}
