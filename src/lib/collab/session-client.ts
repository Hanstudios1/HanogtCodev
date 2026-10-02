/**
 * One live session in the browser: the shared Y.Doc, y-protocols awareness,
 * the Monaco bindings, sending (batched every ~150 ms) and receiving (Firestore
 * listeners while the Firebase bridge is ready, otherwise polling
 * GET /api/collab/[id] about every 700 ms), chat and the voice mesh.
 *
 * React reads it through subscribe/getState (useSyncExternalStore); the
 * editor page changes files through applyTabChanges and shows the models
 * named by modelPath.
 */
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import type { IDisposable, editor as MonacoEditor } from "monaco-editor";
import type { MonacoApi } from "@/lib/monaco";
import { fileExtensionFor, monacoLanguageFor } from "@/lib/runtimes/languages";
import { CollabRequestError, collabApi, collabErrorCode, sendFinalUpdate, sendLeaveBeacon, type CollabOutgoingSignal } from "./api";
import { applyTabOps, diffTabs, filesOf, listDocFiles, readDocFiles, readFileEntry, type CollabFileContent, type TabLike } from "./doc";
import { IDLE_CALL, MeshCall, type MeshCallState, type MeshPeerId, type MeshSignalKind } from "./mesh-call";
import { COLLAB_CURSOR_CSS, CollabEditorPresence, CollabTextBinding, type PresenceTarget } from "./monaco-binding";
import {
    COLLAB_LIMITS,
    COLLAB_TIMING,
    cleanChatText,
    collabColor,
    cssString,
    fromBase64,
    isClientId,
    isCollabFileId,
    isOwnAwarenessUpdate,
    isParticipantKey,
    readAwarenessState,
    toBase64,
    type CollabAwarenessState,
    type CollabChatMessage,
    type CollabErrorCode,
    type CollabInvitee,
    type CollabMeta,
    type CollabPollResponse,
    type CollabPresenceItem,
    type CollabRole,
    type CollabSignal,
    type CollabUpdateItem,
} from "./protocol";
import { SequenceTracker, orderUpdates } from "./sequence";
import { startRealtime, type RealtimeHandle } from "./transport";

type Editor = MonacoEditor.IStandaloneCodeEditor;
type Model = MonacoEditor.ITextModel;

/** Origin of changes that came from the server (never sent back). */
const REMOTE = Symbol("collab-remote");
/** Origin of file additions, renames and removals made through the editor's tabs. */
const TABS = Symbol("collab-tabs");
const URI_ROOT = "inmemory://hanogt-collab/";
const REALTIME_RETRY_MS = 5 * 60_000;

export type CollabPhase = "connecting" | "live" | "reconnecting" | "closed";
export type CollabCloseReason = "ended" | "left" | "removed" | "unavailable";

/** Another browser tab in the session (one person can have several). */
export type CollabPeer = CollabAwarenessState & {
    clientID: number;
    key: string;
    name: string;
    avatar: string | null;
    color: string;
    role: CollabRole;
};

export type CollabFileView = { id: string; name: string; lang: string; order: number; code: string };

export type CollabState = {
    id: string;
    phase: CollabPhase;
    /** Receiving through Firestore listeners (otherwise polling). */
    realtime: boolean;
    meta: CollabMeta | null;
    me: { key: string; role: CollabRole } | null;
    /** The owner's invitations. */
    invited: CollabInvitee[];
    files: CollabFileView[] | null;
    peers: CollabPeer[];
    chat: CollabChatMessage[];
    chatUnread: number;
    chatPending: number;
    /** Participant key whose cursor the editor follows. */
    follow: string | null;
    canEdit: boolean;
    /** Local changes the server hasn't confirmed yet. */
    unsynced: boolean;
    call: MeshCallState;
    /** Phones watch the session (read-only, following the owner). */
    phoneMode: boolean;
    closeReason: CollabCloseReason | null;
};

export type CollabNotice =
    | { kind: "joined" | "left"; name: string }
    | { kind: "read_only_on" | "read_only_off" | "rejected" | "resynced" | "reconnected" | "phone_follow" }
    | { kind: "limit"; code: "too_many_files" | "file_too_large" | "content_too_large" | "invalid_file" | "last_file" }
    | { kind: "error"; code: CollabErrorCode };

export type CollabClosed = { id: string; reason: CollabCloseReason; files: CollabFileContent[]; role: CollabRole | null; title: string };

export type CollabHooks = {
    onActivateFile?: (fileId: string) => void;
    onNotice?: (notice: CollabNotice) => void;
    onClosed?: (closed: CollabClosed) => void;
};

/** Voice-chat peers are browser tabs: "<participant key>:<client id>". */
export function meshPeerId(key: string, client: number): MeshPeerId {
    return `${key}:${client}`;
}

export function parseMeshPeerId(id: string): { key: string; client: number } | null {
    const [key, raw] = id.split(":");
    const client = Number(raw);
    return isParticipantKey(key) && /^\d{1,10}$/.test(raw ?? "") && isClientId(client) ? { key, client } : null;
}

export class CollabSession {
    readonly id: string;
    private hooks: CollabHooks;
    private state: CollabState;
    private readonly listeners = new Set<() => void>();
    private doc!: Y.Doc;
    private awareness!: Awareness;
    private detachDoc: (() => void) | null = null;
    private tracker = new SequenceTracker();
    private needSnapshot = true;
    private readonly bindings = new Map<string, CollabTextBinding>();
    private readonly paths = new Map<string, string>();
    private monaco: MonacoApi | null = null;
    private editor: Editor | null = null;
    private presence: CollabEditorPresence | null = null;
    private modelListener: IDisposable | null = null;
    private realtimeAllowed: boolean;
    private realtimeFailedAt = 0;
    private realtime: RealtimeHandle | null = null;
    private pollTimer: number | null = null;
    private polling = false;
    private pollFailures = 0;
    /** 401s in a row: a transient database error looks like a missing sign-in, so only several end the session. */
    private authFailures = 0;
    private flushTimer: number | null = null;
    private flushDue = 0;
    private sending: Promise<void> | null = null;
    private pending: Uint8Array[] = [];
    private awarenessDirty = false;
    private lastAwarenessSent = 0;
    private sendFailures = 0;
    private retryDelay = 0;
    private local: CollabAwarenessState = { file: null, selection: null, line: null, away: false, call: null };
    private readonly presenceDocs = new Map<string, number>();
    private readonly clientKeys = new Map<number, string>();
    private chatCursor = 0;
    private chatPrimed = false;
    private chatVisible = false;
    private dirtyFiles = new Set<string>();
    private readonly timers = new Map<string, number>();
    private style: HTMLStyleElement | null = null;
    private lastCss = "";
    private lastFollow = "";
    private pendingReveal: CollabPeer | null = null;
    private mesh: MeshCall | null = null;
    private outgoingSignals: CollabOutgoingSignal[] = [];
    private acks: string[] = [];
    private readonly seenSignals = new Set<string>();
    private readonly lastNotice = new Map<string, number>();
    private reloading = false;
    private lastReloadAt = 0;
    /** Set while this participant leaves (their own departure isn't reported as being removed). */
    private leaving = false;
    private finishing = false;
    private closed = false;
    private readonly cleanups: Array<() => void> = [];

    constructor(id: string, options: { realtime: boolean; hooks?: CollabHooks; phoneMode?: boolean }) {
        this.id = id;
        this.hooks = options.hooks ?? {};
        this.realtimeAllowed = options.realtime;
        this.state = {
            id,
            phase: "connecting",
            realtime: false,
            meta: null,
            me: null,
            invited: [],
            files: null,
            peers: [],
            chat: [],
            chatUnread: 0,
            chatPending: 0,
            follow: null,
            canEdit: false,
            unsynced: false,
            call: IDLE_CALL,
            phoneMode: options.phoneMode === true,
            closeReason: null,
        };
        this.setupDoc();
    }

    // ------------------------------------------------------------------ store

    readonly subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    readonly getState = () => this.state;

    get isClosed() {
        return this.closed;
    }

    setHooks(hooks: CollabHooks) {
        this.hooks = hooks;
    }

    private set(patch: Partial<CollabState>) {
        let changed = false;
        for (const key of Object.keys(patch) as Array<keyof CollabState>) {
            if (!Object.is(this.state[key], patch[key])) {
                changed = true;
                break;
            }
        }
        if (!changed) return;
        this.state = { ...this.state, ...patch };
        for (const listener of [...this.listeners]) listener();
    }

    private notice(notice: CollabNotice) {
        const key = JSON.stringify(notice);
        const now = Date.now();
        if (now - (this.lastNotice.get(key) ?? 0) < 4_000) return;
        this.lastNotice.set(key, now);
        this.hooks.onNotice?.(notice);
    }

    private timer(name: string, delay: number, run: () => void, replace = false) {
        const existing = this.timers.get(name);
        if (existing !== undefined) {
            if (!replace) return;
            window.clearTimeout(existing);
        }
        this.timers.set(name, window.setTimeout(() => {
            this.timers.delete(name);
            run();
        }, Math.max(0, delay)));
    }

    private clearTimer(name: string) {
        const existing = this.timers.get(name);
        if (existing !== undefined) window.clearTimeout(existing);
        this.timers.delete(name);
    }

    // ------------------------------------------------------------------ document

    private setupDoc() {
        const doc = new Y.Doc();
        const awareness = new Awareness(doc);
        const files = filesOf(doc);
        const onUpdate = (update: Uint8Array, origin: unknown) => {
            if (origin === REMOTE || this.closed) return;
            this.pending.push(update);
            if (!this.state.unsynced) this.set({ unsynced: true });
            this.scheduleFlush(COLLAB_TIMING.updateBatchMs);
        };
        const onAwarenessUpdate = (_changes: unknown, origin: unknown) => {
            if (origin !== "local" || this.closed) return;
            this.awarenessDirty = true;
            this.scheduleFlush(Math.max(0, this.lastAwarenessSent + COLLAB_TIMING.awarenessThrottleMs - Date.now()));
        };
        const onAwarenessChange = () => this.timer("peers", 40, () => this.computePeers());
        const onFiles = (events: Array<Y.YEvent<Y.AbstractType<unknown>>>) => {
            for (const event of events) if (event.path.length) this.dirtyFiles.add(String(event.path[0]));
            this.timer("files", 30, () => this.computeFiles());
        };
        doc.on("update", onUpdate);
        awareness.on("update", onAwarenessUpdate);
        awareness.on("change", onAwarenessChange);
        files.observeDeep(onFiles);
        this.doc = doc;
        this.awareness = awareness;
        this.detachDoc = () => {
            doc.off("update", onUpdate);
            awareness.off("update", onAwarenessUpdate);
            awareness.off("change", onAwarenessChange);
            files.unobserveDeep(onFiles);
        };
        awareness.setLocalState({ ...this.local });
    }

    private applyRemote(data: string) {
        const bytes = fromBase64(data);
        if (!bytes) return;
        try {
            Y.applyUpdate(this.doc, bytes, REMOTE);
        } catch (error) {
            console.warn("[collab] An update couldn't be applied:", error instanceof Error ? error.message : error);
            void this.reload();
        }
    }

    private computeFiles() {
        if (this.closed) return;
        const previous = new Map((this.state.files ?? []).map((file) => [file.id, file]));
        const dirty = this.dirtyFiles;
        this.dirtyFiles = new Set();
        const files = listDocFiles(this.doc).map((file): CollabFileView => {
            const old = previous.get(file.id);
            if (old && !dirty.has(file.id)) {
                if (old.name === file.name && old.lang === file.lang && old.order === file.order) return old;
                return { ...old, name: file.name, lang: file.lang, order: file.order };
            }
            return { id: file.id, name: file.name, lang: file.lang, order: file.order, code: file.text.toString() };
        });
        const ids = new Set(files.map((file) => file.id));
        for (const [fileId, binding] of [...this.bindings]) {
            if (ids.has(fileId)) continue;
            binding.destroy();
            if (this.editor?.getModel() !== binding.model && !binding.model.isDisposed()) binding.model.dispose();
        }
        if (this.monaco) {
            for (const file of files) {
                const binding = this.bindings.get(file.id);
                const language = monacoLanguageFor(file.lang);
                if (binding && !binding.model.isDisposed() && binding.model.getLanguageId() !== language) this.monaco.editor.setModelLanguage(binding.model, language);
            }
        }
        const current = this.state.files;
        if (!current || current.length !== files.length || files.some((file, index) => file !== current[index])) this.set({ files });
    }

    // ------------------------------------------------------------------ lifecycle

    /** Loads the session (snapshot + updates) and starts receiving. Throws a CollabRequestError when it can't. */
    async start() {
        const onPageHide = () => this.pageHide();
        const onPageShow = () => {
            this.awarenessDirty = true;
            this.scheduleFlush(0);
        };
        const onVisibility = () => {
            const hidden = document.visibilityState === "hidden";
            this.setLocal({ away: hidden });
            if (!hidden && !this.realtime && !this.closed) this.schedulePoll(0);
        };
        window.addEventListener("pagehide", onPageHide);
        window.addEventListener("pageshow", onPageShow);
        document.addEventListener("visibilitychange", onVisibility);
        this.cleanups.push(() => {
            window.removeEventListener("pagehide", onPageHide);
            window.removeEventListener("pageshow", onPageShow);
            document.removeEventListener("visibilitychange", onVisibility);
        });
        const response = await collabApi.poll(this.id, { after: -1, chat: 0, signals: false, client: this.doc.clientID });
        if (this.closed) return;
        this.applyPoll(response);
        this.computeFiles();
        this.chatPrimed = true;
        if (this.finishing || this.closed) return;
        this.set({ phase: "live" });
        this.setLocal({ away: document.visibilityState === "hidden" });
        this.startReceiving();
        if (this.state.phoneMode && this.state.me?.role !== "owner") {
            const owner = this.state.meta?.participants.find((person) => person.role === "owner");
            if (owner) this.follow(owner.key);
            this.notice({ kind: "phone_follow" });
        }
    }

    /** Leaves this page without leaving the session (navigation, unmount): the tab's presence is removed. */
    destroy() {
        if (this.closed) return;
        this.pageHide();
        this.closed = true;
        this.mesh?.leave();
        this.mesh = null;
        this.set({ phase: "closed" });
        this.disposeResources();
    }

    private pageHide() {
        if (this.closed) return;
        if (this.pending.length) {
            const update = toBase64(this.pending.length === 1 ? this.pending[0] : Y.mergeUpdates(this.pending));
            if (sendFinalUpdate(this.id, this.doc.clientID, update)) this.pending = [];
        }
        sendLeaveBeacon(this.id, this.doc.clientID);
    }

    private disposeResources() {
        for (const handle of this.timers.values()) window.clearTimeout(handle);
        this.timers.clear();
        if (this.pollTimer !== null) window.clearTimeout(this.pollTimer);
        if (this.flushTimer !== null) window.clearTimeout(this.flushTimer);
        this.pollTimer = null;
        this.flushTimer = null;
        this.realtime?.stop();
        this.realtime = null;
        this.presence?.dispose();
        this.presence = null;
        this.modelListener?.dispose();
        this.modelListener = null;
        for (const binding of [...this.bindings.values()]) binding.destroy();
        this.bindings.clear();
        if (this.monaco) {
            for (const model of this.monaco.editor.getModels()) {
                if (model.uri.toString().startsWith(this.uriPrefix) && !model.isDisposed()) model.dispose();
            }
        }
        this.detachDoc?.();
        this.detachDoc = null;
        this.awareness.destroy();
        this.doc.destroy();
        this.style?.remove();
        this.style = null;
        this.cleanups.splice(0).forEach((cleanup) => cleanup());
    }

    /**
     * Ends this client's part in the session and reports the files: the final
     * state from the server when the session ended, the local state otherwise.
     */
    private async finish(reason: CollabCloseReason) {
        if (this.finishing || this.closed) return;
        this.finishing = true;
        this.stopReceiving();
        if (this.mesh) this.leaveCall();
        if (reason === "ended") {
            try {
                const response = await collabApi.poll(this.id, { after: -1, chat: 0, signals: false, client: this.doc.clientID });
                if (response.snapshot) this.applyRemote(response.snapshot.data);
                for (const item of orderUpdates(response.updates)) this.applyRemote(item.data);
            } catch {
                // The local copy is used.
            }
        }
        const files = readDocFiles(this.doc);
        const closed: CollabClosed = { id: this.id, reason, files, role: this.state.me?.role ?? null, title: this.state.meta?.title ?? "" };
        if (reason === "removed") this.notice({ kind: "error", code: "not_found" });
        this.closed = true;
        this.set({ phase: "closed", closeReason: reason });
        this.hooks.onClosed?.(closed);
        this.disposeResources();
    }

    // ------------------------------------------------------------------ receiving

    private startReceiving() {
        if (this.closed) return;
        if (this.realtimeAllowed && Date.now() - this.realtimeFailedAt > REALTIME_RETRY_MS && this.state.me) this.startRealtime();
        else this.schedulePoll(COLLAB_TIMING.pollVisibleMs);
    }

    private stopReceiving() {
        this.realtime?.stop();
        this.realtime = null;
        if (this.pollTimer !== null) window.clearTimeout(this.pollTimer);
        this.pollTimer = null;
    }

    /** The Firebase bridge became ready or unavailable. */
    setRealtimeAvailable(available: boolean) {
        this.realtimeAllowed = available;
        if (this.closed || this.finishing || this.state.phase === "connecting") return;
        if (available && !this.realtime && Date.now() - this.realtimeFailedAt > REALTIME_RETRY_MS) this.startRealtime();
        else if (!available && this.realtime) {
            this.realtime.stop();
            this.realtime = null;
            this.set({ realtime: false });
            this.schedulePoll(0);
        }
    }

    private startRealtime() {
        const me = this.state.me;
        if (!me || this.closed) return;
        if (this.pollTimer !== null) window.clearTimeout(this.pollTimer);
        this.pollTimer = null;
        this.realtime?.stop();
        this.realtime = startRealtime({
            sessionId: this.id,
            key: me.key,
            afterSeq: this.tracker.watermark,
            signals: Boolean(this.mesh),
            handlers: {
                onMeta: (meta) => this.applyMeta(meta, null),
                onUpdates: (items) => this.applyUpdates(items),
                onPresence: (items, removed) => this.applyPresenceChanges(items, removed),
                onChat: (messages) => this.mergeChat(messages),
                onSignals: (signals) => this.receiveSignals(signals),
                onError: () => this.realtimeFailed(),
            },
        });
        this.set({ realtime: true });
    }

    private realtimeFailed() {
        this.realtime?.stop();
        this.realtime = null;
        this.realtimeFailedAt = Date.now();
        this.set({ realtime: false });
        if (!this.closed && !this.finishing) this.schedulePoll(0);
    }

    private schedulePoll(delay: number) {
        if (this.closed || this.finishing || this.realtime) return;
        if (this.pollTimer !== null) window.clearTimeout(this.pollTimer);
        this.pollTimer = window.setTimeout(() => {
            this.pollTimer = null;
            void this.pollOnce().then((more) => {
                const failures = this.pollFailures;
                const delayNext = more
                    ? 0
                    : failures
                        ? COLLAB_TIMING.retryMs[Math.min(failures - 1, COLLAB_TIMING.retryMs.length - 1)]
                        : document.visibilityState === "hidden" ? COLLAB_TIMING.pollHiddenMs : COLLAB_TIMING.pollVisibleMs;
                this.schedulePoll(delayNext);
            });
        }, Math.max(0, delay));
    }

    /** One GET /api/collab/[id]; returns true when more updates are waiting. */
    private async pollOnce(): Promise<boolean> {
        if (this.closed || this.finishing || this.polling) return false;
        this.polling = true;
        try {
            const response = await collabApi.poll(this.id, {
                after: this.needSnapshot ? -1 : this.tracker.watermark,
                chat: this.chatCursor,
                signals: Boolean(this.mesh),
                client: this.doc.clientID,
            });
            if (this.closed || this.reloading) return false;
            this.authFailures = 0;
            this.applyPoll(response);
            if (this.pollFailures) {
                this.pollFailures = 0;
                if (this.state.phase === "reconnecting" && !this.sendFailures) {
                    this.set({ phase: "live" });
                    this.notice({ kind: "reconnected" });
                }
            }
            return response.more;
        } catch (error) {
            this.handleRequestError(error, "poll");
            return false;
        } finally {
            this.polling = false;
        }
    }

    private handleRequestError(error: unknown, source: "poll" | "sync") {
        const code = collabErrorCode(error);
        if (code === "not_found" || code === "forbidden") {
            if (!this.leaving) void this.finish("removed");
            return;
        }
        if (code === "ended") {
            void this.finish("ended");
            return;
        }
        if (code === "unauthorized") {
            this.authFailures += 1;
            if (this.authFailures >= 4) {
                this.notice({ kind: "error", code });
                void this.finish("unavailable");
                return;
            }
        }
        if (source === "poll") this.pollFailures += 1;
        if (this.pollFailures >= 2 || this.sendFailures >= 2) this.set({ phase: "reconnecting" });
    }

    private applyPoll(response: CollabPollResponse) {
        this.applyMeta(response.meta, response.me);
        if (response.invited) this.set({ invited: response.invited });
        if (response.snapshot) {
            this.applyRemote(response.snapshot.data);
            this.tracker.coverUpTo(response.snapshot.seq);
            this.needSnapshot = false;
        }
        this.applyUpdates(response.updates);
        if (response.meta.status === "active") this.applyPresenceList(response.presence);
        if (response.chat) this.mergeChat(response.chat);
        if (response.signals.length) this.receiveSignals(response.signals);
    }

    private applyMeta(meta: CollabMeta, me: { key: string; role: CollabRole } | null) {
        if (this.closed || meta.id !== this.id) return;
        const previous = this.state.meta;
        const mine = me ?? this.state.me;
        if (mine && meta.status === "active" && !meta.participants.some((person) => person.key === mine.key)) {
            if (!this.leaving) void this.finish("removed");
            return;
        }
        if (previous && mine && previous.status === "active") {
            const before = new Set(previous.participants.map((person) => person.key));
            const after = new Set(meta.participants.map((person) => person.key));
            for (const person of meta.participants) if (!before.has(person.key) && person.key !== mine.key) this.notice({ kind: "joined", name: person.name });
            for (const person of previous.participants) if (!after.has(person.key) && person.key !== mine.key) this.notice({ kind: "left", name: person.name });
            if (mine.role !== "owner" && previous.readOnly !== meta.readOnly && meta.status === "active") this.notice({ kind: meta.readOnly ? "read_only_on" : "read_only_off" });
            const changed = before.size !== after.size || [...after].some((key) => !before.has(key));
            if (changed && mine.role === "owner" && this.realtime) this.timer("invites", 1_500, () => void this.pollOnce());
        }
        const keys = new Set(meta.participants.map((person) => person.key));
        const gone = [...this.clientKeys].filter(([, key]) => !keys.has(key)).map(([client]) => client);
        if (gone.length) {
            for (const client of gone) this.clientKeys.delete(client);
            for (const [id, client] of [...this.presenceDocs]) if (gone.includes(client)) this.presenceDocs.delete(id);
            removeAwarenessStates(this.awareness, gone, REMOTE);
        }
        const canEdit = meta.status === "active" && !meta.frozen && (!meta.readOnly || mine?.role === "owner") && !this.state.phoneMode;
        this.set({ meta, me: mine, canEdit });
        if (meta.status === "ended") {
            void this.finish("ended");
            return;
        }
        if (this.realtime && meta.snapshotSeq > this.tracker.watermark) {
            this.timer("catch-up", 5_000, () => {
                const current = this.state.meta;
                if (current && current.snapshotSeq > this.tracker.watermark) void this.pollOnce();
            });
        }
        this.timer("peers", 40, () => this.computePeers());
    }

    private applyUpdates(items: readonly CollabUpdateItem[]) {
        if (this.closed) return;
        let applied = false;
        for (const item of orderUpdates(items)) {
            if (!this.tracker.accept(item.seq)) continue;
            // Our own updates come back too; they are already in the document.
            if (item.client === this.doc.clientID) continue;
            this.applyRemote(item.data);
            applied = true;
        }
        if (this.tracker.hasGap) {
            this.timer("gap", COLLAB_TIMING.gapRepairMs, () => {
                if (this.tracker.hasGap) void this.pollOnce();
            });
        } else {
            this.clearTimer("gap");
        }
        if (applied) this.watchPendingStructs();
    }

    /**
     * Changes whose dependencies never arrive (a lost update) would leave the
     * document incomplete: after 15 seconds it is reloaded from the server.
     */
    private watchPendingStructs() {
        const store = this.doc.store;
        if (!store.pendingStructs && !store.pendingDs) {
            this.clearTimer("pending");
            return;
        }
        this.timer("pending", 15_000, () => {
            const current = this.doc.store;
            if ((current.pendingStructs || current.pendingDs) && Date.now() - this.lastReloadAt > 120_000) void this.reload();
        });
    }

    private applyPresenceItem(item: CollabPresenceItem) {
        if (item.client === this.doc.clientID) return;
        // A client id belongs to the participant who used it first.
        const known = this.clientKeys.get(item.client);
        if (known && known !== item.by) return;
        const bytes = fromBase64(item.data, COLLAB_LIMITS.maxAwarenessChars);
        if (!bytes || !isOwnAwarenessUpdate(bytes, item.client)) return;
        this.presenceDocs.set(item.id, item.client);
        this.clientKeys.set(item.client, item.by);
        try {
            applyAwarenessUpdate(this.awareness, bytes, REMOTE);
        } catch {
            // A malformed state is ignored.
        }
    }

    private forgetPresenceDoc(id: string) {
        const client = this.presenceDocs.get(id);
        if (client === undefined) return;
        this.presenceDocs.delete(id);
        if ([...this.presenceDocs.values()].includes(client)) return;
        this.clientKeys.delete(client);
        removeAwarenessStates(this.awareness, [client], REMOTE);
    }

    /** Polling returns every presence document: the ones that disappeared left. */
    private applyPresenceList(items: readonly CollabPresenceItem[]) {
        const seen = new Set<string>();
        for (const item of items) {
            seen.add(item.id);
            this.applyPresenceItem(item);
        }
        for (const id of [...this.presenceDocs.keys()]) if (!seen.has(id)) this.forgetPresenceDoc(id);
    }

    private applyPresenceChanges(items: readonly CollabPresenceItem[], removed: readonly string[]) {
        for (const item of items) this.applyPresenceItem(item);
        for (const id of removed) this.forgetPresenceDoc(id);
    }

    private computePeers() {
        if (this.closed) return;
        const meta = this.state.meta;
        if (!meta) return;
        const people = new Map(meta.participants.map((person) => [person.key, person]));
        const peers: CollabPeer[] = [];
        this.awareness.getStates().forEach((state, clientID) => {
            if (clientID === this.doc.clientID) return;
            const key = this.clientKeys.get(clientID);
            const person = key ? people.get(key) : undefined;
            if (!key || !person) return;
            peers.push({ ...readAwarenessState(state), clientID, key, name: person.name, avatar: person.avatar, color: collabColor(person.color), role: person.role });
        });
        peers.sort((a, b) => a.name.localeCompare(b.name) || a.clientID - b.clientID);
        this.set({ peers });
        this.presence?.render(peers);
        this.updateStyles(peers);
        this.mesh?.setPeers(peers.filter((peer) => peer.call?.on).map((peer) => meshPeerId(peer.key, peer.clientID)));
        this.followUpdate(false);
    }

    private updateStyles(peers: readonly CollabPeer[]) {
        if (typeof document === "undefined") return;
        const css = [
            COLLAB_CURSOR_CSS,
            ...peers.map((peer) => `.collab-sel-${peer.clientID}{background-color:${peer.color}40}.collab-head-${peer.clientID}{border-left-color:${peer.color}}.collab-head-${peer.clientID}::after{content:${cssString(peer.name)};background-color:${peer.color}}`),
        ].join("\n");
        if (css === this.lastCss) return;
        this.lastCss = css;
        if (!this.style) {
            this.style = document.createElement("style");
            this.style.setAttribute("data-collab-cursors", this.id);
            document.head.appendChild(this.style);
        }
        this.style.textContent = css;
    }

    // ------------------------------------------------------------------ sending

    private setLocal(patch: Partial<CollabAwarenessState>) {
        if (this.closed) return;
        const next = { ...this.local, ...patch };
        if (JSON.stringify(next) === JSON.stringify(this.local)) return;
        this.local = next;
        this.awareness.setLocalState({ ...next });
    }

    private scheduleFlush(delay: number) {
        if (this.closed) return;
        const wait = Math.max(0, delay);
        const due = Date.now() + wait;
        if (this.flushTimer !== null) {
            if (this.flushDue <= due) return;
            window.clearTimeout(this.flushTimer);
        }
        this.flushDue = due;
        this.flushTimer = window.setTimeout(() => {
            this.flushTimer = null;
            void this.flush();
        }, wait);
    }

    private flush(): Promise<void> {
        if (this.sending) return this.sending;
        const sending = this.sendBatch().finally(() => {
            if (this.sending === sending) this.sending = null;
        });
        this.sending = sending;
        return sending;
    }

    /** Sends everything pending now and waits for it (before ending or leaving). */
    private async flushNow() {
        for (let attempt = 0; attempt < 4; attempt += 1) {
            if (this.flushTimer !== null) {
                window.clearTimeout(this.flushTimer);
                this.flushTimer = null;
            }
            await this.flush();
            if (!this.pending.length && !this.sending) return;
        }
    }

    private async sendBatch() {
        if (this.closed) return;
        const doc = this.doc;
        const updates = this.pending;
        const sendAwareness = this.awarenessDirty;
        if (!updates.length && !sendAwareness) return;
        this.pending = [];
        this.awarenessDirty = false;
        let update: Uint8Array | null = updates.length === 0 ? null : updates.length === 1 ? updates[0] : Y.mergeUpdates(updates);
        let encoded = update ? toBase64(update) : undefined;
        if (encoded && encoded.length > COLLAB_LIMITS.maxUpdateChars) {
            this.notice({ kind: "error", code: "payload_too_large" });
            encoded = undefined;
            update = null;
            void this.reload();
        }
        const awareness = sendAwareness ? toBase64(encodeAwarenessUpdate(this.awareness, [doc.clientID])) : undefined;
        if (!encoded && !awareness) return;
        if (awareness) this.lastAwarenessSent = Date.now();
        try {
            await collabApi.sync(this.id, { client: doc.clientID, ...(encoded ? { update: encoded } : {}), ...(awareness ? { awareness } : {}) });
            if (doc !== this.doc) return;
            this.authFailures = 0;
            if (this.sendFailures) {
                this.sendFailures = 0;
                if (this.state.phase === "reconnecting" && !this.pollFailures) {
                    this.set({ phase: "live" });
                    this.notice({ kind: "reconnected" });
                }
            }
        } catch (error) {
            if (doc !== this.doc || this.closed) return;
            const code = collabErrorCode(error);
            if (code === "read_only" || code === "frozen" || code === "invalid_update" || code === "payload_too_large") {
                // The server refused our changes: start again from its state.
                if (code !== "read_only") this.notice({ kind: "error", code });
                if (awareness) this.awarenessDirty = true;
                if (update) void this.reload();
            } else if (code === "not_found" || code === "forbidden" || code === "ended") {
                this.handleRequestError(error, "sync");
            } else {
                if (code === "unauthorized") this.handleRequestError(error, "sync");
                if (update) this.pending.unshift(update);
                if (awareness) this.awarenessDirty = true;
                this.sendFailures += 1;
                if (this.sendFailures >= 2) this.set({ phase: "reconnecting" });
                this.retryDelay = error instanceof CollabRequestError && error.retryAfterMs
                    ? error.retryAfterMs
                    : COLLAB_TIMING.retryMs[Math.min(this.sendFailures - 1, COLLAB_TIMING.retryMs.length - 1)];
            }
        } finally {
            if (!this.closed && doc === this.doc) {
                this.set({ unsynced: this.pending.length > 0 });
                if (this.pending.length || this.awarenessDirty) this.scheduleFlush(this.sendFailures ? this.retryDelay : COLLAB_TIMING.updateBatchMs);
            }
        }
    }

    /**
     * Starts over from the server's state with a new document (the Monaco
     * models are kept and re-bound). Used when the server refused local
     * changes or the document can't be completed.
     */
    private async reload() {
        if (this.reloading || this.closed || this.finishing) return;
        this.reloading = true;
        this.lastReloadAt = Date.now();
        try {
            const oldClient = this.doc.clientID;
            const response = await collabApi.poll(this.id, { after: -1, chat: this.chatCursor, signals: false, client: oldClient });
            if (this.closed || this.finishing) return;
            const restartRealtime = Boolean(this.realtime);
            this.realtime?.stop();
            this.realtime = null;
            if (this.mesh) this.leaveCall();
            for (const binding of [...this.bindings.values()]) binding.destroy();
            this.bindings.clear();
            this.detachDoc?.();
            this.awareness.destroy();
            this.doc.destroy();
            this.pending = [];
            this.awarenessDirty = false;
            this.tracker = new SequenceTracker();
            this.needSnapshot = true;
            this.presenceDocs.clear();
            this.clientKeys.clear();
            this.local = { ...this.local, selection: null, call: null };
            this.setupDoc();
            sendLeaveBeacon(this.id, oldClient);
            this.applyPoll(response);
            this.computeFiles();
            if (this.monaco) for (const model of this.monaco.editor.getModels()) this.bindModel(model);
            this.presence?.report(true);
            this.set({ unsynced: false });
            this.notice({ kind: "resynced" });
            if (restartRealtime) this.startRealtime();
            else this.schedulePoll(COLLAB_TIMING.pollVisibleMs);
        } catch (error) {
            this.handleRequestError(error, "poll");
        } finally {
            this.reloading = false;
        }
    }

    // ------------------------------------------------------------------ editor

    private get uriPrefix() {
        return `${URI_ROOT}${this.id}/`;
    }

    /** The Monaco model path of a file (stable for the file's lifetime in this tab). */
    modelPath(fileId: string): string {
        let path = this.paths.get(fileId);
        if (!path) {
            const file = readFileEntry(fileId, filesOf(this.doc).get(fileId));
            const extension = fileExtensionFor(file?.lang ?? "plaintext").toLowerCase().replace(/[^a-z0-9_-]/g, "") || "txt";
            path = `${this.uriPrefix}${fileId}.${extension}`;
            this.paths.set(fileId, path);
        }
        return path;
    }

    private fileIdOf(model: Model | null): string | null {
        if (!model) return null;
        const uri = model.uri.toString();
        if (!uri.startsWith(this.uriPrefix)) return null;
        const rest = uri.slice(this.uriPrefix.length);
        const dot = rest.lastIndexOf(".");
        const id = dot > 0 ? rest.slice(0, dot) : rest;
        return isCollabFileId(id) ? id : null;
    }

    private targetOf(model: Model | null): PresenceTarget | null {
        const fileId = this.fileIdOf(model);
        if (!fileId) return null;
        const file = readFileEntry(fileId, filesOf(this.doc).get(fileId));
        return file ? { fileId, ytext: file.text } : null;
    }

    private bindModel(model: Model) {
        if (this.closed || !this.monaco || model.isDisposed()) return;
        const fileId = this.fileIdOf(model);
        if (!fileId) return;
        const existing = this.bindings.get(fileId);
        if (existing && existing.model === model && !existing.isDestroyed) return;
        existing?.destroy();
        const file = readFileEntry(fileId, filesOf(this.doc).get(fileId));
        if (!file) return;
        const binding = new CollabTextBinding(this.monaco, file.text, model, () => (this.editor ? [this.editor] : []), {
            allowLocalChange: (length) => this.allowLocalChange(fileId, length),
            onRejected: () => this.notice({ kind: "rejected" }),
        });
        binding.onDestroy = () => {
            if (this.bindings.get(fileId) === binding) this.bindings.delete(fileId);
        };
        this.bindings.set(fileId, binding);
    }

    private allowLocalChange(fileId: string, length: number) {
        if (!this.state.canEdit || this.finishing) return false;
        if (length > COLLAB_LIMITS.maxFileChars) return false;
        let total = length;
        for (const file of listDocFiles(this.doc)) if (file.id !== fileId) total += file.text.length;
        return total <= COLLAB_LIMITS.maxTotalChars;
    }

    /** Connects the page's Monaco editor; returns the function that disconnects it. */
    attachEditor(editor: Editor, monaco: MonacoApi): () => void {
        if (this.closed) return () => undefined;
        this.monaco = monaco;
        this.editor = editor;
        this.modelListener ??= monaco.editor.onDidCreateModel((model) => this.bindModel(model));
        for (const model of monaco.editor.getModels()) this.bindModel(model);
        this.presence?.dispose();
        const presence = new CollabEditorPresence(monaco, editor, (model) => this.targetOf(model), (state) => this.setLocal(state), () => this.userMoved());
        this.presence = presence;
        presence.render(this.state.peers);
        const modelChange = editor.onDidChangeModel(() => this.editorModelChanged());
        let attached = true;
        const detach = () => {
            if (!attached) return;
            attached = false;
            modelChange.dispose();
            disposeListener.dispose();
            if (this.presence === presence) {
                presence.dispose();
                this.presence = null;
            }
            if (this.editor === editor) this.editor = null;
        };
        const disposeListener = editor.onDidDispose(detach);
        return detach;
    }

    private editorModelChanged() {
        if (this.closed) return;
        const reveal = this.pendingReveal;
        this.pendingReveal = null;
        if (reveal) window.setTimeout(() => this.presence?.reveal(reveal), 0);
        // Models of files that were deleted while they were open.
        if (!this.monaco) return;
        const current = this.editor?.getModel() ?? null;
        for (const model of this.monaco.editor.getModels()) {
            if (model === current || model.isDisposed()) continue;
            const fileId = this.fileIdOf(model);
            if (fileId && !filesOf(this.doc).has(fileId)) model.dispose();
        }
    }

    private userMoved() {
        if (this.state.follow && !this.state.phoneMode) this.set({ follow: null });
    }

    private bindingForEditor() {
        const fileId = this.fileIdOf(this.editor?.getModel() ?? null);
        return fileId ? this.bindings.get(fileId) ?? null : null;
    }

    /** Undo/redo of this browser's own changes in the open file (Ctrl+Z / Ctrl+Shift+Z in the editor). */
    undo() {
        if (this.state.canEdit) this.bindingForEditor()?.undo();
    }

    redo() {
        if (this.state.canEdit) this.bindingForEditor()?.redo();
    }

    /**
     * File changes made through the editor's tab list (new, upload, rename,
     * duplicate, delete, reorder, language). Only the intended change is
     * applied (see diffTabs), so others' concurrent changes are kept.
     */
    applyTabChanges(base: readonly TabLike[], next: readonly TabLike[]) {
        if (this.closed || this.finishing) return;
        const ops = diffTabs(base, next);
        if (!ops.length) return;
        if (!this.state.canEdit) {
            this.notice({ kind: "rejected" });
            return;
        }
        const result = applyTabOps(this.doc, ops, TABS);
        if (result.rejected) this.notice({ kind: "limit", code: result.rejected });
        this.clearTimer("files");
        this.computeFiles();
    }

    // ------------------------------------------------------------------ follow

    /** Follows a participant: their file opens and the editor scrolls to their cursor. */
    follow(key: string | null) {
        const target = key && key !== this.state.me?.key ? key : null;
        this.lastFollow = "";
        this.set({ follow: target });
        if (target) this.followUpdate(true);
    }

    private followUpdate(force: boolean) {
        const key = this.state.follow;
        if (!key) return;
        const candidates = this.state.peers.filter((peer) => peer.key === key);
        if (!candidates.length) {
            if (this.state.meta && !this.state.meta.participants.some((person) => person.key === key)) this.set({ follow: null });
            return;
        }
        const target = candidates.find((peer) => !peer.away && peer.file) ?? candidates.find((peer) => peer.file);
        if (!target?.file) return;
        const signature = `${target.clientID}:${target.file}:${target.line ?? 0}`;
        if (!force && signature === this.lastFollow) return;
        this.lastFollow = signature;
        if (this.fileIdOf(this.editor?.getModel() ?? null) !== target.file) {
            this.pendingReveal = target;
            this.hooks.onActivateFile?.(target.file);
            return;
        }
        this.presence?.reveal(target);
    }

    // ------------------------------------------------------------------ chat

    setChatVisible(visible: boolean) {
        this.chatVisible = visible;
        if (visible && this.state.chatUnread) this.set({ chatUnread: 0 });
    }

    private mergeChat(messages: readonly CollabChatMessage[]) {
        if (!messages.length || this.closed) return;
        const known = new Map(this.state.chat.map((message) => [message.id, message]));
        let fresh = 0;
        for (const message of messages) {
            if (message.at > this.chatCursor) this.chatCursor = message.at;
            if (known.has(message.id)) continue;
            known.set(message.id, message);
            if (this.chatPrimed && message.by !== this.state.me?.key) fresh += 1;
        }
        if (known.size === this.state.chat.length) return;
        const chat = [...known.values()].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1)).slice(-COLLAB_LIMITS.chatKeep);
        this.set({ chat, chatUnread: this.chatVisible ? 0 : this.state.chatUnread + fresh });
    }

    async sendChat(text: string): Promise<boolean> {
        const clean = cleanChatText(text);
        if (!clean || this.closed) return false;
        this.set({ chatPending: this.state.chatPending + 1 });
        try {
            const { message } = await collabApi.chat(this.id, clean);
            this.mergeChat([message]);
            return true;
        } catch (error) {
            this.notice({ kind: "error", code: collabErrorCode(error) });
            return false;
        } finally {
            this.set({ chatPending: Math.max(0, this.state.chatPending - 1) });
        }
    }

    // ------------------------------------------------------------------ voice

    async joinCall() {
        const me = this.state.me;
        if (this.mesh || this.closed || !me) return;
        const mesh = new MeshCall({
            selfId: meshPeerId(me.key, this.doc.clientID),
            send: (to, kind, data) => this.queueSignal(to, kind, data),
            onChange: (call) => {
                if (this.mesh !== mesh && call.status !== "idle") return;
                this.set({ call });
                this.syncCallAwareness();
            },
        });
        this.mesh = mesh;
        const joined = await mesh.join();
        if (this.mesh !== mesh) return;
        if (!joined) {
            this.mesh = null;
            this.set({ call: mesh.current });
            return;
        }
        this.realtime?.setSignals(true);
        this.syncCallAwareness();
        this.computePeers();
        if (!this.realtime) this.schedulePoll(0);
    }

    leaveCall() {
        const mesh = this.mesh;
        if (!mesh) return;
        this.mesh = null;
        mesh.leave();
        this.realtime?.setSignals(false);
        this.set({ call: { ...IDLE_CALL, turnConfigured: mesh.current.turnConfigured } });
        this.setLocal({ call: null });
        void this.flushSignals();
    }

    toggleMute() {
        this.mesh?.setMuted(!this.state.call.muted);
    }

    toggleDeafen() {
        this.mesh?.setDeafened(!this.state.call.deafened);
    }

    private syncCallAwareness() {
        const call = this.mesh?.current;
        this.setLocal({ call: call && call.status === "active" ? { on: true, muted: call.muted, deafened: call.deafened } : null });
    }

    private queueSignal(to: MeshPeerId, kind: MeshSignalKind, data: string) {
        const target = parseMeshPeerId(to);
        if (!target || this.closed) return;
        this.outgoingSignals.push({ to: target.key, toClient: target.client, kind, data });
        this.timer("signals", 30, () => void this.flushSignals());
    }

    private receiveSignals(signals: readonly CollabSignal[]) {
        for (const signal of signals) {
            if (this.seenSignals.has(signal.id)) continue;
            this.seenSignals.add(signal.id);
            this.acks.push(signal.id);
            if (signal.toClient !== this.doc.clientID || !this.mesh) continue;
            void this.mesh.handleSignal(meshPeerId(signal.from, signal.fromClient), signal.kind, signal.data);
        }
        if (this.seenSignals.size > 2_000) {
            for (const id of [...this.seenSignals].slice(0, 1_000)) this.seenSignals.delete(id);
        }
        if (this.acks.length) this.timer("signals", 400, () => void this.flushSignals());
    }

    private async flushSignals() {
        const signals = this.outgoingSignals.splice(0, COLLAB_LIMITS.maxSignalsPerRequest);
        const ack = this.acks.splice(0, COLLAB_LIMITS.maxAcksPerRequest);
        if (!signals.length && !ack.length) return;
        try {
            await collabApi.call(this.id, { client: this.doc.clientID, ...(signals.length ? { signals } : {}), ...(ack.length ? { ack } : {}) });
        } catch (error) {
            const code = collabErrorCode(error);
            if (code === "network" || code === "rate_limited" || code === "unavailable" || code === "conflict") {
                this.outgoingSignals.unshift(...signals);
                this.acks.unshift(...ack);
                this.timer("signals", 1_000, () => void this.flushSignals());
                return;
            }
        }
        if (this.outgoingSignals.length || this.acks.length) this.timer("signals", 50, () => void this.flushSignals());
    }

    // ------------------------------------------------------------------ owner and membership

    async invite(emails: string[]) {
        const result = await collabApi.invite(this.id, emails);
        this.set({ invited: result.invited });
    }

    async remove(email: string) {
        const result = await collabApi.remove(this.id, email);
        this.set({ invited: result.invited });
        this.applyMeta(result.meta, null);
    }

    async setReadOnly(value: boolean) {
        const result = await collabApi.readOnly(this.id, value);
        this.applyMeta(result.meta, null);
    }

    /** Owner: sends the last edits, ends the session for everyone and reports the final files. */
    async end() {
        if (this.state.me?.role !== "owner" || this.finishing || this.closed) return;
        await this.flushNow();
        await collabApi.end(this.id);
        await this.finish("ended");
    }

    /** Participant: sends the last edits and leaves (the code is kept only as a copy). */
    async leave() {
        if (this.finishing || this.closed) return;
        this.leaving = true;
        try {
            await this.flushNow().catch(() => undefined);
            await collabApi.leave(this.id);
        } catch (error) {
            const code = collabErrorCode(error);
            if (code !== "not_found" && code !== "ended") {
                this.leaving = false;
                throw error;
            }
        }
        await this.finish("left");
    }

    /** The owner's invitation list (also refreshed with every poll). */
    async refreshInvites() {
        if (this.state.me?.role === "owner") await this.pollOnce();
    }
}
