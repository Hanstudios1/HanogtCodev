/** Shared GPU resources: primitive geometries, sprite shapes, textures, background gradients and models. */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { loadAudioBytes } from "../audio-store";
import { inspectGlb } from "../glb";
import type { ModelAsset, PrimitiveMesh, SpriteShape, TextureAsset } from "../types";

/** A parsed GLB model: clone `scene` per object (geometries and materials are shared). */
export interface LoadedModel {
    scene: THREE.Group;
    /** Size and center of the model's bounds in its own space. */
    size: THREE.Vector3;
    center: THREE.Vector3;
}

type ModelEntry = { status: "loading" | "failed" } | { status: "ready"; model: LoadedModel };

/**
 * A flat sprite outline (convex, or star-shaped around the origin) as a
 * triangle fan from its center, with uv = position like three's
 * ShapeGeometry. Building it here keeps three's curve and path classes out
 * of the player bundle.
 */
function polygonGeometry(points: ReadonlyArray<readonly [number, number]>): THREE.BufferGeometry {
    const positions = [0, 0, 0];
    const uvs = [0, 0];
    for (const [x, y] of points) {
        positions.push(x, y, 0);
        uvs.push(x, y);
    }
    const indices: number[] = [];
    for (let index = 0; index < points.length; index += 1) indices.push(0, index + 1, ((index + 1) % points.length) + 1);
    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(indices);
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(positions.map((_, index) => (index % 3 === 2 ? 1 : 0)), 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    return geometry;
}

/** The rounded square's outline: straight sides and quadratic corners of 8 segments each. */
function roundedSquareOutline(radius: number): Array<[number, number]> {
    const half = 0.5;
    const points: Array<[number, number]> = [];
    // Each side ends where a corner starts: [side end, corner control, corner end].
    const corners: Array<[[number, number], [number, number], [number, number]]> = [
        [[half - radius, -half], [half, -half], [half, -half + radius]],
        [[half, half - radius], [half, half], [half - radius, half]],
        [[-half + radius, half], [-half, half], [-half, half - radius]],
        [[-half, -half + radius], [-half, -half], [-half + radius, -half]],
    ];
    for (const [start, control, end] of corners) {
        points.push(start);
        for (let step = 1; step <= 8; step += 1) {
            const t = step / 8;
            const a = (1 - t) * (1 - t);
            const b = 2 * (1 - t) * t;
            const c = t * t;
            points.push([a * start[0] + b * control[0] + c * end[0], a * start[1] + b * control[1] + c * end[1]]);
        }
    }
    // The last corner ends at the bottom side's start; the fan closes the outline back to the first point.
    return points;
}

export class RenderAssets {
    private readonly geometries = new Map<string, THREE.BufferGeometry>();
    private readonly textures = new Map<string, { texture: THREE.Texture; dataUrl: string; filter: string }>();
    /** Background gradients drawn on a canvas. */
    private readonly gradients = new Map<string, THREE.Texture>();
    private textureAssets = new Map<string, TextureAsset>();
    private modelAssets = new Map<string, ModelAsset>();
    private readonly models = new Map<string, ModelEntry>();
    pixelArt = false;
    /** Called when an async texture finished decoding so the host can re-render. */
    onTextureLoaded: (() => void) | null = null;
    /** Called when a model finished loading (or failed), so objects waiting for it rebuild. */
    onModelLoaded: ((hash: string) => void) | null = null;

    setModelAssets(assets: readonly ModelAsset[]) {
        this.modelAssets = new Map(assets.map((asset) => [asset.id, asset]));
    }

    modelAsset(id: string | null | undefined): ModelAsset | null {
        return id ? this.modelAssets.get(id) ?? null : null;
    }

    /**
     * A project model ready to show, or null while it loads (or when it can't
     * be shown). The file is checked again before parsing: a model must not
     * reach for other files.
     */
    model(hash: string): LoadedModel | null {
        const entry = this.models.get(hash);
        if (entry) return entry.status === "ready" ? entry.model : null;
        this.models.set(hash, { status: "loading" });
        void (async () => {
            const bytes = await loadAudioBytes({ hash });
            if (!bytes || !inspectGlb(new Uint8Array(bytes)).ok) throw new Error("model");
            const gltf = await new GLTFLoader().parseAsync(bytes.slice(0), "");
            const scene = gltf.scene;
            scene.traverse((child) => {
                const mesh = child as THREE.Mesh;
                if (mesh.geometry) mesh.geometry.userData.shared = true;
                const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
                for (const material of materials) material.userData.shared = true;
            });
            const box = new THREE.Box3().setFromObject(scene);
            const size = box.isEmpty() ? new THREE.Vector3(1, 1, 1) : box.getSize(new THREE.Vector3());
            const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
            this.models.set(hash, { status: "ready", model: { scene, size, center } });
        })().catch(() => {
            this.models.set(hash, { status: "failed" });
        }).finally(() => this.onModelLoaded?.(hash));
        return null;
    }

    setTextureAssets(assets: readonly TextureAsset[]) {
        this.textureAssets = new Map(assets.map((asset) => [asset.id, asset]));
        for (const [id, entry] of this.textures) {
            const asset = this.textureAssets.get(id);
            if (!asset || asset.dataUrl !== entry.dataUrl || asset.filter !== entry.filter) {
                entry.texture.dispose();
                this.textures.delete(id);
            }
        }
    }

    texture(id: string | null | undefined): THREE.Texture | null {
        if (!id) return null;
        const cached = this.textures.get(id);
        if (cached) return cached.texture;
        const asset = this.textureAssets.get(id);
        if (!asset || typeof document === "undefined") return null;
        const image = new Image();
        const texture = new THREE.Texture(image);
        texture.colorSpace = THREE.SRGBColorSpace;
        const nearest = asset.filter === "nearest" || this.pixelArt;
        texture.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
        texture.minFilter = nearest ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
        texture.generateMipmaps = !nearest;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        image.onload = () => {
            texture.needsUpdate = true;
            this.onTextureLoaded?.();
        };
        image.src = asset.dataUrl;
        this.textures.set(id, { texture, dataUrl: asset.dataUrl, filter: asset.filter });
        return texture;
    }

    textureAspect(id: string | null | undefined): number {
        const asset = id ? this.textureAssets.get(id) : undefined;
        return asset && asset.height > 0 ? asset.width / asset.height : 1;
    }

    textureSize(id: string | null | undefined): { width: number; height: number } | null {
        const asset = id ? this.textureAssets.get(id) : undefined;
        return asset ? { width: asset.width, height: asset.height } : null;
    }

    mesh(kind: PrimitiveMesh): THREE.BufferGeometry {
        const key = `mesh:${kind}`;
        let geometry = this.geometries.get(key);
        if (geometry) return geometry;
        switch (kind) {
            case "cube": geometry = new THREE.BoxGeometry(1, 1, 1); break;
            case "sphere": geometry = new THREE.SphereGeometry(0.5, 40, 20); break;
            case "plane": geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); break;
            case "capsule": geometry = new THREE.CapsuleGeometry(0.5, 1, 8, 24); break;
            case "cylinder": geometry = new THREE.CylinderGeometry(0.5, 0.5, 2, 36); break;
            case "cone": geometry = new THREE.ConeGeometry(0.5, 1, 36); break;
            case "torus": geometry = new THREE.TorusGeometry(0.4, 0.15, 18, 48); break;
            default: geometry = new THREE.BoxGeometry(1, 1, 1);
        }
        this.geometries.set(key, geometry);
        return geometry;
    }

    sprite(shape: SpriteShape): THREE.BufferGeometry {
        const key = `sprite:${shape}`;
        let geometry = this.geometries.get(key);
        if (geometry) return geometry;
        const polygon = polygonGeometry;
        switch (shape) {
            case "circle":
                geometry = new THREE.CircleGeometry(0.5, 48);
                break;
            case "triangle":
                geometry = polygon([[-0.5, -0.5], [0.5, -0.5], [0, 0.5]]);
                break;
            case "diamond":
                geometry = polygon([[0, -0.5], [0.5, 0], [0, 0.5], [-0.5, 0]]);
                break;
            case "hexagon":
                geometry = polygon(Array.from({ length: 6 }, (_, index) => {
                    const angle = (index / 6) * Math.PI * 2 + Math.PI / 6;
                    return [Math.cos(angle) * 0.5, Math.sin(angle) * 0.5] as [number, number];
                }));
                break;
            case "star":
                geometry = polygon(Array.from({ length: 10 }, (_, index) => {
                    const angle = (index / 10) * Math.PI * 2 + Math.PI / 2;
                    const radius = index % 2 === 0 ? 0.5 : 0.21;
                    return [Math.cos(angle) * radius, Math.sin(angle) * radius] as [number, number];
                }));
                break;
            case "roundedSquare":
                geometry = polygon(roundedSquareOutline(0.14));
                break;
            default:
                geometry = new THREE.PlaneGeometry(1, 1);
        }
        this.geometries.set(key, geometry);
        return geometry;
    }

    gradient(top: string, bottom: string): THREE.Texture {
        const key = `gradient:${top}:${bottom}`;
        const cached = this.gradients.get(key);
        if (cached) return cached;
        const canvas = document.createElement("canvas");
        canvas.width = 4;
        canvas.height = 256;
        const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
        const gradient = ctx.createLinearGradient(0, 0, 0, 256);
        gradient.addColorStop(0, top);
        gradient.addColorStop(1, bottom);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 4, 256);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        // Keep a handful of gradients at most.
        if (this.gradients.size > 40) {
            const [oldest, value] = this.gradients.entries().next().value as [string, THREE.Texture];
            value.dispose();
            this.gradients.delete(oldest);
        }
        this.gradients.set(key, texture);
        return texture;
    }

    dispose() {
        for (const geometry of this.geometries.values()) geometry.dispose();
        for (const entry of this.textures.values()) entry.texture.dispose();
        for (const texture of this.gradients.values()) texture.dispose();
        for (const entry of this.models.values()) {
            if (entry.status !== "ready") continue;
            entry.model.scene.traverse((child) => {
                const mesh = child as THREE.Mesh;
                mesh.geometry?.dispose();
                const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
                for (const material of materials) {
                    for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
                    material.dispose();
                }
            });
        }
        this.geometries.clear();
        this.textures.clear();
        this.gradients.clear();
        this.models.clear();
    }
}
