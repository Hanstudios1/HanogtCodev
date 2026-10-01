import { NextRequest, NextResponse } from "next/server";
import { createEngineId } from "@/lib/game-engine/ids";
import { normalizeProject, SchemaError } from "@/lib/game-engine/schema";
import { GAME_ENGINE_SCHEMA_VERSION, type GameProjectDocument, type ScriptAsset } from "@/lib/game-engine/types";
import { getActiveSession } from "@/lib/server/active-session";
import { getServerDocument, isWriteConflict } from "@/lib/server/firebase-rest";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";

export const MAX_PROJECTS_PER_USER = 50;
export const MAX_SCRIPT_BYTES = 160 * 1024;
/** A full project (content ≤ 900 KB + scripts + thumbnail) in one request. */
export const MAX_REQUEST_BYTES = 3 * 1024 * 1024;
export const MAX_THUMBNAIL_LENGTH = 70_000;

export type GameScriptLanguage = "csharp" | "cpp";

export type GameProjectRecord = {
    ownerEmail?: string;
    name?: string;
    description?: string;
    dimension?: "2d" | "3d";
    schemaVersion?: number;
    /** v2 and later: JSON of { activeSceneId, scenes, prefabs, textures, settings }. */
    content?: string;
    /** v1: single scene document. */
    scene?: unknown;
    thumbnail?: string | null;
    templateId?: string | null;
    scriptCount?: number;
    objectCount?: number;
    sceneCount?: number;
    createdAt?: string;
    updatedAt?: string;
    _id?: string;
    _path?: string;
    _updateTime?: string;
};

export type GameScriptRecord = {
    projectId?: string;
    ownerEmail?: string;
    name?: string;
    language?: GameScriptLanguage;
    content?: string;
    order?: number;
    /** v1 only: objects the script was attached to. */
    attachedObjectIds?: string[];
    enabled?: boolean;
    createdAt?: string;
    updatedAt?: string;
    _id?: string;
    _path?: string;
    _updateTime?: string;
};

export class GameApiError extends Error {
    constructor(
        public readonly status: number,
        message: string,
        public readonly headers: Record<string, string> = {},
    ) {
        super(message);
        this.name = "GameApiError";
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function assertOnlyKeys(body: Record<string, unknown>, allowed: readonly string[]) {
    const unexpected = Object.keys(body).find((key) => !allowed.includes(key));
    if (unexpected) throw new GameApiError(400, `Desteklenmeyen alan: ${unexpected}`);
}

export function readText(value: unknown, field: string, max: number, options: { required?: boolean; min?: number } = {}) {
    if (value === undefined && !options.required) return undefined;
    if (typeof value !== "string") throw new GameApiError(400, `${field} metin olmalıdır.`);
    if (value.includes("\0")) throw new GameApiError(400, `${field} geçersiz karakter içeriyor.`);
    const normalized = value.trim();
    if ((options.required || options.min) && normalized.length < (options.min || 1)) {
        throw new GameApiError(400, `${field} en az ${options.min || 1} karakter olmalıdır.`);
    }
    if (normalized.length > max) throw new GameApiError(413, `${field} en fazla ${max} karakter olabilir.`);
    return normalized;
}

export function readDimension(value: unknown, fallback?: "2d" | "3d"): "2d" | "3d" {
    if (value === undefined && fallback) return fallback;
    if (value !== "2d" && value !== "3d") throw new GameApiError(400, "Boyut yalnızca 2d veya 3d olabilir.");
    return value;
}

export function readScriptLanguage(value: unknown): GameScriptLanguage {
    if (value === "csharp" || value === "cpp") return value;
    throw new GameApiError(400, "Oyun betikleri yalnızca C# (csharp) veya C++ (cpp) olabilir.");
}

export function assertProjectId(value: unknown) {
    if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{7,99}$/.test(value)) {
        throw new GameApiError(400, "Geçersiz oyun projesi kimliği.");
    }
    return value;
}

export function assertScriptId(value: unknown) {
    if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{7,99}$/.test(value)) {
        throw new GameApiError(400, "Geçersiz betik kimliği.");
    }
    return value;
}

export async function readJsonBody(request: NextRequest, maxBytes = MAX_REQUEST_BYTES) {
    const contentType = request.headers.get("content-type")?.toLowerCase() || "";
    if (!contentType.includes("application/json") && !contentType.includes("+json")) {
        throw new GameApiError(415, "İstek gövdesi JSON olmalıdır.");
    }
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        throw new GameApiError(413, "İstek gövdesi izin verilen boyutu aşıyor.");
    }
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > maxBytes) throw new GameApiError(413, "İstek gövdesi izin verilen boyutu aşıyor.");
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new GameApiError(400, "Geçerli bir JSON gövdesi gönderilmelidir.");
    }
    if (!isRecord(parsed)) throw new GameApiError(400, "JSON gövdesi bir nesne olmalıdır.");
    return parsed;
}

export async function authorizeGameRequest(
    request: NextRequest,
    options: { mutation: boolean; bucket: "read" | "write" },
) {
    if (options.mutation && !isSameOrigin(request)) throw new GameApiError(403, "Geçersiz istek kaynağı.");
    const activeSession = await getActiveSession();
    if (!activeSession) throw new GameApiError(401, "Etkin oturum gerekli.");
    const limit = options.bucket === "read" ? 180 : 90;
    const rate = await enforceRateLimit(`game-projects:${options.bucket}:${activeSession.email}`, limit, 60_000);
    if (!rate.allowed) {
        throw new GameApiError(429, "Çok fazla oyun projesi isteği. Biraz sonra tekrar deneyin.", {
            "Retry-After": String(rate.retryAfterSeconds),
        });
    }
    return { ...activeSession, rate };
}

export function rateHeaders(rate?: { remaining: number }): Record<string, string> {
    return rate ? { "X-RateLimit-Remaining": String(rate.remaining) } : {};
}

export function apiJson(payload: unknown, status = 200, headers: Record<string, string> = {}) {
    return NextResponse.json(payload, { status, headers: jsonSecurityHeaders(headers) });
}

export function apiError(error: unknown, fallbackMessage: string, fallbackStatus = 500) {
    if (error instanceof GameApiError) return apiJson({ error: error.message }, error.status, error.headers);
    if (error instanceof SchemaError) return apiJson({ error: error.message }, 400);
    if (isWriteConflict(error)) {
        return apiJson({ error: "Proje başka bir oturumda değişti. Güncel sürümü yükleyip tekrar deneyin." }, 409);
    }
    return apiJson({ error: fallbackMessage }, fallbackStatus);
}

export async function loadOwnedProject(projectId: string, email: string) {
    const project = await getServerDocument<GameProjectRecord>(`game_projects/${projectId}`);
    if (!project || project.ownerEmail !== email) throw new GameApiError(404, "Oyun projesi bulunamadı veya erişiminiz yok.");
    return project;
}

export function assertRevision(request: NextRequest, record: { _updateTime?: string }, bodyRevision?: unknown) {
    const requested = typeof bodyRevision === "string"
        ? bodyRevision
        : request.headers.get("if-match")?.replace(/^W\//, "").replace(/^"|"$/g, "");
    if (requested && requested !== record._updateTime) throw new GameApiError(409, "Proje başka bir sekmede veya cihazda değişti. Güncel sürümü yükleyin.");
}

export function readThumbnail(value: unknown): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    if (typeof value !== "string" || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) {
        throw new GameApiError(400, "Kapak görseli geçersiz.");
    }
    if (value.length > MAX_THUMBNAIL_LENGTH) throw new GameApiError(413, "Kapak görseli çok büyük.");
    return value;
}

// ---------------------------------------------------------------------------
// Storage format
// ---------------------------------------------------------------------------

/** Validates a client document with the shared engine schema (throws SchemaError). */
export function validateProject(value: unknown, id: string, overrides: { name?: string; description?: string } = {}): GameProjectDocument {
    const project = normalizeProject(value, { fallbackId: id });
    project.id = id;
    if (overrides.name !== undefined) project.name = overrides.name;
    if (overrides.description !== undefined) project.description = overrides.description;
    // Script ids become Firestore document ids: remap anything unsafe and update references.
    const remap = new Map<string, string>();
    for (const script of project.scripts) {
        if (Buffer.byteLength(script.content, "utf8") > MAX_SCRIPT_BYTES) throw new GameApiError(413, `${script.name} 160 KB sınırını aşıyor.`);
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]{7,99}$/.test(script.id)) {
            const next = createEngineId("script").replace(/[^A-Za-z0-9_-]/g, "_");
            remap.set(script.id, next);
            script.id = next;
        }
    }
    if (remap.size) {
        const entities = [...project.scenes.flatMap((scene) => scene.objects), ...project.prefabs.flatMap((prefab) => prefab.entities)];
        for (const entity of entities) {
            for (const component of entity.components) {
                if (component.type === "script" && remap.has(component.scriptId)) component.scriptId = remap.get(component.scriptId) as string;
            }
        }
    }
    return project;
}

export function projectDocumentFields(project: GameProjectDocument) {
    const content = JSON.stringify({
        activeSceneId: project.activeSceneId,
        scenes: project.scenes,
        prefabs: project.prefabs,
        textures: project.textures,
        settings: project.settings,
    });
    return {
        name: project.name,
        description: project.description,
        dimension: project.dimension,
        schemaVersion: GAME_ENGINE_SCHEMA_VERSION,
        content,
        templateId: project.scenes[0]?.metadata.templateId ?? null,
        scriptCount: project.scripts.length,
        sceneCount: project.scenes.length,
        objectCount: project.scenes.reduce((total, scene) => total + scene.objects.length, 0),
    };
}

/** Builds the full document from the stored record + scripts (migrating schema v1). */
export function assembleProject(record: GameProjectRecord, id: string, scripts: GameScriptRecord[]): GameProjectDocument {
    const scriptAssets: ScriptAsset[] = scripts
        .slice()
        .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
        .map((script) => ({
            id: script._id || createEngineId("script"),
            name: script.name || "Script.cs",
            language: script.language === "cpp" ? "cpp" : "csharp",
            content: typeof script.content === "string" ? script.content : "",
        }));
    let source: Record<string, unknown>;
    // v2 and v3 share the storage layout; the schema migrates the content itself.
    if (Number(record.schemaVersion ?? 1) >= 2 && typeof record.content === "string") {
        let content: unknown = {};
        try {
            content = JSON.parse(record.content);
        } catch {
            content = {};
        }
        source = { ...(isRecord(content) ? content : {}) };
    } else {
        // Schema v1: one scene; scripts were linked to objects by id.
        const scene = isRecord(record.scene) ? JSON.parse(JSON.stringify(record.scene)) as Record<string, unknown> : {};
        const objects = Array.isArray(scene.objects) ? scene.objects as Array<Record<string, unknown>> : [];
        for (const script of scripts) {
            for (const objectId of script.attachedObjectIds || []) {
                const object = objects.find((candidate) => candidate.id === objectId);
                if (!object) continue;
                const components = Array.isArray(object.components) ? object.components as Array<Record<string, unknown>> : [];
                if (components.some((component) => component.type === "script" && component.scriptId === script._id)) continue;
                components.push({ id: `script-${String(script._id).slice(0, 40)}-${components.length}`, type: "script", enabled: script.enabled !== false, scriptId: script._id, className: null, fields: {} });
                object.components = components;
            }
        }
        source = { scene };
    }
    const project = normalizeProject({
        ...source,
        id,
        name: record.name || "Oyun Projesi",
        description: record.description || "",
        dimension: record.dimension === "2d" ? "2d" : "3d",
        scripts: scriptAssets,
        metadata: { createdAt: record.createdAt, updatedAt: record.updatedAt },
    }, { fallbackId: id, dimension: record.dimension === "2d" ? "2d" : "3d" });
    project.id = id;
    return project;
}

export function summarizeRecord(record: GameProjectRecord, id: string, arcadeIds: Set<string>) {
    return {
        id,
        name: record.name || "Oyun Projesi",
        description: record.description || "",
        dimension: record.dimension === "2d" ? "2d" : "3d",
        createdAt: String(record.createdAt || ""),
        updatedAt: String(record.updatedAt || record.createdAt || ""),
        thumbnail: typeof record.thumbnail === "string" ? record.thumbnail : null,
        sceneCount: Number(record.sceneCount || 1),
        scriptCount: Number(record.scriptCount || 0),
        objectCount: Number(record.objectCount || 0),
        arcadeId: arcadeIds.has(id) ? id : null,
        schemaVersion: Number(record.schemaVersion || 1),
    };
}

export const SUMMARY_FIELDS = ["ownerEmail", "name", "description", "dimension", "schemaVersion", "thumbnail", "scriptCount", "objectCount", "sceneCount", "createdAt", "updatedAt"];

export function scriptRecord(script: ScriptAsset, projectId: string, email: string, order: number, now: string, createdAt?: string) {
    return {
        projectId,
        ownerEmail: email,
        name: script.name,
        language: script.language,
        content: script.content,
        order,
        createdAt: createdAt || now,
        updatedAt: now,
    };
}

export function serializeScript(record: GameScriptRecord, id: string) {
    return {
        id,
        name: record.name || "Script.cs",
        language: record.language === "cpp" ? "cpp" : "csharp",
        content: record.content || "",
        order: Number(record.order || 0),
        createdAt: record.createdAt || null,
        updatedAt: record.updatedAt || null,
        revision: record._updateTime || null,
    };
}

export function normalizeScriptName(value: unknown, language: GameScriptLanguage) {
    const raw = readText(value, "Betik adı", 100, { required: true, min: 1 })!;
    if (raw.includes("/") || raw.includes("\\") || raw === "." || raw === ".." || raw.startsWith(".")) throw new GameApiError(400, "Betik adı bir dosya yolu içeremez.");
    if (!/^[\p{L}\p{N} _.-]+$/u.test(raw)) throw new GameApiError(400, "Betik adı desteklenmeyen karakter içeriyor.");
    const lower = raw.toLowerCase();
    const validExtension = language === "csharp"
        ? lower.endsWith(".cs")
        : [".cpp", ".cc", ".cxx", ".h", ".hpp"].some((extension) => lower.endsWith(extension));
    if (raw.includes(".") && !validExtension) throw new GameApiError(400, language === "csharp" ? "C# betiği .cs uzantılı olmalıdır." : "C++ betiği .cpp, .cc, .cxx, .h veya .hpp uzantılı olmalıdır.");
    return validExtension ? raw : `${raw}${language === "csharp" ? ".cs" : ".cpp"}`;
}

export function normalizeScriptContent(value: unknown) {
    if (value === undefined) return "";
    if (typeof value !== "string" || value.includes("\0")) throw new GameApiError(400, "Betik içeriği geçersiz.");
    if (Buffer.byteLength(value, "utf8") > MAX_SCRIPT_BYTES) throw new GameApiError(413, "Betik içeriği 160 KB sınırını aşıyor.");
    return value;
}
