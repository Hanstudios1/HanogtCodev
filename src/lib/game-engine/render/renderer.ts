/**
 * WebGL scene renderer (three.js) shared by the editor Scene view, the Game
 * view, the Arcade player and exported builds.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import type { TRS } from "../math";
import type {
    CameraComponent,
    ColliderComponent,
    GameComponent,
    GameDimension,
    LightComponent,
    MeshRendererComponent,
    ParticleSystemComponent,
    SceneSettings,
    SpriteRendererComponent,
    TextureAsset,
    Vector3,
} from "../types";
import type { ParticleEmitter } from "../runtime/particles";
import { RenderAssets } from "./assets";
import { applyTRS, readTRS, toThreePosition, toThreeQuaternion } from "./convert";

export interface RenderEntity {
    readonly id: string;
    readonly name: string;
    readonly tag?: string;
    readonly visible: boolean;
    readonly world: TRS;
    readonly components: readonly GameComponent[];
    /** Changes whenever a render-relevant component property changed in place. */
    readonly version: number;
    readonly emitter?: ParticleEmitter | null;
}

export interface RenderDebugLine {
    from: Vector3;
    to: Vector3;
    color: string;
}

export interface RenderFrame {
    dimension: GameDimension;
    settings: SceneSettings;
    entities: Iterable<RenderEntity>;
    debugLines?: readonly RenderDebugLine[];
}

export type GizmoMode = "translate" | "rotate" | "scale";

export interface SceneRendererOptions {
    mode: "editor" | "game";
    antialias?: boolean;
    shadows?: boolean;
    pixelArt?: boolean;
    onPick?: (entityId: string | null, additive: boolean) => void;
    onDoublePick?: (entityId: string) => void;
    onGizmoStart?: (entityId: string) => void;
    onGizmoChange?: (entityId: string, world: TRS) => void;
    onGizmoEnd?: (entityId: string) => void;
}

interface ParticleVisual {
    object: THREE.Points;
    geometry: THREE.BufferGeometry;
    emitter: ParticleEmitter;
    worldSpace: boolean;
}

class EntityObject {
    readonly group = new THREE.Group();
    componentsRef: readonly GameComponent[] | null = null;
    version = -1;
    visual: THREE.Mesh | null = null;
    visualKey = "";
    mapClone: THREE.Texture | null = null;
    local: THREE.PointLight | THREE.SpotLight | null = null;
    directional: THREE.DirectionalLight | null = null;
    directionalComponent: LightComponent | null = null;
    particles: ParticleVisual | null = null;
    icon: THREE.Sprite | null = null;
    iconKind = "";
    gizmo: THREE.Object3D | null = null;
    gizmoKey = "";
    colliderGizmo: THREE.Object3D | null = null;
    colliderKey = "";
    camera: CameraComponent | null = null;
    tag = "";
    constructor(readonly id: string) {
        this.group.userData.entityId = id;
    }
}

const PARTICLE_VERTEX = /* glsl */ `
attribute float size;
attribute vec4 pcolor;
varying vec4 vColor;
uniform float pixelScale;
uniform float isOrtho;
void main() {
    vColor = pcolor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float attenuation = isOrtho > 0.5 ? 1.0 : 1.0 / max(0.001, -mv.z);
    gl_PointSize = max(1.0, size * pixelScale * attenuation);
}`;

const PARTICLE_FRAGMENT = /* glsl */ `
varying vec4 vColor;
void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.15, d);
    gl_FragColor = vec4(vColor.rgb, vColor.a * alpha);
}`;

function disposeObject(object: THREE.Object3D) {
    object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        // Sprites share one module-level geometry inside three.js; never dispose it.
        if (mesh.geometry && !(mesh.geometry.userData?.shared) && !(child instanceof THREE.Sprite)) mesh.geometry.dispose();
        const material = (mesh as { material?: THREE.Material | THREE.Material[] }).material;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose();
    });
}

export class SceneRenderer {
    readonly renderer: THREE.WebGLRenderer;
    readonly scene = new THREE.Scene();
    readonly assets = new RenderAssets();
    readonly canvas: HTMLCanvasElement;
    private readonly root = new THREE.Group();
    private readonly objects = new Map<string, EntityObject>();
    private readonly hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    private readonly fallbackSun = new THREE.DirectionalLight(0xffffff, 1.1);
    private readonly options: SceneRendererOptions;
    private dimension: GameDimension = "3d";
    private settingsKey = "";
    private width = 1;
    private height = 1;
    private resizeObserver: ResizeObserver | null = null;
    private disposed = false;

    // Editor
    private editorCamera3D: THREE.PerspectiveCamera | null = null;
    private editorCamera2D: THREE.OrthographicCamera | null = null;
    private orbit: OrbitControls | null = null;
    private transform: TransformControls | null = null;
    private gridGroup: THREE.Group | null = null;
    private selection: string[] = [];
    private selectionHelpers = new Map<string, THREE.BoxHelper>();
    private attachedId: string | null = null;
    private dragging = false;
    private gizmoMode: GizmoMode = "translate";
    private gizmoSpace: "world" | "local" = "world";
    showColliders = false;
    showGrid = true;
    showIcons = true;
    private pointerDown: { x: number; y: number; time: number } | null = null;
    private lastClick = { id: "", time: 0 };
    private readonly raycaster = new THREE.Raycaster();

    // Game
    private gameCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null = null;
    private primary: { entity: EntityObject; component: CameraComponent; world: TRS } | null = null;
    hasCamera = false;

    private debugLines: THREE.LineSegments | null = null;
    private frameNumber = 0;

    constructor(readonly container: HTMLElement, options: SceneRendererOptions) {
        this.options = options;
        this.renderer = new THREE.WebGLRenderer({ antialias: options.antialias ?? true, alpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance" });
        this.renderer.setPixelRatio(Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.NeutralToneMapping;
        this.renderer.toneMappingExposure = 1;
        this.renderer.shadowMap.enabled = options.shadows ?? true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        this.canvas = this.renderer.domElement;
        this.canvas.style.display = "block";
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        this.canvas.style.touchAction = "none";
        this.canvas.style.outline = "none";
        this.canvas.tabIndex = 0;
        if (options.pixelArt) {
            this.canvas.style.imageRendering = "pixelated";
            this.assets.pixelArt = true;
        }
        container.appendChild(this.canvas);
        this.scene.add(this.root);
        this.scene.add(this.hemi);
        this.fallbackSun.position.set(6, 12, 8);
        this.fallbackSun.castShadow = options.shadows ?? true;
        this.configureShadow(this.fallbackSun);
        this.scene.add(this.fallbackSun);
        this.scene.add(this.fallbackSun.target);
        if (options.mode === "editor") this.setupEditor();
        this.resize();
        if (typeof ResizeObserver !== "undefined") {
            this.resizeObserver = new ResizeObserver(() => this.resize());
            this.resizeObserver.observe(container);
        }
    }

    get mode() {
        return this.options.mode;
    }

    // -------------------------------------------------------------------
    // Setup
    // -------------------------------------------------------------------

    private configureShadow(light: THREE.DirectionalLight) {
        light.shadow.mapSize.set(2048, 2048);
        const camera = light.shadow.camera;
        camera.left = -30;
        camera.right = 30;
        camera.top = 30;
        camera.bottom = -30;
        camera.near = 0.5;
        camera.far = 160;
        light.shadow.bias = -0.0004;
        light.shadow.normalBias = 0.03;
    }

    private setupEditor() {
        this.editorCamera3D = new THREE.PerspectiveCamera(55, 1, 0.05, 5000);
        this.editorCamera3D.position.set(8, 7, 10);
        this.editorCamera2D = new THREE.OrthographicCamera(-8, 8, 5, -5, -1000, 1000);
        this.editorCamera2D.position.set(0, 0, 50);
        this.orbit = new OrbitControls(this.editorCamera3D, this.canvas);
        this.orbit.enableDamping = true;
        this.orbit.dampingFactor = 0.12;
        this.orbit.screenSpacePanning = true;
        this.transform = new TransformControls(this.editorCamera3D, this.canvas);
        this.transform.setSize(0.9);
        this.transform.addEventListener("dragging-changed", (event) => {
            const dragging = Boolean((event as unknown as { value: boolean }).value);
            this.dragging = dragging;
            if (this.orbit) this.orbit.enabled = !dragging;
            if (this.attachedId) {
                if (dragging) this.options.onGizmoStart?.(this.attachedId);
                else this.options.onGizmoEnd?.(this.attachedId);
            }
        });
        this.transform.addEventListener("objectChange", () => {
            if (!this.attachedId) return;
            const object = this.objects.get(this.attachedId);
            if (!object) return;
            if (this.dimension === "2d") {
                object.group.position.z = Math.round(object.group.position.z * 1000) / 1000;
            }
            this.options.onGizmoChange?.(this.attachedId, readTRS(object.group));
        });
        this.scene.add(this.transform.getHelper());
        this.canvas.addEventListener("pointerdown", this.handlePointerDown);
        this.canvas.addEventListener("pointerup", this.handlePointerUp);
        this.applyEditorDimension();
    }

    private applyEditorDimension() {
        if (!this.orbit || !this.transform) return;
        const camera = this.dimension === "2d" ? this.editorCamera2D! : this.editorCamera3D!;
        this.orbit.object = camera;
        this.transform.camera = camera;
        if (this.dimension === "2d") {
            this.orbit.enableRotate = false;
            this.orbit.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
            this.orbit.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
            this.orbit.target.set(camera.position.x, camera.position.y, 0);
        } else {
            this.orbit.enableRotate = true;
            this.orbit.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
            this.orbit.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
        }
        this.orbit.update();
        this.rebuildGrid();
        this.applyGizmoConstraints();
    }

    private rebuildGrid() {
        if (this.gridGroup) {
            this.scene.remove(this.gridGroup);
            disposeObject(this.gridGroup);
        }
        const group = new THREE.Group();
        const minor = new THREE.GridHelper(200, 200, 0x3f3f46, 0x27272a);
        const major = new THREE.GridHelper(200, 20, 0x52525b, 0x3f3f46);
        for (const grid of [minor, major]) {
            const material = grid.material as THREE.Material;
            material.transparent = true;
            material.opacity = grid === minor ? 0.35 : 0.6;
            material.depthWrite = false;
            group.add(grid);
        }
        const axis = (from: THREE.Vector3, to: THREE.Vector3, color: number) => {
            const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
            const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 }));
            group.add(line);
        };
        if (this.dimension === "2d") {
            group.rotation.x = Math.PI / 2;
            axis(new THREE.Vector3(-100, 0, 0), new THREE.Vector3(100, 0, 0), 0xef4444);
            axis(new THREE.Vector3(0, 0, -100), new THREE.Vector3(0, 0, 100), 0x22c55e);
        } else {
            axis(new THREE.Vector3(-100, 0.001, 0), new THREE.Vector3(100, 0.001, 0), 0xef4444);
            axis(new THREE.Vector3(0, 0.001, -100), new THREE.Vector3(0, 0.001, 100), 0x3b82f6);
        }
        group.renderOrder = -10;
        group.visible = this.showGrid;
        this.gridGroup = group;
        this.scene.add(group);
    }

    private applyGizmoConstraints() {
        if (!this.transform) return;
        this.transform.setMode(this.gizmoMode);
        this.transform.setSpace(this.gizmoMode === "scale" ? "local" : this.gizmoSpace);
        const is2D = this.dimension === "2d";
        if (this.gizmoMode === "rotate") {
            this.transform.showX = !is2D;
            this.transform.showY = !is2D;
            this.transform.showZ = true;
        } else {
            this.transform.showX = true;
            this.transform.showY = true;
            this.transform.showZ = !is2D;
        }
    }

    setGizmoMode(mode: GizmoMode) {
        this.gizmoMode = mode;
        this.applyGizmoConstraints();
    }

    setGizmoSpace(space: "world" | "local") {
        this.gizmoSpace = space;
        this.applyGizmoConstraints();
    }

    setGridVisible(visible: boolean) {
        this.showGrid = visible;
        if (this.gridGroup) this.gridGroup.visible = visible;
    }

    setTextures(textures: readonly TextureAsset[]) {
        this.assets.setTextureAssets(textures);
        for (const object of this.objects.values()) object.version = -2;
    }

    // -------------------------------------------------------------------
    // Sizing
    // -------------------------------------------------------------------

    resize() {
        if (this.disposed) return;
        const rect = this.container.getBoundingClientRect();
        const width = Math.max(1, Math.floor(rect.width));
        const height = Math.max(1, Math.floor(rect.height));
        if (width === this.width && height === this.height) return;
        this.width = width;
        this.height = height;
        this.renderer.setSize(width, height, false);
        this.updateEditorProjection();
    }

    get size() {
        return { width: this.width, height: this.height };
    }

    private updateEditorProjection() {
        const aspect = this.width / Math.max(1, this.height);
        if (this.editorCamera3D) {
            this.editorCamera3D.aspect = aspect;
            this.editorCamera3D.updateProjectionMatrix();
        }
        if (this.editorCamera2D) {
            const halfHeight = 6;
            this.editorCamera2D.left = -halfHeight * aspect;
            this.editorCamera2D.right = halfHeight * aspect;
            this.editorCamera2D.top = halfHeight;
            this.editorCamera2D.bottom = -halfHeight;
            this.editorCamera2D.updateProjectionMatrix();
        }
    }

    // -------------------------------------------------------------------
    // Selection & picking (editor)
    // -------------------------------------------------------------------

    setSelection(ids: readonly string[]) {
        this.selection = [...ids];
        for (const [id, helper] of this.selectionHelpers) {
            if (!ids.includes(id)) {
                this.scene.remove(helper);
                helper.geometry.dispose();
                (helper.material as THREE.Material).dispose();
                this.selectionHelpers.delete(id);
            }
        }
        for (const object of this.objects.values()) object.colliderKey = "";
        this.refreshAttachment();
    }

    /** Disables the transform gizmo (e.g. while the game is running). */
    gizmoEnabled = true;

    private refreshAttachment() {
        if (!this.transform) return;
        const id = this.gizmoEnabled ? this.selection[0] ?? null : null;
        const object = id ? this.objects.get(id) : undefined;
        if (object && id) {
            if (this.attachedId !== id) {
                this.transform.attach(object.group);
                this.attachedId = id;
            }
        } else if (this.attachedId) {
            this.transform.detach();
            this.attachedId = null;
        }
    }

    private handlePointerDown = (event: PointerEvent) => {
        this.pointerDown = { x: event.clientX, y: event.clientY, time: performance.now() };
    };

    private handlePointerUp = (event: PointerEvent) => {
        const down = this.pointerDown;
        this.pointerDown = null;
        if (!down || event.button !== 0 || this.dragging) return;
        if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;
        if ((this.transform as unknown as { axis?: string | null })?.axis) return;
        const id = this.pick(event.clientX, event.clientY);
        const now = performance.now();
        if (id && this.lastClick.id === id && now - this.lastClick.time < 350) {
            this.options.onDoublePick?.(id);
            this.focus(id);
        }
        this.lastClick = { id: id ?? "", time: now };
        this.options.onPick?.(id, event.shiftKey || event.ctrlKey || event.metaKey);
    };

    pick(clientX: number, clientY: number): string | null {
        const camera = this.activeCamera();
        const rect = this.canvas.getBoundingClientRect();
        const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        this.raycaster.setFromCamera(pointer, camera);
        const candidates: THREE.Object3D[] = [];
        for (const object of this.objects.values()) {
            if (!object.group.visible) continue;
            if (object.visual) candidates.push(object.visual);
            if (object.icon && object.icon.visible) candidates.push(object.icon);
        }
        const hits = this.raycaster.intersectObjects(candidates, false);
        if (!hits.length) return null;
        if (this.dimension === "2d") {
            // Topmost sprite wins in 2D.
            hits.sort((a, b) => (b.object.renderOrder - a.object.renderOrder) || (a.distance - b.distance));
        }
        let cursor: THREE.Object3D | null = hits[0].object;
        while (cursor && !cursor.userData.entityId) cursor = cursor.parent;
        return (cursor?.userData.entityId as string | undefined) ?? null;
    }

    /** Point on the ground (3D: y = 0, 2D: z = 0) under the cursor, in engine coordinates. */
    groundPoint(clientX: number, clientY: number): Vector3 {
        const camera = this.activeCamera();
        const rect = this.canvas.getBoundingClientRect();
        const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        this.raycaster.setFromCamera(pointer, camera);
        const plane = this.dimension === "2d" ? new THREE.Plane(new THREE.Vector3(0, 0, 1), 0) : new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const point = new THREE.Vector3();
        const hit = this.raycaster.ray.intersectPlane(plane, point);
        if (!hit) return { x: 0, y: 0, z: 0 };
        return { x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100, z: this.dimension === "2d" ? 0 : Math.round(-point.z * 100) / 100 };
    }

    focus(id: string) {
        const object = this.objects.get(id);
        if (!object || !this.orbit) return;
        const box = new THREE.Box3().setFromObject(object.group);
        const center = box.isEmpty() ? object.group.getWorldPosition(new THREE.Vector3()) : box.getCenter(new THREE.Vector3());
        const radius = box.isEmpty() ? 1 : Math.max(0.5, box.getSize(new THREE.Vector3()).length() / 2);
        if (this.dimension === "2d" && this.editorCamera2D) {
            this.editorCamera2D.position.set(center.x, center.y, 50);
            this.editorCamera2D.zoom = Math.max(0.05, Math.min(20, 5 / radius));
            this.editorCamera2D.updateProjectionMatrix();
            this.orbit.target.set(center.x, center.y, 0);
        } else if (this.editorCamera3D) {
            const direction = this.editorCamera3D.position.clone().sub(this.orbit.target).normalize();
            this.orbit.target.copy(center);
            this.editorCamera3D.position.copy(center).addScaledVector(direction, radius * 3.2 + 1);
        }
        this.orbit.update();
    }

    resetView() {
        if (!this.orbit) return;
        if (this.dimension === "2d" && this.editorCamera2D) {
            this.editorCamera2D.position.set(0, 0, 50);
            this.editorCamera2D.zoom = 1;
            this.editorCamera2D.updateProjectionMatrix();
            this.orbit.target.set(0, 0, 0);
        } else if (this.editorCamera3D) {
            this.editorCamera3D.position.set(8, 7, 10);
            this.orbit.target.set(0, 0, 0);
        }
        this.orbit.update();
    }

    // -------------------------------------------------------------------
    // Frame sync
    // -------------------------------------------------------------------

    private applySettings(settings: SceneSettings, cameraBackground: string | null) {
        const key = JSON.stringify([settings.background, settings.ambientColor, settings.ambientIntensity, settings.fog, cameraBackground, this.dimension]);
        if (key === this.settingsKey) return;
        this.settingsKey = key;
        if (cameraBackground) {
            this.scene.background = new THREE.Color(cameraBackground);
        } else if (settings.background.mode === "gradient") {
            this.scene.background = this.assets.gradient(settings.background.topColor, settings.background.color);
        } else {
            this.scene.background = new THREE.Color(settings.background.color);
        }
        this.hemi.color.set(settings.ambientColor);
        this.hemi.groundColor.set(settings.ambientColor).multiplyScalar(0.35);
        this.hemi.intensity = settings.ambientIntensity * (this.dimension === "2d" ? 1.2 : 1.6);
        this.scene.fog = settings.fog.enabled ? new THREE.Fog(settings.fog.color, settings.fog.near, Math.max(settings.fog.near + 0.1, settings.fog.far)) : null;
    }

    private sync(frame: RenderFrame) {
        if (frame.dimension !== this.dimension) {
            this.dimension = frame.dimension;
            this.settingsKey = "";
            if (this.options.mode === "editor") this.applyEditorDimension();
        }
        const seen = new Set<string>();
        type CameraCandidate = { entity: EntityObject; component: CameraComponent; world: TRS };
        let primary: CameraCandidate | null = null;
        let tagged: CameraCandidate | null = null;
        let fallback: CameraCandidate | null = null;
        let hasDirectional = false;
        this.frameNumber += 1;
        for (const entity of frame.entities) {
            seen.add(entity.id);
            let object = this.objects.get(entity.id);
            if (!object) {
                object = new EntityObject(entity.id);
                this.objects.set(entity.id, object);
                this.root.add(object.group);
            }
            if (object.componentsRef !== entity.components || object.version !== entity.version) this.rebuild(object, entity);
            object.tag = entity.tag ?? "";
            object.group.visible = entity.visible;
            if (!(this.dragging && this.attachedId === entity.id)) applyTRS(object.group, entity.world);
            if (object.directional) {
                object.directional.visible = entity.visible && Boolean(object.directionalComponent?.enabled);
                if (object.directional.visible) hasDirectional = true;
            }
            if (object.particles) this.updateParticles(object.particles, entity);
            if (object.camera && entity.visible && object.camera.enabled) {
                const candidate = { entity: object, component: object.camera, world: entity.world };
                if (!primary && object.camera.primary) primary = candidate;
                if (!tagged && entity.tag === "MainCamera") tagged = candidate;
                if (!fallback) fallback = candidate;
            }
            if (this.options.mode === "editor") this.updateEditorDecorations(object, entity);
        }
        for (const [id, object] of this.objects) {
            if (seen.has(id)) continue;
            this.removeObject(object);
            this.objects.delete(id);
        }
        this.primary = primary ?? tagged ?? fallback;
        this.hasCamera = Boolean(this.primary);
        this.fallbackSun.visible = this.dimension === "3d" && !hasDirectional;
        this.applySettings(frame.settings, this.options.mode === "game" ? this.primary?.component.backgroundColor ?? null : null);
        this.updateDebugLines(frame.debugLines);
        this.refreshAttachment();
    }

    private removeObject(object: EntityObject) {
        if (this.attachedId === object.id) {
            this.transform?.detach();
            this.attachedId = null;
        }
        if (object.directional) {
            this.scene.remove(object.directional);
            this.scene.remove(object.directional.target);
            object.directional.dispose();
        }
        object.mapClone?.dispose();
        this.root.remove(object.group);
        disposeObject(object.group);
        const helper = this.selectionHelpers.get(object.id);
        if (helper) {
            this.scene.remove(helper);
            helper.geometry.dispose();
            this.selectionHelpers.delete(object.id);
        }
    }

    private rebuild(object: EntityObject, entity: RenderEntity) {
        object.componentsRef = entity.components;
        object.version = entity.version;
        let mesh: MeshRendererComponent | undefined;
        let sprite: SpriteRendererComponent | undefined;
        let light: LightComponent | undefined;
        let camera: CameraComponent | undefined;
        let particles: ParticleSystemComponent | undefined;
        for (const component of entity.components) {
            switch (component.type) {
                case "meshRenderer": mesh ??= component; break;
                case "spriteRenderer": sprite ??= component; break;
                case "light": light ??= component; break;
                case "camera": camera ??= component; break;
                case "particleSystem": particles ??= component; break;
            }
        }
        if (mesh?.enabled) this.ensureMesh(object, mesh);
        else if (sprite?.enabled) this.ensureSprite(object, sprite);
        else this.removeVisual(object);
        this.ensureLight(object, light?.enabled ? light : undefined);
        object.camera = camera ?? null;
        if (!particles || !entity.emitter || object.particles?.emitter !== entity.emitter) this.removeParticles(object);
        if (particles && entity.emitter && !object.particles) this.createParticles(object, entity.emitter, particles);
        object.gizmoKey = "";
        object.colliderKey = "";
    }

    private removeVisual(object: EntityObject) {
        if (!object.visual) return;
        object.group.remove(object.visual);
        (object.visual.material as THREE.Material).dispose();
        object.visual = null;
        object.visualKey = "";
    }

    private ensureMesh(object: EntityObject, component: MeshRendererComponent) {
        const key = `mesh:${component.mesh}`;
        if (!object.visual || object.visualKey !== key) {
            this.removeVisual(object);
            const geometry = this.assets.mesh(component.mesh);
            geometry.userData.shared = true;
            object.visual = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
            object.visual.userData.entityId = object.id;
            object.visualKey = key;
            object.group.add(object.visual);
        }
        const material = object.visual.material as THREE.MeshStandardMaterial;
        const data = component.material;
        material.color.set(data.color);
        material.metalness = data.metallic;
        material.roughness = data.roughness;
        material.emissive.set(data.emissive);
        material.emissiveIntensity = data.emissiveIntensity;
        const transparent = data.opacity < 0.999;
        if (material.transparent !== transparent) material.needsUpdate = true;
        material.transparent = transparent;
        material.opacity = data.opacity;
        material.depthWrite = !transparent;
        material.wireframe = data.wireframe;
        if (material.flatShading !== data.flatShading) {
            material.flatShading = data.flatShading;
            material.needsUpdate = true;
        }
        let map = this.assets.texture(data.textureId);
        if (map && data.tiling !== 1) {
            if (!object.mapClone || object.mapClone.source !== map.source) {
                object.mapClone?.dispose();
                object.mapClone = map.clone();
            }
            object.mapClone.repeat.set(data.tiling, data.tiling);
            object.mapClone.needsUpdate = true;
            map = object.mapClone;
        }
        if (material.map !== map) {
            material.map = map;
            material.needsUpdate = true;
        }
        object.visual.castShadow = component.castShadows;
        object.visual.receiveShadow = component.receiveShadows;
        object.visual.scale.set(1, 1, 1);
        object.visual.renderOrder = 0;
    }

    private ensureSprite(object: EntityObject, component: SpriteRendererComponent) {
        const texture = this.assets.texture(component.textureId);
        const key = texture ? "sprite:texture" : `sprite:${component.shape}`;
        if (!object.visual || object.visualKey !== key) {
            this.removeVisual(object);
            const geometry = texture ? this.assets.sprite("square") : this.assets.sprite(component.shape);
            geometry.userData.shared = true;
            object.visual = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
            object.visual.userData.entityId = object.id;
            object.visualKey = key;
            object.group.add(object.visual);
        }
        const material = object.visual.material as THREE.MeshBasicMaterial;
        material.color.set(component.color);
        material.opacity = component.opacity;
        if (material.map !== texture) {
            material.map = texture;
            material.needsUpdate = true;
        }
        material.alphaTest = texture ? 0.02 : 0;
        object.visual.scale.set(component.flipX ? -1 : 1, component.flipY ? -1 : 1, 1);
        object.visual.renderOrder = 10 + component.sortingLayer;
        object.visual.castShadow = false;
        object.visual.receiveShadow = false;
    }

    private ensureLight(object: EntityObject, component: LightComponent | undefined) {
        const wantDirectional = component?.lightType === "directional";
        const wantLocal = component && component.lightType !== "directional" ? component.lightType : null;
        if (!wantDirectional && object.directional) {
            this.scene.remove(object.directional);
            this.scene.remove(object.directional.target);
            object.directional.dispose();
            object.directional = null;
            object.directionalComponent = null;
        }
        const localKind = object.local ? (object.local instanceof THREE.SpotLight ? "spot" : "point") : null;
        if (object.local && localKind !== wantLocal) {
            object.group.remove(object.local);
            object.local.dispose();
            object.local = null;
        }
        if (!component) return;
        const shadows = this.renderer.shadowMap.enabled && component.castShadows;
        if (wantDirectional) {
            if (!object.directional) {
                object.directional = new THREE.DirectionalLight();
                this.configureShadow(object.directional);
                this.scene.add(object.directional);
                this.scene.add(object.directional.target);
            }
            object.directionalComponent = component;
            object.directional.color.set(component.color);
            object.directional.intensity = component.intensity * 1.6;
            object.directional.castShadow = shadows && this.dimension === "3d";
            return;
        }
        if (!object.local) {
            if (wantLocal === "spot") {
                const spot = new THREE.SpotLight();
                spot.target.position.set(0, 0, -1);
                spot.add(spot.target);
                object.local = spot;
            } else {
                object.local = new THREE.PointLight();
            }
            object.local.shadow.mapSize.set(1024, 1024);
            object.local.shadow.bias = -0.0005;
            object.group.add(object.local);
        }
        object.local.color.set(component.color);
        object.local.intensity = component.intensity * 12;
        object.local.distance = component.range;
        object.local.decay = 1.2;
        object.local.castShadow = shadows && this.dimension === "3d";
        if (object.local instanceof THREE.SpotLight) {
            object.local.angle = Math.min(Math.PI / 2 - 0.01, (component.spotAngle / 2) * (Math.PI / 180));
            object.local.penumbra = 0.35;
        }
    }

    private createParticles(object: EntityObject, emitter: ParticleEmitter, component: ParticleSystemComponent) {
        const capacity = emitter.capacity;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute("pcolor", new THREE.BufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute("size", new THREE.BufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage));
        geometry.setDrawRange(0, 0);
        const material = new THREE.ShaderMaterial({
            vertexShader: PARTICLE_VERTEX,
            fragmentShader: PARTICLE_FRAGMENT,
            uniforms: { pixelScale: { value: 100 }, isOrtho: { value: 0 } },
            transparent: true,
            depthWrite: false,
            blending: THREE.NormalBlending,
        });
        const points = new THREE.Points(geometry, material);
        points.frustumCulled = false;
        points.renderOrder = 50;
        if (component.worldSpace) this.root.add(points);
        else object.group.add(points);
        object.particles = { object: points, geometry, emitter, worldSpace: component.worldSpace };
    }

    private removeParticles(object: EntityObject) {
        if (!object.particles) return;
        object.particles.object.parent?.remove(object.particles.object);
        object.particles.geometry.dispose();
        (object.particles.object.material as THREE.Material).dispose();
        object.particles = null;
    }

    private readonly startColor = new THREE.Color();
    private readonly endColor = new THREE.Color();

    private updateParticles(visual: ParticleVisual, entity: RenderEntity) {
        const emitter = visual.emitter;
        const component = emitter.component;
        visual.object.visible = entity.visible;
        const positions = visual.geometry.getAttribute("position") as THREE.BufferAttribute;
        const colors = visual.geometry.getAttribute("pcolor") as THREE.BufferAttribute;
        const sizes = visual.geometry.getAttribute("size") as THREE.BufferAttribute;
        const count = Math.min(emitter.count, emitter.capacity);
        this.startColor.set(component.startColor);
        this.endColor.set(component.endColor);
        const p = positions.array as Float32Array;
        const c = colors.array as Float32Array;
        const s = sizes.array as Float32Array;
        for (let index = 0; index < count; index += 1) {
            p[index * 3] = emitter.positions[index * 3];
            p[index * 3 + 1] = emitter.positions[index * 3 + 1];
            p[index * 3 + 2] = -emitter.positions[index * 3 + 2];
            const life = emitter.ages[index * 2 + 1] || 1;
            const t = Math.min(1, emitter.ages[index * 2] / life);
            c[index * 4] = this.startColor.r + (this.endColor.r - this.startColor.r) * t;
            c[index * 4 + 1] = this.startColor.g + (this.endColor.g - this.startColor.g) * t;
            c[index * 4 + 2] = this.startColor.b + (this.endColor.b - this.startColor.b) * t;
            c[index * 4 + 3] = 1 - t * t;
            s[index] = component.startSize + (component.endSize - component.startSize) * t;
        }
        visual.geometry.setDrawRange(0, count);
        positions.needsUpdate = true;
        colors.needsUpdate = true;
        sizes.needsUpdate = true;
    }

    private updateDebugLines(lines: readonly RenderDebugLine[] | undefined) {
        if (!lines || !lines.length) {
            if (this.debugLines) this.debugLines.visible = false;
            return;
        }
        if (!this.debugLines) {
            const geometry = new THREE.BufferGeometry();
            this.debugLines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }));
            this.debugLines.renderOrder = 999;
            this.debugLines.frustumCulled = false;
            this.scene.add(this.debugLines);
        }
        const positions = new Float32Array(lines.length * 6);
        const colors = new Float32Array(lines.length * 6);
        const color = new THREE.Color();
        lines.forEach((line, index) => {
            positions.set([line.from.x, line.from.y, -line.from.z, line.to.x, line.to.y, -line.to.z], index * 6);
            color.set(line.color);
            colors.set([color.r, color.g, color.b, color.r, color.g, color.b], index * 6);
        });
        this.debugLines.geometry.dispose();
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        this.debugLines.geometry = geometry;
        this.debugLines.visible = true;
    }

    // -------------------------------------------------------------------
    // Editor decorations
    // -------------------------------------------------------------------

    private updateEditorDecorations(object: EntityObject, entity: RenderEntity) {
        const components = entity.components;
        const has = (type: GameComponent["type"]) => components.some((component) => component.type === type);
        let iconKind = "";
        if (has("camera")) iconKind = "camera";
        else if (has("light")) iconKind = "light";
        else if (has("particleSystem")) iconKind = "particles";
        else if (has("uiText")) iconKind = "text";
        else if (has("audioSource") && !object.visual) iconKind = "audio";
        else if (!object.visual) iconKind = "empty";
        if (!this.showIcons) iconKind = "";
        if (iconKind !== object.iconKind) {
            if (object.icon) {
                object.group.remove(object.icon);
                (object.icon.material as THREE.Material).dispose();
                object.icon = null;
            }
            if (iconKind) {
                const material = new THREE.SpriteMaterial({ map: this.assets.icon(iconKind as "camera"), sizeAttenuation: false, depthTest: false, transparent: true, toneMapped: false });
                object.icon = new THREE.Sprite(material);
                object.icon.scale.set(0.045, 0.045, 1);
                object.icon.renderOrder = 900;
                object.icon.userData.entityId = object.id;
                object.group.add(object.icon);
            }
            object.iconKind = iconKind;
        }
        if (object.icon) {
            // Counteract the entity scale so icons keep a constant size.
            const s = object.group.scale;
            object.icon.scale.set(0.045 / Math.max(1e-3, Math.abs(s.x)), 0.045 / Math.max(1e-3, Math.abs(s.y)), 1);
        }

        const selected = this.selection.includes(object.id);
        const camera = object.camera;
        const lightComponent = components.find((component): component is LightComponent => component.type === "light");
        const gizmoKey = camera
            ? `camera:${camera.projection}:${camera.fieldOfView}:${camera.orthographicSize}:${selected}:${this.width}x${this.height}`
            : lightComponent && lightComponent.lightType !== "point"
                ? `light:${lightComponent.lightType}:${selected}`
                : "";
        if (gizmoKey !== object.gizmoKey) {
            if (object.gizmo) {
                object.group.remove(object.gizmo);
                disposeObject(object.gizmo);
                object.gizmo = null;
            }
            if (camera) object.gizmo = this.cameraGizmo(camera, selected);
            else if (lightComponent && lightComponent.lightType !== "point") object.gizmo = this.lightGizmo(selected);
            if (object.gizmo) object.group.add(object.gizmo);
            object.gizmoKey = gizmoKey;
        }

        const collider = components.find((component): component is ColliderComponent => component.type === "collider");
        const showCollider = Boolean(collider && collider.enabled && (this.showColliders || selected));
        const colliderKey = showCollider && collider ? `${collider.shape}:${collider.size.x},${collider.size.y},${collider.size.z}:${collider.radius}:${collider.offset.x},${collider.offset.y},${collider.offset.z}:${collider.isTrigger}:${this.dimension}` : "";
        if (colliderKey !== object.colliderKey) {
            if (object.colliderGizmo) {
                object.group.remove(object.colliderGizmo);
                disposeObject(object.colliderGizmo);
                object.colliderGizmo = null;
            }
            if (showCollider && collider) {
                object.colliderGizmo = this.colliderGizmo(collider);
                object.group.add(object.colliderGizmo);
            }
            object.colliderKey = colliderKey;
        }

        if (selected) {
            let helper = this.selectionHelpers.get(object.id);
            if (!helper) {
                helper = new THREE.BoxHelper(object.group, 0xf59e0b);
                (helper.material as THREE.LineBasicMaterial).depthTest = false;
                (helper.material as THREE.LineBasicMaterial).transparent = true;
                helper.renderOrder = 998;
                this.selectionHelpers.set(object.id, helper);
                this.scene.add(helper);
            }
            helper.visible = entity.visible && Boolean(object.visual);
            if (helper.visible) helper.setFromObject(object.visual ?? object.group);
        }
    }

    private cameraGizmo(camera: CameraComponent, selected: boolean): THREE.Object3D {
        const aspect = this.width > 0 ? Math.min(2.4, Math.max(0.4, this.width / this.height)) : 16 / 9;
        const points: THREE.Vector3[] = [];
        const distance = 1.6;
        let hw: number;
        let hh: number;
        if (camera.projection === "orthographic") {
            hh = camera.orthographicSize;
            hw = hh * aspect;
            const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
            for (let index = 0; index < 4; index += 1) {
                const [ax, ay] = corners[index];
                const [bx, by] = corners[(index + 1) % 4];
                points.push(new THREE.Vector3(ax, ay, 0), new THREE.Vector3(bx, by, 0));
                points.push(new THREE.Vector3(ax, ay, -distance * 4), new THREE.Vector3(bx, by, -distance * 4));
                points.push(new THREE.Vector3(ax, ay, 0), new THREE.Vector3(ax, ay, -distance * 4));
            }
        } else {
            hh = Math.tan((camera.fieldOfView * Math.PI) / 360) * distance;
            hw = hh * aspect;
            const corners = [new THREE.Vector3(-hw, -hh, -distance), new THREE.Vector3(hw, -hh, -distance), new THREE.Vector3(hw, hh, -distance), new THREE.Vector3(-hw, hh, -distance)];
            for (let index = 0; index < 4; index += 1) {
                points.push(new THREE.Vector3(0, 0, 0), corners[index]);
                points.push(corners[index], corners[(index + 1) % 4]);
            }
            points.push(new THREE.Vector3(-hw * 0.4, hh * 1.1, -distance), new THREE.Vector3(0, hh * 1.5, -distance));
            points.push(new THREE.Vector3(0, hh * 1.5, -distance), new THREE.Vector3(hw * 0.4, hh * 1.1, -distance));
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: selected ? 0x93c5fd : 0x64748b, transparent: true, opacity: selected ? 1 : 0.7 }));
        lines.raycast = () => undefined;
        return lines;
    }

    private lightGizmo(selected: boolean): THREE.Object3D {
        const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -2.2)];
        for (const [x, y] of [[0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]]) {
            points.push(new THREE.Vector3(x, y, 0), new THREE.Vector3(x, y, -1.6));
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: selected ? 0xfde047 : 0xa16207, transparent: true, opacity: 0.9 }));
        lines.raycast = () => undefined;
        return lines;
    }

    private colliderGizmo(collider: ColliderComponent): THREE.Object3D {
        const color = collider.isTrigger ? 0x38bdf8 : 0x4ade80;
        const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false });
        let object: THREE.Object3D;
        if (collider.shape === "box") {
            const size = this.dimension === "2d" ? { x: collider.size.x, y: collider.size.y, z: 0.001 } : collider.size;
            const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(Math.max(0.001, size.x), Math.max(0.001, size.y), Math.max(0.001, size.z)));
            object = new THREE.LineSegments(geometry, material);
        } else {
            const group = new THREE.Group();
            const circle = (rotation: THREE.Euler) => {
                const curve = new THREE.EllipseCurve(0, 0, collider.radius, collider.radius, 0, Math.PI * 2);
                const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(64));
                const loop = new THREE.LineLoop(geometry, material);
                loop.rotation.copy(rotation);
                group.add(loop);
            };
            circle(new THREE.Euler(0, 0, 0));
            if (this.dimension === "3d") {
                circle(new THREE.Euler(Math.PI / 2, 0, 0));
                circle(new THREE.Euler(0, Math.PI / 2, 0));
            }
            object = group;
        }
        object.position.set(collider.offset.x, collider.offset.y, -collider.offset.z);
        object.renderOrder = 997;
        object.traverse((child) => {
            child.raycast = () => undefined;
        });
        return object;
    }

    // -------------------------------------------------------------------
    // Cameras & rendering
    // -------------------------------------------------------------------

    private activeCamera(): THREE.Camera {
        if (this.options.mode === "editor") return this.dimension === "2d" ? this.editorCamera2D! : this.editorCamera3D!;
        return this.syncGameCamera();
    }

    private syncGameCamera(): THREE.PerspectiveCamera | THREE.OrthographicCamera {
        const aspect = this.width / Math.max(1, this.height);
        const primary = this.primary;
        const orthographic = primary ? primary.component.projection === "orthographic" : this.dimension === "2d";
        if (!this.gameCamera || (orthographic ? !(this.gameCamera instanceof THREE.OrthographicCamera) : !(this.gameCamera instanceof THREE.PerspectiveCamera))) {
            this.gameCamera = orthographic ? new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000) : new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
        }
        const camera = this.gameCamera;
        if (primary) {
            toThreePosition(primary.world.position, camera.position);
            toThreeQuaternion(primary.world.rotation, camera.quaternion);
            camera.near = Math.max(0.001, primary.component.nearClip);
            camera.far = Math.max(camera.near + 0.1, primary.component.farClip);
        } else {
            camera.position.set(0, this.dimension === "2d" ? 0 : 3, 10);
            camera.quaternion.identity();
            if (this.dimension === "3d") camera.lookAt(0, 0, 0);
            camera.near = 0.1;
            camera.far = 1000;
        }
        if (camera instanceof THREE.OrthographicCamera) {
            const size = primary ? Math.max(0.01, primary.component.orthographicSize) : 5;
            camera.left = -size * aspect;
            camera.right = size * aspect;
            camera.top = size;
            camera.bottom = -size;
            // Orthographic cameras must see objects behind their position in 2D.
            camera.near = this.dimension === "2d" ? -1000 : camera.near;
        } else {
            camera.fov = primary ? Math.max(1, Math.min(179, primary.component.fieldOfView)) : 60;
            camera.aspect = aspect;
        }
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        return camera;
    }

    private positionDirectionalLights(camera: THREE.Camera) {
        const focus = new THREE.Vector3();
        if (this.options.mode === "editor" && this.orbit) focus.copy(this.orbit.target);
        else {
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            focus.copy(camera.position).addScaledVector(forward, 12);
        }
        const direction = new THREE.Vector3();
        for (const object of this.objects.values()) {
            const light = object.directional;
            if (!light || !light.visible) continue;
            direction.set(0, 0, -1).applyQuaternion(object.group.quaternion).normalize();
            light.target.position.copy(focus);
            light.position.copy(focus).addScaledVector(direction, -60);
            light.target.updateMatrixWorld();
        }
        if (this.fallbackSun.visible) {
            this.fallbackSun.target.position.copy(focus);
            this.fallbackSun.position.copy(focus).add(new THREE.Vector3(18, 36, 24));
            this.fallbackSun.target.updateMatrixWorld();
        }
    }

    private updateParticleUniforms(camera: THREE.Camera) {
        let pixelScale: number;
        let ortho = 0;
        if (camera instanceof THREE.OrthographicCamera) {
            ortho = 1;
            pixelScale = (this.height * camera.zoom) / Math.max(1e-6, camera.top - camera.bottom);
        } else {
            const perspective = camera as THREE.PerspectiveCamera;
            pixelScale = this.height / (2 * Math.tan((perspective.fov * Math.PI) / 360));
        }
        pixelScale *= this.renderer.getPixelRatio();
        for (const object of this.objects.values()) {
            if (!object.particles) continue;
            const material = object.particles.object.material as THREE.ShaderMaterial;
            material.uniforms.pixelScale.value = pixelScale;
            material.uniforms.isOrtho.value = ortho;
        }
    }

    /** Syncs `frame` (when given) and draws one image. */
    render(frame?: RenderFrame) {
        if (this.disposed) return;
        if (frame) this.sync(frame);
        const camera = this.activeCamera();
        if (this.orbit) this.orbit.update();
        this.positionDirectionalLights(camera);
        this.updateParticleUniforms(camera);
        this.renderer.render(this.scene, camera);
    }

    /** JPEG snapshot of the current view (for thumbnails). */
    snapshot(frame?: RenderFrame, quality = 0.72): string {
        this.render(frame);
        try {
            return this.canvas.toDataURL("image/jpeg", quality);
        } catch {
            return "";
        }
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.resizeObserver?.disconnect();
        this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
        this.canvas.removeEventListener("pointerup", this.handlePointerUp);
        this.transform?.detach();
        this.transform?.dispose();
        this.orbit?.dispose();
        for (const object of this.objects.values()) this.removeObject(object);
        this.objects.clear();
        for (const helper of this.selectionHelpers.values()) helper.geometry.dispose();
        if (this.gridGroup) disposeObject(this.gridGroup);
        if (this.debugLines) disposeObject(this.debugLines);
        this.assets.dispose();
        this.renderer.dispose();
        this.canvas.remove();
    }
}
