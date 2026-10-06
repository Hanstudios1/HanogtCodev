/**
 * Shared, dependency-free normaliser for Hanogt Engine documents.
 *
 * It is used by the browser editor (imports, local drafts), by the server API
 * before anything is persisted and by the Arcade before a published game is
 * played. It accepts schema v1 and v2 documents (and the legacy API shape) and
 * always returns a complete, clamped schema v3 document. Migration is additive:
 * every v2 field is kept and the V3 fields get their defaults. Unknown keys are
 * dropped so untrusted input cannot smuggle extra data into storage.
 */
import { defaultTilePalette } from "./components";
import { createEngineId, isEngineId, nowIso } from "./ids";
import { ACTION_NAME, normalizeInputSettings } from "./input-actions";
import { isKeyCode } from "./key-codes";
import { isTileKey, TILEMAP_LIMITS } from "./tilemap";
import {
    ANIMATION_PROPERTIES,
    ANIMATION_WRAP_MODES,
    EASINGS,
    GAME_ENGINE_SCHEMA_VERSION,
    INPUT_CONTENT_TYPES,
    PRIMITIVE_MESHES,
    PROGRESS_DIRECTIONS,
    SOUND_PRESETS,
    SPRITE_SHAPES,
    TOGGLE_STYLES,
    UI_ANCHORS,
    UNIQUE_COMPONENT_TYPES,
    type AnimationClip,
    type AnimationKey,
    type AnimationProperty,
    type AnimationTrack,
    type AnimationValue,
    type ColliderComponent,
    type GameComponent,
    type GameDimension,
    type GameEntity,
    type GameProjectDocument,
    type PrefabAsset,
    type ProjectSettings,
    type SceneDocument,
    type SceneSettings,
    type ScriptAsset,
    type ScriptFieldValue,
    type ScriptLanguage,
    type TextureAsset,
    type TileDefinition,
    type TilemapComponent,
    type UIRectFields,
    type Vector2,
    type Vector3,
} from "./types";

export const ENGINE_LIMITS = {
    maxScenes: 24,
    maxEntitiesPerScene: 1000,
    maxComponentsPerEntity: 32,
    maxPrefabs: 120,
    maxPrefabEntities: 200,
    maxTextures: 40,
    maxTextureDataUrlLength: 360_000,
    maxScripts: 64,
    maxScriptBytes: 160 * 1024,
    /** Scenes + prefabs + textures + settings, serialised. Firestore documents cap at 1 MiB. */
    maxContentBytes: 900 * 1024,
    maxNameLength: 80,
    maxUiTextLength: 2000,
    maxTagLength: 40,
    maxFieldStringLength: 500,
    maxScriptFields: 64,
    maxHierarchyDepth: 64,
    maxUiLabelLength: 200,
    maxTilemapColumns: TILEMAP_LIMITS.maxColumns,
    maxTilemapRows: TILEMAP_LIMITS.maxRows,
    maxPaletteTiles: TILEMAP_LIMITS.maxPalette,
    maxAnimationClips: 16,
    maxAnimationTracks: 12,
    maxAnimationKeys: 120,
} as const;

export class SchemaError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SchemaError";
    }
}

type AnyRecord = Record<string, unknown>;

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const DATA_URL = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;

function isRecord(value: unknown): value is AnyRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rec(value: unknown): AnyRecord {
    return isRecord(value) ? value : {};
}

function str(value: unknown, fallback: string, max = 200): string {
    if (typeof value !== "string") return fallback;
    // Strip control characters except newlines/tabs; they break rendering and logs.
    const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
    return cleaned ? cleaned.slice(0, max) : fallback;
}

function text(value: unknown, fallback: string, max: number): string {
    if (typeof value !== "string") return fallback;
    return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, max);
}

function num(value: unknown, fallback: number, min = -1_000_000, max = 1_000_000): number {
    const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function int(value: unknown, fallback: number, min: number, max: number): number {
    return Math.round(num(value, fallback, min, max));
}

function bool(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
}

export function normalizeColor(value: unknown, fallback: string): string {
    if (typeof value !== "string" || !HEX_COLOR.test(value.trim())) return fallback;
    const trimmed = value.trim().toLowerCase();
    if (trimmed.length === 4) return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
    return trimmed;
}

function nullableColor(value: unknown): string | null {
    return typeof value === "string" && HEX_COLOR.test(value.trim()) ? normalizeColor(value, "#000000") : null;
}

function enumOf<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
    return typeof value === "string" && (values as readonly string[]).includes(value) ? value as T : fallback;
}

function vec3(value: unknown, fallback: Vector3, min = -1_000_000, max = 1_000_000): Vector3 {
    const source = rec(value);
    return {
        x: num(source.x, fallback.x, min, max),
        y: num(source.y, fallback.y, min, max),
        z: num(source.z, fallback.z, min, max),
    };
}

function vec2(value: unknown, fallback: Vector2, min = -100_000, max = 100_000): Vector2 {
    const source = rec(value);
    return { x: num(source.x, fallback.x, min, max), y: num(source.y, fallback.y, min, max) };
}

function idOr(value: unknown, prefix: string): string {
    return isEngineId(value) ? value : createEngineId(prefix);
}

function refId(value: unknown): string | null {
    return isEngineId(value) ? value : null;
}

function iso(value: unknown, fallback: string): string {
    if (typeof value === "string" && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
    return fallback;
}

function assertSafeTree(value: unknown) {
    let nodes = 0;
    const visit = (current: unknown, depth: number) => {
        nodes += 1;
        if (nodes > 400_000) throw new SchemaError("Proje yapısı çok karmaşık.");
        if (depth > 40) throw new SchemaError("Proje yapısı çok derin.");
        if (Array.isArray(current)) {
            if (current.length > 20_000) throw new SchemaError("Projedeki bir liste çok büyük.");
            for (const item of current) visit(item, depth + 1);
            return;
        }
        if (!isRecord(current)) return;
        for (const key of Object.keys(current)) {
            if (FORBIDDEN_KEYS.has(key)) throw new SchemaError("Proje güvenli olmayan bir alan adı içeriyor.");
            visit(current[key], depth + 1);
        }
    };
    visit(value, 0);
}

// ---------------------------------------------------------------------------
// V3 component helpers
// ---------------------------------------------------------------------------

function uiRectFields(source: AnyRecord, defaults: UIRectFields): UIRectFields {
    return {
        anchor: enumOf(source.anchor, UI_ANCHORS, defaults.anchor),
        offset: vec2(source.offset, defaults.offset),
        width: num(source.width, defaults.width, 0, 4000),
        height: num(source.height, defaults.height, 0, 4000),
        order: int(source.order, defaults.order, -1000, 1000),
    };
}

function normalizeTilemap(source: AnyRecord, id: string, enabled: boolean): TilemapComponent {
    const palette: TileDefinition[] = [];
    if (Array.isArray(source.palette)) {
        const keys = new Set<string>();
        for (const raw of source.palette.slice(0, ENGINE_LIMITS.maxPaletteTiles * 2)) {
            const tile = rec(raw);
            if (!isTileKey(tile.key) || keys.has(tile.key)) continue;
            keys.add(tile.key);
            palette.push({
                key: tile.key,
                name: str(tile.name, `Tile ${palette.length + 1}`, 40),
                color: normalizeColor(tile.color, "#94a3b8"),
                solid: bool(tile.solid, true),
                frame: int(tile.frame, -1, -1, 4095),
            });
            if (palette.length >= ENGINE_LIMITS.maxPaletteTiles) break;
        }
    } else {
        palette.push(...defaultTilePalette());
    }
    const keys = new Set(palette.map((tile) => tile.key));
    let width = 0;
    const cleaned = (Array.isArray(source.rows) ? source.rows.slice(0, ENGINE_LIMITS.maxTilemapRows) : []).map((row) => {
        let output = "";
        // Cells that are not palette keys become empty so rows and palette always agree.
        for (const char of typeof row === "string" ? row.slice(0, ENGINE_LIMITS.maxTilemapColumns) : "") output += keys.has(char) ? char : ".";
        width = Math.max(width, output.length);
        return output;
    });
    const origin = rec(source.origin);
    const atlas = rec(source.atlas);
    return {
        id,
        type: "tilemap",
        enabled,
        cellSize: num(source.cellSize, 1, 0.05, 100),
        origin: { x: int(origin.x, 0, -100_000, 100_000), y: int(origin.y, 0, -100_000, 100_000) },
        rows: width ? cleaned.map((row) => row.padEnd(width, ".")) : [],
        palette,
        atlas: { textureId: refId(atlas.textureId), columns: int(atlas.columns, 1, 1, 64), rows: int(atlas.rows, 1, 1, 64) },
        sortingLayer: int(source.sortingLayer, 0, -1000, 1000),
        isTrigger: bool(source.isTrigger, false),
        friction: num(source.friction, 0.4, 0, 2),
        bounciness: num(source.bounciness, 0, 0, 1),
    };
}

function animationValue(property: AnimationProperty, value: unknown): AnimationValue {
    switch (property) {
        case "position": return vec3(value, { x: 0, y: 0, z: 0 }, -100_000, 100_000);
        case "rotation": return vec3(value, { x: 0, y: 0, z: 0 }, -360_000, 360_000);
        case "scale": return vec3(value, { x: 1, y: 1, z: 1 }, -10_000, 10_000);
        case "color": return normalizeColor(value, "#ffffff");
        case "opacity": return num(value, 1, 0, 1);
        case "frame": return int(value, 0, 0, 4095);
    }
}

function normalizeAnimationClips(value: unknown): AnimationClip[] {
    const clips: AnimationClip[] = [];
    const names = new Set<string>();
    for (const raw of Array.isArray(value) ? value.slice(0, ENGINE_LIMITS.maxAnimationClips) : []) {
        const source = rec(raw);
        const duration = num(source.duration, 1, 0.01, 600);
        const base = str(source.name, "Clip", 40);
        let name = base;
        for (let index = 2; names.has(name); index += 1) name = `${base.slice(0, 36)} ${index}`;
        names.add(name);
        const tracks: AnimationTrack[] = [];
        for (const rawTrack of Array.isArray(source.tracks) ? source.tracks.slice(0, ENGINE_LIMITS.maxAnimationTracks) : []) {
            const track = rec(rawTrack);
            if (typeof track.property !== "string" || !(ANIMATION_PROPERTIES as readonly string[]).includes(track.property)) continue;
            const property = track.property as AnimationProperty;
            const keys: AnimationKey[] = (Array.isArray(track.keys) ? track.keys.slice(0, ENGINE_LIMITS.maxAnimationKeys) : []).map((rawKey) => {
                const key = rec(rawKey);
                return { time: num(key.time, 0, 0, duration), value: animationValue(property, key.value), easing: enumOf(key.easing, EASINGS, "linear") };
            });
            keys.sort((a, b) => a.time - b.time);
            tracks.push({ property, keys });
        }
        clips.push({ name, duration, wrap: enumOf(source.wrap, ANIMATION_WRAP_MODES, "once"), tracks });
    }
    return clips;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

type MigrationContext = {
    /** Script assets recovered from schema v1 components that embedded their source. */
    recoveredScripts: Map<string, ScriptAsset>;
    /** v1 kept restitution on the rigidbody; v2 keeps bounciness on the collider. */
    pendingBounciness?: number;
    /** Dimension of the project (component defaults differ in 2D and 3D). */
    dimension?: GameDimension;
};

function normalizeScriptFields(value: unknown): Record<string, ScriptFieldValue> {
    const output: Record<string, ScriptFieldValue> = {};
    let count = 0;
    for (const [key, raw] of Object.entries(rec(value))) {
        if (!FIELD_NAME.test(key) || count >= ENGINE_LIMITS.maxScriptFields) continue;
        let normalized: ScriptFieldValue | undefined;
        if (raw === null) normalized = null;
        else if (typeof raw === "number") normalized = Number.isFinite(raw) ? Math.min(1e9, Math.max(-1e9, raw)) : undefined;
        else if (typeof raw === "boolean") normalized = raw;
        else if (typeof raw === "string") normalized = text(raw, "", ENGINE_LIMITS.maxFieldStringLength);
        else if (isRecord(raw) && (raw.ref === "entity" || raw.ref === "prefab")) normalized = { ref: raw.ref, id: refId(raw.id) };
        else if (isRecord(raw) && "x" in raw && "y" in raw) normalized = vec3(raw, { x: 0, y: 0, z: 0 });
        if (normalized === undefined) continue;
        output[key] = normalized;
        count += 1;
    }
    return output;
}

function scriptLanguage(value: unknown): ScriptLanguage | null {
    return value === "csharp" || value === "cpp" ? value : null;
}

export function normalizeScriptName(value: unknown, language: ScriptLanguage): string {
    const extension = language === "csharp" ? ".cs" : ".cpp";
    let name = str(value, `NewScript${extension}`, 100).replace(/[\\/]/g, "_").replace(/^\.+/, "");
    name = name.replace(/[^\p{L}\p{N} _.-]/gu, "_");
    const lower = name.toLowerCase();
    const valid = language === "csharp" ? lower.endsWith(".cs") : [".cpp", ".cc", ".cxx", ".h", ".hpp"].some((ext) => lower.endsWith(ext));
    if (!valid) name = `${name.replace(/\.[^.]*$/, "") || "NewScript"}${extension}`;
    return name.slice(0, 100);
}

export function normalizeScriptAsset(value: unknown): ScriptAsset | null {
    const source = rec(value);
    const language = scriptLanguage(source.language);
    if (!language) return null;
    const content = typeof source.content === "string" ? source.content.replace(/\0/g, "") : "";
    if (new TextEncoder().encode(content).byteLength > ENGINE_LIMITS.maxScriptBytes) {
        throw new SchemaError(`Bir script ${Math.round(ENGINE_LIMITS.maxScriptBytes / 1024)} KB sınırını aşıyor.`);
    }
    return {
        id: idOr(source.id, "script"),
        name: normalizeScriptName(source.name, language),
        language,
        content,
    };
}

function normalizeComponent(value: unknown, context: MigrationContext): GameComponent | null {
    const source = rec(value);
    const type = source.type;
    const id = idOr(source.id, "cmp");
    const enabled = bool(source.enabled, true);

    switch (type) {
        case "transform":
            return {
                id,
                type,
                enabled: true,
                position: vec3(source.position, { x: 0, y: 0, z: 0 }),
                rotation: vec3(source.rotation, { x: 0, y: 0, z: 0 }, -360_000, 360_000),
                scale: vec3(source.scale, { x: 1, y: 1, z: 1 }, -10_000, 10_000),
            };
        case "spriteRenderer":
            return {
                id,
                type,
                enabled,
                shape: enumOf(source.shape, SPRITE_SHAPES, "square"),
                textureId: refId(source.textureId),
                color: normalizeColor(source.color, "#ffffff"),
                opacity: num(source.opacity, 1, 0, 1),
                sortingLayer: int(source.sortingLayer, 0, -1000, 1000),
                flipX: bool(source.flipX, false),
                flipY: bool(source.flipY, false),
                sheet: { columns: int(rec(source.sheet).columns, 1, 1, 64), rows: int(rec(source.sheet).rows, 1, 1, 64) },
                frame: int(source.frame, 0, 0, 4095),
            };
        case "meshRenderer": {
            const legacyMesh = rec(source.mesh);
            const meshValue = typeof source.mesh === "string" ? source.mesh : legacyMesh.primitive;
            const material = rec(source.material);
            return {
                id,
                type,
                enabled,
                mesh: enumOf(meshValue, PRIMITIVE_MESHES, "cube"),
                material: {
                    color: normalizeColor(material.color, "#ffffff"),
                    metallic: num(material.metallic, 0.05, 0, 1),
                    roughness: num(material.roughness, 0.6, 0, 1),
                    emissive: normalizeColor(material.emissive, "#000000"),
                    emissiveIntensity: num(material.emissiveIntensity, 0, 0, 20),
                    opacity: num(material.opacity, 1, 0, 1),
                    textureId: refId(material.textureId ?? material.textureAssetId),
                    tiling: num(material.tiling, 1, 0.01, 100),
                    wireframe: bool(material.wireframe, false),
                    flatShading: bool(material.flatShading, false),
                },
                castShadows: bool(source.castShadows, true),
                receiveShadows: bool(source.receiveShadows, true),
            };
        }
        case "camera":
            return {
                id,
                type,
                enabled,
                projection: enumOf(source.projection, ["perspective", "orthographic"] as const, "perspective"),
                fieldOfView: num(source.fieldOfView, 60, 5, 170),
                orthographicSize: num(source.orthographicSize, 5, 0.1, 10_000),
                nearClip: num(source.nearClip, 0.1, 0.001, 1000),
                farClip: num(source.farClip, 1000, 1, 100_000),
                backgroundColor: nullableColor(source.backgroundColor),
                primary: bool(source.primary, true),
            };
        case "light":
            return {
                id,
                type,
                enabled,
                lightType: enumOf(source.lightType, ["directional", "point", "spot"] as const, "directional"),
                color: normalizeColor(source.color, "#ffffff"),
                intensity: num(source.intensity, 1, 0, 100),
                range: num(source.range, 12, 0, 10_000),
                spotAngle: num(source.spotAngle, 45, 1, 179),
                castShadows: bool(source.castShadows, true),
            };
        case "rigidBody": {
            if (typeof source.restitution === "number" && context.pendingBounciness === undefined) {
                context.pendingBounciness = num(source.restitution, 0, 0, 1);
            }
            const freeze = rec(source.freezePosition);
            return {
                id,
                type,
                enabled,
                bodyType: enumOf(source.bodyType, ["dynamic", "kinematic", "static"] as const, "dynamic"),
                mass: num(source.mass, 1, 0.001, 100_000),
                useGravity: bool(source.useGravity, true),
                gravityScale: num(source.gravityScale, 1, -100, 100),
                linearDamping: num(source.linearDamping, 0.05, 0, 100),
                angularDamping: num(source.angularDamping, 0.05, 0, 100),
                velocity: vec3(source.velocity, { x: 0, y: 0, z: 0 }, -10_000, 10_000),
                angularVelocity: vec3(source.angularVelocity, { x: 0, y: 0, z: 0 }, -100_000, 100_000),
                freezePosition: { x: bool(freeze.x, false), y: bool(freeze.y, false), z: bool(freeze.z, false) },
                freezeRotation: bool(source.freezeRotation, true),
            };
        }
        case "collider":
            return {
                id,
                type,
                enabled,
                shape: enumOf(source.shape, ["box", "sphere", "circle"] as const, "box"),
                size: vec3(source.size, { x: 1, y: 1, z: 1 }, 0.001, 100_000),
                radius: num(source.radius, 0.5, 0.001, 100_000),
                offset: vec3(source.offset, { x: 0, y: 0, z: 0 }),
                isTrigger: bool(source.isTrigger, false),
                friction: num(source.friction, 0.4, 0, 2),
                bounciness: num(source.bounciness, 0, 0, 1),
            };
        case "script": {
            // Schema v1 embedded the source inside the component.
            if (typeof source.source === "string" && !isEngineId(source.scriptId)) {
                const language = scriptLanguage(source.language) ?? "csharp";
                if (!context.recoveredScripts.has(id)) {
                    const asset = normalizeScriptAsset({ id, name: source.fileName, language, content: source.source });
                    if (asset) context.recoveredScripts.set(asset.id, asset);
                }
                return { id, type, enabled, scriptId: id, className: typeof source.entryClass === "string" ? str(source.entryClass, "", 100) || null : null, fields: {} };
            }
            const scriptId = refId(source.scriptId);
            if (!scriptId) return null;
            return {
                id,
                type,
                enabled,
                scriptId,
                className: typeof source.className === "string" ? (str(source.className, "", 100) || null) : null,
                fields: normalizeScriptFields(source.fields),
            };
        }
        case "particleSystem":
            return {
                id,
                type,
                enabled,
                playOnStart: bool(source.playOnStart, true),
                loop: bool(source.loop, true),
                duration: num(source.duration, 2, 0.05, 600),
                emissionRate: num(source.emissionRate, 24, 0, 2000),
                burstCount: int(source.burstCount, 0, 0, 2000),
                maxParticles: int(source.maxParticles, 300, 1, 4000),
                lifetime: num(source.lifetime, 1.4, 0.05, 60),
                startSpeed: num(source.startSpeed, 3, -1000, 1000),
                spread: num(source.spread, 25, 0, 180),
                startSize: num(source.startSize, 0.3, 0, 100),
                endSize: num(source.endSize, 0.05, 0, 100),
                startColor: normalizeColor(source.startColor, "#fde68a"),
                endColor: normalizeColor(source.endColor, "#f97316"),
                gravityModifier: num(source.gravityModifier, 0, -50, 50),
                worldSpace: bool(source.worldSpace, true),
            };
        case "audioSource":
            return {
                id,
                type,
                enabled,
                clip: enumOf(source.clip, SOUND_PRESETS, "coin"),
                volume: num(source.volume, 0.8, 0, 1),
                pitch: num(source.pitch, 1, 0.1, 4),
                playOnStart: bool(source.playOnStart, false),
            };
        case "uiText":
            return {
                id,
                type,
                enabled,
                text: text(source.text, "", ENGINE_LIMITS.maxUiTextLength),
                fontSize: num(source.fontSize, 28, 6, 200),
                color: normalizeColor(source.color, "#ffffff"),
                anchor: enumOf(source.anchor, UI_ANCHORS, "top-left"),
                offset: vec2(source.offset, { x: 24, y: 24 }),
                bold: bool(source.bold, true),
                shadow: bool(source.shadow, true),
                order: int(source.order, 0, -1000, 1000),
            };
        case "uiButton": {
            const click = rec(source.onClick);
            return {
                id,
                type,
                enabled,
                text: text(source.text, "", ENGINE_LIMITS.maxUiLabelLength),
                fontSize: num(source.fontSize, 22, 6, 120),
                textColor: normalizeColor(source.textColor, "#ffffff"),
                color: normalizeColor(source.color, "#6366f1"),
                cornerRadius: num(source.cornerRadius, 14, 0, 200),
                ...uiRectFields(source, { anchor: "center", offset: { x: 0, y: 0 }, width: 200, height: 56, order: 10 }),
                interactable: bool(source.interactable, true),
                onClick: {
                    targetId: refId(click.targetId),
                    method: typeof click.method === "string" && FIELD_NAME.test(click.method) ? click.method : "",
                },
                hotkey: isKeyCode(source.hotkey) ? source.hotkey : "None",
            };
        }
        case "uiPanel":
            return {
                id,
                type,
                enabled,
                color: normalizeColor(source.color, "#0f172a"),
                opacity: num(source.opacity, 0.85, 0, 1),
                textureId: refId(source.textureId),
                cornerRadius: num(source.cornerRadius, 18, 0, 200),
                ...uiRectFields(source, { anchor: "center", offset: { x: 0, y: 0 }, width: 360, height: 240, order: -10 }),
                fullScreen: bool(source.fullScreen, false),
                blocksClicks: bool(source.blocksClicks, true),
            };
        case "uiProgressBar":
            return {
                id,
                type,
                enabled,
                value: num(source.value, 0.6),
                min: num(source.min, 0),
                max: num(source.max, 1),
                fillColor: normalizeColor(source.fillColor, "#22c55e"),
                backgroundColor: normalizeColor(source.backgroundColor, "#1e293b"),
                cornerRadius: num(source.cornerRadius, 8, 0, 200),
                direction: enumOf(source.direction, PROGRESS_DIRECTIONS, "leftToRight"),
                showLabel: bool(source.showLabel, false),
                ...uiRectFields(source, { anchor: "top", offset: { x: 0, y: 24 }, width: 260, height: 22, order: 0 }),
            };
        case "tilemap":
            return normalizeTilemap(source, id, enabled);
        case "animation": {
            const clips = normalizeAnimationClips(source.clips);
            const defaultClip = typeof source.defaultClip === "string" && clips.some((clip) => clip.name === source.defaultClip) ? source.defaultClip : null;
            return {
                id,
                type,
                enabled,
                clips,
                defaultClip,
                playOnStart: bool(source.playOnStart, true),
                speed: num(source.speed, 1, 0, 10),
            };
        }
        case "characterController2D":
            return {
                id,
                type,
                enabled,
                moveSpeed: num(source.moveSpeed, 7, 0, 200),
                acceleration: num(source.acceleration, 70, 0, 10_000),
                deceleration: num(source.deceleration, 60, 0, 10_000),
                airControl: num(source.airControl, 0.65, 0, 1),
                jumpHeight: num(source.jumpHeight, 3, 0, 200),
                maxJumps: int(source.maxJumps, 1, 0, 10),
                coyoteTime: num(source.coyoteTime, 0.1, 0, 1),
                jumpBuffer: num(source.jumpBuffer, 0.12, 0, 1),
                variableJump: bool(source.variableJump, true),
                fallGravity: num(source.fallGravity, 1.6, 0.1, 10),
                maxFallSpeed: num(source.maxFallSpeed, 20, 0.5, 500),
                maxSlope: num(source.maxSlope, 50, 0, 89),
                useInput: bool(source.useInput, true),
                horizontalAction: actionName(source.horizontalAction, "Horizontal"),
                jumpAction: actionName(source.jumpAction, "Jump"),
                flipSprite: bool(source.flipSprite, true),
            };
        case "cameraFollow": {
            const defaults = context.dimension === "3d" ? { offset: { x: 0, y: 4, z: -9 }, lookAhead: 0, lookAtTarget: true } : { offset: { x: 0, y: 1, z: 0 }, lookAhead: 1.5, lookAtTarget: false };
            return {
                id,
                type,
                enabled,
                targetId: refId(source.targetId),
                offset: vec3(source.offset, defaults.offset, -10_000, 10_000),
                smoothTime: num(source.smoothTime, 0.18, 0, 5),
                deadZone: vec2(source.deadZone, { x: 0.6, y: 0.8 }, 0, 1000),
                lookAhead: num(source.lookAhead, defaults.lookAhead, 0, 100),
                followX: bool(source.followX, true),
                followY: bool(source.followY, true),
                useBounds: bool(source.useBounds, false),
                boundsMin: vec2(source.boundsMin, { x: -20, y: -10 }),
                boundsMax: vec2(source.boundsMax, { x: 20, y: 10 }),
                lookAtTarget: bool(source.lookAtTarget, defaults.lookAtTarget),
            };
        }
        case "navAgent2D":
            return {
                id,
                type,
                enabled,
                speed: num(source.speed, 3.5, 0, 200),
                stoppingDistance: num(source.stoppingDistance, 0.1, 0, 100),
                radius: num(source.radius, 0.3, 0, 50),
                targetId: refId(source.targetId),
                repathInterval: num(source.repathInterval, 0.4, 0.05, 10),
                flipSprite: bool(source.flipSprite, true),
                showPath: bool(source.showPath, false),
            };
        case "joint":
            return {
                id,
                type,
                enabled,
                kind: enumOf(source.kind, ["distance", "spring"] as const, "distance"),
                connectedId: refId(source.connectedId),
                anchor: vec3(source.anchor, { x: 0, y: 0, z: 0 }, -10_000, 10_000),
                connectedAnchor: vec3(source.connectedAnchor, { x: 0, y: 0, z: 0 }),
                distance: num(source.distance, 2, 0, 10_000),
                autoDistance: bool(source.autoDistance, true),
                maxDistanceOnly: bool(source.maxDistanceOnly, false),
                frequency: num(source.frequency, 2, 0.01, 60),
                dampingRatio: num(source.dampingRatio, 0.2, 0, 10),
                showLine: bool(source.showLine, true),
                lineColor: normalizeColor(source.lineColor, "#e2e8f0"),
            };
        case "uiSlider": {
            const min = num(source.min, 0, -1_000_000, 1_000_000);
            const max = num(source.max, 1, -1_000_000, 1_000_000);
            return {
                id,
                type,
                enabled,
                value: num(source.value, 0.5, Math.min(min, max), Math.max(min, max)),
                min,
                max,
                wholeNumbers: bool(source.wholeNumbers, false),
                direction: enumOf(source.direction, PROGRESS_DIRECTIONS, "leftToRight"),
                fillColor: normalizeColor(source.fillColor, "#8b5cf6"),
                backgroundColor: normalizeColor(source.backgroundColor, "#1e293b"),
                handleColor: normalizeColor(source.handleColor, "#ffffff"),
                showValue: bool(source.showValue, false),
                interactable: bool(source.interactable, true),
                onValueChanged: uiEventTarget(source.onValueChanged),
                ...uiRectFields(source, { anchor: "center", offset: { x: 0, y: 0 }, width: 260, height: 28, order: 10 }),
            };
        }
        case "uiToggle":
            return {
                id,
                type,
                enabled,
                isOn: bool(source.isOn, false),
                label: text(source.label, "", ENGINE_LIMITS.maxUiLabelLength),
                fontSize: num(source.fontSize, 20, 6, 120),
                textColor: normalizeColor(source.textColor, "#ffffff"),
                color: normalizeColor(source.color, "#334155"),
                checkColor: normalizeColor(source.checkColor, "#8b5cf6"),
                style: enumOf(source.style, TOGGLE_STYLES, "switch"),
                interactable: bool(source.interactable, true),
                onValueChanged: uiEventTarget(source.onValueChanged),
                ...uiRectFields(source, { anchor: "center", offset: { x: 0, y: 0 }, width: 220, height: 36, order: 10 }),
            };
        case "uiInputField": {
            const characterLimit = int(source.characterLimit, 40, 1, 200);
            return {
                id,
                type,
                enabled,
                text: text(source.text, "", characterLimit),
                placeholder: text(source.placeholder, "", ENGINE_LIMITS.maxUiLabelLength),
                fontSize: num(source.fontSize, 20, 6, 120),
                textColor: normalizeColor(source.textColor, "#ffffff"),
                backgroundColor: normalizeColor(source.backgroundColor, "#0f172a"),
                borderColor: normalizeColor(source.borderColor, "#475569"),
                characterLimit,
                contentType: enumOf(source.contentType, INPUT_CONTENT_TYPES, "standard"),
                interactable: bool(source.interactable, true),
                onValueChanged: uiEventTarget(source.onValueChanged),
                onEndEdit: uiEventTarget(source.onEndEdit),
                ...uiRectFields(source, { anchor: "center", offset: { x: 0, y: 0 }, width: 300, height: 48, order: 10 }),
            };
        }
        default:
            return null;
    }
}

/** Inspector event of a UI control (target object and method name). */
function uiEventTarget(value: unknown): { targetId: string | null; method: string } {
    const source = rec(value);
    return {
        targetId: refId(source.targetId),
        method: typeof source.method === "string" && FIELD_NAME.test(source.method) ? source.method : "",
    };
}

/** Input action names in components (same rule as the project's input actions). */
function actionName(value: unknown, fallback: string): string {
    return typeof value === "string" && ACTION_NAME.test(value.trim()) ? value.trim() : fallback;
}

// ---------------------------------------------------------------------------
// Entities & scenes
// ---------------------------------------------------------------------------

export function normalizeEntity(value: unknown, context: MigrationContext = { recoveredScripts: new Map() }): GameEntity {
    const source = rec(value);
    const legacyTransform = rec(source.transform);
    const rawComponents = Array.isArray(source.components) ? source.components.slice(0, ENGINE_LIMITS.maxComponentsPerEntity * 2) : [];
    context.pendingBounciness = undefined;

    const components: GameComponent[] = [];
    const seenTypes = new Set<string>();
    const seenIds = new Set<string>();
    for (const raw of rawComponents) {
        const component = normalizeComponent(raw, context);
        if (!component) continue;
        if (UNIQUE_COMPONENT_TYPES.has(component.type) && seenTypes.has(component.type)) continue;
        if (seenIds.has(component.id)) component.id = createEngineId("cmp");
        seenIds.add(component.id);
        seenTypes.add(component.type);
        components.push(component);
        if (components.length >= ENGINE_LIMITS.maxComponentsPerEntity) break;
    }

    const transform: GameComponent = components.find((component) => component.type === "transform")
        ?? normalizeComponent({
            type: "transform",
            position: legacyTransform.position,
            rotation: legacyTransform.rotation,
            scale: legacyTransform.scale,
        }, context) as GameComponent;
    const collider = components.find((component): component is ColliderComponent => component.type === "collider");
    if (collider && context.pendingBounciness !== undefined) {
        const rawCollider = rec(rawComponents.find((raw) => rec(raw).type === "collider"));
        if (rawCollider.bounciness === undefined) collider.bounciness = context.pendingBounciness;
    }

    return {
        id: idOr(source.id, "entity"),
        name: str(source.name, "GameObject", ENGINE_LIMITS.maxNameLength),
        tag: str(source.tag, "Untagged", ENGINE_LIMITS.maxTagLength),
        parentId: refId(source.parentId ?? legacyTransform.parentId),
        active: bool(source.active, true),
        components: [transform, ...components.filter((component) => component !== transform)],
    };
}

/** Removes dangling parents, cycles, duplicate ids and over-deep hierarchies (mutates). */
export function repairHierarchy(entities: GameEntity[]): GameEntity[] {
    const seen = new Set<string>();
    for (const entity of entities) {
        if (seen.has(entity.id)) entity.id = createEngineId("entity");
        seen.add(entity.id);
    }
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    for (const entity of entities) {
        if (entity.parentId && (!byId.has(entity.parentId) || entity.parentId === entity.id)) entity.parentId = null;
    }
    for (const entity of entities) {
        const visited = new Set<string>([entity.id]);
        let cursor = entity.parentId;
        let depth = 0;
        while (cursor) {
            if (visited.has(cursor) || depth > ENGINE_LIMITS.maxHierarchyDepth) {
                entity.parentId = null;
                break;
            }
            visited.add(cursor);
            cursor = byId.get(cursor)?.parentId ?? null;
            depth += 1;
        }
    }
    return entities;
}

export function defaultSceneSettings(dimension: GameDimension): SceneSettings {
    return {
        background: dimension === "2d"
            ? { mode: "solid", color: "#0f172a", topColor: "#1e293b" }
            : { mode: "gradient", color: "#cbd5e1", topColor: "#60a5fa" },
        ambientColor: "#ffffff",
        ambientIntensity: dimension === "2d" ? 1 : 0.55,
        fog: { enabled: false, mode: "linear", color: "#cbd5e1", near: 30, far: 120, density: 0.02 },
        postProcessing: {
            bloom: { enabled: false, intensity: 0.8, threshold: 0.85, radius: 0.4 },
            vignette: { enabled: false, intensity: 0.35 },
            exposure: 1,
        },
        physics: { gravity: { x: 0, y: -9.81, z: 0 }, fixedTimeStep: 1 / 60, maxSubSteps: 6 },
    };
}

function normalizeSceneSettings(value: unknown, dimension: GameDimension): SceneSettings {
    const source = rec(value);
    const defaults = defaultSceneSettings(dimension);
    const background = rec(source.background);
    const fog = rec(source.fog);
    const post = rec(source.postProcessing);
    const bloom = rec(post.bloom);
    const vignette = rec(post.vignette);
    const physics = rec(source.physics);
    const legacyBackground = typeof source.backgroundColor === "string" ? source.backgroundColor : undefined;
    return {
        background: {
            mode: enumOf(background.mode, ["solid", "gradient"] as const, legacyBackground ? "solid" : defaults.background.mode),
            color: normalizeColor(background.color ?? legacyBackground, defaults.background.color),
            topColor: normalizeColor(background.topColor, defaults.background.topColor),
        },
        ambientColor: normalizeColor(source.ambientColor, defaults.ambientColor),
        ambientIntensity: num(source.ambientIntensity ?? source.ambientLight, defaults.ambientIntensity, 0, 10),
        fog: {
            enabled: bool(fog.enabled, false),
            mode: enumOf(fog.mode, ["linear", "exponential"] as const, "linear"),
            color: normalizeColor(fog.color, defaults.fog.color),
            near: num(fog.near, defaults.fog.near, 0, 100_000),
            far: num(fog.far, defaults.fog.far, 0.1, 100_000),
            density: num(fog.density, defaults.fog.density, 0, 1),
        },
        postProcessing: {
            bloom: {
                enabled: bool(bloom.enabled, false),
                intensity: num(bloom.intensity, defaults.postProcessing.bloom.intensity, 0, 5),
                threshold: num(bloom.threshold, defaults.postProcessing.bloom.threshold, 0, 2),
                radius: num(bloom.radius, defaults.postProcessing.bloom.radius, 0, 1),
            },
            vignette: {
                enabled: bool(vignette.enabled, false),
                intensity: num(vignette.intensity, defaults.postProcessing.vignette.intensity, 0, 1),
            },
            exposure: num(post.exposure, defaults.postProcessing.exposure, 0.1, 4),
        },
        physics: {
            gravity: vec3(physics.gravity ?? source.gravity, defaults.physics.gravity, -1000, 1000),
            fixedTimeStep: num(physics.fixedTimeStep, defaults.physics.fixedTimeStep, 1 / 240, 1 / 15),
            maxSubSteps: int(physics.maxSubSteps, defaults.physics.maxSubSteps, 1, 16),
        },
    };
}

export function normalizeScene(value: unknown, dimension: GameDimension, context: MigrationContext = { recoveredScripts: new Map() }): SceneDocument {
    const source = rec(value);
    context.dimension ??= dimension;
    const rawObjects = Array.isArray(source.objects) ? source.objects : Array.isArray(source.entities) ? source.entities : [];
    if (rawObjects.length > ENGINE_LIMITS.maxEntitiesPerScene) {
        throw new SchemaError(`Bir sahnede en fazla ${ENGINE_LIMITS.maxEntitiesPerScene} nesne bulunabilir.`);
    }
    const now = nowIso();
    const metadata = rec(source.metadata);
    return {
        version: GAME_ENGINE_SCHEMA_VERSION,
        id: idOr(source.id, "scene"),
        name: str(source.name, "Main Scene", ENGINE_LIMITS.maxNameLength),
        dimension,
        objects: repairHierarchy(rawObjects.map((raw) => normalizeEntity(raw, context))),
        settings: normalizeSceneSettings(source.settings, dimension),
        metadata: {
            createdAt: iso(metadata.createdAt, now),
            updatedAt: iso(metadata.updatedAt, now),
            templateId: typeof metadata.templateId === "string" ? str(metadata.templateId, "", 80) || null : null,
        },
    };
}

export function normalizePrefab(value: unknown, context: MigrationContext = { recoveredScripts: new Map() }): PrefabAsset | null {
    const source = rec(value);
    const rawEntities = Array.isArray(source.entities) ? source.entities.slice(0, ENGINE_LIMITS.maxPrefabEntities) : [];
    if (!rawEntities.length) return null;
    const entities = repairHierarchy(rawEntities.map((raw) => normalizeEntity(raw, context)));
    entities[0].parentId = null;
    return { id: idOr(source.id, "prefab"), name: str(source.name, entities[0].name, ENGINE_LIMITS.maxNameLength), entities };
}

export function normalizeTexture(value: unknown): TextureAsset | null {
    const source = rec(value);
    const dataUrl = typeof source.dataUrl === "string" ? source.dataUrl.trim() : "";
    if (!DATA_URL.test(dataUrl) || dataUrl.length > ENGINE_LIMITS.maxTextureDataUrlLength) return null;
    return {
        id: idOr(source.id, "texture"),
        name: str(source.name, "Texture", ENGINE_LIMITS.maxNameLength),
        dataUrl,
        width: int(source.width, 64, 1, 4096),
        height: int(source.height, 64, 1, 4096),
        filter: enumOf(source.filter, ["linear", "nearest"] as const, "linear"),
    };
}

function normalizeProjectSettings(value: unknown, sceneIds: string[], documentVersion: number): ProjectSettings {
    const source = rec(value);
    const startSceneId = typeof source.startSceneId === "string" && sceneIds.includes(source.startSceneId) ? source.startSceneId : sceneIds[0];
    return {
        startSceneId,
        aspect: enumOf(source.aspect, ["free", "16:9", "4:3", "9:16", "1:1"] as const, "free"),
        shadows: bool(source.shadows, true),
        antialias: bool(source.antialias, true),
        pixelArt: bool(source.pixelArt, false),
        showFps: bool(source.showFps, false),
        touchControls: bool(source.touchControls, true),
        // Documents saved before V4 have no rules field: they keep V3 behavior.
        rules: source.rules === 3 || source.rules === 4 ? source.rules : documentVersion >= 4 ? 4 : 3,
        input: normalizeInputSettings(source.input),
    };
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export type NormalizeProjectOptions = {
    fallbackId?: string;
    fallbackName?: string;
    /** Extra script assets (e.g. rows from the cloud scripts collection). */
    scripts?: unknown[];
    dimension?: GameDimension;
};

export function projectContentBytes(project: Pick<GameProjectDocument, "scenes" | "prefabs" | "textures" | "settings" | "activeSceneId">): number {
    const content = JSON.stringify({
        activeSceneId: project.activeSceneId,
        scenes: project.scenes,
        prefabs: project.prefabs,
        textures: project.textures,
        settings: project.settings,
    });
    return new TextEncoder().encode(content).byteLength;
}

export function normalizeProject(value: unknown, options: NormalizeProjectOptions = {}): GameProjectDocument {
    const wrapped = rec(value);
    const source = isRecord(wrapped.project) ? { ...wrapped, ...wrapped.project } : wrapped;
    if (!isRecord(source)) throw new SchemaError("Oyun projesi bir JSON nesnesi olmalıdır.");
    if (typeof source.version === "number" && source.version > GAME_ENGINE_SCHEMA_VERSION) {
        // Saving it here would silently drop the newer engine's data.
        throw new SchemaError(`Bu proje daha yeni bir Hanogt Engine sürümüyle (şema v${Math.trunc(source.version)}) kaydedilmiş. Sayfayı yenileyip tekrar deneyin.`);
    }
    assertSafeTree(source);

    const dimension: GameDimension = options.dimension ?? (source.dimension === "2d" ? "2d" : "3d");
    const context: MigrationContext = { recoveredScripts: new Map(), dimension };

    const rawScenes = Array.isArray(source.scenes) && source.scenes.length
        ? source.scenes
        : isRecord(source.scene) ? [source.scene] : [];
    if (rawScenes.length > ENGINE_LIMITS.maxScenes) throw new SchemaError(`Bir projede en fazla ${ENGINE_LIMITS.maxScenes} sahne bulunabilir.`);
    const scenes = rawScenes.map((raw) => normalizeScene(raw, dimension, context));
    if (!scenes.length) scenes.push(normalizeScene({ name: "Main Scene" }, dimension, context));
    const sceneIds = new Set<string>();
    for (const scene of scenes) {
        if (sceneIds.has(scene.id)) scene.id = createEngineId("scene");
        sceneIds.add(scene.id);
    }

    const rawPrefabs = Array.isArray(source.prefabs) ? source.prefabs.slice(0, ENGINE_LIMITS.maxPrefabs) : [];
    const prefabs = rawPrefabs.map((raw) => normalizePrefab(raw, context)).filter((prefab): prefab is PrefabAsset => Boolean(prefab));
    const rawTextures = Array.isArray(source.textures) ? source.textures.slice(0, ENGINE_LIMITS.maxTextures) : [];
    const textures = rawTextures.map(normalizeTexture).filter((texture): texture is TextureAsset => Boolean(texture));

    const scripts = new Map<string, ScriptAsset>();
    for (const asset of context.recoveredScripts.values()) scripts.set(asset.id, asset);
    const rawScripts = [...(Array.isArray(source.scripts) ? source.scripts : []), ...(options.scripts ?? [])];
    for (const raw of rawScripts) {
        const asset = normalizeScriptAsset(raw);
        if (asset) scripts.set(asset.id, asset);
        if (scripts.size > ENGINE_LIMITS.maxScripts) throw new SchemaError(`Bir projede en fazla ${ENGINE_LIMITS.maxScripts} script bulunabilir.`);
    }

    const metadata = rec(source.metadata);
    const now = nowIso();
    const activeSceneId = typeof source.activeSceneId === "string" && sceneIds.has(source.activeSceneId) ? source.activeSceneId : scenes[0].id;
    const project: GameProjectDocument = {
        version: GAME_ENGINE_SCHEMA_VERSION,
        id: isEngineId(source.id) ? source.id : (options.fallbackId && isEngineId(options.fallbackId) ? options.fallbackId : createEngineId("game")),
        name: str(source.name, options.fallbackName || "Yeni Oyun", ENGINE_LIMITS.maxNameLength),
        description: text(source.description, "", 500),
        dimension,
        activeSceneId,
        scenes,
        prefabs,
        textures,
        scripts: [...scripts.values()],
        settings: normalizeProjectSettings(source.settings, [...sceneIds], typeof source.version === "number" ? source.version : 1),
        metadata: {
            createdAt: iso(metadata.createdAt ?? source.createdAt, now),
            updatedAt: iso(metadata.updatedAt ?? source.updatedAt, now),
        },
    };
    if (projectContentBytes(project) > ENGINE_LIMITS.maxContentBytes) {
        throw new SchemaError(`Proje içeriği ${Math.round(ENGINE_LIMITS.maxContentBytes / 1024)} KB sınırını aşıyor. Büyük dokuları küçültün veya kaldırın.`);
    }
    return project;
}

/** Deep copy for plain JSON documents. */
export function cloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}
