/**
 * The editor's Scene view: the game renderer plus orbit/pan camera controls,
 * the move/rotate/scale gizmo (one or many objects), box selection, picking,
 * icons, camera/light/collider outlines, the grid and the tile painter's
 * cursor. Only the editor loads this module, so the standalone player
 * (public/engine/player.js) carries none of it.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import type { TRS } from "../math";
import type { CameraComponent, ColliderComponent, GameComponent, LightComponent, Vector3 } from "../types";
import { editorIcon, type EditorIconKind } from "./editor-icons";
import { readTRS } from "./convert";
import { disposeObject, SceneRenderer, type EntityObject, type RenderEntity, type SceneRendererOptions } from "./renderer";

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

export interface EditorRendererOptions extends Omit<SceneRendererOptions, "mode"> {
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

export class EditorSceneRenderer extends SceneRenderer {
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
    private paintMode = false;
    private cursorKey = "";

    private readonly editorOptions: EditorRendererOptions;
    private readonly icons = new Map<EditorIconKind, THREE.Texture>();

    constructor(container: HTMLElement, options: EditorRendererOptions) {
        super(container, { ...options, mode: "editor" });
        this.editorOptions = options;
        this.setupEditor();
        this.updateEditorProjection();
    }

    // -------------------------------------------------------------------
    // Hooks of the game renderer
    // -------------------------------------------------------------------

    protected override activeCamera(): THREE.Camera {
        return this.dimension === "2d" ? this.editorCamera2D! : this.editorCamera3D!;
    }

    protected override resized() {
        this.updateEditorProjection();
    }

    protected override dimensionChanged() {
        this.applyEditorDimension();
    }

    protected override heldByGizmo(id: string): boolean {
        return this.dragging && this.attachedId === id;
    }

    protected override decorate(object: EntityObject, entity: RenderEntity) {
        this.updateEditorDecorations(object, entity);
    }

    protected override synced() {
        this.refreshAttachment();
    }

    protected override rebuilt(object: EntityObject) {
        object.gizmoKey = "";
        object.colliderKey = "";
    }

    protected override removed(object: EntityObject) {
        if (this.attachedId === object.id) {
            this.transform?.detach();
            this.attachedId = null;
        }
        const helper = this.selectionHelpers.get(object.id);
        if (helper) {
            this.scene.remove(helper);
            helper.geometry.dispose();
            this.selectionHelpers.delete(object.id);
        }
    }

    protected override lightFocus(camera: THREE.Camera, focus: THREE.Vector3) {
        if (this.orbit) focus.copy(this.orbit.target);
        else super.lightFocus(camera, focus);
    }

    protected override beforeRender() {
        this.orbit?.update();
    }

    override dispose() {
        if (this.disposed) return;
        this.endMarquee();
        this.canvas.removeEventListener("pointerdown", this.handlePointerDown, { capture: true });
        this.canvas.removeEventListener("pointermove", this.handlePointerMove);
        this.canvas.removeEventListener("pointerup", this.handlePointerUp);
        this.canvas.removeEventListener("pointercancel", this.handlePointerCancel);
        this.transform?.detach();
        this.transform?.dispose();
        this.orbit?.dispose();
        for (const helper of this.selectionHelpers.values()) helper.geometry.dispose();
        if (this.gridGroup) disposeObject(this.gridGroup);
        for (const texture of this.icons.values()) texture.dispose();
        this.icons.clear();
        super.dispose();
    }

    private icon(kind: EditorIconKind): THREE.Texture {
        let texture = this.icons.get(kind);
        if (!texture) {
            texture = editorIcon(kind);
            this.icons.set(kind, texture);
        }
        return texture;
    }

    // -------------------------------------------------------------------
    // Setup, view controls and the tile painter
    // -------------------------------------------------------------------

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
                if (dragging) this.editorOptions.onGizmoStart?.(this.attachedId);
                else this.editorOptions.onGizmoEnd?.(this.attachedId);
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
            this.editorOptions.onGizmoChange?.(this.attachedId, readTRS(object.group));
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
        this.editorOptions.onGizmoChangeMany?.(changes);
    }

    private handlePointerDown = (event: PointerEvent) => {
        this.pointerDown = { x: event.clientX, y: event.clientY, time: performance.now() };
        const onGizmo = Boolean((this.transform as unknown as { axis?: string | null } | null)?.axis);
        if (!this.editorOptions.onMarquee || event.button !== 0 || !event.shiftKey || this.paintMode || onGizmo) return;
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
                this.editorOptions.onPick?.(this.pick(event.clientX, event.clientY), true);
                return;
            }
            const ids = this.objectsInBox(Math.min(marquee.x0, marquee.x1), Math.min(marquee.y0, marquee.y1), Math.max(marquee.x0, marquee.x1), Math.max(marquee.y0, marquee.y1));
            this.editorOptions.onMarquee?.(ids, marquee.additive);
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
            this.editorOptions.onDoublePick?.(id);
            this.focus(id);
        }
        this.lastClick = { id: id ?? "", time: now };
        this.editorOptions.onPick?.(id, event.shiftKey || event.ctrlKey || event.metaKey);
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
                const material = new THREE.SpriteMaterial({ map: this.icon(iconKind as EditorIconKind), sizeAttenuation: false, depthTest: false, transparent: true, toneMapped: false });
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

}
