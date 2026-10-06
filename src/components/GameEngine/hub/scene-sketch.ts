/**
 * A flat SVG picture of a scene's first frame, computed from the scene data
 * alone: sprites and tilemaps through the 2D camera, boxes, spheres and
 * planes through the 3D camera with simple lighting and fog. The hub uses it
 * for template cards so a page full of templates needs no WebGL at all.
 */
import { conjugateQuat, IDENTITY_TRS, combineTRS, quatFromEulerDeg, rotateVec3, type TRS } from "@/lib/game-engine/math";
import { anchorParts, progressFraction, uiRect, UI_REFERENCE_HEIGHT } from "@/lib/game-engine/ui-layout";
import type {
    CameraComponent,
    GameEntity,
    GameProjectDocument,
    LightComponent,
    MeshRendererComponent,
    SceneDocument,
    SpriteRendererComponent,
    TilemapComponent,
    TransformComponent,
    UIButtonComponent,
    UIPanelComponent,
    UIProgressBarComponent,
    UITextComponent,
    Vector3,
} from "@/lib/game-engine/types";

export const SKETCH_WIDTH = 320;
export const SKETCH_HEIGHT = 180;
const MAX_SHAPES = 1600;

export type SketchShape =
    | { kind: "polygon"; points: string; fill: string; opacity: number }
    | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number; rotate: number; fill: string; opacity: number }
    | { kind: "rect"; x: number; y: number; width: number; height: number; rx: number; rotate: number; fill: string; opacity: number }
    | { kind: "text"; x: number; y: number; text: string; size: number; fill: string; anchor: "start" | "middle" | "end"; baseline: "hanging" | "central" | "auto"; bold: boolean };

export interface SceneSketchData {
    top: string;
    bottom: string;
    shapes: SketchShape[];
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

function parseColor(value: string): [number, number, number] {
    const hex = /^#([0-9a-f]{3,8})$/i.exec(value.trim())?.[1] ?? "ffffff";
    const full = hex.length <= 4 ? hex.slice(0, 3).split("").map((part) => part + part).join("") : hex.slice(0, 6);
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function toHex([r, g, b]: [number, number, number]) {
    const part = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
    return `#${part(r)}${part(g)}${part(b)}`;
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const round = (value: number) => Math.round(value * 10) / 10;

// ---------------------------------------------------------------------------
// Scene helpers
// ---------------------------------------------------------------------------

function transformOf(entity: GameEntity): TRS {
    const transform = entity.components.find((component): component is TransformComponent => component.type === "transform");
    if (!transform) return IDENTITY_TRS;
    return { position: { ...transform.position }, rotation: quatFromEulerDeg(transform.rotation), scale: { ...transform.scale } };
}

/** World transforms of the active objects (an inactive parent hides its children). */
function worldTransforms(scene: SceneDocument) {
    const byId = new Map(scene.objects.map((entity) => [entity.id, entity]));
    const cache = new Map<string, TRS | null>();
    const resolve = (entity: GameEntity, depth = 0): TRS | null => {
        if (cache.has(entity.id)) return cache.get(entity.id) ?? null;
        let result: TRS | null = null;
        if (entity.active && depth < 32) {
            const parent = entity.parentId ? byId.get(entity.parentId) : null;
            if (!parent) result = transformOf(entity);
            else {
                const parentWorld = resolve(parent, depth + 1);
                result = parentWorld ? combineTRS(parentWorld, transformOf(entity)) : null;
            }
        }
        cache.set(entity.id, result);
        return result;
    };
    return scene.objects.map((entity) => ({ entity, world: resolve(entity) })).filter((item): item is { entity: GameEntity; world: TRS } => item.world !== null);
}

function backgroundOf(scene: SceneDocument) {
    const background = scene.settings.background;
    return background.mode === "gradient" ? { top: background.topColor, bottom: background.color } : { top: background.color, bottom: background.color };
}

const UNIT_SHAPES: Record<string, Array<[number, number]>> = {
    square: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]],
    triangle: [[0, 0.5], [-0.5, -0.5], [0.5, -0.5]],
    diamond: [[0, 0.5], [0.5, 0], [0, -0.5], [-0.5, 0]],
    hexagon: Array.from({ length: 6 }, (_, index) => [Math.cos(Math.PI / 6 + (index * Math.PI) / 3) * 0.5, Math.sin(Math.PI / 6 + (index * Math.PI) / 3) * 0.5] as [number, number]),
    star: Array.from({ length: 10 }, (_, index) => {
        const radius = index % 2 ? 0.2 : 0.5;
        const angle = Math.PI / 2 + (index * Math.PI) / 5;
        return [Math.cos(angle) * radius, Math.sin(angle) * radius] as [number, number];
    }),
};

// ---------------------------------------------------------------------------
// UI (screen space, drawn over the scene)
// ---------------------------------------------------------------------------

function sketchUi(items: Array<{ entity: GameEntity; world: TRS }>): SketchShape[] {
    const screen = { width: SKETCH_WIDTH, height: SKETCH_HEIGHT };
    const ui = SKETCH_HEIGHT / UI_REFERENCE_HEIGHT;
    const layered: Array<{ order: number; shapes: SketchShape[] }> = [];
    for (const { entity } of items) {
        for (const component of entity.components) {
            if (!component.enabled) continue;
            if (component.type === "uiPanel") {
                const panel = component as UIPanelComponent;
                const rect = panel.fullScreen ? { left: 0, top: 0, width: SKETCH_WIDTH, height: SKETCH_HEIGHT } : uiRect(panel, screen, ui);
                layered.push({ order: panel.order, shapes: [{ kind: "rect", x: round(rect.left), y: round(rect.top), width: round(rect.width), height: round(rect.height), rx: panel.fullScreen ? 0 : round(panel.cornerRadius * ui), rotate: 0, fill: panel.color, opacity: panel.opacity }] });
            } else if (component.type === "uiButton") {
                const button = component as UIButtonComponent;
                const rect = uiRect(button, screen, ui);
                layered.push({
                    order: button.order,
                    shapes: [
                        { kind: "rect", x: round(rect.left), y: round(rect.top), width: round(rect.width), height: round(rect.height), rx: round(button.cornerRadius * ui), rotate: 0, fill: button.color, opacity: 1 },
                        { kind: "text", x: round(rect.left + rect.width / 2), y: round(rect.top + rect.height / 2), text: button.text.split("\n")[0], size: round(button.fontSize * ui), fill: button.textColor, anchor: "middle", baseline: "central", bold: true },
                    ],
                });
            } else if (component.type === "uiProgressBar") {
                const bar = component as UIProgressBarComponent;
                const rect = uiRect(bar, screen, ui);
                const fraction = progressFraction(bar);
                layered.push({
                    order: bar.order,
                    shapes: [
                        { kind: "rect", x: round(rect.left), y: round(rect.top), width: round(rect.width), height: round(rect.height), rx: round(bar.cornerRadius * ui), rotate: 0, fill: bar.backgroundColor, opacity: 1 },
                        { kind: "rect", x: round(rect.left), y: round(rect.top), width: round(rect.width * fraction), height: round(rect.height), rx: round(bar.cornerRadius * ui), rotate: 0, fill: bar.fillColor, opacity: 1 },
                    ],
                });
            } else if (component.type === "uiSlider") {
                const rect = uiRect(component, screen, ui);
                const fraction = progressFraction(component);
                const track = Math.max(1, rect.height * 0.36);
                const knob = Math.max(2, rect.height * 0.9);
                layered.push({
                    order: component.order,
                    shapes: [
                        { kind: "rect", x: round(rect.left), y: round(rect.top + (rect.height - track) / 2), width: round(rect.width), height: round(track), rx: round(track / 2), rotate: 0, fill: component.backgroundColor, opacity: 1 },
                        { kind: "rect", x: round(rect.left), y: round(rect.top + (rect.height - track) / 2), width: round(rect.width * fraction), height: round(track), rx: round(track / 2), rotate: 0, fill: component.fillColor, opacity: 1 },
                        { kind: "ellipse", cx: round(rect.left + (rect.width - knob) * fraction + knob / 2), cy: round(rect.top + rect.height / 2), rx: round(knob / 2), ry: round(knob / 2), rotate: 0, fill: component.handleColor, opacity: 1 },
                    ],
                });
            } else if (component.type === "uiToggle") {
                const rect = uiRect(component, screen, ui);
                const height = Math.max(2, rect.height * 0.72);
                const width = component.style === "switch" ? height * 1.8 : height;
                const top = rect.top + (rect.height - height) / 2;
                layered.push({
                    order: component.order,
                    shapes: [
                        { kind: "rect", x: round(rect.left), y: round(top), width: round(width), height: round(height), rx: round(component.style === "switch" ? height / 2 : height * 0.24), rotate: 0, fill: component.isOn ? component.checkColor : component.color, opacity: 1 },
                        { kind: "text", x: round(rect.left + width + height * 0.4), y: round(rect.top + rect.height / 2), text: component.label.slice(0, 40), size: round(component.fontSize * ui), fill: component.textColor, anchor: "start", baseline: "central", bold: true },
                    ],
                });
            } else if (component.type === "uiInputField") {
                const rect = uiRect(component, screen, ui);
                layered.push({
                    order: component.order,
                    shapes: [
                        { kind: "rect", x: round(rect.left), y: round(rect.top), width: round(rect.width), height: round(rect.height), rx: round(10 * ui), rotate: 0, fill: component.backgroundColor, opacity: 1 },
                        { kind: "text", x: round(rect.left + 8 * ui), y: round(rect.top + rect.height / 2), text: (component.text || component.placeholder).slice(0, 40), size: round(component.fontSize * ui), fill: component.textColor, anchor: "start", baseline: "central", bold: false },
                    ],
                });
            } else if (component.type === "uiText") {
                const text = component as UITextComponent;
                const line = text.text.split("\n")[0].trim();
                if (!line) continue;
                const { horizontal, vertical } = anchorParts(text.anchor);
                const x = horizontal === "left" ? text.offset.x * ui : horizontal === "right" ? SKETCH_WIDTH - text.offset.x * ui : SKETCH_WIDTH / 2 + text.offset.x * ui;
                const y = vertical === "top" ? text.offset.y * ui : vertical === "bottom" ? SKETCH_HEIGHT - text.offset.y * ui : SKETCH_HEIGHT / 2 + text.offset.y * ui;
                layered.push({
                    order: text.order,
                    shapes: [{
                        kind: "text",
                        x: round(x),
                        y: round(y),
                        text: line.slice(0, 60),
                        size: round(Math.max(4, text.fontSize * ui)),
                        fill: text.color,
                        anchor: horizontal === "left" ? "start" : horizontal === "right" ? "end" : "middle",
                        baseline: vertical === "top" ? "hanging" : vertical === "bottom" ? "auto" : "central",
                        bold: text.bold,
                    }],
                });
            }
        }
    }
    layered.sort((a, b) => a.order - b.order);
    return layered.flatMap((item) => item.shapes);
}

// ---------------------------------------------------------------------------
// 2D
// ---------------------------------------------------------------------------

function sketch2d(scene: SceneDocument): SceneSketchData {
    const items = worldTransforms(scene);
    const cameraItem = items.find(({ entity }) => entity.components.some((component) => component.type === "camera" && (component as CameraComponent).primary))
        ?? items.find(({ entity }) => entity.components.some((component) => component.type === "camera"));
    const camera = cameraItem?.entity.components.find((component): component is CameraComponent => component.type === "camera");
    const viewHeight = 2 * (camera?.orthographicSize ?? 5);
    const viewWidth = viewHeight * (SKETCH_WIDTH / SKETCH_HEIGHT);
    const centerX = cameraItem?.world.position.x ?? 0;
    const centerY = cameraItem?.world.position.y ?? 0;
    const unit = SKETCH_HEIGHT / viewHeight;
    const toX = (x: number) => (x - (centerX - viewWidth / 2)) * unit;
    const toY = (y: number) => SKETCH_HEIGHT - (y - (centerY - viewHeight / 2)) * unit;

    const layered: Array<{ layer: number; order: number; shape: SketchShape }> = [];
    let order = 0;
    for (const { entity, world } of items) {
        for (const component of entity.components) {
            if (!component.enabled) continue;
            if (component.type === "tilemap") {
                const tilemap = component as TilemapComponent;
                const palette = new Map(tilemap.palette.map((tile) => [tile.key, tile.color]));
                const height = tilemap.rows.length;
                const cell = tilemap.cellSize;
                tilemap.rows.forEach((row, rowIndex) => {
                    const y = tilemap.origin.y + height - 1 - rowIndex;
                    let start = 0;
                    // Neighbouring cells of the same tile become one rectangle.
                    for (let column = 1; column <= row.length; column += 1) {
                        if (column < row.length && row[column] === row[start]) continue;
                        const key = row[start];
                        if (key !== "." && palette.has(key)) {
                            const x0 = world.position.x + (tilemap.origin.x + start) * cell * world.scale.x;
                            const x1 = world.position.x + (tilemap.origin.x + column) * cell * world.scale.x;
                            const y0 = world.position.y + y * cell * world.scale.y;
                            const y1 = world.position.y + (y + 1) * cell * world.scale.y;
                            layered.push({
                                layer: tilemap.sortingLayer,
                                order: order++,
                                shape: { kind: "rect", x: round(toX(Math.min(x0, x1))), y: round(toY(Math.max(y0, y1))), width: round(Math.abs(x1 - x0) * unit + 0.4), height: round(Math.abs(y1 - y0) * unit + 0.4), rx: 0, rotate: 0, fill: palette.get(key) as string, opacity: 1 },
                            });
                        }
                        start = column;
                    }
                });
            } else if (component.type === "spriteRenderer") {
                const sprite = component as SpriteRendererComponent;
                if (sprite.opacity <= 0.01) continue;
                const angle = 2 * Math.atan2(world.rotation.z, world.rotation.w);
                const width = Math.abs(world.scale.x) * unit;
                const height = Math.abs(world.scale.y) * unit;
                const cx = toX(world.position.x);
                const cy = toY(world.position.y);
                // Quick reject outside the frame.
                const reach = Math.max(width, height);
                if (cx + reach < 0 || cx - reach > SKETCH_WIDTH || cy + reach < 0 || cy - reach > SKETCH_HEIGHT) continue;
                const rotate = round((-angle * 180) / Math.PI);
                let shape: SketchShape;
                if (sprite.shape === "circle") {
                    shape = { kind: "ellipse", cx: round(cx), cy: round(cy), rx: round(width / 2), ry: round(height / 2), rotate, fill: sprite.color, opacity: sprite.opacity };
                } else if (sprite.shape === "roundedSquare") {
                    shape = { kind: "rect", x: round(cx - width / 2), y: round(cy - height / 2), width: round(width), height: round(height), rx: round(Math.min(width, height) * 0.22), rotate, fill: sprite.color, opacity: sprite.opacity };
                } else {
                    const points = (UNIT_SHAPES[sprite.shape] ?? UNIT_SHAPES.square).map(([x, y]) => {
                        const sx = x * world.scale.x;
                        const sy = y * world.scale.y;
                        const rx = sx * Math.cos(angle) - sy * Math.sin(angle);
                        const ry = sx * Math.sin(angle) + sy * Math.cos(angle);
                        return `${round(toX(world.position.x + rx))},${round(toY(world.position.y + ry))}`;
                    });
                    shape = { kind: "polygon", points: points.join(" "), fill: sprite.color, opacity: sprite.opacity };
                }
                layered.push({ layer: sprite.sortingLayer, order: order++, shape });
            }
        }
    }
    layered.sort((a, b) => a.layer - b.layer || a.order - b.order);
    return { ...backgroundOf(scene), shapes: [...layered.slice(0, MAX_SHAPES).map((item) => item.shape), ...sketchUi(items)] };
}

// ---------------------------------------------------------------------------
// 3D
// ---------------------------------------------------------------------------

const BOX_AXES: Array<[Vector3, Vector3, Vector3]> = [
    // normal, u, v (face spans ±u, ±v around normal)
    [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }],
    [{ x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }],
    [{ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }],
    [{ x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }],
    [{ x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }],
    [{ x: 0, y: 0, z: -1 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }],
];

const add = (a: Vector3, b: Vector3): Vector3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vector3, b: Vector3): Vector3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: Vector3, s: number): Vector3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a: Vector3, b: Vector3) => a.x * b.x + a.y * b.y + a.z * b.z;
const mulAxes = (a: Vector3, b: Vector3): Vector3 => ({ x: a.x * b.x, y: a.y * b.y, z: a.z * b.z });

/** Cuts a camera-space polygon at the near plane (long floors reach behind the camera). */
function clipNear(polygon: Vector3[], near: number): Vector3[] {
    const result: Vector3[] = [];
    for (let index = 0; index < polygon.length; index += 1) {
        const current = polygon[index];
        const next = polygon[(index + 1) % polygon.length];
        const currentIn = current.z >= near;
        const nextIn = next.z >= near;
        if (currentIn) result.push(current);
        if (currentIn !== nextIn) {
            const t = (near - current.z) / (next.z - current.z);
            result.push(add(current, scale(sub(next, current), t)));
        }
    }
    return result;
}

function sketch3d(scene: SceneDocument): SceneSketchData {
    const items = worldTransforms(scene);
    const cameraItem = items.find(({ entity }) => entity.components.some((component) => component.type === "camera" && (component as CameraComponent).primary));
    const camera = cameraItem?.entity.components.find((component): component is CameraComponent => component.type === "camera");
    const cameraTrs = cameraItem?.world ?? { position: { x: 0, y: 3, z: -10 }, rotation: quatFromEulerDeg({ x: 10, y: 0, z: 0 }), scale: { x: 1, y: 1, z: 1 } };
    const inverse = conjugateQuat(cameraTrs.rotation);
    const focal = 1 / Math.tan(((camera?.fieldOfView ?? 60) * Math.PI) / 360);
    const aspect = SKETCH_WIDTH / SKETCH_HEIGHT;
    // A deeper near plane than the camera's keeps clipped floor corners from projecting to huge coordinates.
    const near = Math.max(0.5, camera?.nearClip ?? 0.1);
    const limit = (value: number, size: number) => Math.max(-size * 8, Math.min(size * 9, value));
    const toCamera = (point: Vector3) => rotateVec3(inverse, sub(point, cameraTrs.position));
    const project = (point: Vector3) => ({
        x: limit(((point.x / point.z) * (focal / aspect) * 0.5 + 0.5) * SKETCH_WIDTH, SKETCH_WIDTH),
        y: limit((0.5 - (point.y / point.z) * focal * 0.5) * SKETCH_HEIGHT, SKETCH_HEIGHT),
    });

    const lightItem = items.find(({ entity }) => entity.components.some((component) => component.type === "light" && (component as LightComponent).lightType === "directional"));
    const lightDirection = lightItem ? rotateVec3(lightItem.world.rotation, { x: 0, y: 0, z: 1 }) : { x: -0.3, y: -0.8, z: 0.5 };
    const settings = scene.settings;
    const ambient = Math.min(0.75, 0.3 + settings.ambientIntensity * 0.35);
    const fogColor = parseColor(settings.fog.color);
    const fogAmount = (distance: number) => {
        if (!settings.fog.enabled) return 0;
        if (settings.fog.mode === "exponential") return 1 - Math.exp(-((settings.fog.density * distance) ** 2));
        return Math.max(0, Math.min(1, (distance - settings.fog.near) / Math.max(0.01, settings.fog.far - settings.fog.near)));
    };
    const shade = (color: string, normal: Vector3, distance: number, emissive = "#000000", emissiveIntensity = 0) => {
        const light = Math.max(0, dot(normal, scale(lightDirection, -1)));
        const lit = mix([0, 0, 0], parseColor(color), Math.min(1.15, ambient + (1 - ambient) * light));
        const glow = mix(lit, parseColor(emissive), Math.min(0.6, emissiveIntensity * 0.25));
        return toHex(mix(glow, fogColor, fogAmount(distance)));
    };

    const faces: Array<{ depth: number; shape: SketchShape }> = [];
    for (const { entity, world } of items) {
        const renderer = entity.components.find((component): component is MeshRendererComponent => component.type === "meshRenderer" && component.enabled);
        if (!renderer) continue;
        const material = renderer.material;
        const opacity = Math.max(0.15, Math.min(1, material.opacity));
        if (renderer.mesh === "sphere" || renderer.mesh === "torus") {
            const center = toCamera(world.position);
            if (center.z <= near) continue;
            const radius = 0.5 * Math.max(Math.abs(world.scale.x), Math.abs(world.scale.y), Math.abs(world.scale.z));
            const screen = project(center);
            const pixels = (radius / center.z) * focal * 0.5 * SKETCH_HEIGHT;
            const distance = Math.hypot(center.x, center.y, center.z);
            faces.push({ depth: distance, shape: { kind: "ellipse", cx: round(screen.x), cy: round(screen.y), rx: round(pixels), ry: round(pixels), rotate: 0, fill: shade(material.color, { x: -0.3, y: 0.8, z: -0.5 }, distance, material.emissive, material.emissiveIntensity), opacity } });
            continue;
        }
        // Boxes (cube, capsule, cylinder, cone) and planes (one face).
        const half: Vector3 = renderer.mesh === "plane"
            ? { x: 0.5, y: 0, z: 0.5 }
            : renderer.mesh === "capsule" || renderer.mesh === "cylinder" ? { x: 0.5, y: 1, z: 0.5 } : { x: 0.5, y: 0.5, z: 0.5 };
        const axes = renderer.mesh === "plane" ? [BOX_AXES[2]] : BOX_AXES;
        for (const [normalLocal, uLocal, vLocal] of axes) {
            const offset = mulAxes(normalLocal, half);
            const u = mulAxes(uLocal, half);
            const v = mulAxes(vLocal, half);
            const corners = [add(add(offset, u), v), add(sub(offset, u), v), sub(sub(offset, u), v), sub(add(offset, u), v)]
                .map((corner) => add(world.position, rotateVec3(world.rotation, mulAxes(corner, world.scale))));
            const cameraCorners = corners.map(toCamera);
            const normal = rotateVec3(world.rotation, normalLocal);
            const center = scale(cameraCorners.reduce((sum, corner) => add(sum, corner), { x: 0, y: 0, z: 0 }), 0.25);
            if (dot(rotateVec3(inverse, normal), center) >= 0) continue;
            const clipped = clipNear(cameraCorners, near);
            if (clipped.length < 3) continue;
            const points = clipped.map(project);
            if (points.every((point) => point.x < 0) || points.every((point) => point.x > SKETCH_WIDTH) || points.every((point) => point.y < 0) || points.every((point) => point.y > SKETCH_HEIGHT)) continue;
            const distance = Math.hypot(center.x, center.y, center.z);
            faces.push({
                depth: distance,
                shape: { kind: "polygon", points: points.map((point) => `${round(point.x)},${round(point.y)}`).join(" "), fill: shade(material.color, normal, distance, material.emissive, material.emissiveIntensity), opacity },
            });
        }
    }
    faces.sort((a, b) => b.depth - a.depth);
    return { ...backgroundOf(scene), shapes: [...faces.slice(-MAX_SHAPES).map((item) => item.shape), ...sketchUi(items)] };
}

/** The start scene of a project as flat SVG shapes. */
export function sketchProject(project: GameProjectDocument): SceneSketchData {
    const scene = project.scenes.find((item) => item.id === project.settings.startSceneId) ?? project.scenes[0];
    if (!scene) return { top: "#0f172a", bottom: "#0f172a", shapes: [] };
    return project.dimension === "3d" ? sketch3d(scene) : sketch2d(scene);
}
