/** Shared GPU resources: primitive geometries, sprite shapes, textures and editor icons. */
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

export class RenderAssets {
    private readonly geometries = new Map<string, THREE.BufferGeometry>();
    private readonly textures = new Map<string, { texture: THREE.Texture; dataUrl: string; filter: string }>();
    private readonly icons = new Map<string, THREE.Texture>();
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
        const polygon = (points: Array<[number, number]>) => new THREE.ShapeGeometry(new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y))));
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
            case "roundedSquare": {
                const r = 0.14;
                const s = new THREE.Shape();
                s.moveTo(-0.5 + r, -0.5);
                s.lineTo(0.5 - r, -0.5);
                s.quadraticCurveTo(0.5, -0.5, 0.5, -0.5 + r);
                s.lineTo(0.5, 0.5 - r);
                s.quadraticCurveTo(0.5, 0.5, 0.5 - r, 0.5);
                s.lineTo(-0.5 + r, 0.5);
                s.quadraticCurveTo(-0.5, 0.5, -0.5, 0.5 - r);
                s.lineTo(-0.5, -0.5 + r);
                s.quadraticCurveTo(-0.5, -0.5, -0.5 + r, -0.5);
                geometry = new THREE.ShapeGeometry(s, 8);
                break;
            }
            default:
                geometry = new THREE.PlaneGeometry(1, 1);
        }
        this.geometries.set(key, geometry);
        return geometry;
    }

    /** Editor billboard icons drawn on a canvas (no image files needed). */
    icon(kind: "camera" | "light" | "audio" | "particles" | "empty" | "text" | "ui"): THREE.Texture {
        const cached = this.icons.get(kind);
        if (cached) return cached;
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
        const palette: Record<string, string> = { camera: "#60a5fa", light: "#fbbf24", audio: "#34d399", particles: "#f472b6", empty: "#a1a1aa", text: "#c084fc", ui: "#c084fc" };
        ctx.fillStyle = "rgba(9,9,11,0.78)";
        ctx.beginPath();
        ctx.arc(32, 32, 29, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = palette[kind];
        ctx.fillStyle = palette[kind];
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        switch (kind) {
            case "camera":
                ctx.fillRect(14, 22, 26, 20);
                ctx.beginPath();
                ctx.moveTo(40, 32);
                ctx.lineTo(51, 23);
                ctx.lineTo(51, 41);
                ctx.closePath();
                ctx.fill();
                break;
            case "light":
                ctx.beginPath();
                ctx.arc(32, 32, 8, 0, Math.PI * 2);
                ctx.fill();
                for (let index = 0; index < 8; index += 1) {
                    const angle = (index / 8) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.moveTo(32 + Math.cos(angle) * 13, 32 + Math.sin(angle) * 13);
                    ctx.lineTo(32 + Math.cos(angle) * 20, 32 + Math.sin(angle) * 20);
                    ctx.stroke();
                }
                break;
            case "audio":
                ctx.fillRect(16, 26, 8, 12);
                ctx.beginPath();
                ctx.moveTo(24, 26);
                ctx.lineTo(34, 18);
                ctx.lineTo(34, 46);
                ctx.lineTo(24, 38);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(36, 32, 10, -0.8, 0.8);
                ctx.stroke();
                break;
            case "particles":
                for (const [x, y, r] of [[24, 24, 5], [40, 22, 4], [32, 38, 6], [44, 40, 3], [20, 40, 3]]) {
                    ctx.beginPath();
                    ctx.arc(x, y, r, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;
            case "text":
                ctx.font = "bold 34px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("T", 32, 34);
                break;
            case "ui":
                ctx.strokeRect(15, 21, 34, 22);
                ctx.fillRect(21, 29, 22, 6);
                break;
            default:
                ctx.beginPath();
                ctx.moveTo(32, 16);
                ctx.lineTo(48, 32);
                ctx.lineTo(32, 48);
                ctx.lineTo(16, 32);
                ctx.closePath();
                ctx.stroke();
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        this.icons.set(kind, texture);
        return texture;
    }

    gradient(top: string, bottom: string): THREE.Texture {
        const key = `gradient:${top}:${bottom}`;
        const cached = this.icons.get(key);
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
        if (this.icons.size > 40) {
            for (const [name, value] of this.icons) {
                if (name.startsWith("gradient:")) {
                    value.dispose();
                    this.icons.delete(name);
                    break;
                }
            }
        }
        this.icons.set(key, texture);
        return texture;
    }

    dispose() {
        for (const geometry of this.geometries.values()) geometry.dispose();
        for (const entry of this.textures.values()) entry.texture.dispose();
        for (const texture of this.icons.values()) texture.dispose();
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
        this.icons.clear();
        this.models.clear();
    }
}
