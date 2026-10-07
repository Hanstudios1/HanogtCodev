/**
 * Local history: snapshots of the editor's files kept only in this browser
 * (IndexedDB "hanogt-local-history"; nothing is sent to a server or to
 * Firestore). Snapshots are taken when the person saves, runs code and every
 * few minutes while editing; an unchanged file is skipped. Each file keeps at
 * most 30 snapshots and all of them together at most 25 MB; the oldest go
 * first.
 *
 * A file is identified by its workspace (account, project / game script /
 * live session / unsaved draft) and its name. Snapshot metadata and contents
 * are stored separately, so listing and pruning never read the code.
 */

export type SnapshotReason = "save" | "run" | "auto" | "manual" | "restore";

export interface SnapshotMeta {
    id: number;
    fileKey: string;
    name: string;
    lang: string;
    /** Epoch milliseconds. */
    at: number;
    reason: SnapshotReason;
    /** UTF-8 bytes of the code. */
    size: number;
    hash: string;
}

export interface Snapshot extends SnapshotMeta {
    code: string;
}

/** Where snapshots live (IndexedDB in the browser, memory in tests). */
export interface HistoryBackend {
    add(meta: Omit<SnapshotMeta, "id">, code: string): Promise<number>;
    /** Metadata of one file, or of every file. */
    list(fileKey?: string): Promise<SnapshotMeta[]>;
    get(id: number): Promise<Snapshot | null>;
    remove(ids: readonly number[]): Promise<void>;
    /** Rewrites metadata (renamed files, a draft that became a project). */
    update(metas: readonly SnapshotMeta[]): Promise<void>;
    clear(): Promise<void>;
}

export const HISTORY_DATABASE = "hanogt-local-history";
export const MAX_SNAPSHOTS_PER_FILE = 30;
export const MAX_HISTORY_BYTES = 25 * 1024 * 1024;
/** How often edited files get an automatic snapshot. */
export const AUTO_SNAPSHOT_MS = 3 * 60 * 1000;

const SEPARATOR = "\u0000";

/** A short, non-reversible tag for the signed-in account ("guest" when signed out). */
export function historyAccountTag(email: string | null | undefined): string {
    const normalized = (email ?? "").trim().toLowerCase();
    return normalized ? `u${fnv1a(normalized).toString(36)}` : "guest";
}

/** The key of one file in one workspace. */
export function historyFileKey(scope: string, fileName: string): string {
    return `${scope}${SEPARATOR}${fileName}`;
}

/** The workspace part of a file key. */
export function historyScopeOf(fileKey: string): string {
    const index = fileKey.lastIndexOf(SEPARATOR);
    return index < 0 ? fileKey : fileKey.slice(0, index);
}

function fnv1a(text: string): number {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

/** A cheap fingerprint to skip unchanged snapshots (length + FNV-1a). */
export function snapshotHash(code: string): string {
    return `${code.length.toString(36)}-${fnv1a(code).toString(36)}`;
}

/** UTF-8 byte length without encoding the text. */
export function utf8Length(text: string): number {
    let bytes = 0;
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        if (code < 0x80) bytes += 1;
        else if (code < 0x800) bytes += 2;
        else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
            bytes += 4;
            index += 1;
        } else bytes += 3;
    }
    return bytes;
}

export interface HistoryLimits {
    perFile: number;
    totalBytes: number;
}

/** The snapshot store; operations run one after another. */
export class LocalHistory {
    private readonly backend: HistoryBackend;
    private readonly limits: HistoryLimits;
    private queue: Promise<unknown> = Promise.resolve();
    /** The newest snapshot's fingerprint per file (null: known to have none). */
    private readonly latest = new Map<string, string | null>();

    constructor(backend: HistoryBackend, limits: Partial<HistoryLimits> = {}) {
        this.backend = backend;
        this.limits = { perFile: limits.perFile ?? MAX_SNAPSHOTS_PER_FILE, totalBytes: limits.totalBytes ?? MAX_HISTORY_BYTES };
    }

    private run<T>(task: () => Promise<T>): Promise<T> {
        const next = this.queue.then(task, task);
        this.queue = next.catch(() => undefined);
        return next;
    }

    /** Newest first. */
    list(fileKey: string): Promise<SnapshotMeta[]> {
        return this.run(async () => (await this.backend.list(fileKey)).sort((a, b) => b.at - a.at || b.id - a.id));
    }

    get(id: number): Promise<Snapshot | null> {
        return this.run(() => this.backend.get(id));
    }

    /**
     * Stores a snapshot unless the file's newest snapshot has the same code.
     * Returns the new snapshot's metadata, or null when nothing was stored.
     */
    snapshot(input: { fileKey: string; name: string; lang: string; code: string; reason: SnapshotReason; at?: number }): Promise<SnapshotMeta | null> {
        return this.run(async () => {
            const hash = snapshotHash(input.code);
            let latest = this.latest.get(input.fileKey);
            if (latest === undefined) {
                const metas = await this.backend.list(input.fileKey);
                const newest = metas.sort((a, b) => b.at - a.at || b.id - a.id)[0];
                latest = newest?.hash ?? null;
            }
            if (latest === hash) {
                this.latest.set(input.fileKey, hash);
                return null;
            }
            const size = utf8Length(input.code);
            if (size > this.limits.totalBytes) return null;
            const meta = { fileKey: input.fileKey, name: input.name, lang: input.lang, at: input.at ?? Date.now(), reason: input.reason, size, hash };
            const id = await this.backend.add(meta, input.code);
            this.latest.set(input.fileKey, hash);
            await this.prune(input.fileKey);
            return { ...meta, id };
        });
    }

    /** At most `perFile` snapshots per file and `totalBytes` in all; the oldest go first. */
    private async prune(fileKey: string) {
        const all = await this.backend.list();
        const doomed = new Set<number>();
        const own = all.filter((meta) => meta.fileKey === fileKey).sort((a, b) => a.at - b.at || a.id - b.id);
        for (const meta of own.slice(0, Math.max(0, own.length - this.limits.perFile))) doomed.add(meta.id);
        let total = all.reduce((sum, meta) => sum + (doomed.has(meta.id) ? 0 : meta.size), 0);
        if (total > this.limits.totalBytes) {
            for (const meta of [...all].sort((a, b) => a.at - b.at || a.id - b.id)) {
                if (total <= this.limits.totalBytes) break;
                if (doomed.has(meta.id)) continue;
                doomed.add(meta.id);
                total -= meta.size;
            }
        }
        if (!doomed.size) return;
        await this.backend.remove([...doomed]);
        // Pruning may have removed a file's newest snapshot (the size cap): look it up again next time.
        for (const meta of all) if (doomed.has(meta.id)) this.latest.delete(meta.fileKey);
    }

    remove(id: number): Promise<void> {
        return this.run(async () => {
            await this.backend.remove([id]);
            this.latest.clear();
        });
    }

    /** Removes every snapshot of one file. */
    clearFile(fileKey: string): Promise<void> {
        return this.run(async () => {
            const metas = await this.backend.list(fileKey);
            await this.backend.remove(metas.map((meta) => meta.id));
            this.latest.set(fileKey, null);
        });
    }

    /** Removes every snapshot in this browser. */
    clearAll(): Promise<void> {
        return this.run(async () => {
            await this.backend.clear();
            this.latest.clear();
        });
    }

    /** A renamed file keeps its history. */
    renameFile(fromKey: string, toKey: string, name: string): Promise<void> {
        return this.run(async () => {
            if (fromKey === toKey) return;
            const metas = await this.backend.list(fromKey);
            if (!metas.length) return;
            await this.backend.update(metas.map((meta) => ({ ...meta, fileKey: toKey, name })));
            this.latest.delete(fromKey);
            this.latest.delete(toKey);
        });
    }

    /** Moves the history of the given files from one workspace to another (an unsaved draft saved as a project). */
    moveScope(fromScope: string, toScope: string, names: readonly string[]): Promise<void> {
        return this.run(async () => {
            if (fromScope === toScope) return;
            const wanted = new Set(names.map((name) => historyFileKey(fromScope, name)));
            const metas = (await this.backend.list()).filter((meta) => wanted.has(meta.fileKey));
            if (!metas.length) return;
            await this.backend.update(metas.map((meta) => ({ ...meta, fileKey: historyFileKey(toScope, meta.name) })));
            this.latest.clear();
        });
    }
}

// ------------------------------------------------------------------ backends
/** Snapshots in memory (tests, and browsers without IndexedDB for one page view). */
export function createMemoryBackend(): HistoryBackend {
    const metas = new Map<number, SnapshotMeta>();
    const contents = new Map<number, string>();
    let nextId = 1;
    return {
        async add(meta, code) {
            const id = nextId++;
            metas.set(id, { ...meta, id });
            contents.set(id, code);
            return id;
        },
        async list(fileKey) {
            return [...metas.values()].filter((meta) => fileKey === undefined || meta.fileKey === fileKey).map((meta) => ({ ...meta }));
        },
        async get(id) {
            const meta = metas.get(id);
            const code = contents.get(id);
            return meta && code !== undefined ? { ...meta, code } : null;
        },
        async remove(ids) {
            for (const id of ids) {
                metas.delete(id);
                contents.delete(id);
            }
        },
        async update(updated) {
            for (const meta of updated) if (metas.has(meta.id)) metas.set(meta.id, { ...meta });
        },
        async clear() {
            metas.clear();
            contents.clear();
        },
    };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
    });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
        transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    });
}

/** Snapshots in IndexedDB: "meta" (id, fileKey index) and "content" (id → code). */
export async function createIndexedDbBackend(factory: IDBFactory = indexedDB): Promise<HistoryBackend> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = factory.open(HISTORY_DATABASE, 1);
        open.onupgradeneeded = () => {
            const database = open.result;
            if (!database.objectStoreNames.contains("meta")) database.createObjectStore("meta", { keyPath: "id", autoIncrement: true }).createIndex("fileKey", "fileKey");
            if (!database.objectStoreNames.contains("content")) database.createObjectStore("content");
        };
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error ?? new Error("IndexedDB is unavailable"));
        open.onblocked = () => reject(new Error("IndexedDB is blocked"));
    });
    // Another tab upgrading the database (a later version of the site) gets the connection.
    db.onversionchange = () => db.close();
    return {
        async add(meta, code) {
            const transaction = db.transaction(["meta", "content"], "readwrite");
            const done = transactionDone(transaction);
            const request = transaction.objectStore("meta").add(meta);
            let id = 0;
            request.onsuccess = () => {
                id = Number(request.result);
                transaction.objectStore("content").put(code, id);
            };
            await done;
            return id;
        },
        async list(fileKey) {
            const store = db.transaction("meta", "readonly").objectStore("meta");
            const request = fileKey === undefined ? store.getAll() : store.index("fileKey").getAll(fileKey);
            return (await requestResult(request)) as SnapshotMeta[];
        },
        async get(id) {
            const transaction = db.transaction(["meta", "content"], "readonly");
            const [meta, code] = await Promise.all([
                requestResult(transaction.objectStore("meta").get(id) as IDBRequest<SnapshotMeta | undefined>),
                requestResult(transaction.objectStore("content").get(id) as IDBRequest<string | undefined>),
            ]);
            return meta && typeof code === "string" ? { ...meta, code } : null;
        },
        async remove(ids) {
            if (!ids.length) return;
            const transaction = db.transaction(["meta", "content"], "readwrite");
            const done = transactionDone(transaction);
            for (const id of ids) {
                transaction.objectStore("meta").delete(id);
                transaction.objectStore("content").delete(id);
            }
            await done;
        },
        async update(metas) {
            if (!metas.length) return;
            const transaction = db.transaction("meta", "readwrite");
            const done = transactionDone(transaction);
            for (const meta of metas) transaction.objectStore("meta").put(meta);
            await done;
        },
        async clear() {
            const transaction = db.transaction(["meta", "content"], "readwrite");
            const done = transactionDone(transaction);
            transaction.objectStore("meta").clear();
            transaction.objectStore("content").clear();
            await done;
        },
    };
}

let shared: Promise<LocalHistory | null> | null = null;

/** The page's local history (one database connection); null when IndexedDB can't be used. */
export function openLocalHistory(): Promise<LocalHistory | null> {
    if (typeof window === "undefined" || typeof indexedDB === "undefined") return Promise.resolve(null);
    shared ??= createIndexedDbBackend()
        .then((backend) => new LocalHistory(backend))
        .catch(() => {
            shared = null;
            return null;
        });
    return shared;
}
