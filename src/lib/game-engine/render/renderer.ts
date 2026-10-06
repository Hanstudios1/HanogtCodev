/**
 * WebGL scene renderer (three.js) shared by the editor Scene view, the Game
 * view, the Arcade player and exported builds.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import type { TRS } from "../math";
import { forEachTile } from "../tilemap";
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
    TilemapComponent,
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
    /** Camera shake: offset along the camera's right/up in world units and a roll in degrees. */
    cameraShake?: { x: number; y: number; roll: number } | null;
}

export type GizmoMode = "translate" | "rotate" | "scale";

/** Transform gizmo snapping (null = off). Rotation is in degrees. */
export interface SnapSettings {
    translate: number | null;
    rotate: number | null;
    scale: number | null;
}

/** Cells highlighted by the tile painter, in the tilemap's cell coordinates. */
export interface TileCursor {
    entityId: string;
    cellSize: number;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    erase: boolean;
}

export interface RenderStats {
    drawCalls: number;
    triangles: number;
}

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
    /** Several selected objects moved, turned or scaled together by the gizmo (new world transforms). */
    onGizmoChangeMany?: (changes: Array<{ id: string; world: TRS }>) => void;
    /** Shift + drag in the Scene view: the objects inside the box. */
    onMarquee?: (entityIds: string[], additive: boolean) => void;
}

/** The gizmo is on the selection's center when several objects are selected. */
const MULTI_GIZMO = "\u0000multi";

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
    tilemap: THREE.Group | null = null;
    tilemapKey = "";
    tileCursor: THREE.Object3D | null = null;
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

const VIGNETTE_SHADER = {
    uniforms: { tDiffuse: { value: null }, intensity: { value: 0.35 } },
    vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform float intensity;
varying vec2 vUv;
void main() {
    vec4 color = texture2D(tDiffuse, vUv);
    float edge = smoothstep(0.85, 0.25, length(vUv - 0.5) * 1.3);
    color.rgb *= mix(1.0, edge, intensity);
    gl_FragColor = color;
}`,
};

/** Unlit, double-sided material shared by sprites and tilemaps. */
function flatMaterial(parameters: THREE.MeshBasicMaterialParameters = {}) {
    return new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, ...parameters });
}

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
    /** Stand-in the gizmo moves while several objects are selected, and where it and they started. */
    private readonly multiPivot = new THREE.Object3D();
    private multiStart: { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3; objects: Array<{ id: string; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }> } | null = null;
    private marquee: { pointerId: number; x0: number; y0: number; x1: number; y1: number; additive: boolean; element: HTMLDivElement } | null = null;
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
    private cameraShake: { x: number; y: number; roll: number } | null = null;
    hasCamera = false;

    private debugLines: THREE.LineSegments | null = null;
    private frameNumber = 0;

    // Post-processing (bloom, vignette)
    private composer: EffectComposer | null = null;
    private renderPass: RenderPass | null = null;
    private bloomPass: UnrealBloomPass | null = null;
    private vignettePass: ShaderPass | null = null;
    private effects: SceneSettings["postProcessing"] | null = null;
    /** Shows bloom/vignette in the editor's Scene view too. */
    showEffects = false;

    // Tile painter
    private paintMode = false;
    private cursorKey = "";
    private lastStats: RenderStats = { drawCalls: 0, triangles: 0 };

    constructor(readonly container: HTMLElement, options: SceneRendererOptions) {
        this.options = options;
        this.renderer = new THREE.WebGLRenderer({ antialias: options.antialias ?? true, alpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance" });
        this.renderer.setPixelRatio(Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.NeutralToneMapping;
        this.renderer.toneMappingExposure = 1;
        this.renderer.shadowMap.enabled = options.shadows ?? true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        // Reset once per frame so multi-pass (post-processing) frames report their totals.
        this.renderer.info.autoReset = false;
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
            if (this.attachedId === MULTI_GIZMO) {
                if (dragging) this.beginMultiDrag();
                else this.multiStart = null;
            }
            if (this.attachedId) {
                if (dragging) this.options.onGizmoStart?.(this.attachedId);
                else this.options.onGizmoEnd?.(this.attachedId);
            }
        });
        this.transform.addEventListener("objectChange", () => {
            if (!this.attachedId) return;
            if (this.attachedId === MULTI_GIZMO) {
                this.applyMultiDrag();
                return;
            }
            const object = this.objects.get(this.attachedId);
            if (!object) return;
            if (this.dimension === "2d") {
                object.group.position.z = Math.round(object.group.position.z * 1000) / 1000;
            }
            this.options.onGizmoChange?.(this.attachedId, readTRS(object.group));
        });
        this.scene.add(this.transform.getHelper());
        this.scene.add(this.multiPivot);
        // Capture phase: Shift + drag starts a box selection before the view controls see the press.
        this.canvas.addEventListener("pointerdown", this.handlePointerDown, { capture: true });
        this.canvas.addEventListener("pointermove", this.handlePointerMove);
        this.canvas.addEventListener("pointerup", this.handlePointerUp);
        this.canvas.addEventListener("pointercancel", this.handlePointerCancel);
        this.applyEditorDimension();
    }

    private applyEditorDimension() {
        if (!this.orbit || !this.transform) return;
        const camera = this.dimension === "2d" ? this.editorCamera2D! : this.editorCamera3D!;
        this.orbit.object = camera;
        this.transform.camera = camera;
        if (this.dimension === "2d") this.orbit.target.set(camera.position.x, camera.position.y, 0);
        this.applyOrbitButtons();
        this.orbit.update();
        this.rebuildGrid();
        this.applyGizmoConstraints();
    }

    /** While painting tiles the left button / one finger paints instead of moving the view. */
    private applyOrbitButtons() {
        if (!this.orbit) return;
        const is2D = this.dimension === "2d";
        this.orbit.enableRotate = !is2D;
        if (is2D) {
            this.orbit.mouseButtons = { LEFT: this.paintMode ? null : THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
            this.orbit.touches = { ONE: this.paintMode ? null : THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
        } else {
            this.orbit.mouseButtons = { LEFT: this.paintMode ? null : THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
            this.orbit.touches = { ONE: this.paintMode ? null : THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
        }
    }

    setPaintMode(enabled: boolean) {
        if (this.paintMode === enabled) return;
        this.paintMode = enabled;
        this.applyOrbitButtons();
        this.refreshAttachment();
        if (!enabled) this.setTileCursor(null);
    }

    setSnap(snap: SnapSettings | null) {
        if (!this.transform) return;
        this.transform.setTranslationSnap(snap?.translate ?? null);
        this.transform.setRotationSnap(snap?.rotate ? THREE.MathUtils.degToRad(snap.rotate) : null);
        this.transform.setScaleSnap(snap?.scale ?? null);
    }

    /** Point under the pointer on an entity's local XY plane (its own coordinates), or null. */
    localPointOnEntity(clientX: number, clientY: number, entityId: string): { x: number; y: number } | null {
        const object = this.objects.get(entityId);
        if (!object) return null;
        const camera = this.activeCamera();
        const rect = this.canvas.getBoundingClientRect();
        const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        this.raycaster.setFromCamera(pointer, camera);
        object.group.updateMatrixWorld(true);
        const origin = object.group.getWorldPosition(new THREE.Vector3());
        const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(object.group.getWorldQuaternion(new THREE.Quaternion()));
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin);
        const hit = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
        if (!hit) return null;
        const local = object.group.worldToLocal(hit);
        return { x: local.x, y: local.y };
    }

    /** Highlights the painter's target cells (or clears the highlight). */
    setTileCursor(cursor: TileCursor | null) {
        const key = cursor ? JSON.stringify(cursor) : "";
        if (key === this.cursorKey) return;
        this.cursorKey = key;
        for (const object of this.objects.values()) {
            if (!object.tileCursor) continue;
            object.group.remove(object.tileCursor);
            disposeObject(object.tileCursor);
            object.tileCursor = null;
        }
        const object = cursor ? this.objects.get(cursor.entityId) : undefined;
        if (!cursor || !object) return;
        const size = cursor.cellSize;
        const x0 = Math.min(cursor.x0, cursor.x1) * size;
        const y0 = Math.min(cursor.y0, cursor.y1) * size;
        const x1 = (Math.max(cursor.x0, cursor.x1) + 1) * size;
        const y1 = (Math.max(cursor.y0, cursor.y1) + 1) * size;
        const group = new THREE.Group();
        const outline = new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x0, y0, 0), new THREE.Vector3(x1, y0, 0), new THREE.Vector3(x1, y1, 0), new THREE.Vector3(x0, y1, 0)]),
            new THREE.LineBasicMaterial({ color: cursor.erase ? 0xf87171 : 0xffffff, depthTest: false, transparent: true }),
        );
        const fill = new THREE.Mesh(
            new THREE.PlaneGeometry(x1 - x0, y1 - y0).translate((x0 + x1) / 2, (y0 + y1) / 2, 0),
            new THREE.MeshBasicMaterial({ color: cursor.erase ? 0xef4444 : 0x818cf8, transparent: true, opacity: 0.22, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
        );
        group.add(fill, outline);
        group.renderOrder = 996;
        group.traverse((child) => {
            child.renderOrder = 996;
            child.raycast = () => undefined;
        });
        object.group.add(group);
        object.tileCursor = group;
    }

    get renderStats(): RenderStats {
        return this.lastStats;
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
        this.composer?.setSize(width, height);
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
        const usable = this.gizmoEnabled && !this.paintMode ? this.selection.filter((item) => this.objects.has(item)) : [];
        if (usable.length > 1) {
            if (!this.dragging) this.placeMultiPivot(usable);
            if (this.attachedId !== MULTI_GIZMO) {
                this.transform.attach(this.multiPivot);
                this.attachedId = MULTI_GIZMO;
            }
            return;
        }
        if (this.attachedId === MULTI_GIZMO) {
            this.transform.detach();
            this.attachedId = null;
            this.multiStart = null;
        }
        const id = usable[0] ?? null;
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

    /** Puts the multi-object gizmo on the selection's center (turned like the first object in local space). */
    private placeMultiPivot(ids: readonly string[]) {
        const center = new THREE.Vector3();
        for (const id of ids) center.add(this.objects.get(id)!.group.position);
        center.divideScalar(ids.length);
        this.multiPivot.position.copy(center);
        const first = this.objects.get(ids[0])!.group;
        if (this.gizmoSpace === "local" || this.gizmoMode === "scale") this.multiPivot.quaternion.copy(first.quaternion);
        else this.multiPivot.quaternion.identity();
        this.multiPivot.scale.set(1, 1, 1);
        this.multiPivot.updateMatrixWorld(true);
    }

    private beginMultiDrag() {
        const ids = this.selection.filter((id) => this.objects.has(id));
        this.multiStart = {
            position: this.multiPivot.position.clone(),
            quaternion: this.multiPivot.quaternion.clone(),
            scale: this.multiPivot.scale.clone(),
            objects: ids.map((id) => {
                const group = this.objects.get(id)!.group;
                return { id, position: group.position.clone(), quaternion: group.quaternion.clone(), scale: group.scale.clone() };
            }),
        };
    }

    /** The objects follow the stand-in as one group: moved, turned around and scaled from the center. */
    private applyMultiDrag() {
        const start = this.multiStart;
        if (!start) return;
        const pivot = this.multiPivot;
        if (this.dimension === "2d") pivot.position.z = Math.round(pivot.position.z * 1000) / 1000;
        const move = pivot.position.clone().sub(start.position);
        const turn = pivot.quaternion.clone().multiply(start.quaternion.clone().invert());
        const ratio = new THREE.Vector3(pivot.scale.x / (start.scale.x || 1), pivot.scale.y / (start.scale.y || 1), pivot.scale.z / (start.scale.z || 1));
        const inverseFrame = start.quaternion.clone().invert();
        const temp = new THREE.Object3D();
        const changes = start.objects.map((item) => {
            temp.position.copy(item.position);
            temp.quaternion.copy(item.quaternion);
            temp.scale.copy(item.scale);
            if (this.gizmoMode === "translate") temp.position.add(move);
            else if (this.gizmoMode === "rotate") {
                temp.position.sub(start.position).applyQuaternion(turn).add(start.position);
                temp.quaternion.premultiply(turn);
            } else {
                const offset = item.position.clone().sub(start.position).applyQuaternion(inverseFrame).multiply(ratio).applyQuaternion(start.quaternion);
                temp.position.copy(start.position).add(offset);
                temp.scale.set(item.scale.x * ratio.x, item.scale.y * ratio.y, item.scale.z * ratio.z);
            }
            return { id: item.id, world: readTRS(temp) };
        });
        this.options.onGizmoChangeMany?.(changes);
    }

    private handlePointerDown = (event: PointerEvent) => {
        this.pointerDown = { x: event.clientX, y: event.clientY, time: performance.now() };
        const onGizmo = Boolean((this.transform as unknown as { axis?: string | null } | null)?.axis);
        if (this.options.mode !== "editor" || !this.options.onMarquee || event.button !== 0 || !event.shiftKey || this.paintMode || onGizmo) return;
        // Shift + drag: box selection instead of moving the view.
        event.stopImmediatePropagation();
        event.preventDefault();
        const element = document.createElement("div");
        element.setAttribute("data-scene-marquee", "");
        Object.assign(element.style, { position: "absolute", pointerEvents: "none", zIndex: "6", border: "1px solid rgba(129,140,248,0.9)", background: "rgba(99,102,241,0.12)", borderRadius: "2px", display: "none" });
        this.container.appendChild(element);
        this.marquee = { pointerId: event.pointerId, x0: event.clientX, y0: event.clientY, x1: event.clientX, y1: event.clientY, additive: event.ctrlKey || event.metaKey, element };
        try {
            this.canvas.setPointerCapture(event.pointerId);
        } catch {
            // The pointer may already be gone.
        }
    };

    private handlePointerMove = (event: PointerEvent) => {
        const marquee = this.marquee;
        if (!marquee || event.pointerId !== marquee.pointerId) return;
        marquee.x1 = event.clientX;
        marquee.y1 = event.clientY;
        const bounds = this.container.getBoundingClientRect();
        const left = Math.min(marquee.x0, marquee.x1) - bounds.left;
        const top = Math.min(marquee.y0, marquee.y1) - bounds.top;
        Object.assign(marquee.element.style, { display: "block", left: `${left}px`, top: `${top}px`, width: `${Math.abs(marquee.x1 - marquee.x0)}px`, height: `${Math.abs(marquee.y1 - marquee.y0)}px` });
    };

    private handlePointerCancel = () => {
        this.endMarquee();
    };

    private endMarquee() {
        const marquee = this.marquee;
        if (!marquee) return null;
        this.marquee = null;
        marquee.element.remove();
        try {
            this.canvas.releasePointerCapture(marquee.pointerId);
        } catch {
            // Already released.
        }
        return marquee;
    }

    /** Objects whose drawn center falls inside a box given in page coordinates. */
    objectsInBox(left: number, top: number, right: number, bottom: number): string[] {
        const camera = this.activeCamera();
        camera.updateMatrixWorld();
        const rect = this.canvas.getBoundingClientRect();
        const box = new THREE.Box3();
        const center = new THREE.Vector3();
        const ids: string[] = [];
        for (const object of this.objects.values()) {
            if (!object.group.visible) continue;
            object.group.updateMatrixWorld(true);
            if (object.visual) box.setFromObject(object.visual);
            else box.makeEmpty();
            if (box.isEmpty()) object.group.getWorldPosition(center);
            else box.getCenter(center);
            center.project(camera);
            if (center.z < -1 || center.z > 1) continue;
            const x = rect.left + ((center.x + 1) / 2) * rect.width;
            const y = rect.top + ((1 - center.y) / 2) * rect.height;
            if (x >= left && x <= right && y >= top && y <= bottom) ids.push(object.id);
        }
        return ids;
    }

    private handlePointerUp = (event: PointerEvent) => {
        if (this.marquee && event.pointerId === this.marquee.pointerId) {
            const marquee = this.endMarquee()!;
            this.pointerDown = null;
            if (Math.hypot(marquee.x1 - marquee.x0, marquee.y1 - marquee.y0) <= 5) {
                // A Shift-click, not a drag: add or remove the object under the pointer.
                this.options.onPick?.(this.pick(event.clientX, event.clientY), true);
                return;
            }
            const ids = this.objectsInBox(Math.min(marquee.x0, marquee.x1), Math.min(marquee.y0, marquee.y1), Math.max(marquee.x0, marquee.x1), Math.max(marquee.y0, marquee.y1));
            this.options.onMarquee?.(ids, marquee.additive);
            return;
        }
        const down = this.pointerDown;
        this.pointerDown = null;
        if (!down || event.button !== 0 || this.dragging || this.paintMode) return;
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
            if (object.tilemap) candidates.push(...object.tilemap.children);
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
        const key = JSON.stringify([settings.background, settings.ambientColor, settings.ambientIntensity, settings.fog, settings.postProcessing, cameraBackground, this.dimension]);
        if (key === this.settingsKey) return;
        this.settingsKey = key;
        this.renderer.toneMappingExposure = settings.postProcessing?.exposure ?? 1;
        this.effects = settings.postProcessing ?? null;
        this.configureEffects();
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
        if (!settings.fog.enabled) this.scene.fog = null;
        else if (settings.fog.mode === "exponential") this.scene.fog = new THREE.FogExp2(settings.fog.color, settings.fog.density);
        else this.scene.fog = new THREE.Fog(settings.fog.color, settings.fog.near, Math.max(settings.fog.near + 0.1, settings.fog.far));
    }

    /** Creates, updates or drops the post-processing chain for the current settings. */
    private configureEffects() {
        const effects = this.effects;
        const wanted = Boolean(effects && (effects.bloom.enabled || effects.vignette.enabled) && (this.options.mode === "game" || this.showEffects));
        if (!wanted || !effects) {
            if (this.composer) {
                this.composer.dispose();
                this.bloomPass?.dispose();
                this.composer = null;
                this.renderPass = null;
                this.bloomPass = null;
                this.vignettePass = null;
            }
            return;
        }
        if (!this.composer) {
            this.composer = new EffectComposer(this.renderer);
            this.composer.setPixelRatio(this.renderer.getPixelRatio());
            this.composer.setSize(this.width, this.height);
            this.renderPass = new RenderPass(this.scene, this.activeCamera());
            this.bloomPass = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), effects.bloom.intensity, effects.bloom.radius, effects.bloom.threshold);
            this.vignettePass = new ShaderPass(VIGNETTE_SHADER);
            this.composer.addPass(this.renderPass);
            this.composer.addPass(this.bloomPass);
            this.composer.addPass(this.vignettePass);
            this.composer.addPass(new OutputPass());
        }
        if (this.bloomPass) {
            this.bloomPass.enabled = effects.bloom.enabled;
            this.bloomPass.strength = effects.bloom.intensity;
            this.bloomPass.radius = effects.bloom.radius;
            this.bloomPass.threshold = effects.bloom.threshold;
        }
        if (this.vignettePass) {
            this.vignettePass.enabled = effects.vignette.enabled;
            this.vignettePass.uniforms.intensity.value = effects.vignette.intensity;
        }
    }

    /** Editor toggle: show bloom/vignette in the Scene view. */
    setEffectsVisible(visible: boolean) {
        this.showEffects = visible;
        this.configureEffects();
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
        this.cameraShake = frame.cameraShake ?? null;
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
        let tilemap: TilemapComponent | undefined;
        for (const component of entity.components) {
            switch (component.type) {
                case "meshRenderer": mesh ??= component; break;
                case "spriteRenderer": sprite ??= component; break;
                case "light": light ??= component; break;
                case "camera": camera ??= component; break;
                case "particleSystem": particles ??= component; break;
                case "tilemap": tilemap ??= component; break;
            }
        }
        if (mesh?.enabled) this.ensureMesh(object, mesh);
        else if (sprite?.enabled) this.ensureSprite(object, sprite);
        else this.removeVisual(object);
        if (tilemap?.enabled) this.ensureTilemap(object, tilemap);
        else this.removeTilemap(object);
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
        let map = texture;
        const columns = Math.max(1, component.sheet?.columns ?? 1);
        const rows = Math.max(1, component.sheet?.rows ?? 1);
        if (map && columns * rows > 1) {
            // One cell of the sprite sheet: a per-object texture view with its own UV window.
            if (!object.mapClone || object.mapClone.source !== map.source) {
                object.mapClone?.dispose();
                object.mapClone = map.clone();
                object.mapClone.needsUpdate = true;
            }
            const count = columns * rows;
            const frame = (((component.frame ?? 0) % count) + count) % count;
            object.mapClone.repeat.set(1 / columns, 1 / rows);
            object.mapClone.offset.set((frame % columns) / columns, 1 - (Math.floor(frame / columns) + 1) / rows);
            map = object.mapClone;
        }
        if (material.map !== map) {
            material.map = map;
            material.needsUpdate = true;
        }
        material.alphaTest = map ? 0.02 : 0;
        object.visual.scale.set(component.flipX ? -1 : 1, component.flipY ? -1 : 1, 1);
        object.visual.renderOrder = 10 + component.sortingLayer;
        object.visual.castShadow = false;
        object.visual.receiveShadow = false;
    }

    private removeTilemap(object: EntityObject) {
        if (!object.tilemap) return;
        object.group.remove(object.tilemap);
        disposeObject(object.tilemap);
        object.tilemap = null;
        object.tilemapKey = "";
    }

    /** Builds one mesh for plain colored tiles and one for atlas tiles (rebuilt only when the grid changes). */
    private ensureTilemap(object: EntityObject, component: TilemapComponent) {
        const atlas = component.atlas.textureId ? this.assets.texture(component.atlas.textureId) : null;
        const key = JSON.stringify([component.rows, component.origin, component.cellSize, component.palette, component.atlas, component.sortingLayer, atlas?.uuid ?? null]);
        if (object.tilemap && object.tilemapKey === key) return;
        this.removeTilemap(object);
        const palette = new Map(component.palette.map((tile) => [tile.key, tile]));
        const size = component.cellSize;
        const columns = Math.max(1, component.atlas.columns);
        const rows = Math.max(1, component.atlas.rows);
        const texel = this.assets.textureSize(component.atlas.textureId);
        // Half a texel inset keeps neighbouring atlas cells from bleeding in.
        const insetU = texel ? 0.5 / texel.width : 0;
        const insetV = texel ? 0.5 / texel.height : 0;
        const plain = { positions: [] as number[], colors: [] as number[] };
        const textured = { positions: [] as number[], colors: [] as number[], uvs: [] as number[] };
        const color = new THREE.Color();
        const light = new THREE.Color();
        const dark = new THREE.Color();
        forEachTile(component, (x, y, cell) => {
            const tile = palette.get(cell);
            if (!tile) return;
            const x0 = x * size;
            const y0 = y * size;
            const x1 = x0 + size;
            const y1 = y0 + size;
            const corners = [x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y0, 0, x1, y1, 0, x0, y1, 0];
            color.set(tile.color);
            if (atlas && tile.frame >= 0) {
                const frame = Math.min(tile.frame, columns * rows - 1);
                const u0 = (frame % columns) / columns + insetU;
                const u1 = ((frame % columns) + 1) / columns - insetU;
                const v1 = 1 - Math.floor(frame / columns) / rows - insetV;
                const v0 = 1 - (Math.floor(frame / columns) + 1) / rows + insetV;
                textured.positions.push(...corners);
                textured.uvs.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
                for (let index = 0; index < 6; index += 1) textured.colors.push(color.r, color.g, color.b);
                return;
            }
            // A soft vertical gradient gives flat tiles some depth.
            light.copy(color).multiplyScalar(1.14);
            dark.copy(color).multiplyScalar(0.82);
            plain.positions.push(...corners);
            plain.colors.push(dark.r, dark.g, dark.b, dark.r, dark.g, dark.b, light.r, light.g, light.b, dark.r, dark.g, dark.b, light.r, light.g, light.b, light.r, light.g, light.b);
        });
        const group = new THREE.Group();
        group.userData.entityId = object.id;
        const order = 10 + component.sortingLayer;
        if (plain.positions.length) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", new THREE.Float32BufferAttribute(plain.positions, 3));
            geometry.setAttribute("color", new THREE.Float32BufferAttribute(plain.colors, 3));
            const mesh = new THREE.Mesh(geometry, flatMaterial({ vertexColors: true, transparent: false }));
            mesh.renderOrder = order;
            mesh.userData.entityId = object.id;
            group.add(mesh);
        }
        if (textured.positions.length && atlas) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", new THREE.Float32BufferAttribute(textured.positions, 3));
            geometry.setAttribute("color", new THREE.Float32BufferAttribute(textured.colors, 3));
            geometry.setAttribute("uv", new THREE.Float32BufferAttribute(textured.uvs, 2));
            const mesh = new THREE.Mesh(geometry, flatMaterial({ vertexColors: true, map: atlas, alphaTest: 0.02 }));
            mesh.renderOrder = order + 0.5;
            mesh.userData.entityId = object.id;
            group.add(mesh);
        }
        object.group.add(group);
        object.tilemap = group;
        object.tilemapKey = key;
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
        else if (has("uiButton") || has("uiPanel") || has("uiProgressBar")) iconKind = "ui";
        else if (has("audioSource") && !object.visual) iconKind = "audio";
        else if (!object.visual && !object.tilemap) iconKind = "empty";
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
            helper.visible = entity.visible && Boolean(object.visual || object.tilemap?.children.length);
            if (helper.visible) helper.setFromObject(object.visual ?? object.tilemap ?? object.group);
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
            const shake = this.cameraShake;
            if (shake) {
                // Along the camera's own right and up, so the shake reads the same at any angle.
                camera.translateX(shake.x);
                camera.translateY(shake.y);
                camera.rotateZ((shake.roll * Math.PI) / 180);
            }
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
        this.renderer.info.reset();
        if (this.composer && this.renderPass) {
            this.renderPass.camera = camera;
            this.composer.render();
        } else {
            this.renderer.render(this.scene, camera);
        }
        this.lastStats = { drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
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
        this.endMarquee();
        this.canvas.removeEventListener("pointerdown", this.handlePointerDown, { capture: true });
        this.canvas.removeEventListener("pointermove", this.handlePointerMove);
        this.canvas.removeEventListener("pointerup", this.handlePointerUp);
        this.canvas.removeEventListener("pointercancel", this.handlePointerCancel);
        this.transform?.detach();
        this.transform?.dispose();
        this.orbit?.dispose();
        for (const object of this.objects.values()) this.removeObject(object);
        this.objects.clear();
        for (const helper of this.selectionHelpers.values()) helper.geometry.dispose();
        if (this.gridGroup) disposeObject(this.gridGroup);
        if (this.debugLines) disposeObject(this.debugLines);
        this.composer?.dispose();
        this.bloomPass?.dispose();
        this.assets.dispose();
        this.renderer.dispose();
        // Free the GPU context now: previews and play sessions create many renderers over time.
        this.renderer.forceContextLoss();
        this.canvas.remove();
    }
}
