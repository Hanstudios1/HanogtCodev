"use client";

import {
    collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc,
} from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "@/lib/firebase";
import { GROUP_LIMITS, languageFromFileName, safeGroupVoicePath } from "@/lib/groups";
import { SocialRequestError } from "@/lib/social/api";
import { useVoiceMessagePlayer } from "@/lib/social/hooks";
import type { GroupClientErrorCode } from "../api";
import { fileFromData, messageFromData, type GroupChatMessage, type GroupFileItem, type MonacoEditor, type SaveState } from "./model";

type ErrorSink = (code: GroupClientErrorCode) => void;

/** Keeps the latest callback in a ref so subscriptions don't restart when it changes. */
function useLatest<T>(value: T) {
    const ref = useRef(value);
    useEffect(() => {
        ref.current = value;
    });
    return ref;
}

/**
 * Applies a remote change to the open Monaco model as one minimal edit, so the
 * local cursor and selection stay where they are. Returns false when the model
 * is not the expected one (the editor then falls back to a full refresh).
 */
function applyRemoteEdit(editor: MonacoEditor | null, mountedFileId: string, fileId: string, before: string, after: string, suppress: { current: boolean }) {
    const model = editor?.getModel();
    if (!editor || !model || mountedFileId !== fileId) return false;
    const current = model.getValue();
    if (current === after) return true;
    if (current !== before) return false;
    let start = 0;
    const shortest = Math.min(current.length, after.length);
    while (start < shortest && current.charCodeAt(start) === after.charCodeAt(start)) start += 1;
    let endBefore = current.length;
    let endAfter = after.length;
    while (endBefore > start && endAfter > start && current.charCodeAt(endBefore - 1) === after.charCodeAt(endAfter - 1)) {
        endBefore -= 1;
        endAfter -= 1;
    }
    // Never split a surrogate pair.
    if (start > 0 && /[\uD800-\uDBFF]/.test(current[start - 1])) start -= 1;
    if (endBefore < current.length && /[\uDC00-\uDFFF]/.test(current[endBefore])) {
        endBefore += 1;
        endAfter += 1;
    }
    const from = model.getPositionAt(start);
    const to = model.getPositionAt(endBefore);
    suppress.current = true;
    try {
        editor.executeEdits("hanogt-group-sync", [{
            range: { startLineNumber: from.lineNumber, startColumn: from.column, endLineNumber: to.lineNumber, endColumn: to.column },
            text: after.slice(start, endAfter),
            forceMoveMarkers: false,
        }]);
    } finally {
        suppress.current = false;
    }
    return model.getValue() === after;
}

type PendingSave = { code: string; timer: ReturnType<typeof setTimeout> | null };

const SAVE_DELAY_MS = 700;

/**
 * Live shared files with debounced autosave. Local edits that are not saved
 * yet win over incoming snapshots (so typing is never overwritten), and remote
 * edits to the open file are merged into Monaco without moving the cursor.
 */
export function useGroupFiles({ groupId, email, enabled, onError }: { groupId: string; email: string; enabled: boolean; onError: ErrorSink }) {
    const [files, setFiles] = useState<GroupFileItem[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [saveState, setSaveState] = useState<SaveState>("idle");
    const filesRef = useRef<GroupFileItem[]>([]);
    const pendingRef = useRef(new Map<string, PendingSave>());
    const editorRef = useRef<MonacoEditor | null>(null);
    const mountedFileRef = useRef("");
    const suppressRef = useRef(false);
    const onErrorRef = useLatest(onError);

    useEffect(() => {
        if (!enabled) return;
        const filesQuery = query(collection(db, "groups", groupId, "files"), orderBy("order", "asc"), limit(GROUP_LIMITS.filesMax + 10));
        return onSnapshot(filesQuery, (snapshot) => {
            const previous = new Map(filesRef.current.map((file) => [file.id, file]));
            const next = snapshot.docs.map((item) => {
                const file = fileFromData(item.id, item.data({ serverTimestamps: "estimate" }));
                const pending = pendingRef.current.get(file.id);
                if (pending) return { ...file, code: pending.code };
                const before = previous.get(file.id);
                if (before && before.code !== file.code) applyRemoteEdit(editorRef.current, mountedFileRef.current, file.id, before.code, file.code, suppressRef);
                return file;
            });
            filesRef.current = next;
            setFiles(next);
            setLoaded(true);
        }, () => onErrorRef.current("files"));
    }, [enabled, groupId, onErrorRef]);

    const flush = useCallback(async (fileId: string) => {
        const entry = pendingRef.current.get(fileId);
        if (!entry) return;
        if (entry.timer) {
            clearTimeout(entry.timer);
            entry.timer = null;
        }
        const code = entry.code;
        if (code.length > GROUP_LIMITS.fileContentMax) {
            setSaveState("error");
            onErrorRef.current("file_too_large");
            return;
        }
        setSaveState("saving");
        try {
            await updateDoc(doc(db, "groups", groupId, "files", fileId), { code, updatedBy: email, updatedAt: serverTimestamp() });
            const latest = pendingRef.current.get(fileId);
            if (latest && latest.code === code && !latest.timer) pendingRef.current.delete(fileId);
            if (!pendingRef.current.size) setSaveState("saved");
        } catch (error) {
            const reason = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
            if (reason === "not-found") {
                pendingRef.current.delete(fileId);
                setSaveState(pendingRef.current.size ? "saving" : "idle");
                onErrorRef.current("file_deleted");
                return;
            }
            setSaveState("error");
            onErrorRef.current(reason === "permission-denied" ? "files" : "save_failed");
        }
    }, [email, groupId, onErrorRef]);

    const updateCode = useCallback((fileId: string, code: string) => {
        if (suppressRef.current) return;
        filesRef.current = filesRef.current.map((file) => (file.id === fileId ? { ...file, code } : file));
        setFiles(filesRef.current);
        const entry = pendingRef.current.get(fileId) ?? { code, timer: null };
        entry.code = code;
        if (entry.timer) clearTimeout(entry.timer);
        entry.timer = setTimeout(() => {
            entry.timer = null;
            void flush(fileId);
        }, SAVE_DELAY_MS);
        pendingRef.current.set(fileId, entry);
        setSaveState("saving");
    }, [flush]);

    const flushAll = useCallback(() => {
        for (const fileId of [...pendingRef.current.keys()]) void flush(fileId);
    }, [flush]);

    useEffect(() => {
        const beforeUnload = (event: BeforeUnloadEvent) => {
            if (!pendingRef.current.size) return;
            flushAll();
            event.preventDefault();
        };
        window.addEventListener("beforeunload", beforeUnload);
        return () => {
            window.removeEventListener("beforeunload", beforeUnload);
            // Leaving the workspace inside the app: save what is still pending right away.
            flushAll();
        };
    }, [flushAll]);

    const createFile = useCallback(async (name: string, code: string) => {
        const id = crypto.randomUUID();
        const order = filesRef.current.reduce((max, file) => Math.max(max, file.order), -1) + 1;
        await setDoc(doc(db, "groups", groupId, "files", id), {
            name,
            lang: languageFromFileName(name),
            code,
            order,
            updatedBy: email,
            updatedAt: serverTimestamp(),
        });
        return id;
    }, [email, groupId]);

    const renameFile = useCallback(async (fileId: string, name: string) => {
        await updateDoc(doc(db, "groups", groupId, "files", fileId), { name, lang: languageFromFileName(name), updatedBy: email, updatedAt: serverTimestamp() });
    }, [email, groupId]);

    const deleteFile = useCallback(async (fileId: string) => {
        const pending = pendingRef.current.get(fileId);
        if (pending?.timer) clearTimeout(pending.timer);
        pendingRef.current.delete(fileId);
        await deleteDoc(doc(db, "groups", groupId, "files", fileId));
    }, [groupId]);

    const bindEditor = useCallback((editor: MonacoEditor | null) => {
        editorRef.current = editor;
    }, []);

    const setMountedFile = useCallback((fileId: string) => {
        mountedFileRef.current = fileId;
    }, []);

    const isSuppressed = useCallback(() => suppressRef.current, []);

    return { files, loaded, saveState, updateCode, flushAll, createFile, renameFile, deleteFile, bindEditor, setMountedFile, isSuppressed };
}

const MESSAGE_PAGE = 120;
const MESSAGE_MAX = 1000;
const POLL_MS = 4_000;
const FULL_POLL_MS = 30_000;

type ServerMessages = {
    messages?: unknown;
    hasMore?: unknown;
    typing?: unknown;
    pinnedMessageIds?: unknown;
};

/** What GET /api/groups/chat answered, in the same shape as the live snapshot. */
function parseServerMessages(data: ServerMessages, received: number) {
    const messages = Array.isArray(data.messages)
        ? data.messages.flatMap((entry) => (entry && typeof entry === "object" && typeof (entry as { id?: unknown }).id === "string"
            ? [messageFromData((entry as { id: string }).id, entry as Record<string, unknown>, false, received)]
            : []))
        : [];
    const typing = data.typing && typeof data.typing === "object" ? Object.fromEntries(Object.entries(data.typing as Record<string, unknown>).filter((entry): entry is [string, number] => typeof entry[1] === "number")) : {};
    const pinned = Array.isArray(data.pinnedMessageIds) ? data.pinnedMessageIds.filter((id): id is string => typeof id === "string") : null;
    return { messages, hasMore: data.hasMore === true, typing, pinned };
}

function mergeById(current: GroupChatMessage[], incoming: GroupChatMessage[]) {
    const byId = new Map(current.map((message) => [message.id, message]));
    for (const message of incoming) byId.set(message.id, message);
    const merged = [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
    return merged.length > MESSAGE_MAX ? merged.slice(merged.length - MESSAGE_MAX) : merged;
}

/**
 * Newest messages first, shown oldest → newest; "load older" grows the
 * window. `live`: a Firestore listener. Otherwise GET /api/groups/chat is
 * polled every few seconds while the tab is visible (with the typing state
 * and pins, which the live view reads from the group document).
 */
export function useGroupMessages({ groupId, enabled, live = true, onError }: { groupId: string; enabled: boolean; live?: boolean; onError: ErrorSink }) {
    const [messages, setMessages] = useState<GroupChatMessage[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [windowSize, setWindowSize] = useState(MESSAGE_PAGE);
    const [hasMore, setHasMore] = useState(false);
    const [serverTyping, setServerTyping] = useState<Record<string, number>>({});
    const [serverPins, setServerPins] = useState<string[] | null>(null);
    const onErrorRef = useLatest(onError);
    const messagesRef = useLatest(messages);
    const fullAtRef = useRef(0);

    useEffect(() => {
        if (!enabled || !live) return;
        const messagesQuery = query(collection(db, "groups", groupId, "messages"), orderBy("createdAt", "desc"), limit(windowSize));
        return onSnapshot(messagesQuery, (snapshot) => {
            const received = Date.now();
            const next = snapshot.docs
                .map((item) => messageFromData(item.id, item.data({ serverTimestamps: "estimate" }), item.metadata.hasPendingWrites, received))
                .sort((a, b) => a.createdAt - b.createdAt);
            setMessages(next);
            setHasMore(snapshot.size >= windowSize);
            setLoaded(true);
        }, () => onErrorRef.current("chat"));
    }, [enabled, groupId, live, onErrorRef, windowSize]);

    /** One server read: the newest page ("full"), or what arrived since the newest message shown. */
    const fetchServer = useCallback(async (kind: "full" | "since") => {
        const newest = messagesRef.current[messagesRef.current.length - 1]?.createdAt ?? 0;
        const params = new URLSearchParams({ groupId });
        // A small overlap catches messages committed with a slightly older server time.
        if (kind === "since" && newest) params.set("since", String(Math.max(1, newest - 2_000)));
        else params.set("limit", String(MESSAGE_PAGE));
        const response = await fetch(`/api/groups/chat?${params.toString()}`, { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) {
            if (response.status === 404 || response.status === 401) onErrorRef.current("chat");
            return;
        }
        const parsed = parseServerMessages(await response.json() as ServerMessages, Date.now());
        // A full read replaces what it covers, so messages deleted meanwhile disappear.
        setMessages((current) => (kind === "full"
            ? mergeById(current.filter((message) => message.createdAt < (parsed.messages[0]?.createdAt ?? Infinity)), parsed.messages)
            : mergeById(current, parsed.messages)));
        if (kind === "full") setHasMore((value) => value || parsed.hasMore);
        setServerTyping(parsed.typing);
        if (parsed.pinned) setServerPins(parsed.pinned);
        setLoaded(true);
    }, [groupId, messagesRef, onErrorRef]);

    useEffect(() => {
        if (!enabled || live) return;
        let stopped = false;
        let timer = 0;
        const tick = async () => {
            if (stopped) return;
            if (document.visibilityState === "visible") {
                const full = Date.now() - fullAtRef.current > FULL_POLL_MS;
                if (full) fullAtRef.current = Date.now();
                await fetchServer(full ? "full" : "since").catch(() => undefined);
            }
            if (!stopped) timer = window.setTimeout(() => void tick(), POLL_MS);
        };
        fullAtRef.current = 0;
        timer = window.setTimeout(() => void tick(), 0);
        return () => {
            stopped = true;
            window.clearTimeout(timer);
        };
    }, [enabled, fetchServer, live]);

    const loadOlder = useCallback(() => {
        if (live) {
            setWindowSize((value) => Math.min(value + MESSAGE_PAGE, MESSAGE_MAX));
            return;
        }
        const oldest = messagesRef.current[0]?.createdAt;
        if (!oldest) return;
        void fetch(`/api/groups/chat?${new URLSearchParams({ groupId, before: String(oldest), limit: String(MESSAGE_PAGE) }).toString()}`, { cache: "no-store", credentials: "same-origin" })
            .then(async (response) => {
                if (!response.ok) return;
                const parsed = parseServerMessages(await response.json() as ServerMessages, Date.now());
                setMessages((current) => mergeById(current, parsed.messages));
                setHasMore(parsed.hasMore);
            })
            .catch(() => undefined);
    }, [groupId, live, messagesRef]);

    /** Re-reads the newest page right away (after a send, reaction or deletion through the server). */
    const refresh = useCallback(() => {
        if (live) return;
        fullAtRef.current = Date.now();
        void fetchServer("full").catch(() => undefined);
    }, [fetchServer, live]);

    return {
        messages,
        loaded,
        hasMore: hasMore && (live ? windowSize < MESSAGE_MAX : messages.length < MESSAGE_MAX),
        loadOlder,
        refresh,
        /** Fallback only: typing entries (member key → server time) and pins from the last poll. */
        serverTyping,
        serverPins,
    };
}

const VOICE_LIMIT_SECONDS = 60;

/** Microphone recording (max 60 s) that hands the finished clip to `onRecorded`. */
export function useVoiceRecorder({ onRecorded, onError }: { onRecorded: (blob: Blob, mimeType: string, seconds: number) => void; onError: ErrorSink }) {
    const [recording, setRecording] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const startedRef = useRef(0);
    const discardRef = useRef(false);
    const startingRef = useRef(false);
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const limitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const callbacks = useLatest({ onRecorded, onError });

    const clearTimers = () => {
        if (tickRef.current) clearInterval(tickRef.current);
        if (limitRef.current) clearTimeout(limitRef.current);
        tickRef.current = null;
        limitRef.current = null;
    };

    const stop = useCallback((discard = false) => {
        discardRef.current = discard;
        clearTimers();
        setRecording(false);
        const recorder = recorderRef.current;
        if (recorder && recorder.state !== "inactive") recorder.stop();
    }, []);

    const start = useCallback(async () => {
        // A double tap must not open two microphones while the permission prompt is up.
        if (recorderRef.current || startingRef.current) return;
        startingRef.current = true;
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
        } catch {
            callbacks.current.onError("mic_denied");
            return;
        } finally {
            startingRef.current = false;
        }
        const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type));
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 64_000 } : undefined);
        recorderRef.current = recorder;
        chunksRef.current = [];
        discardRef.current = false;
        recorder.ondataavailable = (event) => {
            if (event.data.size) chunksRef.current.push(event.data);
        };
        recorder.onstop = () => {
            stream.getTracks().forEach((track) => track.stop());
            const type = recorder.mimeType || mimeType || "audio/webm";
            const blob = new Blob(chunksRef.current, { type });
            const duration = Math.max(1, Math.min(VOICE_LIMIT_SECONDS, Math.round((performance.now() - startedRef.current) / 1000)));
            chunksRef.current = [];
            recorderRef.current = null;
            setSeconds(0);
            if (!discardRef.current && blob.size) callbacks.current.onRecorded(blob, type, duration);
        };
        recorder.start(1000);
        startedRef.current = performance.now();
        setSeconds(0);
        setRecording(true);
        tickRef.current = setInterval(() => setSeconds((value) => value + 1), 1000);
        limitRef.current = setTimeout(() => stop(false), VOICE_LIMIT_SECONDS * 1000);
    }, [callbacks, stop]);

    useEffect(() => () => {
        if (tickRef.current) clearInterval(tickRef.current);
        if (limitRef.current) clearTimeout(limitRef.current);
        discardRef.current = true;
        const recorder = recorderRef.current;
        if (recorder && recorder.state !== "inactive") recorder.stop();
    }, []);

    return { recording, seconds, start, stop, limit: VOICE_LIMIT_SECONDS };
}

/**
 * Plays one voice message of the group at a time. The recording comes from
 * GET /api/social/voice (members only), with or without the Firebase bridge.
 */
export function useVoicePlayer({ groupId, onError }: { groupId: string; onError: ErrorSink }) {
    const onErrorRef = useLatest(onError);
    const player = useVoiceMessagePlayer({ group: groupId }, (error) => {
        const code = error instanceof SocialRequestError ? error.code : "";
        onErrorRef.current(code === "rate_limited" || code === "network" || code === "unauthorized" ? code : "voice_unavailable");
    });
    const { toggle: play } = player;
    const toggle = useCallback((message: GroupChatMessage) => {
        // Only recordings inside the group's own folder are ever requested.
        if (!safeGroupVoicePath(message.voicePath, groupId)) {
            onErrorRef.current("voice_unavailable");
            return Promise.resolve();
        }
        return play(message);
    }, [groupId, onErrorRef, play]);
    return { playingId: player.playingId, loadingId: player.loadingId, toggle };
}
