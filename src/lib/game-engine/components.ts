import { createEngineId } from "./ids";
import type {
    AnimationClip,
    AnimationComponent,
    AudioSourceComponent,
    CameraComponent,
    CameraFollowComponent,
    CharacterController2DComponent,
    ColliderComponent,
    ComponentType,
    GameComponent,
    GameDimension,
    JointComponent,
    LightComponent,
    MaterialData,
    MeshRendererComponent,
    NavAgent2DComponent,
    ParticleSystemComponent,
    RigidBodyComponent,
    ScriptComponent,
    SpriteRendererComponent,
    TileDefinition,
    TilemapComponent,
    TransformComponent,
    UIButtonComponent,
    UIPanelComponent,
    UIProgressBarComponent,
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
        sheet: { columns: 1, rows: 1, ...overrides.sheet },
        frame: overrides.frame ?? 0,
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
        order: overrides.order ?? 0,
    };
}

export function createUIButton(overrides: Overrides<UIButtonComponent> = {}): UIButtonComponent {
    return {
        id: overrides.id ?? createEngineId("cmp"),
        type: "uiButton",
        enabled: overrides.enabled ?? true,
        text: overrides.text ?? "Buton",
        fontSize: overrides.fontSize ?? 22,
        textColor: overrides.textColor ?? "#ffffff",
        color: overrides.color ?? "#6366f1",
        cornerRadius: overrides.cornerRadius ?? 14,
        anchor: overrides.anchor ?? "center",
        offset: { x: 0, y: 0, ...overrides.offset },
        width: overrides.width ?? 200,
        height: overrides.height ?? 56,
        order: overrides.order ?? 10,
        interactable: overrides.interactable ?? true,
        onClick: { targetId: null, method: "", ...overrides.onClick },
        hotkey: overrides.hotkey ?? "None",
    };
}

export function createUIPanel(overrides: Overrides<UIPanelComponent> = {}): UIPanelComponent {
    return {
        id: overrides.id ?? createEngineId("cmp"),
        type: "uiPanel",
        enabled: overrides.enabled ?? true,
        color: overrides.color ?? "#0f172a",
        opacity: overrides.opacity ?? 0.85,
        textureId: overrides.textureId ?? null,
        cornerRadius: overrides.cornerRadius ?? 18,
        anchor: overrides.anchor ?? "center",
        offset: { x: 0, y: 0, ...overrides.offset },
        width: overrides.width ?? 360,
        height: overrides.height ?? 240,
        order: overrides.order ?? -10,
        fullScreen: overrides.fullScreen ?? false,
        blocksClicks: overrides.blocksClicks ?? true,
    };
}

export function createUIProgressBar(overrides: Overrides<UIProgressBarComponent> = {}): UIProgressBarComponent {
    return {
        id: overrides.id ?? createEngineId("cmp"),
        type: "uiProgressBar",
        enabled: overrides.enabled ?? true,
        value: overrides.value ?? 0.6,
        min: overrides.min ?? 0,
        max: overrides.max ?? 1,
        fillColor: overrides.fillColor ?? "#22c55e",
        backgroundColor: overrides.backgroundColor ?? "#1e293b",
        cornerRadius: overrides.cornerRadius ?? 8,
        direction: overrides.direction ?? "leftToRight",
        showLabel: overrides.showLabel ?? false,
        anchor: overrides.anchor ?? "top",
        offset: { x: 0, y: 24, ...overrides.offset },
        width: overrides.width ?? 260,
        height: overrides.height ?? 22,
        order: overrides.order ?? 0,
    };
}

/** Starter palette of a new tilemap. */
export function defaultTilePalette(): TileDefinition[] {
    return [
        { key: "#", name: "Çimen", color: "#22c55e", solid: true, frame: -1 },
        { key: "=", name: "Toprak", color: "#a16207", solid: true, frame: -1 },
        { key: "@", name: "Taş", color: "#64748b", solid: true, frame: -1 },
        { key: "B", name: "Tuğla", color: "#c2410c", solid: true, frame: -1 },
        { key: "~", name: "Su", color: "#38bdf8", solid: false, frame: -1 },
        { key: "*", name: "Süs", color: "#facc15", solid: false, frame: -1 },
    ];
}

export function createTilemap(overrides: Overrides<TilemapComponent> = {}): TilemapComponent {
    return {
        id: overrides.id ?? createEngineId("cmp"),
        type: "tilemap",
        enabled: overrides.enabled ?? true,
        cellSize: overrides.cellSize ?? 1,
        origin: { x: 0, y: 0, ...overrides.origin },
        rows: overrides.rows ? [...overrides.rows] : [],
        palette: overrides.palette ? overrides.palette.map((tile) => ({ ...tile })) : defaultTilePalette(),
        atlas: { textureId: null, columns: 1, rows: 1, ...overrides.atlas },
        sortingLayer: overrides.sortingLayer ?? 0,
        isTrigger: overrides.isTrigger ?? false,
        friction: overrides.friction ?? 0.4,
        bounciness: overrides.bounciness ?? 0,
    };
}

export function createAnimation(overrides: Overrides<AnimationComponent> = {}): AnimationComponent {
    const clips: AnimationClip[] = overrides.clips ? JSON.parse(JSON.stringify(overrides.clips)) as AnimationClip[] : [];
    return {
        id: overrides.id ?? createEngineId("cmp"),
        type: "animation",
        enabled: overrides.enabled ?? true,
        clips,
        defaultClip: overrides.defaultClip !== undefined ? overrides.defaultClip : clips[0]?.name ?? null,
        playOnStart: overrides.playOnStart ?? true,
        speed: overrides.speed ?? 1,
    };
}

export function createCharacterController2D(overrides: Overrides<CharacterController2DComponent> = {}): CharacterController2DComponent {
    return {
        id: overrides.id ?? createEngineId("cmp"),
        type: "characterController2D",
        enabled: overrides.enabled ?? true,
        moveSpeed: overrides.moveSpeed ?? 7,
        acceleration: overrides.acceleration ?? 70,
        deceleration: overrides.deceleration ?? 60,
        airControl: overrides.airControl ?? 0.65,
        jumpHeight: overrides.jumpHeight ?? 3,
        maxJumps: overrides.maxJumps ?? 1,
        coyoteTime: overrides.coyoteTime ?? 0.1,
        jumpBuffer: overrides.jumpBuffer ?? 0.12,
        variableJump: overrides.variableJump ?? true,
        fallGravity: overrides.fallGravity ?? 1.6,
        maxFallSpeed: overrides.maxFallSpeed ?? 20,
        maxSlope: overrides.maxSlope ?? 50,
        useInput: overrides.useInput ?? true,
        horizontalAction: overrides.horizontalAction ?? "Horizontal",
        jumpAction: overrides.jumpAction ?? "Jump",
        flipSprite: overrides.flipSprite ?? true,
    };
}

export function createCameraFollow(overrides: Overrides<CameraFollowComponent> = {}, dimension: GameDimension = "2d"): CameraFollowComponent {
    return {
        id: overrides.id ?? createEngineId("cmp"),
        type: "cameraFollow",
        enabled: overrides.enabled ?? true,
        targetId: overrides.targetId ?? null,
        offset: { ...(dimension === "2d" ? { x: 0, y: 1, z: 0 } : { x: 0, y: 4, z: -9 }), ...overrides.offset },
        smoothTime: overrides.smoothTime ?? 0.18,
        deadZone: { x: 0.6, y: 0.8, ...overrides.deadZone },
        lookAhead: overrides.lookAhead ?? (dimension === "2d" ? 1.5 : 0),
        followX: overrides.followX ?? true,
        followY: overrides.followY ?? true,
        useBounds: overrides.useBounds ?? false,
        boundsMin: { x: -20, y: -10, ...overrides.boundsMin },
        boundsMax: { x: 20, y: 10, ...overrides.boundsMax },
        lookAtTarget: overrides.lookAtTarget ?? dimension === "3d",
    };
}

export function createNavAgent2D(overrides: Overrides<NavAgent2DComponent> = {}): NavAgent2DComponent {
    return {
        id: overrides.id ?? createEngineId("cmp"),
        type: "navAgent2D",
        enabled: overrides.enabled ?? true,
        speed: overrides.speed ?? 3.5,
        stoppingDistance: overrides.stoppingDistance ?? 0.1,
        radius: overrides.radius ?? 0.3,
        targetId: overrides.targetId ?? null,
        repathInterval: overrides.repathInterval ?? 0.4,
        flipSprite: overrides.flipSprite ?? true,
        showPath: overrides.showPath ?? false,
    };
}

export function createJoint(overrides: Overrides<JointComponent> = {}): JointComponent {
    return {
        id: overrides.id ?? createEngineId("cmp"),
        type: "joint",
        enabled: overrides.enabled ?? true,
        kind: overrides.kind ?? "distance",
        connectedId: overrides.connectedId ?? null,
        anchor: { x: 0, y: 0, z: 0, ...overrides.anchor },
        connectedAnchor: { x: 0, y: 0, z: 0, ...overrides.connectedAnchor },
        distance: overrides.distance ?? 2,
        autoDistance: overrides.autoDistance ?? true,
        maxDistanceOnly: overrides.maxDistanceOnly ?? false,
        frequency: overrides.frequency ?? 2,
        dampingRatio: overrides.dampingRatio ?? 0.2,
        showLine: overrides.showLine ?? true,
        lineColor: overrides.lineColor ?? "#e2e8f0",
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
        case "uiButton": return createUIButton();
        case "uiPanel": return createUIPanel();
        case "uiProgressBar": return createUIProgressBar();
        case "tilemap": return createTilemap();
        case "animation": return createAnimation();
        case "characterController2D": return createCharacterController2D();
        case "cameraFollow": return createCameraFollow({}, dimension);
        case "navAgent2D": return createNavAgent2D();
        case "joint": return createJoint();
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
    uiButton: "UI Button",
    uiPanel: "UI Panel",
    uiProgressBar: "UI Progress Bar",
    tilemap: "Tilemap",
    animation: "Animation",
    characterController2D: "Character Controller 2D",
    cameraFollow: "Camera Follow",
    navAgent2D: "Nav Agent 2D",
    joint: "Joint",
};
