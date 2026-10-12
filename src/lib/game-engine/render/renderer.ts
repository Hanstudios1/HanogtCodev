/**
 * WebGL scene renderer (three.js) shared by the Game view, the Arcade player
 * and exported builds. The editor's Scene view extends it with its camera
 * controls, gizmos and picking (editor-renderer.ts), which the standalone
 * player never loads.
 */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import type { TRS } from "../math";
import { animatedTileFrame, forEachTile, tileFrameAt } from "../tilemap";
import type {
    CameraComponent,
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
    ModelAsset,
} from "../types";
import { particleColorAt, particleSizeAt, type ParticleEmitter } from "../runtime/particles";
import { RenderAssets, type LoadedModel } from "./assets";
import { applyTRS, toThreePosition, toThreeQuaternion } from "./convert";

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
    /** Seconds of game time for animated tiles (V6); the editor uses the clock. */
    time?: number;
}

export interface RenderStats {
    drawCalls: number;
    triangles: number;
}

export interface SceneRendererOptions {
    /** "editor" is the Scene view (EditorSceneRenderer); everything else draws the game. */
    mode: "editor" | "game";
    antialias?: boolean;
    shadows?: boolean;
    pixelArt?: boolean;
}

interface TileAnimation {
    uv: THREE.BufferAttribute;
    /** Each animated quad: its tile's animation and where its 6 UV pairs start. */
    quads: Array<{ animation: { frames: number[]; fps: number }; offset: number }>;
    /** Turns an atlas frame into its UV rectangle. */
    rect: (frame: number) => [number, number, number, number];
    /** Frame each animation showed last (only changed quads are rewritten). */
    shown: Map<object, number>;
}

interface ParticleVisual {
    object: THREE.Points;
    geometry: THREE.BufferGeometry;
    emitter: ParticleEmitter;
    worldSpace: boolean;
}

/** The three.js objects drawn for one entity (the editor adds its icons and gizmos). */
export class EntityObject {
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
    /** Animated tiles (V6): their quads' UVs change as frames advance. */
    tileAnimation: TileAnimation | null = null;
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

/** A soft round dot, or (V6) the system's image tinted by the particle colour. */
const PARTICLE_FRAGMENT = /* glsl */ `
varying vec4 vColor;
uniform sampler2D map;
uniform float useMap;
void main() {
    if (useMap > 0.5) {
        vec4 texel = texture2D(map, vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y));
        gl_FragColor = vec4(vColor.rgb * texel.rgb, vColor.a * texel.a);
        if (gl_FragColor.a < 0.01) discard;
        return;
    }
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

/**
 * Screen effects V2 in one pass: CRT curvature, pixelation, chromatic
 * aberration, color grading (in gamma space, so contrast and brightness feel
 * as they do in image editors) and CRT scanlines.
 */
const V5_EFFECTS_SHADER = {
    uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
        pixelRatio: { value: 1 },
        pixelSize: { value: 1 },
        aberration: { value: 0 },
        curvature: { value: 0 },
        scanlines: { value: 0 },
        grading: { value: 0 },
        saturation: { value: 0 },
        contrast: { value: 0 },
        brightness: { value: 0 },
        hue: { value: 0 },
        tint: { value: new THREE.Vector3(1, 1, 1) },
        tintAmount: { value: 0 },
        exposure: { value: 1 },
    },
    vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 resolution;
uniform float pixelRatio;
uniform float pixelSize;
uniform float aberration;
uniform float curvature;
uniform float scanlines;
uniform float grading;
uniform float saturation;
uniform float contrast;
uniform float brightness;
uniform float hue;
uniform vec3 tint;
uniform float tintAmount;
uniform float exposure;
varying vec2 vUv;

vec3 hueShift(vec3 color, float angle) {
    vec3 k = vec3(0.57735);
    float c = cos(angle);
    return color * c + cross(k, color) * sin(angle) + k * dot(k, color) * (1.0 - c);
}

void main() {
    vec2 uv = vUv;
    if (curvature > 0.0) {
        vec2 centered = uv * 2.0 - 1.0;
        centered *= 1.0 + dot(centered, centered) * curvature * 0.12;
        uv = centered * 0.5 + 0.5;
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
        }
    }
    if (pixelSize > 1.0) {
        vec2 cell = vec2(pixelSize * pixelRatio) / resolution;
        uv = (floor(uv / cell) + 0.5) * cell;
    }
    vec4 color = texture2D(tDiffuse, uv);
    if (aberration > 0.0) {
        vec2 offset = (uv - 0.5) * aberration * 0.02;
        color.r = texture2D(tDiffuse, uv + offset).r;
        color.b = texture2D(tDiffuse, uv - offset).b;
    }
    color.rgb *= exposure;
    if (grading > 0.5) {
        vec3 c = pow(max(color.rgb, 0.0), vec3(1.0 / 2.2));
        c += brightness * 0.35;
        c = (c - 0.5) * (1.0 + contrast) + 0.5;
        float grey = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(grey), c, 1.0 + saturation);
        if (hue != 0.0) c = hueShift(c, hue);
        c = mix(c, c * tint, tintAmount);
        color.rgb = pow(max(c, 0.0), vec3(2.2));
    }
    if (scanlines > 0.0) {
        float line = 0.5 + 0.5 * sin(vUv.y * resolution.y / pixelRatio * 2.0943951);
        color.rgb *= mix(1.0, 0.6 + 0.4 * line, scanlines);
        vec2 d = vUv - 0.5;
        color.rgb *= 1.0 - dot(d, d) * scanlines * 0.8;
    }
    gl_FragColor = color;
}`,
};

/** Unlit, double-sided material shared by sprites and tilemaps. */
function flatMaterial(parameters: THREE.MeshBasicMaterialParameters = {}) {
    return new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, ...parameters });
}

export function disposeObject(object: THREE.Object3D) {
    object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        // Sprites share one module-level geometry inside three.js; never dispose it.
        if (mesh.geometry && !(mesh.geometry.userData?.shared) && !(child as THREE.Sprite).isSprite) mesh.geometry.dispose();
        // Model materials are shared by every copy of the model (the assets cache disposes them).
        const material = (mesh as { material?: THREE.Material | THREE.Material[] }).material;
        if (Array.isArray(material)) material.forEach((item) => { if (!item.userData?.shared) item.dispose(); });
        else if (material && !material.userData?.shared) material.dispose();
    });
}

export class SceneRenderer {
    readonly renderer: THREE.WebGLRenderer;
    readonly scene = new THREE.Scene();
    readonly assets = new RenderAssets();
    readonly canvas: HTMLCanvasElement;
    protected readonly root = new THREE.Group();
    protected readonly objects = new Map<string, EntityObject>();
    private readonly hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    private readonly fallbackSun = new THREE.DirectionalLight(0xffffff, 1.1);
    protected readonly options: SceneRendererOptions;
    protected dimension: GameDimension = "3d";
    private settingsKey = "";
    protected width = 1;
    protected height = 1;
    private resizeObserver: ResizeObserver | null = null;
    protected disposed = false;

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
    private effectsPass: ShaderPass | null = null;
    private effects: SceneSettings["postProcessing"] | null = null;
    /** Shows bloom/vignette in the editor's Scene view too. */
    showEffects = false;

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
        this.assets.onModelLoaded = (hash) => this.modelLoaded(hash);
        this.scene.add(this.root);
        this.scene.add(this.hemi);
        this.fallbackSun.position.set(6, 12, 8);
        this.fallbackSun.castShadow = options.shadows ?? true;
        this.configureShadow(this.fallbackSun);
        this.scene.add(this.fallbackSun);
        this.scene.add(this.fallbackSun.target);
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

    protected configureShadow(light: THREE.DirectionalLight) {
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

    get renderStats(): RenderStats {
        return this.lastStats;
    }

    /** The project's GLB models (V5). */
    setModels(models: readonly ModelAsset[]) {
        this.assets.setModelAssets(models);
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
        this.updateEffectsResolution();
        this.resized();
    }

    /** The view changed size (the editor fits its cameras). */
    protected resized() {}

    get size() {
        return { width: this.width, height: this.height };
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

    private updateEffectsResolution() {
        if (!this.effectsPass) return;
        const ratio = this.renderer.getPixelRatio();
        this.effectsPass.uniforms.resolution.value.set(this.width * ratio, this.height * ratio);
        this.effectsPass.uniforms.pixelRatio.value = ratio;
    }

    /** Creates, updates or drops the post-processing chain for the current settings. */
    private configureEffects() {
        const effects = this.effects;
        const screenEffects = Boolean(effects && (effects.colorGrading?.enabled || effects.chromaticAberration?.enabled || effects.pixelate?.enabled || effects.crt?.enabled));
        const wanted = Boolean(effects && (effects.bloom.enabled || effects.vignette.enabled || screenEffects) && (this.options.mode === "game" || this.showEffects));
        // The composer tone maps the whole frame. 2D scenes are unlit sprites, so without bloom's
        // bright highlights that would only shift their colors from the plain look; exposure is then
        // a plain multiplier in the effects pass.
        const flat2D = Boolean(wanted && effects && this.dimension === "2d" && !effects.bloom.enabled);
        this.renderer.toneMapping = flat2D ? THREE.NoToneMapping : THREE.NeutralToneMapping;
        if (!wanted || !effects) {
            if (this.composer) {
                this.composer.dispose();
                this.bloomPass?.dispose();
                this.composer = null;
                this.renderPass = null;
                this.bloomPass = null;
                this.vignettePass = null;
                this.effectsPass = null;
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
            this.effectsPass = new ShaderPass(V5_EFFECTS_SHADER);
            this.composer.addPass(this.renderPass);
            this.composer.addPass(this.bloomPass);
            this.composer.addPass(this.vignettePass);
            this.composer.addPass(this.effectsPass);
            this.composer.addPass(new OutputPass());
            this.updateEffectsResolution();
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
        if (this.effectsPass) {
            const uniforms = this.effectsPass.uniforms;
            const grading = effects.colorGrading;
            const crt = effects.crt;
            this.effectsPass.enabled = screenEffects || (flat2D && effects.exposure !== 1);
            uniforms.exposure.value = flat2D ? effects.exposure : 1;
            uniforms.pixelSize.value = effects.pixelate?.enabled ? effects.pixelate.size : 1;
            uniforms.aberration.value = effects.chromaticAberration?.enabled ? effects.chromaticAberration.intensity : 0;
            uniforms.curvature.value = crt?.enabled ? crt.curvature : 0;
            uniforms.scanlines.value = crt?.enabled ? crt.scanlines : 0;
            uniforms.grading.value = grading?.enabled ? 1 : 0;
            if (grading) {
                uniforms.saturation.value = grading.saturation;
                uniforms.contrast.value = grading.contrast;
                uniforms.brightness.value = grading.brightness;
                uniforms.hue.value = (grading.hue * Math.PI) / 180;
                const tint = new THREE.Color(grading.tint).convertLinearToSRGB();
                uniforms.tint.value.set(tint.r, tint.g, tint.b);
                uniforms.tintAmount.value = grading.tintAmount;
            }
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
            this.dimensionChanged();
        }
        const seen = new Set<string>();
        type CameraCandidate = { entity: EntityObject; component: CameraComponent; world: TRS };
        let primary: CameraCandidate | null = null;
        let tagged: CameraCandidate | null = null;
        let fallback: CameraCandidate | null = null;
        let hasDirectional = false;
        this.frameNumber += 1;
        const time = frame.time ?? (typeof performance !== "undefined" ? performance.now() / 1000 : 0);
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
            if (!this.heldByGizmo(entity.id)) applyTRS(object.group, entity.world);
            if (object.directional) {
                object.directional.visible = entity.visible && Boolean(object.directionalComponent?.enabled);
                if (object.directional.visible) hasDirectional = true;
            }
            if (object.particles) this.updateParticles(object.particles, entity);
            if (object.tileAnimation) this.animateTiles(object.tileAnimation, time);
            if (object.camera && entity.visible && object.camera.enabled) {
                const candidate = { entity: object, component: object.camera, world: entity.world };
                if (!primary && object.camera.primary) primary = candidate;
                if (!tagged && entity.tag === "MainCamera") tagged = candidate;
                if (!fallback) fallback = candidate;
            }
            this.decorate(object, entity);
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
        this.synced();
    }

    // Hooks of the editor's Scene view (editor-renderer.ts); the game needs none of them.
    /** The scene switched between 2D and 3D. */
    protected dimensionChanged() {}
    /** The gizmo is dragging this object: the frame must not move it back. */
    protected heldByGizmo(id: string): boolean {
        void id;
        return false;
    }
    /** Icons, gizmos and selection boxes of one object. */
    protected decorate(object: EntityObject, entity: RenderEntity) {
        void object;
        void entity;
    }
    /** Every object of the frame is in place. */
    protected synced() {}
    /** An object left the scene. */
    protected removed(object: EntityObject) {
        void object;
    }
    /** An object's visuals were rebuilt. */
    protected rebuilt(object: EntityObject) {
        void object;
    }

    private removeObject(object: EntityObject) {
        this.removed(object);
        if (object.directional) {
            this.scene.remove(object.directional);
            this.scene.remove(object.directional.target);
            object.directional.dispose();
        }
        object.mapClone?.dispose();
        this.root.remove(object.group);
        disposeObject(object.group);
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
        if (particles && object.particles) this.applyParticleTexture(object.particles, particles);
        this.rebuilt(object);
    }

    private removeVisual(object: EntityObject) {
        if (!object.visual) return;
        object.group.remove(object.visual);
        (object.visual.material as THREE.Material).dispose();
        // A model's bounds box is its own; the model under it shares the cached geometry.
        if (object.visual.geometry.userData.ownBounds) object.visual.geometry.dispose();
        object.visual = null;
        object.visualKey = "";
    }

    /** Objects whose model just loaded rebuild with it (the primitive stood in meanwhile). */
    private modelLoaded(hash: string) {
        for (const object of this.objects.values()) {
            if (object.visualKey.endsWith(`|wait:${hash}`)) object.version = -1;
        }
    }

    /**
     * A Mesh Renderer with a model (V5): an invisible box the size of the model
     * takes picking, selection and bounds; a copy of the model hangs under it.
     */
    private ensureModel(object: EntityObject, component: MeshRendererComponent, hash: string, model: LoadedModel) {
        const key = `model:${hash}`;
        if (!object.visual || object.visualKey !== key) {
            this.removeVisual(object);
            const bounds = new THREE.BoxGeometry(Math.max(model.size.x, 0.01), Math.max(model.size.y, 0.01), Math.max(model.size.z, 0.01)).translate(model.center.x, model.center.y, model.center.z);
            bounds.userData.ownBounds = true;
            const proxy = new THREE.Mesh(bounds, new THREE.MeshBasicMaterial({ visible: false }));
            proxy.userData.entityId = object.id;
            const copy = model.scene.clone(true);
            copy.traverse((child) => { child.userData.entityId = object.id; });
            proxy.add(copy);
            object.visual = proxy;
            object.visualKey = key;
            object.group.add(proxy);
        }
        object.visual.traverse((child) => {
            if (!(child as THREE.Mesh).isMesh || child === object.visual) return;
            child.castShadow = component.castShadows;
            child.receiveShadow = component.receiveShadows;
        });
        object.visual.scale.set(1, 1, 1);
        object.visual.renderOrder = 0;
    }

    private ensureMesh(object: EntityObject, component: MeshRendererComponent) {
        const asset = this.assets.modelAsset(component.modelId);
        if (asset) {
            const model = this.assets.model(asset.hash);
            if (model) {
                this.ensureModel(object, component, asset.hash, model);
                return;
            }
        }
        // The primitive shows while a model loads (and when it can't).
        const key = `mesh:${component.mesh}${asset ? `|wait:${asset.hash}` : ""}`;
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
        object.tileAnimation = null;
    }

    /** Moves animated tiles (V6) to the frame of `time`. */
    private animateTiles(animation: TileAnimation, time: number) {
        let changed = false;
        const uvs = animation.uv.array as Float32Array;
        for (const quad of animation.quads) {
            const frame = animatedTileFrame(quad.animation, time);
            if (animation.shown.get(quad) === frame) continue;
            animation.shown.set(quad, frame);
            const [u0, v0, u1, v1] = animation.rect(frame);
            uvs.set([u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1], quad.offset);
            changed = true;
        }
        if (changed) animation.uv.needsUpdate = true;
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
        const animated = { positions: [] as number[], colors: [] as number[], uvs: [] as number[], quads: [] as TileAnimation["quads"] };
        const color = new THREE.Color();
        const light = new THREE.Color();
        const dark = new THREE.Color();
        const rect = (frameIndex: number): [number, number, number, number] => {
            const frame = Math.max(0, Math.min(frameIndex, columns * rows - 1));
            return [
                (frame % columns) / columns + insetU,
                1 - (Math.floor(frame / columns) + 1) / rows + insetV,
                ((frame % columns) + 1) / columns - insetU,
                1 - Math.floor(frame / columns) / rows - insetV,
            ];
        };
        forEachTile(component, (x, y, cell) => {
            const tile = palette.get(cell);
            if (!tile) return;
            const x0 = x * size;
            const y0 = y * size;
            const x1 = x0 + size;
            const y1 = y0 + size;
            const corners = [x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y0, 0, x1, y1, 0, x0, y1, 0];
            color.set(tile.color);
            // Rule tiles (V6) pick their frame from the neighbours, so painting one redraws the cells around it too.
            const frame = atlas ? tileFrameAt(component, x, y, tile) : -1;
            if (atlas && frame >= 0) {
                const moving = !tile.rule && tile.animation && tile.animation.frames.length > 1;
                const target = moving ? animated : textured;
                if (moving && tile.animation) animated.quads.push({ animation: tile.animation, offset: animated.uvs.length });
                const [u0, v0, u1, v1] = rect(frame);
                target.positions.push(...corners);
                target.uvs.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
                for (let index = 0; index < 6; index += 1) target.colors.push(color.r, color.g, color.b);
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
        object.tileAnimation = null;
        if (animated.positions.length && atlas) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", new THREE.Float32BufferAttribute(animated.positions, 3));
            geometry.setAttribute("color", new THREE.Float32BufferAttribute(animated.colors, 3));
            const uv = new THREE.Float32BufferAttribute(animated.uvs, 2).setUsage(THREE.DynamicDrawUsage);
            geometry.setAttribute("uv", uv);
            const mesh = new THREE.Mesh(geometry, flatMaterial({ vertexColors: true, map: atlas, alphaTest: 0.02 }));
            mesh.renderOrder = order + 0.5;
            mesh.userData.entityId = object.id;
            group.add(mesh);
            object.tileAnimation = { uv, quads: animated.quads, rect, shown: new Map() };
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
            uniforms: { pixelScale: { value: 100 }, isOrtho: { value: 0 }, map: { value: null }, useMap: { value: 0 } },
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

    /** Particles V2: the system's image (once it has loaded), else the soft dot. */
    private applyParticleTexture(visual: ParticleVisual, component: ParticleSystemComponent) {
        const material = visual.object.material as THREE.ShaderMaterial;
        const texture = this.assets.texture(component.textureId);
        material.uniforms.map.value = texture;
        material.uniforms.useMap.value = texture ? 1 : 0;
    }

    private removeParticles(object: EntityObject) {
        if (!object.particles) return;
        object.particles.object.parent?.remove(object.particles.object);
        object.particles.geometry.dispose();
        (object.particles.object.material as THREE.Material).dispose();
        object.particles = null;
    }

    private updateParticles(visual: ParticleVisual, entity: RenderEntity) {
        const emitter = visual.emitter;
        const component = emitter.component;
        visual.object.visible = entity.visible;
        const positions = visual.geometry.getAttribute("position") as THREE.BufferAttribute;
        const colors = visual.geometry.getAttribute("pcolor") as THREE.BufferAttribute;
        const sizes = visual.geometry.getAttribute("size") as THREE.BufferAttribute;
        const count = Math.min(emitter.count, emitter.capacity);
        const p = positions.array as Float32Array;
        const c = colors.array as Float32Array;
        const s = sizes.array as Float32Array;
        for (let index = 0; index < count; index += 1) {
            p[index * 3] = emitter.positions[index * 3];
            p[index * 3 + 1] = emitter.positions[index * 3 + 1];
            p[index * 3 + 2] = -emitter.positions[index * 3 + 2];
            const life = emitter.ages[index * 2 + 1] || 1;
            const t = Math.min(1, emitter.ages[index * 2] / life);
            // Gradient and size curve (V6); without them start → end exactly as in V5.
            particleColorAt(component, t, c, index * 4);
            s[index] = particleSizeAt(component, t);
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
    // Cameras & rendering
    // -------------------------------------------------------------------

    /** The camera the view is drawn with (the editor uses its own). */
    protected activeCamera(): THREE.Camera {
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

    /** Where shadows of directional lights are centered: a little in front of the camera. */
    protected lightFocus(camera: THREE.Camera, focus: THREE.Vector3) {
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        focus.copy(camera.position).addScaledVector(forward, 12);
    }

    private positionDirectionalLights(camera: THREE.Camera) {
        const focus = new THREE.Vector3();
        this.lightFocus(camera, focus);
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
        this.beforeRender();
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

    /** Called right before drawing (the editor's camera controls update here). */
    protected beforeRender() {}

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
        for (const object of this.objects.values()) this.removeObject(object);
        this.objects.clear();
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
