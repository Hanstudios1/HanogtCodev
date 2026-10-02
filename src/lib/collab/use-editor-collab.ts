"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { collabApi, collabErrorCode, type CollabCreateFile } from "./api";
import { fromBase64, isCollabSessionId, type CollabErrorCode, type CollabInfoResponse } from "./protocol";
// Yjs and the session client load when a session starts, not with the editor.
import type { CollabClosed, CollabHooks, CollabNotice, CollabSession, CollabState } from "./session-client";

/** /editor?collab=<session id> opens (or joins) a live session. */
export const COLLAB_PARAM = "collab";
const SHARED_KEY = "hanogt_collab_shared";

/** The owner's tab ids that went into a session; the final content replaces exactly these when it ends. */
function rememberSharedFiles(id: string, fileIds: readonly string[]) {
    try {
        window.sessionStorage.setItem(`${SHARED_KEY}:${id}`, JSON.stringify(fileIds));
    } catch {
        // Without storage every file of the session counts as shared.
    }
}

export function sharedFileIds(id: string): string[] | null {
    try {
        const parsed = JSON.parse(window.sessionStorage.getItem(`${SHARED_KEY}:${id}`) ?? "null") as unknown;
        return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : null;
    } catch {
        return null;
    }
}

function setSessionParam(id: string | null) {
    try {
        const url = new URL(window.location.href);
        if (url.searchParams.get(COLLAB_PARAM) === id) return;
        if (id) url.searchParams.set(COLLAB_PARAM, id);
        else url.searchParams.delete(COLLAB_PARAM);
        window.history.replaceState(null, "", url);
    } catch {
        // The address bar only helps reloading; the session works without it.
    }
}

function isPhone() {
    try {
        return window.matchMedia("(max-width: 639px)").matches;
    } catch {
        return false;
    }
}

/**
 * A value of the session's state; the component re-renders only when the
 * selected value changes (select must return stored values, not new objects).
 */
export function useCollabValue<T>(session: CollabSession | null, select: (state: CollabState) => T, fallback: T): T {
    const subscribe = useCallback((listener: () => void) => (session ? session.subscribe(listener) : () => undefined), [session]);
    return useSyncExternalStore(subscribe, () => (session ? select(session.getState()) : fallback), () => fallback);
}

export type EditorCollabOptions = {
    /** Signed in and not editing a game script. */
    enabled: boolean;
    /** useFirebaseBridge().ready: receive through Firestore listeners instead of polling. */
    realtime: boolean;
    /** The ?collab= parameter of the page. */
    requestedId: string | null;
    onActivateFile: (fileId: string) => void;
    onNotice: (notice: CollabNotice) => void;
    onError: (code: CollabErrorCode) => void;
    /** The session started or was joined in this tab. */
    onStarted: () => void;
    /** This tab's part in the session is over (ended, left, removed). */
    onClosed: (closed: CollabClosed) => void;
};

export type CollabStartInput = { title: string; files: CollabCreateFile[]; invite: string[] };

/**
 * Live collaboration for the editor page: starts sessions, joins them from
 * the invite link (/editor?collab=<id>), keeps one CollabSession and reports
 * when it is over. The page reads the shared files through `files` and
 * routes tab changes through `sessionRef` (applyTabChanges).
 */
export function useEditorCollab(options: EditorCollabOptions) {
    const [session, setSession] = useState<CollabSession | null>(null);
    const [joinInfo, setJoinInfo] = useState<CollabInfoResponse | null>(null);
    const [finished, setFinished] = useState<CollabClosed | null>(null);
    const [busy, setBusy] = useState<"start" | "join" | null>(null);
    const optionsRef = useRef(options);
    useEffect(() => {
        optionsRef.current = options;
    });
    /** The running session, readable synchronously from event handlers. */
    const sessionRef = useRef<CollabSession | null>(null);

    const phase = useCollabValue(session, (state) => state.phase, "closed");
    const files = useCollabValue(session, (state) => state.files, null);
    const canEdit = useCollabValue(session, (state) => state.canEdit, false);
    const role = useCollabValue(session, (state) => state.me?.role ?? null, null);
    const title = useCollabValue(session, (state) => state.meta?.title ?? "", "");
    const unsynced = useCollabValue(session, (state) => state.unsynced, false);
    const chatUnread = useCollabValue(session, (state) => state.chatUnread, 0);
    const active = Boolean(session) && phase !== "closed" && files !== null;

    const hooks = useMemo<CollabHooks>(() => ({
        onActivateFile: (fileId) => optionsRef.current.onActivateFile(fileId),
        onNotice: (notice) => optionsRef.current.onNotice(notice),
        onClosed: (closed) => {
            if (sessionRef.current?.id === closed.id) sessionRef.current = null;
            setSessionParam(null);
            optionsRef.current.onClosed(closed);
            // Participants get the final code to keep; the owner's project receives it directly.
            // Anyone who lost access (signed out elsewhere) can keep what they had.
            if ((closed.role !== "owner" && (closed.reason === "ended" || closed.reason === "left")) || closed.reason === "unavailable") setFinished(closed);
        },
    }), []);

    const launch = useCallback(async (id: string) => {
        if (sessionRef.current && sessionRef.current.id === id && !sessionRef.current.isClosed) return;
        let SessionClass: typeof CollabSession;
        try {
            SessionClass = (await import("./session-client")).CollabSession;
        } catch {
            optionsRef.current.onError("network");
            return;
        }
        const current = sessionRef.current;
        if (current && current.id === id && !current.isClosed) return;
        current?.destroy();
        const next = new SessionClass(id, { realtime: optionsRef.current.realtime, hooks, phoneMode: isPhone() });
        sessionRef.current = next;
        setSession(next);
        setSessionParam(id);
        try {
            await next.start();
            if (sessionRef.current === next && !next.isClosed) optionsRef.current.onStarted();
        } catch (error) {
            next.destroy();
            if (sessionRef.current === next) {
                sessionRef.current = null;
                setSessionParam(null);
            }
            optionsRef.current.onError(collabErrorCode(error));
        }
    }, [hooks]);

    /** The final code of a session that ended while this person was away (kept for 24 hours). */
    const showFinal = useCallback(async (id: string) => {
        try {
            const response = await collabApi.poll(id, { after: -1, chat: 0, signals: false, client: 0 });
            const updates = response.updates.flatMap((item) => {
                const bytes = fromBase64(item.data);
                return bytes ? [bytes] : [];
            });
            const { filesFromState } = await import("./doc");
            const files = filesFromState(response.snapshot ? fromBase64(response.snapshot.data) : null, updates);
            if (files.length) setFinished({ id, reason: "ended", files, role: response.me.role, title: response.meta.title });
            else optionsRef.current.onError("ended");
        } catch (error) {
            optionsRef.current.onError(collabErrorCode(error));
        }
    }, []);

    // The invite link: participants rejoin directly, invitees see the join dialog.
    const { enabled, requestedId } = options;
    useEffect(() => {
        if (!enabled || !requestedId || sessionRef.current?.id === requestedId) return;
        if (!isCollabSessionId(requestedId)) {
            setSessionParam(null);
            optionsRef.current.onError("not_found");
            return;
        }
        let cancelled = false;
        collabApi.info(requestedId).then((info) => {
            if (cancelled) return;
            if (info.status !== "active") {
                setSessionParam(null);
                if (info.joined) void showFinal(requestedId);
                else optionsRef.current.onError("ended");
            } else if (info.joined) {
                void launch(requestedId);
            } else {
                setJoinInfo(info);
            }
        }).catch((error: unknown) => {
            if (cancelled) return;
            setSessionParam(null);
            optionsRef.current.onError(collabErrorCode(error));
        });
        return () => {
            cancelled = true;
        };
    }, [enabled, requestedId, launch, showFinal]);

    // Signing out ends the local part (without leaving: signing back in rejoins).
    useEffect(() => {
        if (enabled) return;
        const current = sessionRef.current;
        sessionRef.current = null;
        current?.destroy();
    }, [enabled]);

    useEffect(() => {
        session?.setRealtimeAvailable(options.realtime);
    }, [session, options.realtime]);

    useEffect(() => {
        const registry = sessionRef;
        return () => {
            registry.current?.destroy();
            registry.current = null;
        };
    }, []);

    const start = useCallback(async (input: CollabStartInput) => {
        setBusy("start");
        try {
            const created = await collabApi.create(input);
            rememberSharedFiles(created.id, input.files.map((file) => file.id));
            await launch(created.id);
            return true;
        } catch (error) {
            optionsRef.current.onError(collabErrorCode(error));
            return false;
        } finally {
            setBusy(null);
        }
    }, [launch]);

    const join = useCallback(async () => {
        const info = joinInfo;
        if (!info) return;
        setBusy("join");
        try {
            await collabApi.join(info.id);
            setJoinInfo(null);
            await launch(info.id);
        } catch (error) {
            const code = collabErrorCode(error);
            optionsRef.current.onError(code);
            if (code !== "network" && code !== "rate_limited" && code !== "unavailable") {
                setJoinInfo(null);
                setSessionParam(null);
            }
        } finally {
            setBusy(null);
        }
    }, [joinInfo, launch]);

    const dismissJoin = useCallback(() => {
        setJoinInfo(null);
        setSessionParam(null);
    }, []);

    const dismissFinished = useCallback(() => setFinished(null), []);

    return {
        /** The current session (also while connecting); null when there is none. */
        session: active || phase === "connecting" || phase === "reconnecting" || phase === "live" ? session : null,
        sessionRef,
        /** The shared files are loaded and the editor shows them. */
        active,
        phase,
        files,
        canEdit,
        role,
        title,
        unsynced,
        chatUnread,
        busy,
        joinInfo,
        finished,
        start,
        join,
        dismissJoin,
        dismissFinished,
    };
}

export type EditorCollab = ReturnType<typeof useEditorCollab>;
