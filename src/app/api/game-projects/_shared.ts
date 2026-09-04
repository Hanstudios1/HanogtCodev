import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/server/active-session";
import { getServerDocument } from "@/lib/server/firebase-rest";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";

export const MAX_PROJECTS_PER_USER = 50;
export const MAX_SCRIPTS_PER_PROJECT = 64;
export const MAX_SCENE_BYTES = 512 * 1024;
export const MAX_SCRIPT_BYTES = 160 * 1024;
export const MAX_REQUEST_BYTES = 700 * 1024;

export type GameDimension = "2d" | "3d";
export type GameScriptLanguage = "csharp" | "cpp";

type Vector3 = { x: number; y: number; z: number };
type Component = Record<string, unknown> & { id: string; type: string; enabled: boolean };

export type SceneObject = {
    id: string;
    name: string;
    parentId: string | null;
    active: boolean;
    components: Component[];
};

export type SceneDocument = {
    version: 1;
    id: string;
    name: string;
    dimension: GameDimension;
    objects: SceneObject[];
    settings: {
        backgroundColor: string;
        ambientLight: number;
        physics: {
            gravity: Vector3;
            fixedTimeStep: number;
            maxSubSteps: number;
            worldBounds: { enabled: boolean; min: Vector3; max: Vector3 };
        };
    };
    metadata: { createdAt: string; updatedAt: string; templateId: string | null };
};

export type GameProjectRecord = {
    ownerEmail?: string;
    name?: string;
    description?: string;
    dimension?: GameDimension;
    scene?: SceneDocument;
    scriptCount?: number;
    schemaVersion?: number;
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
    enabled?: boolean;
    attachedObjectIds?: string[];
    compilerTarget?: string;
    sourceKind?: string;
    executionPolicy?: string;
    order?: number;
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

export function readDimension(value: unknown, fallback?: GameDimension): GameDimension {
    if (value === undefined && fallback) return fallback;
    if (value !== "2d" && value !== "3d") throw new GameApiError(400, "Boyut yalnızca 2d veya 3d olabilir.");
    return value;
}

export function readScriptLanguage(value: unknown): GameScriptLanguage {
    if (value === "csharp" || value === "cpp") return value;
    throw new GameApiError(400, "Oyun betikleri yalnızca C# (csharp) veya C++ (cpp) olabilir.");
}

function readIdentifier(value: unknown, field: string) {
    if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value)) {
        throw new GameApiError(400, `${field} geçersiz bir kimlik içeriyor.`);
    }
    return value;
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
    const firestoreStatus = error instanceof Error && "status" in error
        ? Number((error as Error & { status?: number }).status)
        : 0;
    if (firestoreStatus === 409 || firestoreStatus === 412) {
        return apiJson({ error: "Kaynak başka bir oturumda değişti. Güncel veriyi yükleyip tekrar deneyin." }, 409);
    }
    return apiJson({ error: fallbackMessage }, fallbackStatus);
}

function finiteNumber(value: unknown, field: string, fallback?: number, min = -1_000_000, max = 1_000_000) {
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
        throw new GameApiError(400, `${field} geçerli bir sayı olmalıdır.`);
    }
    return value;
}

function integer(value: unknown, field: string, fallback: number, min: number, max: number) {
    const result = finiteNumber(value, field, fallback, min, max);
    if (!Number.isInteger(result)) throw new GameApiError(400, `${field} tam sayı olmalıdır.`);
    return result;
}

function booleanValue(value: unknown, field: string, fallback: boolean) {
    if (value === undefined) return fallback;
    if (typeof value !== "boolean") throw new GameApiError(400, `${field} doğru/yanlış değeri olmalıdır.`);
    return value;
}

function vector3(value: unknown, field: string, fallback: Vector3): Vector3 {
    if (value === undefined) return { ...fallback };
    if (!isRecord(value)) throw new GameApiError(400, `${field} bir vektör olmalıdır.`);
    return {
        x: finiteNumber(value.x, `${field}.x`, fallback.x),
        y: finiteNumber(value.y, `${field}.y`, fallback.y),
        z: finiteNumber(value.z, `${field}.z`, fallback.z),
    };
}

function color(value: unknown, field: string, fallback: string) {
    const result = value === undefined ? fallback : readText(value, field, 32, { required: true })!;
    if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(result)) throw new GameApiError(400, `${field} hex biçiminde olmalıdır.`);
    return result;
}

function enumValue<T extends string>(value: unknown, field: string, values: readonly T[], fallback: T): T {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || !values.includes(value as T)) throw new GameApiError(400, `${field} desteklenmiyor.`);
    return value as T;
}

function nullableIdentifier(value: unknown, field: string) {
    if (value === undefined || value === null || value === "") return null;
    return readIdentifier(value, field);
}

function assertSafeJson(value: unknown) {
    let nodes = 0;
    const visit = (current: unknown, depth: number) => {
        nodes += 1;
        if (nodes > 20_000 || depth > 14) throw new GameApiError(413, "Sahne yapısı çok karmaşık.");
        if (current === null || typeof current === "boolean") return;
        if (typeof current === "number") {
            if (!Number.isFinite(current)) throw new GameApiError(400, "Sahne geçersiz bir sayı içeriyor.");
            return;
        }
        if (typeof current === "string") {
            if (current.length > MAX_SCRIPT_BYTES) throw new GameApiError(413, "Sahnedeki bir metin alanı çok büyük.");
            return;
        }
        if (Array.isArray(current)) {
            if (current.length > 2_000) throw new GameApiError(413, "Sahnedeki bir dizi çok büyük.");
            current.forEach((item) => visit(item, depth + 1));
            return;
        }
        if (!isRecord(current)) throw new GameApiError(400, "Sahne yalnızca JSON uyumlu değerler içerebilir.");
        const entries = Object.entries(current);
        if (entries.length > 256) throw new GameApiError(413, "Sahnedeki bir nesne çok fazla alan içeriyor.");
        for (const [key, child] of entries) {
            if (key.length > 80 || key === "__proto__" || key === "prototype" || key === "constructor") {
                throw new GameApiError(400, "Sahne güvenli olmayan bir alan adı içeriyor.");
            }
            visit(child, depth + 1);
        }
    };
    visit(value, 0);
}

function componentBase(value: Record<string, unknown>) {
    return {
        id: readIdentifier(value.id, "Bileşen"),
        enabled: booleanValue(value.enabled, "Bileşen etkinliği", true),
    };
}

function normalizeComponent(value: unknown): Component {
    if (!isRecord(value)) throw new GameApiError(400, "Her bileşen bir nesne olmalıdır.");
    const type = enumValue(value.type, "Bileşen türü", ["transform", "spriteRenderer", "meshRenderer", "camera", "light", "rigidBody", "collider", "script"] as const, "transform");
    const base = componentBase(value);
    if (type === "transform") {
        return { ...base, type, position: vector3(value.position, "Konum", { x: 0, y: 0, z: 0 }), rotation: vector3(value.rotation, "Dönüş", { x: 0, y: 0, z: 0 }), scale: vector3(value.scale, "Ölçek", { x: 1, y: 1, z: 1 }) };
    }
    if (type === "spriteRenderer") {
        return { ...base, type, assetId: nullableIdentifier(value.assetId, "Sprite varlığı"), color: color(value.color, "Sprite rengi", "#ffffff"), opacity: finiteNumber(value.opacity, "Sprite saydamlığı", 1, 0, 1), pixelsPerUnit: finiteNumber(value.pixelsPerUnit, "Piksel oranı", 100, 0.01, 100_000), sortingLayer: integer(value.sortingLayer, "Sıralama katmanı", 0, -1_000_000, 1_000_000), flipX: booleanValue(value.flipX, "Yatay çevirme", false), flipY: booleanValue(value.flipY, "Dikey çevirme", false) };
    }
    if (type === "meshRenderer") {
        const mesh = isRecord(value.mesh) ? value.mesh : {};
        const kind = enumValue(mesh.kind, "Mesh türü", ["primitive", "asset"] as const, "primitive");
        const normalizedMesh = kind === "primitive"
            ? { kind, primitive: enumValue(mesh.primitive, "İlkel mesh", ["cube", "sphere", "plane", "capsule", "cylinder"] as const, "cube") }
            : { kind, assetId: readIdentifier(mesh.assetId, "Mesh varlığı") };
        const material = isRecord(value.material) ? value.material : {};
        return { ...base, type, mesh: normalizedMesh, material: { color: color(material.color, "Materyal rengi", "#ffffff"), metallic: finiteNumber(material.metallic, "Metallik", 0, 0, 1), roughness: finiteNumber(material.roughness, "Pürüzlülük", 0.5, 0, 1), opacity: finiteNumber(material.opacity, "Materyal saydamlığı", 1, 0, 1), textureAssetId: nullableIdentifier(material.textureAssetId, "Doku varlığı") }, castShadows: booleanValue(value.castShadows, "Gölge oluşturma", true), receiveShadows: booleanValue(value.receiveShadows, "Gölge alma", true) };
    }
    if (type === "camera") {
        return { ...base, type, projection: enumValue(value.projection, "Kamera izdüşümü", ["perspective", "orthographic"] as const, "perspective"), fieldOfView: finiteNumber(value.fieldOfView, "Görüş alanı", 60, 1, 179), orthographicSize: finiteNumber(value.orthographicSize, "Ortografik boyut", 5, 0.001, 100_000), nearClip: finiteNumber(value.nearClip, "Yakın kırpma", 0.1, 0.0001, 1_000_000), farClip: finiteNumber(value.farClip, "Uzak kırpma", 1000, 0.001, 10_000_000), clearColor: color(value.clearColor, "Kamera rengi", "#0f172a"), primary: booleanValue(value.primary, "Ana kamera", false) };
    }
    if (type === "light") {
        return { ...base, type, lightType: enumValue(value.lightType, "Işık türü", ["directional", "point", "spot"] as const, "directional"), color: color(value.color, "Işık rengi", "#ffffff"), intensity: finiteNumber(value.intensity, "Işık yoğunluğu", 1, 0, 100_000), range: finiteNumber(value.range, "Işık menzili", 10, 0, 1_000_000), spotAngle: finiteNumber(value.spotAngle, "Spot açısı", 30, 1, 179), castShadows: booleanValue(value.castShadows, "Işık gölgesi", true) };
    }
    if (type === "rigidBody") {
        const freeze = isRecord(value.freezePosition) ? value.freezePosition : {};
        return { ...base, type, bodyType: enumValue(value.bodyType, "Gövde türü", ["static", "dynamic", "kinematic"] as const, "dynamic"), mass: finiteNumber(value.mass, "Kütle", 1, 0.0001, 1_000_000), useGravity: booleanValue(value.useGravity, "Yerçekimi", true), gravityScale: finiteNumber(value.gravityScale, "Yerçekimi ölçeği", 1, -1000, 1000), velocity: vector3(value.velocity, "Hız", { x: 0, y: 0, z: 0 }), angularVelocity: vector3(value.angularVelocity, "Açısal hız", { x: 0, y: 0, z: 0 }), linearDamping: finiteNumber(value.linearDamping, "Sönüm", 0, 0, 1000), restitution: finiteNumber(value.restitution, "Sekme", 0, 0, 1), freezePosition: { x: booleanValue(freeze.x, "X sabitleme", false), y: booleanValue(freeze.y, "Y sabitleme", false), z: booleanValue(freeze.z, "Z sabitleme", false) } };
    }
    if (type === "collider") {
        return { ...base, type, shape: enumValue(value.shape, "Çarpıştırıcı şekli", ["box", "sphere", "circle"] as const, "box"), size: vector3(value.size, "Çarpıştırıcı boyutu", { x: 1, y: 1, z: 1 }), radius: finiteNumber(value.radius, "Çarpıştırıcı yarıçapı", 0.5, 0.0001, 1_000_000), offset: vector3(value.offset, "Çarpıştırıcı ofseti", { x: 0, y: 0, z: 0 }), isTrigger: booleanValue(value.isTrigger, "Tetikleyici", false) };
    }
    const language = readScriptLanguage(value.language);
    const fileName = normalizeScriptName(value.fileName, language);
    const source = normalizeScriptContent(value.source, language, fileName);
    const entryClass = value.entryClass === null || value.entryClass === undefined ? null : readText(value.entryClass, "Giriş sınıfı", 100, { required: true })!;
    if (value.sourceKind !== undefined && value.sourceKind !== "plain-text") throw new GameApiError(400, "Betik kaynak türü desteklenmiyor.");
    if (value.executionPolicy !== undefined && value.executionPolicy !== "external-toolchain-required") throw new GameApiError(400, "Betik yürütme politikası değiştirilemez.");
    if (value.compileState !== undefined && value.compileState !== "not-compiled") throw new GameApiError(400, "Derleme durumu sunucu doğrulaması olmadan değiştirilemez.");
    return { ...base, type, language, fileName, entryClass, source, sourceKind: "plain-text", executionPolicy: "external-toolchain-required", compileState: "not-compiled" };
}

function normalizeObject(value: unknown, index: number): SceneObject {
    if (!isRecord(value)) throw new GameApiError(400, "Her sahne nesnesi bir JSON nesnesi olmalıdır.");
    const id = readIdentifier(value.id, `Nesne ${index + 1}`);
    const name = readText(value.name, `Nesne ${index + 1} adı`, 100, { required: true })!;
    const legacyTransform = isRecord(value.transform) ? value.transform : null;
    const rawComponents = Array.isArray(value.components) ? [...value.components] : [];
    if (!rawComponents.some((component) => isRecord(component) && component.type === "transform")) {
        rawComponents.unshift({ id: `transform-${id}`.slice(0, 64), type: "transform", enabled: true, position: legacyTransform?.position, rotation: legacyTransform?.rotation, scale: legacyTransform?.scale });
    }
    if (rawComponents.length > 32) throw new GameApiError(413, "Bir nesne en fazla 32 bileşen içerebilir.");
    const components = rawComponents.map(normalizeComponent);
    const componentIds = new Set<string>();
    let transformCount = 0;
    for (const component of components) {
        if (componentIds.has(component.id)) throw new GameApiError(400, "Bir nesnede yinelenen bileşen kimliği var.");
        componentIds.add(component.id);
        if (component.type === "transform") transformCount += 1;
    }
    if (transformCount !== 1) throw new GameApiError(400, "Her sahne nesnesi tam olarak bir Transform bileşeni içermelidir.");
    const legacyParent = legacyTransform?.parentId;
    const parentId = value.parentId === null || value.parentId === undefined
        ? (legacyParent === null || legacyParent === undefined ? null : readIdentifier(legacyParent, "Üst nesne"))
        : readIdentifier(value.parentId, "Üst nesne");
    return { id, name, parentId, active: booleanValue(value.active, "Nesne etkinliği", true), components };
}

function normalizeIso(value: unknown, field: string, fallback: string) {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new GameApiError(400, `${field} geçerli bir tarih olmalıdır.`);
    return new Date(value).toISOString();
}

export function normalizeScene(value: unknown, expectedDimension: GameDimension): SceneDocument {
    if (!isRecord(value)) throw new GameApiError(400, "Sahne verisi bir JSON nesnesi olmalıdır.");
    assertSafeJson(value);
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_SCENE_BYTES) throw new GameApiError(413, "Sahne verisi 512 KB sınırını aşıyor.");
    const source: Record<string, unknown> = Array.isArray(value.entities)
        ? { ...value, version: value.version ?? value.schemaVersion, objects: value.entities }
        : value;
    if (source.version !== 1) throw new GameApiError(400, "Desteklenmeyen sahne şema sürümü.");
    const dimension = readDimension(source.dimension);
    if (dimension !== expectedDimension) throw new GameApiError(400, "Sahne boyutu proje boyutuyla eşleşmelidir.");
    if (!Array.isArray(source.objects)) throw new GameApiError(400, "Sahne nesneleri bir dizi olmalıdır.");
    if (source.objects.length > 500) throw new GameApiError(413, "Bir sahne en fazla 500 nesne içerebilir.");
    const objects = source.objects.map(normalizeObject);
    const ids = new Set<string>();
    for (const object of objects) {
        if (ids.has(object.id)) throw new GameApiError(400, "Sahnede yinelenen nesne kimliği var.");
        ids.add(object.id);
    }
    const parentById = new Map(objects.map((object) => [object.id, object.parentId]));
    for (const object of objects) {
        if (object.parentId && (!ids.has(object.parentId) || object.parentId === object.id)) throw new GameApiError(400, "Sahnede geçersiz üst nesne bağlantısı var.");
        const visited = new Set([object.id]);
        let parentId = object.parentId;
        while (parentId) {
            if (visited.has(parentId)) throw new GameApiError(400, "Sahne nesne ağacında döngü var.");
            visited.add(parentId);
            parentId = parentById.get(parentId) || null;
        }
    }
    const settings = isRecord(source.settings) ? source.settings : {};
    const physics = isRecord(settings.physics) ? settings.physics : settings;
    const worldBounds = isRecord(physics.worldBounds) ? physics.worldBounds : {};
    const metadata = isRecord(source.metadata) ? source.metadata : {};
    const now = new Date().toISOString();
    const normalized: SceneDocument = {
        version: 1,
        id: source.id === undefined ? "main-scene" : readIdentifier(source.id, "Sahne"),
        name: source.name === undefined ? "Main Scene" : readText(source.name, "Sahne adı", 100, { required: true })!,
        dimension,
        objects,
        settings: {
            backgroundColor: color(settings.backgroundColor, "Arka plan rengi", dimension === "2d" ? "#111827" : "#0f172a"),
            ambientLight: finiteNumber(settings.ambientLight, "Ortam ışığı", 0.4, 0, 10),
            physics: {
                gravity: vector3(physics.gravity, "Yerçekimi", { x: 0, y: -9.81, z: 0 }),
                fixedTimeStep: finiteNumber(physics.fixedTimeStep, "Fizik zaman adımı", 1 / 60, 1 / 1000, 1),
                maxSubSteps: integer(physics.maxSubSteps, "Fizik alt adımları", 4, 1, 32),
                worldBounds: {
                    enabled: booleanValue(worldBounds.enabled, "Dünya sınırları", false),
                    min: vector3(worldBounds.min, "Dünya alt sınırı", { x: -100, y: -100, z: -100 }),
                    max: vector3(worldBounds.max, "Dünya üst sınırı", { x: 100, y: 100, z: 100 }),
                },
            },
        },
        metadata: {
            createdAt: normalizeIso(metadata.createdAt, "Sahne oluşturma zamanı", now),
            updatedAt: normalizeIso(metadata.updatedAt, "Sahne güncelleme zamanı", now),
            templateId: nullableIdentifier(metadata.templateId, "Şablon"),
        },
    };
    if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > MAX_SCENE_BYTES) throw new GameApiError(413, "Normalize edilmiş sahne 512 KB sınırını aşıyor.");
    return normalized;
}

function transform(id: string, position: Vector3, rotation: Vector3 = { x: 0, y: 0, z: 0 }, scale: Vector3 = { x: 1, y: 1, z: 1 }): Component {
    return { id: `transform-${id}`.slice(0, 64), type: "transform", enabled: true, position, rotation, scale };
}

export function defaultScene(dimension: GameDimension): SceneDocument {
    const now = new Date().toISOString();
    const cameraPosition = dimension === "2d" ? { x: 0, y: 0, z: -10 } : { x: 5, y: 4, z: -7 };
    const objects: SceneObject[] = [{
        id: "main-camera",
        name: "Main Camera",
        parentId: null,
        active: true,
        components: [
            transform("main-camera", cameraPosition),
            { id: "camera-main", type: "camera", enabled: true, projection: dimension === "2d" ? "orthographic" : "perspective", fieldOfView: 60, orthographicSize: 5, nearClip: 0.1, farClip: 1000, clearColor: dimension === "2d" ? "#111827" : "#0f172a", primary: true },
        ],
    }];
    if (dimension === "3d") {
        objects.push({
            id: "directional-light",
            name: "Directional Light",
            parentId: null,
            active: true,
            components: [
                transform("directional-light", { x: 2, y: 4, z: -2 }, { x: 50, y: -30, z: 0 }),
                { id: "light-main", type: "light", enabled: true, lightType: "directional", color: "#ffffff", intensity: 1, range: 20, spotAngle: 30, castShadows: true },
            ],
        });
        objects.push({
            id: "starter-cube",
            name: "Cube",
            parentId: null,
            active: true,
            components: [
                transform("starter-cube", { x: 0, y: 0, z: 0 }),
                { id: "mesh-starter-cube", type: "meshRenderer", enabled: true, mesh: { kind: "primitive", primitive: "cube" }, material: { color: "#3b82f6", metallic: 0.08, roughness: 0.58, opacity: 1, textureAssetId: null }, castShadows: true, receiveShadows: true },
                { id: "collider-starter-cube", type: "collider", enabled: true, shape: "box", size: { x: 1, y: 1, z: 1 }, radius: 0.5, offset: { x: 0, y: 0, z: 0 }, isTrigger: false },
            ],
        });
        objects.push({
            id: "starter-plane",
            name: "Plane",
            parentId: null,
            active: true,
            components: [
                transform("starter-plane", { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 8, y: 1, z: 8 }),
                { id: "mesh-starter-plane", type: "meshRenderer", enabled: true, mesh: { kind: "primitive", primitive: "plane" }, material: { color: "#334155", metallic: 0, roughness: 0.8, opacity: 1, textureAssetId: null }, castShadows: false, receiveShadows: true },
            ],
        });
    } else {
        objects.push({
            id: "starter-sprite",
            name: "Sprite",
            parentId: null,
            active: true,
            components: [
                transform("starter-sprite", { x: 0, y: 0, z: 0 }),
                { id: "sprite-starter", type: "spriteRenderer", enabled: true, assetId: null, color: "#3b82f6", opacity: 1, pixelsPerUnit: 100, sortingLayer: 0, flipX: false, flipY: false },
                { id: "collider-starter-sprite", type: "collider", enabled: true, shape: "box", size: { x: 1, y: 1, z: 1 }, radius: 0.5, offset: { x: 0, y: 0, z: 0 }, isTrigger: false },
            ],
        });
    }
    return {
        version: 1,
        id: "main-scene",
        name: "Main Scene",
        dimension,
        objects,
        settings: {
            backgroundColor: dimension === "2d" ? "#111827" : "#0f172a",
            ambientLight: 0.4,
            physics: {
                gravity: { x: 0, y: -9.81, z: 0 },
                fixedTimeStep: 1 / 60,
                maxSubSteps: 4,
                worldBounds: { enabled: false, min: { x: -100, y: -100, z: -100 }, max: { x: 100, y: 100, z: 100 } },
            },
        },
        metadata: { createdAt: now, updatedAt: now, templateId: null },
    };
}

export function serializeProject(record: GameProjectRecord, id: string, includeScene: boolean) {
    const dimension = record.dimension === "2d" ? "2d" : "3d";
    const createdAt = String(record.createdAt || "");
    const updatedAt = String(record.updatedAt || createdAt);
    const scene = normalizeScene(record.scene || defaultScene(dimension), dimension);
    return {
        version: 1,
        id,
        name: record.name || "Oyun Projesi",
        description: record.description || "",
        dimension,
        activeSceneId: scene.id,
        supportedScriptLanguages: ["csharp", "cpp"] as const,
        metadata: { createdAt, updatedAt },
        scriptCount: Number(record.scriptCount || 0),
        objectCount: scene.objects.length,
        ...(includeScene ? { scene, scenes: [scene] } : {}),
        createdAt,
        updatedAt,
        revision: record._updateTime || null,
    };
}

export function serializeScript(record: GameScriptRecord, id: string) {
    return {
        id,
        name: record.name || "Script.cs",
        language: record.language === "cpp" ? "cpp" : "csharp",
        content: record.content || "",
        enabled: record.enabled !== false,
        attachedObjectIds: Array.isArray(record.attachedObjectIds) ? record.attachedObjectIds : [],
        compilerTarget: record.compilerTarget || (record.language === "cpp" ? "c++20" : "dotnet-8"),
        sourceKind: "plain-text",
        executionPolicy: "external-toolchain-required",
        compileState: "not-compiled",
        order: Number(record.order || 0),
        createdAt: record.createdAt || null,
        updatedAt: record.updatedAt || null,
        revision: record._updateTime || null,
    };
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
    if (requested && requested !== record._updateTime) throw new GameApiError(409, "Kaynak başka bir oturumda değişti. Güncel veriyi yükleyin.");
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

export function normalizeScriptContent(value: unknown, language: GameScriptLanguage, name: string) {
    if (value === undefined) return defaultScriptContent(language, name);
    if (typeof value !== "string" || value.includes("\0")) throw new GameApiError(400, "Betik içeriği geçersiz.");
    if (Buffer.byteLength(value, "utf8") > MAX_SCRIPT_BYTES) throw new GameApiError(413, "Betik içeriği 160 KB sınırını aşıyor.");
    return value;
}

export function normalizeAttachedObjectIds(value: unknown, scene: SceneDocument) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 32) throw new GameApiError(400, "Betik en fazla 32 nesneye bağlanabilir.");
    const knownObjects = new Set(scene.objects.map((object) => object.id));
    const ids = [...new Set(value.map((id) => readIdentifier(id, "Bağlı nesne")))];
    if (ids.some((id) => !knownObjects.has(id))) throw new GameApiError(400, "Betik bilinmeyen bir sahne nesnesine bağlanamaz.");
    return ids;
}

export function defaultScriptContent(language: GameScriptLanguage, name: string) {
    const className = name.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_]/g, "_").replace(/^[^A-Za-z_]/, "Script_") || "GameScript";
    return language === "csharp"
        ? `using Hanogt.Engine;\n\npublic class ${className} : Behaviour\n{\n    public override void Start()\n    {\n    }\n\n    public override void Update(float deltaTime)\n    {\n    }\n}\n`
        : `#include <hanogt/Behaviour.hpp>\n\nclass ${className} final : public hanogt::Behaviour {\npublic:\n    void start() override {\n    }\n\n    void update(float deltaTime) override {\n        (void)deltaTime;\n    }\n};\n`;
}
