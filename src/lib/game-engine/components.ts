import { createEngineId } from "./ids";
import type {
    AudioSourceComponent,
    CameraComponent,
    ColliderComponent,
    ComponentType,
    GameComponent,
    GameDimension,
    LightComponent,
    MaterialData,
    MeshRendererComponent,
    ParticleSystemComponent,
    RigidBodyComponent,
    ScriptComponent,
    SpriteRendererComponent,
    TransformComponent,
    UITextComponent,
} from "./types";

type Overrides<T> = Partial<Omit<T, "type">>;

export function createTransform(overrides: Overrides<TransformComponent> = {}): TransformComponent {
    return {
        id: overrides.id ?? createEngineId("cmp"),
        type: "transform",
        enabled: true,
        position: { x: 0, y: 0, z: 0, ...overrides.position },
        rotation: { x: 0, y: 0, z: 0, ...overrides.rotation },
        scale: { x: 1, y: 1, z: 1, ...overrides.scale },
    };
}

export function createSpriteRenderer(overrides: Overrides<SpriteRendererComponent> = {}): SpriteRendererComponent {
    return {
        id: overrides.id ?? createEngineId("cmp"),
        type: "spriteRenderer",
        enabled: overrides.enabled ?? true,
        shape: overrides.shape ?? "square",
        textureId: overrides.textureId ?? null,
        color: overrides.color ?? "#ffffff",
        opacity: overrides.opacity ?? 1,
        sortingLayer: overrides.sortingLayer ?? 0,
        flipX: overrides.flipX ?? false,
        flipY: overrides.flipY ?? false,
    };
}

export function defaultMaterial(overrides: Partial<MaterialData> = {}): MaterialData {
    return {
        color: "#ffffff",
        metallic: 0.05,
        roughness: 0.6,
        emissive: "#000000",
        emissiveIntensity: 0,
        opacity: 1,
        textureId: null,
        tiling: 1,
        wireframe: false,
        flatShading: false,
        ...overrides,
    };
}

export function createMeshRenderer(overrides: Omit<Overrides<MeshRendererComponent>, "material"> & { material?: Partial<MaterialData> } = {}): MeshRendererComponent {
    return {
        id: overrides.id ?? createEngineId("cmp"),
        type: "meshRenderer",
        enabled: overrides.enabled ?? true,
        mesh: overrides.mesh ?? "cube",
        material: defaultMaterial(overrides.material),
        castShadows: overrides.castShadows ?? true,
        receiveShadows: overrides.receiveShadows ?? true,
    };
}

export function createCamera(overrides: Overrides<CameraComponent> = {}): CameraComponent {
    return {
        id: overrides.id ?? createEngineId("cmp"),
        type: "camera",
        enabled: overrides.enabled ?? true,
        projection: overrides.projection ?? "perspective",
        fieldOfView: overrides.fieldOfView ?? 60,
        orthographicSize: overrides.orthographicSize ?? 5,
        nearClip: overrides.nearClip ?? 0.1,
        farClip: overrides.farClip ?? 1000,
        backgroundColor: overrides.backgroundColor ?? null,
        primary: overrides.primary ?? true,
    };
}

export function createLight(overrides: Overrides<LightComponent> = {}): LightComponent {
    return {
        id: overrides.id ?? createEngineId("cmp"),
        type: "light",
        enabled: overrides.enabled ?? true,
        lightType: overrides.lightType ?? "directional",
        color: overrides.color ?? "#ffffff",
        intensity: overrides.intensity ?? 1.2,
        range: overrides.range ?? 12,
        spotAngle: overrides.spotAngle ?? 45,
        castShadows: overrides.castShadows ?? true,
    };
}

export function createRigidBody(overrides: Overrides<RigidBodyComponent> = {}): RigidBodyComponent {
    return {
        id: overrides.id ?? createEngineId("cmp"),
        type: "rigidBody",
        enabled: overrides.enabled ?? true,
        bodyType: overrides.bodyType ?? "dynamic",
        mass: overrides.mass ?? 1,
        useGravity: overrides.useGravity ?? true,
        gravityScale: overrides.gravityScale ?? 1,
        linearDamping: overrides.linearDamping ?? 0.05,
        angularDamping: overrides.angularDamping ?? 0.05,
        velocity: { x: 0, y: 0, z: 0, ...overrides.velocity },
        angularVelocity: { x: 0, y: 0, z: 0, ...overrides.angularVelocity },
        freezePosition: { x: false, y: false, z: false, ...overrides.freezePosition },
        freezeRotation: overrides.freezeRotation ?? true,
    };
}

export function createCollider(overrides: Overrides<ColliderComponent> = {}): ColliderComponent {
    return {
        id: overrides.id ?? createEngineId("cmp"),
        type: "collider",
        enabled: overrides.enabled ?? true,
        shape: overrides.shape ?? "box",
        size: { x: 1, y: 1, z: 1, ...overrides.size },
        radius: overrides.radius ?? 0.5,
        offset: { x: 0, y: 0, z: 0, ...overrides.offset },
        isTrigger: overrides.isTrigger ?? false,
        friction: overrides.friction ?? 0.4,
        bounciness: overrides.bounciness ?? 0,
    };
}

export function createScriptComponent(scriptId: string, className: string | null = null, overrides: Overrides<ScriptComponent> = {}): ScriptComponent {
    return {
        id: overrides.id ?? createEngineId("cmp"),
        type: "script",
        enabled: overrides.enabled ?? true,
        scriptId,
        className,
        fields: { ...overrides.fields },
    };
}

export function createParticleSystem(overrides: Overrides<ParticleSystemComponent> = {}): ParticleSystemComponent {
    return {
        id: overrides.id ?? createEngineId("cmp"),
        type: "particleSystem",
        enabled: overrides.enabled ?? true,
        playOnStart: overrides.playOnStart ?? true,
        loop: overrides.loop ?? true,
        duration: overrides.duration ?? 2,
        emissionRate: overrides.emissionRate ?? 24,
        burstCount: overrides.burstCount ?? 0,
        maxParticles: overrides.maxParticles ?? 300,
        lifetime: overrides.lifetime ?? 1.4,
        startSpeed: overrides.startSpeed ?? 3,
        spread: overrides.spread ?? 25,
        startSize: overrides.startSize ?? 0.3,
        endSize: overrides.endSize ?? 0.05,
        startColor: overrides.startColor ?? "#fde68a",
        endColor: overrides.endColor ?? "#f97316",
        gravityModifier: overrides.gravityModifier ?? 0,
        worldSpace: overrides.worldSpace ?? true,
    };
}

export function createAudioSource(overrides: Overrides<AudioSourceComponent> = {}): AudioSourceComponent {
    return {
        id: overrides.id ?? createEngineId("cmp"),
        type: "audioSource",
        enabled: overrides.enabled ?? true,
        clip: overrides.clip ?? "coin",
        volume: overrides.volume ?? 0.8,
        pitch: overrides.pitch ?? 1,
        playOnStart: overrides.playOnStart ?? false,
    };
}

export function createUIText(overrides: Overrides<UITextComponent> = {}): UITextComponent {
    return {
        id: overrides.id ?? createEngineId("cmp"),
        type: "uiText",
        enabled: overrides.enabled ?? true,
        text: overrides.text ?? "Yeni metin",
        fontSize: overrides.fontSize ?? 28,
        color: overrides.color ?? "#ffffff",
        anchor: overrides.anchor ?? "top-left",
        offset: { x: 24, y: 24, ...overrides.offset },
        bold: overrides.bold ?? true,
        shadow: overrides.shadow ?? true,
    };
}

/** Creates a component with sensible defaults for the given scene dimension. */
export function createComponentOfType(type: Exclude<ComponentType, "script" | "transform">, dimension: GameDimension): GameComponent {
    switch (type) {
        case "spriteRenderer": return createSpriteRenderer();
        case "meshRenderer": return createMeshRenderer();
        case "camera": return createCamera(dimension === "2d" ? { projection: "orthographic" } : {});
        case "light": return createLight();
        case "rigidBody": return createRigidBody(dimension === "2d" ? { freezePosition: { x: false, y: false, z: true } } : {});
        case "collider": return createCollider(dimension === "2d" ? { size: { x: 1, y: 1, z: 1 } } : {});
        case "particleSystem": return createParticleSystem();
        case "audioSource": return createAudioSource();
        case "uiText": return createUIText();
    }
}

export const COMPONENT_LABELS: Record<ComponentType, string> = {
    transform: "Transform",
    spriteRenderer: "Sprite Renderer",
    meshRenderer: "Mesh Renderer",
    camera: "Camera",
    light: "Light",
    rigidBody: "Rigidbody",
    collider: "Collider",
    script: "Script",
    particleSystem: "Particle System",
    audioSource: "Audio Source",
    uiText: "UI Text",
};
