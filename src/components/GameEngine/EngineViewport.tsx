"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import { Grid3X3, Hand, Maximize, Move3d, RotateCw, Scale3d, Scan, Sun } from "lucide-react";
import type { EngineMode, GameDimension, GameEntity, Vector3 } from "@/lib/game-engine/types";
import { getEntityColor, getTransform } from "./model";

type Tool = "hand" | "move" | "rotate" | "scale";
type Point = { x: number; y: number };
type HitBox = Point & { id: string; width: number; height: number };
type DragState = { kind: "pan" | "entity"; pointerId: number; entityId?: string; x: number; y: number };

type Props = {
    dimension: GameDimension;
    backgroundColor: string;
    entities: GameEntity[];
    selectedId: string | null;
    mode: EngineMode;
    elapsed: number;
    onSelect: (id: string | null) => void;
    onBeginTransform: (id: string) => void;
    onMoveEntity: (id: string, position: Vector3) => void;
    onRotateEntity: (id: string, rotation: Vector3) => void;
    onScaleEntity: (id: string, scale: Vector3) => void;
    onFrameSelected: () => void;
};

const TOOLS: Array<{ id: Tool; label: string; shortcut: string; icon: typeof Hand }> = [
    { id: "hand", label: "Sahneyi kaydır", shortcut: "Q", icon: Hand },
    { id: "move", label: "Taşı", shortcut: "W", icon: Move3d },
    { id: "rotate", label: "Döndür", shortcut: "E", icon: RotateCw },
    { id: "scale", label: "Ölçekle", shortcut: "R", icon: Scale3d },
];

export default function EngineViewport({ dimension, backgroundColor, entities, selectedId, mode, elapsed, onSelect, onBeginTransform, onMoveEntity, onRotateEntity, onScaleEntity, onFrameSelected }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const hitBoxes = useRef<HitBox[]>([]);
    const [tool, setTool] = useState<Tool>("move");
    const [showGrid, setShowGrid] = useState(true);
    const [lighting, setLighting] = useState(true);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
    const [drag, setDrag] = useState<DragState | null>(null);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const width = Math.max(1, rect.width);
        const height = Math.max(1, rect.height);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
        }
        const context = canvas.getContext("2d");
        if (!context) return;
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.clearRect(0, 0, width, height);

        const gradient = context.createRadialGradient(width * 0.5, height * 0.38, 10, width * 0.5, height * 0.5, Math.max(width, height) * 0.72);
        gradient.addColorStop(0, lighting ? "#1e293b" : backgroundColor);
        gradient.addColorStop(1, backgroundColor);
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);

        const nextHitBoxes: HitBox[] = [];
        if (dimension === "2d") draw2D(context, width, height, entities, selectedId, mode, elapsed, zoom, pan, showGrid, nextHitBoxes);
        else draw3D(context, width, height, entities, selectedId, mode, elapsed, zoom, pan, showGrid, nextHitBoxes);
        hitBoxes.current = nextHitBoxes;
    }, [backgroundColor, dimension, elapsed, entities, lighting, mode, pan, selectedId, showGrid, zoom]);

    useEffect(() => {
        draw();
        const canvas = canvasRef.current;
        if (!canvas) return;
        const observer = new ResizeObserver(draw);
        observer.observe(canvas);
        return () => observer.disconnect();
    }, [draw]);

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            const tag = (event.target as HTMLElement | null)?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA") return;
            if (event.key.toLowerCase() === "q") setTool("hand");
            if (event.key.toLowerCase() === "w") setTool("move");
            if (event.key.toLowerCase() === "e") setTool("rotate");
            if (event.key.toLowerCase() === "r") setTool("scale");
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    };

    const beginDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const point = pointFromEvent(event);
        const hit = [...hitBoxes.current].reverse().find((item) => point.x >= item.x - item.width / 2 && point.x <= item.x + item.width / 2 && point.y >= item.y - item.height / 2 && point.y <= item.y + item.height / 2);
        event.currentTarget.setPointerCapture(event.pointerId);
        if (hit) {
            onSelect(hit.id);
            if (tool !== "hand") onBeginTransform(hit.id);
            setDrag({ kind: tool === "hand" ? "pan" : "entity", pointerId: event.pointerId, entityId: hit.id, x: event.clientX, y: event.clientY });
        } else {
            onSelect(null);
            setDrag({ kind: "pan", pointerId: event.pointerId, x: event.clientX, y: event.clientY });
        }
    };

    const continueDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (drag.kind === "pan") setPan((current) => ({ x: current.x + dx, y: current.y + dy }));
        else if (drag.entityId) {
            const entity = entities.find((item) => item.id === drag.entityId);
            const transform = entity && getTransform(entity);
            if (transform && tool === "move") onMoveEntity(entity.id, dimension === "2d"
                ? { ...transform.position, x: transform.position.x + dx / (54 * zoom), y: transform.position.y - dy / (54 * zoom) }
                : { ...transform.position, x: transform.position.x + dx / (50 * zoom), z: transform.position.z + dy / (30 * zoom) });
            if (transform && tool === "rotate") onRotateEntity(entity.id, dimension === "2d"
                ? { ...transform.rotation, z: transform.rotation.z + dx * 0.7 }
                : { ...transform.rotation, x: transform.rotation.x - dy * 0.45, y: transform.rotation.y + dx * 0.6 });
            if (transform && tool === "scale") {
                const factor = Math.max(0.2, Math.min(5, 1 + (dx - dy) * 0.012));
                const clamp = (value: number) => Math.max(0.05, Math.min(50, value * factor));
                onScaleEntity(entity.id, { x: clamp(transform.scale.x), y: clamp(transform.scale.y), z: clamp(transform.scale.z) });
            }
        }
        setDrag({ ...drag, x: event.clientX, y: event.clientY });
    };

    const endDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (drag?.pointerId === event.pointerId) setDrag(null);
    };

    const handleWheel = (event: WheelEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        setZoom((current) => Math.max(0.35, Math.min(2.5, current * (event.deltaY > 0 ? 0.9 : 1.1))));
    };

    const frameSelected = () => {
        const selected = entities.find((entity) => entity.id === selectedId);
        const transform = selected && getTransform(selected);
        if (transform) {
            const canvas = canvasRef.current;
            const bounds = canvas?.getBoundingClientRect();
            if (bounds) setPan(dimension === "2d"
                ? { x: -transform.position.x * 54 * zoom, y: transform.position.y * 54 * zoom }
                : { x: -(transform.position.x - transform.position.z) * 50 * zoom, y: -(transform.position.x + transform.position.z) * 25 * zoom + transform.position.y * 50 * zoom });
        }
        onFrameSelected();
    };

    return (
        <section className="relative flex min-h-[300px] flex-1 overflow-hidden bg-[#090b10]" aria-label={`${dimension.toUpperCase()} Canvas sahne görünümü`}>
            <canvas
                ref={canvasRef}
                className={`h-full w-full touch-none select-none ${drag ? "cursor-grabbing" : tool === "hand" ? "cursor-grab" : "cursor-default"}`}
                onPointerDown={beginDrag}
                onPointerMove={continueDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onWheel={handleWheel}
                role="img"
                aria-label={`${dimension === "2d" ? "İki" : "Üç"} boyutlu Canvas oyun sahnesi önizlemesi. Nesneler Hierarchy ve Inspector üzerinden de düzenlenebilir.`}
            />
            <div className="absolute left-3 top-3 flex items-center gap-1 rounded-xl border border-white/10 bg-zinc-950/80 p-1 shadow-xl backdrop-blur-xl">
                {TOOLS.map(({ id, label, shortcut, icon: Icon }) => <button key={id} type="button" aria-label={`${label} (${shortcut})`} aria-pressed={tool === id} onClick={() => setTool(id)} title={`${label} (${shortcut})`} className={`rounded-lg p-2 transition ${tool === id ? "bg-blue-600 text-white" : "text-zinc-400 hover:bg-white/10 hover:text-white"}`}><Icon className="h-4 w-4" /></button>)}
                <span className="mx-1 h-5 w-px bg-white/10" />
                <button type="button" aria-label="Seçili nesneye odaklan" onClick={frameSelected} disabled={!selectedId} className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-30" title="Seçili nesneye odaklan"><Scan className="h-4 w-4" /></button>
            </div>
            <div className="absolute right-3 top-3 flex items-center gap-1 rounded-xl border border-white/10 bg-zinc-950/80 p-1 shadow-xl backdrop-blur-xl">
                <button type="button" aria-label="Izgarayı göster" aria-pressed={showGrid} onClick={() => setShowGrid((value) => !value)} className={`rounded-lg p-2 ${showGrid ? "bg-white/10 text-blue-400" : "text-zinc-500 hover:text-white"}`}><Grid3X3 className="h-4 w-4" /></button>
                <button type="button" aria-label="Sahne ışığını göster" aria-pressed={lighting} onClick={() => setLighting((value) => !value)} className={`rounded-lg p-2 ${lighting ? "bg-white/10 text-amber-400" : "text-zinc-500 hover:text-white"}`}><Sun className="h-4 w-4" /></button>
                <button type="button" aria-label="Görünümü sıfırla" onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1); }} className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white"><Maximize className="h-4 w-4" /></button>
            </div>
            <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-950/75 px-2.5 py-1.5 text-[10px] text-zinc-400 backdrop-blur"><span className="font-black text-zinc-200">{dimension.toUpperCase()}</span><span>Canvas önizlemesi</span><span>·</span><span>{Math.round(zoom * 100)}%</span><span>·</span><span>{entities.filter((entity) => entity.active).length} nesne</span></div>
            {mode !== "edit" && <div className={`pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] backdrop-blur ${mode === "playing" ? "border-emerald-400/30 bg-emerald-500/20 text-emerald-300" : "border-amber-400/30 bg-amber-500/20 text-amber-300"}`}>{mode === "playing" ? "Önizleme çalışıyor" : "Duraklatıldı"}</div>}
        </section>
    );
}

function draw2D(context: CanvasRenderingContext2D, width: number, height: number, entities: GameEntity[], selectedId: string | null, mode: EngineMode, elapsed: number, zoom: number, pan: Point, showGrid: boolean, hits: HitBox[]) {
    const center = { x: width / 2 + pan.x, y: height / 2 + pan.y };
    if (showGrid) {
        context.strokeStyle = "rgba(148,163,184,.12)";
        context.lineWidth = 1;
        const step = 40 * zoom;
        context.beginPath();
        for (let x = center.x % step; x < width; x += step) { context.moveTo(x, 0); context.lineTo(x, height); }
        for (let y = center.y % step; y < height; y += step) { context.moveTo(0, y); context.lineTo(width, y); }
        context.stroke();
    }
    context.strokeStyle = "rgba(239,68,68,.35)"; context.beginPath(); context.moveTo(0, center.y); context.lineTo(width, center.y); context.stroke();
    context.strokeStyle = "rgba(34,197,94,.35)"; context.beginPath(); context.moveTo(center.x, 0); context.lineTo(center.x, height); context.stroke();
    context.setLineDash([7, 5]); context.strokeStyle = "rgba(167,139,250,.5)"; context.strokeRect(center.x - 270 * zoom, center.y - 152 * zoom, 540 * zoom, 304 * zoom); context.setLineDash([]);

    entities.filter((entity) => entity.active).forEach((entity) => {
        const transform = getTransform(entity); if (!transform) return;
        const bounce = mode === "playing" && entity.components.some((component) => component.type === "rigidBody") ? Math.sin(elapsed * 3 + transform.position.x) * 7 : 0;
        const point = { x: center.x + transform.position.x * 54 * zoom, y: center.y - transform.position.y * 54 * zoom + bounce };
        const objectWidth = Math.max(18, 48 * Math.abs(transform.scale.x) * zoom);
        const objectHeight = Math.max(18, 48 * Math.abs(transform.scale.y) * zoom);
        const color = getEntityColor(entity);
        context.save(); context.translate(point.x, point.y); context.rotate(-transform.rotation.z * Math.PI / 180);
        context.shadowColor = "rgba(0,0,0,.38)"; context.shadowBlur = 16; context.shadowOffsetY = 7;
        if (entity.components.some((component) => component.type === "camera")) { context.strokeStyle = color; context.lineWidth = 2; roundedRect(context, -36, -22, 72, 44, 6); context.stroke(); context.beginPath(); context.moveTo(36, -13); context.lineTo(54, -23); context.lineTo(54, 23); context.lineTo(36, 13); context.closePath(); context.stroke(); }
        else if (entity.components.some((component) => component.type === "light")) { context.fillStyle = color + "38"; context.strokeStyle = color; context.beginPath(); context.arc(0, 0, 18, 0, Math.PI * 2); context.fill(); context.stroke(); }
        else if (meshPrimitive(entity) === "sphere") { context.fillStyle = color; context.beginPath(); context.arc(0, 0, Math.max(objectWidth, objectHeight) / 2, 0, Math.PI * 2); context.fill(); }
        else { context.fillStyle = color; roundedRect(context, -objectWidth / 2, -objectHeight / 2, objectWidth, objectHeight, 7); context.fill(); }
        context.shadowColor = "transparent";
        if (entity.id === selectedId) drawSelection2D(context, objectWidth + 12, objectHeight + 12);
        context.restore();
        drawLabel(context, entity.name, point.x, point.y + objectHeight / 2 + 21);
        hits.push({ id: entity.id, ...point, width: Math.max(54, objectWidth), height: Math.max(48, objectHeight) });
    });
}

function draw3D(context: CanvasRenderingContext2D, width: number, height: number, entities: GameEntity[], selectedId: string | null, mode: EngineMode, elapsed: number, zoom: number, pan: Point, showGrid: boolean, hits: HitBox[]) {
    const center = { x: width / 2 + pan.x, y: height * .54 + pan.y };
    const project = (position: Vector3): Point => ({ x: center.x + (position.x - position.z) * 50 * zoom, y: center.y + (position.x + position.z) * 25 * zoom - position.y * 50 * zoom });
    if (showGrid) {
        context.save(); context.strokeStyle = "rgba(100,116,139,.24)"; context.lineWidth = 1;
        for (let index = -12; index <= 12; index += 1) {
            const a = project({ x: index, y: 0, z: -12 }); const b = project({ x: index, y: 0, z: 12 }); context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
            const c = project({ x: -12, y: 0, z: index }); const d = project({ x: 12, y: 0, z: index }); context.beginPath(); context.moveTo(c.x, c.y); context.lineTo(d.x, d.y); context.stroke();
        }
        drawAxis(context, center, { x: center.x + 190, y: center.y + 95 }, "#ef4444"); drawAxis(context, center, { x: center.x - 190, y: center.y + 95 }, "#3b82f6"); drawAxis(context, center, { x: center.x, y: center.y - 170 }, "#22c55e"); context.restore();
    }
    const sorted = [...entities].filter((entity) => entity.active).sort((left, right) => { const a = getTransform(left)?.position; const b = getTransform(right)?.position; return ((a?.x ?? 0) + (a?.z ?? 0)) - ((b?.x ?? 0) + (b?.z ?? 0)); });
    sorted.forEach((entity) => {
        const transform = getTransform(entity); if (!transform) return;
        const bounce = mode === "playing" && entity.components.some((component) => component.type === "rigidBody") ? Math.abs(Math.sin(elapsed * 2.4 + transform.position.x)) * .18 : 0;
        const point = project({ ...transform.position, y: transform.position.y + bounce });
        const size = Math.max(16, 32 * zoom * Math.max(.35, Math.abs(transform.scale.x)));
        const color = getEntityColor(entity);
        context.save(); context.translate(point.x, point.y); context.rotate((transform.rotation.y - transform.rotation.x * .35) * Math.PI / 360); context.shadowColor = "rgba(0,0,0,.4)"; context.shadowBlur = 14; context.shadowOffsetY = 8;
        if (entity.components.some((component) => component.type === "camera")) drawCamera(context, color, size);
        else if (entity.components.some((component) => component.type === "light")) drawLight(context, color, size);
        else if (meshPrimitive(entity) === "sphere") drawSphere(context, color, size);
        else if (meshPrimitive(entity) === "plane") drawPlane(context, color, size * 2);
        else drawCube(context, color, size);
        context.shadowColor = "transparent";
        if (entity.id === selectedId) drawGizmo3D(context, Math.max(44, size * 1.7));
        context.restore();
        drawLabel(context, entity.name, point.x, point.y + size + 18);
        hits.push({ id: entity.id, ...point, width: Math.max(50, size * 2), height: Math.max(48, size * 2) });
    });
}

function meshPrimitive(entity: GameEntity) { const mesh = entity.components.find((component) => component.type === "meshRenderer"); return mesh?.type === "meshRenderer" && mesh.mesh.kind === "primitive" ? mesh.mesh.primitive : null; }
function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) { context.beginPath(); context.roundRect(x, y, width, height, radius); }
function shade(hex: string, amount: number) { const value = Number.parseInt(hex.replace("#", ""), 16); if (!Number.isFinite(value)) return hex; const channel = (shift: number) => Math.max(0, Math.min(255, ((value >> shift) & 255) + amount)); return `rgb(${channel(16)},${channel(8)},${channel(0)})`; }
function drawCube(context: CanvasRenderingContext2D, color: string, size: number) { const h = size * .62; context.fillStyle = color; polygon(context, [[0, -h], [size, -h / 2], [0, 0], [-size, -h / 2]]); context.fill(); context.fillStyle = shade(color, -42); polygon(context, [[-size, -h / 2], [0, 0], [0, h], [-size, h / 2]]); context.fill(); context.fillStyle = shade(color, -22); polygon(context, [[size, -h / 2], [0, 0], [0, h], [size, h / 2]]); context.fill(); }
function drawSphere(context: CanvasRenderingContext2D, color: string, size: number) { const gradient = context.createRadialGradient(-size * .25, -size * .4, 2, 0, 0, size); gradient.addColorStop(0, "#fff"); gradient.addColorStop(.18, color); gradient.addColorStop(1, shade(color, -60)); context.fillStyle = gradient; context.beginPath(); context.arc(0, -size * .1, size * .72, 0, Math.PI * 2); context.fill(); }
function drawPlane(context: CanvasRenderingContext2D, color: string, size: number) { context.fillStyle = color; context.globalAlpha = .86; polygon(context, [[0, -size * .44], [size, 0], [0, size * .44], [-size, 0]]); context.fill(); context.globalAlpha = 1; }
function drawCamera(context: CanvasRenderingContext2D, color: string, size: number) { context.fillStyle = color + "35"; context.strokeStyle = color; context.lineWidth = 2; roundedRect(context, -size * .6, -size * .4, size * 1.08, size * .8, 5); context.fill(); context.stroke(); polygon(context, [[size * .48, -size * .25], [size, -size * .52], [size, size * .52], [size * .48, size * .25]]); context.stroke(); }
function drawLight(context: CanvasRenderingContext2D, color: string, size: number) { context.fillStyle = color + "40"; context.strokeStyle = color; context.lineWidth = 2; context.beginPath(); context.arc(0, 0, size * .42, 0, Math.PI * 2); context.fill(); context.stroke(); for (let index = 0; index < 8; index += 1) { const angle = index * Math.PI / 4; context.beginPath(); context.moveTo(Math.cos(angle) * size * .58, Math.sin(angle) * size * .58); context.lineTo(Math.cos(angle) * size * .86, Math.sin(angle) * size * .86); context.stroke(); } }
function polygon(context: CanvasRenderingContext2D, points: number[][]) { context.beginPath(); points.forEach(([x, y], index) => index === 0 ? context.moveTo(x, y) : context.lineTo(x, y)); context.closePath(); }
function drawAxis(context: CanvasRenderingContext2D, from: Point, to: Point, color: string) { context.strokeStyle = color; context.lineWidth = 2; context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke(); }
function drawLabel(context: CanvasRenderingContext2D, label: string, x: number, y: number) { context.save(); context.font = "600 11px Inter, system-ui, sans-serif"; context.textAlign = "center"; context.lineWidth = 4; context.strokeStyle = "#020617"; context.strokeText(label, x, y); context.fillStyle = "#e2e8f0"; context.fillText(label, x, y); context.restore(); }
function drawSelection2D(context: CanvasRenderingContext2D, width: number, height: number) { context.strokeStyle = "#60a5fa"; context.lineWidth = 1.5; context.strokeRect(-width / 2, -height / 2, width, height); [[-width / 2, -height / 2], [width / 2, -height / 2], [-width / 2, height / 2], [width / 2, height / 2]].forEach(([x, y]) => { context.fillStyle = "#fff"; context.fillRect(x - 3, y - 3, 6, 6); }); drawAxis(context, { x: 0, y: 0 }, { x: 58, y: 0 }, "#ef4444"); drawAxis(context, { x: 0, y: 0 }, { x: 0, y: -58 }, "#22c55e"); }
function drawGizmo3D(context: CanvasRenderingContext2D, size: number) { context.setLineDash([4, 3]); context.strokeStyle = "#60a5fa"; context.beginPath(); context.arc(0, 0, size * .7, 0, Math.PI * 2); context.stroke(); context.setLineDash([]); drawAxis(context, { x: 0, y: 0 }, { x: size, y: size * .5 }, "#ef4444"); drawAxis(context, { x: 0, y: 0 }, { x: -size, y: size * .5 }, "#3b82f6"); drawAxis(context, { x: 0, y: 0 }, { x: 0, y: -size }, "#22c55e"); }
