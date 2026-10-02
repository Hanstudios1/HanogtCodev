"use client";

/**
 * Project storage: IndexedDB for local (guest/offline) projects and the
 * authenticated REST API for cloud projects.
 */
import { normalizeProject } from "@/lib/game-engine/schema";
import { GAME_ENGINE_SCHEMA_VERSION, type GameDimension, type GameProjectDocument } from "@/lib/game-engine/types";

export type ProjectSource = "cloud" | "local";

export interface ProjectSummary {
    id: string;
    name: string;
    description: string;
    dimension: GameDimension;
    createdAt: string;
    updatedAt: string;
    thumbnail: string | null;
    sceneCount: number;
    scriptCount: number;
    objectCount: number;
    arcadeId: string | null;
    source: ProjectSource;
}

export class PersistenceError extends Error {
    constructor(message: string, readonly status = 0) {
        super(message);
        this.name = "PersistenceError";
    }
}

// ---------------------------------------------------------------------------
// Local (IndexedDB)
// ---------------------------------------------------------------------------

const DB_NAME = "hanogt-engine";
const STORE = "projects";

interface LocalRecord {
    id: string;
    project: GameProjectDocument;
    thumbnail: string | null;
    updatedAt: string;
}

function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === "undefined") {
            reject(new PersistenceError("Bu tarayıcı yerel proje kaydını desteklemiyor."));
            return;
        }
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new PersistenceError("Yerel veritabanı açılamadı."));
    });
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await openDatabase();
    try {
        return await new Promise<T>((resolve, reject) => {
            const transaction = db.transaction(STORE, mode);
            const request = action(transaction.objectStore(STORE));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(new PersistenceError("Yerel kayıt işlemi başarısız oldu."));
        });
    } finally {
        db.close();
    }
}

function summarize(project: GameProjectDocument, source: ProjectSource, thumbnail: string | null, arcadeId: string | null = null): ProjectSummary {
    return {
        id: project.id,
        name: project.name,
        description: project.description,
        dimension: project.dimension,
        createdAt: project.metadata.createdAt,
        updatedAt: project.metadata.updatedAt,
        thumbnail,
        sceneCount: project.scenes.length,
        scriptCount: project.scripts.length,
        objectCount: project.scenes.reduce((total, scene) => total + scene.objects.length, 0),
        arcadeId,
        source,
    };
}

export async function listLocalProjects(): Promise<ProjectSummary[]> {
    try {
        const records = await withStore<LocalRecord[]>("readonly", (store) => store.getAll() as IDBRequest<LocalRecord[]>);
        return records
            .map((record) => {
                try {
                    return summarize(record.project, "local", record.thumbnail);
                } catch {
                    return null;
                }
            })
            .filter((item): item is ProjectSummary => Boolean(item))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } catch {
        return [];
    }
}

export async function loadLocalProject(id: string): Promise<GameProjectDocument | null> {
    const record = await withStore<LocalRecord | undefined>("readonly", (store) => store.get(id) as IDBRequest<LocalRecord | undefined>);
    if (!record) return null;
    return normalizeProject(record.project, { fallbackId: id });
}

export async function saveLocalProject(project: GameProjectDocument, thumbnail: string | null = null): Promise<void> {
    let previousThumbnail: string | null = null;
    if (!thumbnail) {
        try {
            const existing = await withStore<LocalRecord | undefined>("readonly", (store) => store.get(project.id) as IDBRequest<LocalRecord | undefined>);
            previousThumbnail = existing?.thumbnail ?? null;
        } catch {
            previousThumbnail = null;
        }
    }
    const record: LocalRecord = { id: project.id, project, thumbnail: thumbnail ?? previousThumbnail, updatedAt: project.metadata.updatedAt };
    await withStore("readwrite", (store) => store.put(record));
}

export async function deleteLocalProject(id: string): Promise<void> {
    await withStore("readwrite", (store) => store.delete(id));
}

// ---------------------------------------------------------------------------
// Cloud (REST API)
// ---------------------------------------------------------------------------

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
        response = await fetch(url, {
            ...init,
            cache: "no-store",
            headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
        });
    } catch {
        throw new PersistenceError("Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.");
    }
    const payload = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) throw new PersistenceError(payload.error || `İstek başarısız oldu (${response.status}).`, response.status);
    return payload;
}

type CloudSummary = Omit<ProjectSummary, "source">;

export async function listCloudProjects(): Promise<ProjectSummary[]> {
    const payload = await request<{ projects?: CloudSummary[] }>("/api/game-projects");
    return (payload.projects ?? []).map((item) => ({ ...item, thumbnail: item.thumbnail ?? null, arcadeId: item.arcadeId ?? null, source: "cloud" as const }));
}

export async function loadCloudProject(id: string): Promise<{ project: GameProjectDocument; revision: string | null; arcadeId: string | null }> {
    const payload = await request<{ project: unknown; revision?: string | null; arcadeId?: string | null }>(`/api/game-projects/${encodeURIComponent(id)}`);
    return { project: normalizeProject(payload.project, { fallbackId: id }), revision: payload.revision ?? null, arcadeId: payload.arcadeId ?? null };
}

export async function createCloudProject(project: GameProjectDocument, thumbnail: string | null = null): Promise<{ id: string; revision: string | null }> {
    const payload = await request<{ project: { id: string }; revision?: string | null }>("/api/game-projects", {
        method: "POST",
        body: JSON.stringify({ project, thumbnail }),
    });
    return { id: payload.project.id, revision: payload.revision ?? null };
}

export async function saveCloudProject(project: GameProjectDocument, revision: string | null, thumbnail: string | null = null): Promise<{ revision: string | null }> {
    const payload = await request<{ revision?: string | null }>(`/api/game-projects/${encodeURIComponent(project.id)}`, {
        method: "PUT",
        body: JSON.stringify({ project, revision, ...(thumbnail ? { thumbnail } : {}) }),
    });
    return { revision: payload.revision ?? null };
}

export async function deleteCloudProject(id: string): Promise<void> {
    await request(`/api/game-projects/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function publishProject(id: string, details: { title: string; description: string; thumbnail: string | null; allowRemix: boolean }): Promise<{ arcadeId: string }> {
    return request<{ arcadeId: string }>(`/api/game-projects/${encodeURIComponent(id)}/publish`, {
        method: "POST",
        body: JSON.stringify(details),
    });
}

export async function unpublishProject(id: string): Promise<void> {
    await request(`/api/game-projects/${encodeURIComponent(id)}/publish`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Import / export
// ---------------------------------------------------------------------------

export function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function safeFileName(name: string) {
    return name.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "hanogt-game";
}

export function exportProjectJson(project: GameProjectDocument) {
    const blob = new Blob([JSON.stringify({ format: "hanogt-engine-project", version: GAME_ENGINE_SCHEMA_VERSION, project }, null, 2)], { type: "application/json" });
    downloadBlob(blob, `${safeFileName(project.name)}.hanogt.json`);
}

export async function importProjectFile(file: File): Promise<GameProjectDocument> {
    if (file.size > 6 * 1024 * 1024) throw new PersistenceError("Proje dosyası 6 MB'den büyük olamaz.");
    const text = await file.text();
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new PersistenceError("Dosya geçerli bir JSON değil.");
    }
    return normalizeProject(parsed);
}
