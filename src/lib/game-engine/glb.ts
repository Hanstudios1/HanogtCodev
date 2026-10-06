/**
 * GLB (binary glTF 2.0) checks for game models (V5), shared by the editor and
 * the server. A model must be one self-contained file: its buffers and images
 * inside the file, and no compression the player can't decode without extra
 * libraries (Draco, meshopt, Basis Universal textures).
 */

export const GLB_CONTENT_TYPE = "model/gltf-binary";
export const GLB_MAX_BYTES = 300 * 1024;
export const GLB_ACCEPT = ".glb,model/gltf-binary";

/** Extensions that need decoders the player doesn't ship. */
const UNSUPPORTED_EXTENSIONS = new Set(["KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_meshopt_compression", "KHR_texture_basisu"]);

const MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a; // "JSON"

export interface GlbInfo {
    meshes: number;
    materials: number;
    textures: number;
    animations: number;
    nodes: number;
    triangles: number;
}

export type GlbCheck =
    | { ok: true; info: GlbInfo }
    | { ok: false; reason: "not_glb" | "version" | "compressed" | "external" | "broken"; message: string };

/** Starts with the GLB magic number (the server's quick sniff). */
export function looksLikeGlb(bytes: Uint8Array): boolean {
    return bytes.length >= 12 && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true) === MAGIC;
}

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});

/** Reads the GLB header and JSON chunk and says whether the player can show the model. */
export function inspectGlb(bytes: Uint8Array): GlbCheck {
    if (!looksLikeGlb(bytes)) return { ok: false, reason: "not_glb", message: "Bu bir GLB dosyası değil. Modeli glTF Binary (.glb) olarak dışa aktarın." };
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const version = view.getUint32(4, true);
    if (version !== 2) return { ok: false, reason: "version", message: `GLB sürüm ${version}; yalnızca glTF 2.0 desteklenir.` };
    const length = view.getUint32(8, true);
    if (length > bytes.byteLength || bytes.byteLength < 20) return { ok: false, reason: "broken", message: "GLB dosyası eksik ya da bozuk." };
    const jsonLength = view.getUint32(12, true);
    if (view.getUint32(16, true) !== JSON_CHUNK || 20 + jsonLength > length) return { ok: false, reason: "broken", message: "GLB dosyasının JSON bölümü okunamadı." };
    let json: Record<string, unknown>;
    try {
        json = record(JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))));
    } catch {
        return { ok: false, reason: "broken", message: "GLB dosyasının JSON bölümü okunamadı." };
    }
    const assetVersion = String(record(json.asset).version ?? "");
    if (!assetVersion.startsWith("2")) return { ok: false, reason: "version", message: "Yalnızca glTF 2.0 modelleri desteklenir." };
    const extensions = [...list(json.extensionsUsed), ...list(json.extensionsRequired)].map(String);
    const compressed = extensions.find((name) => UNSUPPORTED_EXTENSIONS.has(name));
    if (compressed) return { ok: false, reason: "compressed", message: `Model sıkıştırılmış (${compressed}). Sıkıştırmayı kapatıp yeniden dışa aktarın.` };
    const external = [...list(json.buffers), ...list(json.images)].some((item) => typeof record(item).uri === "string");
    if (external) return { ok: false, reason: "external", message: "Model dış dosyalara bağlı. Dokuları ve verileri içine gömerek tek bir .glb olarak dışa aktarın." };
    const accessors = list(json.accessors).map(record);
    let triangles = 0;
    for (const mesh of list(json.meshes).map(record)) {
        for (const primitive of list(mesh.primitives).map(record)) {
            const mode = primitive.mode === undefined ? 4 : Number(primitive.mode);
            if (mode !== 4) continue;
            const indices = typeof primitive.indices === "number" ? accessors[primitive.indices] : undefined;
            const position = accessors[Number(record(primitive.attributes).POSITION)];
            const count = Number((indices ?? position)?.count ?? 0);
            if (Number.isFinite(count)) triangles += Math.floor(count / 3);
        }
    }
    return {
        ok: true,
        info: {
            meshes: list(json.meshes).length,
            materials: list(json.materials).length,
            textures: list(json.textures).length,
            animations: list(json.animations).length,
            nodes: list(json.nodes).length,
            triangles,
        },
    };
}

/** A small valid GLB (tests and docs): one triangle, no textures. */
export function sampleGlb(extra: Record<string, unknown> = {}): Uint8Array {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const bin = new Uint8Array(positions.buffer);
    const json = {
        asset: { version: "2.0" },
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
        accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }],
        bufferViews: [{ buffer: 0, byteLength: bin.byteLength }],
        buffers: [{ byteLength: bin.byteLength }],
        ...extra,
    };
    let text = JSON.stringify(json);
    while (text.length % 4) text += " ";
    const jsonBytes = new TextEncoder().encode(text);
    const total = 12 + 8 + jsonBytes.byteLength + 8 + bin.byteLength;
    const output = new Uint8Array(total);
    const view = new DataView(output.buffer);
    view.setUint32(0, MAGIC, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, total, true);
    view.setUint32(12, jsonBytes.byteLength, true);
    view.setUint32(16, JSON_CHUNK, true);
    output.set(jsonBytes, 20);
    const binStart = 20 + jsonBytes.byteLength;
    view.setUint32(binStart, bin.byteLength, true);
    view.setUint32(binStart + 4, 0x004e4942, true);
    output.set(bin, binStart + 8);
    return output;
}
