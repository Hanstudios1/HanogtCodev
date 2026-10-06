"use client";

/**
 * The Animator panel (V5): the selected object's state machine as a graph.
 * Drag states to arrange them, drag from the dot on a state's edge to another
 * state to add a transition (from Entry: choose the default state), click a
 * transition to edit it in the Inspector. While the game runs the current
 * state lights up with its progress and parameters can be changed live.
 */
import { GitBranch, Maximize2, Trash2, Zap } from "lucide-react";
import { useEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";
import { createAnimatorTransition } from "@/lib/game-engine/components";
import type { GamePlayer } from "@/lib/game-engine/player/game-player";
import { ANIMATOR_ANY_STATE, type AnimatorComponent, type AnimatorTransition, type GameEntity } from "@/lib/game-engine/types";
import { ANIMATOR_SELECT_EVENT, conditionModeLabel, type AnimatorSelectDetail } from "./AnimatorEditor";
import { useEditor } from "./context";
import { activeScene, updateComponent } from "./operations";
import { useEditorState } from "./store";
import { IconButton, PanelHeader, cx } from "./ui";

const NODE_W = 150;
const NODE_H = 46;
const SPECIAL_W = 116;
const SPECIAL_H = 34;
const ENTRY = "#entry";

type Point = { x: number; y: number };
type Node = { id: string; x: number; y: number; w: number; h: number; kind: "state" | "entry" | "any" };
type Live = { stateId: string | null; progress: number; values: Record<string, number> } | null;

function center(node: Node): Point {
    return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
}

/** Where the segment from the node's center toward `to` leaves its rectangle. */
function edgePoint(node: Node, to: Point): Point {
    const c = center(node);
    const dx = to.x - c.x;
    const dy = to.y - c.y;
    if (!dx && !dy) return c;
    const scale = Math.min(Math.abs((node.w / 2) / (dx || 1e-9)), Math.abs((node.h / 2) / (dy || 1e-9)));
    return { x: c.x + dx * Math.min(1, scale), y: c.y + dy * Math.min(1, scale) };
}

function conditionSummary(component: AnimatorComponent, transition: AnimatorTransition, t: ReturnType<typeof useEditor>["t"]) {
    const parts = transition.conditions.map((condition) => {
        const parameter = component.parameters.find((item) => item.name === condition.parameter);
        if (!parameter) return condition.parameter;
        const mode = conditionModeLabel(t, parameter.type, condition.mode);
        return parameter.type === "float" || parameter.type === "int" ? `${parameter.name} ${mode} ${condition.threshold}` : `${parameter.name} ${mode}`;
    });
    if (transition.hasExitTime) parts.push(`${t("animatorExitTime")} ${transition.exitTime}`);
    return parts.join(" · ") || "—";
}

export default function AnimatorPanel({ controlRef }: { controlRef: MutableRefObject<GamePlayer | null> }) {
    const { store, t, playing } = useEditor();
    const selection = useEditorState(store, (state) => state.selection);
    const project = useEditorState(store, (state) => state.project);
    const entity: GameEntity | undefined = selection.length ? activeScene(project).objects.find((item) => item.id === selection[0]) : undefined;
    const component = entity?.components.find((item): item is AnimatorComponent => item.type === "animator");

    const svgRef = useRef<SVGSVGElement | null>(null);
    const [pan, setPan] = useState<Point>({ x: 16, y: 16 });
    const [drag, setDrag] = useState<{ id: string; offset: Point; position: Point; moved: boolean } | null>(null);
    const [panning, setPanning] = useState<{ start: Point; origin: Point } | null>(null);
    const [linking, setLinking] = useState<{ from: string; to: Point } | null>(null);
    const [selected, setSelected] = useState<{ kind: "transition" | "state"; id: string } | null>(null);
    const [liveState, setLiveState] = useState<Live>(null);
    const entityId = entity?.id ?? null;
    const hasAnimator = Boolean(component);

    const baseNodes: Node[] = component ? [
        { id: ENTRY, x: component.layout.entry.x, y: component.layout.entry.y, w: SPECIAL_W, h: SPECIAL_H, kind: "entry" },
        { id: ANIMATOR_ANY_STATE, x: component.layout.any.x, y: component.layout.any.y, w: SPECIAL_W, h: SPECIAL_H, kind: "any" },
        ...component.states.map((state) => ({ id: state.id, x: state.x, y: state.y, w: NODE_W, h: NODE_H, kind: "state" as const })),
    ] : [];
    const nodes = drag ? baseNodes.map((node) => (node.id === drag.id ? { ...node, x: drag.position.x, y: drag.position.y } : node)) : baseNodes;
    const byId = new Map(nodes.map((node) => [node.id, node]));

    // Live state while the game runs.
    useEffect(() => {
        if (!playing || !entityId || !hasAnimator) return;
        const read = () => {
            const world = controlRef.current?.world;
            const runtime = world?.entities.get(entityId);
            const controller = runtime && world ? world.animatorControllerOf(runtime) : null;
            if (!runtime || !controller) {
                setLiveState(null);
                return;
            }
            const player = runtime.animator;
            const state = controller.state;
            const progress = state?.clip && player?.clip ? player.normalizedTime : runtime.animatorStateTime;
            setLiveState({ stateId: state?.id ?? null, progress: progress - Math.floor(progress), values: Object.fromEntries(controller.values) });
        };
        read();
        const timer = window.setInterval(read, 100);
        return () => window.clearInterval(timer);
    }, [playing, entityId, hasAnimator, controlRef]);
    const live = playing && hasAnimator ? liveState : null;

    const setLiveValue = (name: string, value: number) => {
        const world = controlRef.current?.world;
        const runtime = entity ? world?.entities.get(entity.id) : undefined;
        const controller = runtime && world ? world.animatorControllerOf(runtime) : null;
        controller?.values.set(name, value);
    };

    if (!entity || !component) {
        return (
            <div className="flex h-full min-h-0 flex-col" data-animator-panel>
                <PanelHeader><GitBranch className="h-3.5 w-3.5 text-zinc-500" /><span className="text-[12px] font-semibold text-zinc-300">{t("animatorPanel")}</span></PanelHeader>
                <p className="px-3 py-4 text-[12px] leading-relaxed text-zinc-500">{t("animatorEmpty")}</p>
            </div>
        );
    }

    const edit = (label: string, recipe: (draft: AnimatorComponent) => void, mergeKey?: string) => store.update(label, (draft) => updateComponent<AnimatorComponent>(draft, entity.id, component.id, recipe), { mergeKey });
    const toGraph = (event: { clientX: number; clientY: number }): Point => {
        const rect = svgRef.current?.getBoundingClientRect();
        return { x: event.clientX - (rect?.left ?? 0) - pan.x, y: event.clientY - (rect?.top ?? 0) - pan.y };
    };
    const nodeAt = (point: Point) => [...nodes].reverse().find((node) => point.x >= node.x && point.x <= node.x + node.w && point.y >= node.y && point.y <= node.y + node.h);
    const selectTransition = (transition: AnimatorTransition | null) => {
        setSelected(transition ? { kind: "transition", id: transition.id } : null);
        window.dispatchEvent(new CustomEvent<AnimatorSelectDetail>(ANIMATOR_SELECT_EVENT, { detail: { componentId: component.id, transitionId: transition?.id ?? null, stateId: null } }));
    };

    const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
        if (event.button !== 0) return;
        const target = event.target as Element;
        const point = toGraph(event);
        const handle = target.closest("[data-link-from]");
        const node = target.closest("[data-node]");
        const edge = target.closest("[data-transition]");
        event.currentTarget.setPointerCapture(event.pointerId);
        if (handle && !playing) {
            setLinking({ from: handle.getAttribute("data-link-from") as string, to: point });
            return;
        }
        if (node) {
            const id = node.getAttribute("data-node") as string;
            const found = byId.get(id);
            if (!found) return;
            if (found.kind === "state") setSelected({ kind: "state", id });
            if (!playing) setDrag({ id, offset: { x: point.x - found.x, y: point.y - found.y }, position: { x: found.x, y: found.y }, moved: false });
            return;
        }
        if (edge) {
            selectTransition(component.transitions.find((item) => item.id === edge.getAttribute("data-transition")) ?? null);
            return;
        }
        setSelected(null);
        setPanning({ start: { x: event.clientX, y: event.clientY }, origin: pan });
    };

    const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
        if (drag) {
            const point = toGraph(event);
            setDrag({ ...drag, position: { x: Math.round(point.x - drag.offset.x), y: Math.round(point.y - drag.offset.y) }, moved: true });
        } else if (linking) setLinking({ ...linking, to: toGraph(event) });
        else if (panning) setPan({ x: panning.origin.x + event.clientX - panning.start.x, y: panning.origin.y + event.clientY - panning.start.y });
    };

    const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
        if (drag) {
            if (drag.moved) {
                const { id, position } = drag;
                edit(t("hEditAnimator"), (draft) => {
                    if (id === ENTRY) draft.layout.entry = position;
                    else if (id === ANIMATOR_ANY_STATE) draft.layout.any = position;
                    else {
                        const state = draft.states.find((item) => item.id === id);
                        if (state) {
                            state.x = position.x;
                            state.y = position.y;
                        }
                    }
                });
            }
            setDrag(null);
        } else if (linking) {
            const target = nodeAt(toGraph(event));
            if (target?.kind === "state") {
                if (linking.from === ENTRY) edit(t("animatorMakeDefault"), (draft) => { draft.defaultState = target.id; });
                else if (linking.from !== target.id || linking.from === ANIMATOR_ANY_STATE) {
                    const transition = createAnimatorTransition(linking.from, target.id);
                    edit(t("animatorAddTransition"), (draft) => {
                        if (draft.transitions.length < 96) draft.transitions.push(transition);
                    });
                    selectTransition(transition);
                }
            }
            setLinking(null);
        }
        setPanning(null);
    };

    const deleteSelected = () => {
        if (!selected) return;
        if (selected.kind === "transition") edit(t("animatorDeleteSelected"), (draft) => { draft.transitions = draft.transitions.filter((item) => item.id !== selected.id); });
        else edit(t("animatorDeleteSelected"), (draft) => {
            draft.states = draft.states.filter((item) => item.id !== selected.id);
            draft.transitions = draft.transitions.filter((item) => item.from !== selected.id && item.to !== selected.id);
            if (draft.defaultState === selected.id) draft.defaultState = draft.states[0]?.id ?? null;
        });
        setSelected(null);
    };

    const fit = () => {
        const svg = svgRef.current;
        if (!svg || !nodes.length) return;
        const minX = Math.min(...nodes.map((node) => node.x));
        const minY = Math.min(...nodes.map((node) => node.y));
        const maxX = Math.max(...nodes.map((node) => node.x + node.w));
        const maxY = Math.max(...nodes.map((node) => node.y + node.h));
        const rect = svg.getBoundingClientRect();
        setPan({ x: Math.round((rect.width - (maxX - minX)) / 2 - minX), y: Math.round((rect.height - (maxY - minY)) / 2 - minY) });
    };

    const defaultId = component.states.some((state) => state.id === component.defaultState) ? component.defaultState : component.states[0]?.id ?? null;
    const edges: Array<{ key: string; from: Node; to: Node; transition: AnimatorTransition | null }> = [];
    const entryNode = byId.get(ENTRY);
    const defaultNode = defaultId ? byId.get(defaultId) : undefined;
    if (entryNode && defaultNode) edges.push({ key: "entry", from: entryNode, to: defaultNode, transition: null });
    for (const transition of component.transitions) {
        const from = byId.get(transition.from);
        const to = byId.get(transition.to);
        if (from && to) edges.push({ key: transition.id, from, to, transition });
    }
    const pairCount = (a: string, b: string) => component.transitions.filter((item) => item.from === b && item.to === a).length;

    return (
        <div className="flex h-full min-h-0 flex-col" data-animator-panel>
            <PanelHeader actions={(
                <>
                    <IconButton icon={Maximize2} label={t("animatorFit")} size="sm" onClick={fit} />
                    <IconButton icon={Trash2} label={t("animatorDeleteSelected")} size="sm" tone="danger" disabled={!selected || playing} onClick={deleteSelected} />
                </>
            )}>
                <GitBranch className="h-3.5 w-3.5 text-fuchsia-300" />
                <span className="truncate text-[12px] font-semibold text-zinc-200">{entity.name}</span>
                <span className="shrink-0 text-[11px] text-zinc-500">{t("animatorStateCount").replace("{count}", String(component.states.length)).replace("{transitions}", String(component.transitions.length))}</span>
                {live ? <span className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-px text-[10px] font-bold text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{t("animatorLive")}</span> : null}
            </PanelHeader>
            <div className="flex min-h-0 flex-1">
                <svg
                    ref={svgRef}
                    className={cx("min-h-0 min-w-0 flex-1 touch-none select-none bg-zinc-950", panning ? "cursor-grabbing" : "cursor-grab")}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={() => { setDrag(null); setLinking(null); setPanning(null); }}
                    onKeyDown={(event) => {
                        if ((event.key === "Delete" || event.key === "Backspace") && !playing) deleteSelected();
                    }}
                    tabIndex={0}
                    role="application"
                    aria-label={t("animatorPanel")}
                    data-animator-graph
                >
                    <defs>
                        <pattern id="animator-grid" width="24" height="24" patternUnits="userSpaceOnUse" x={pan.x % 24} y={pan.y % 24}>
                            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                        </pattern>
                        <marker id="animator-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
                            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                        </marker>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#animator-grid)" />
                    <g transform={`translate(${pan.x} ${pan.y})`}>
                        {edges.map(({ key, from, to, transition }) => {
                            const self = from.id === to.id;
                            const a = center(from);
                            const b = center(to);
                            // Two-way pairs are drawn side by side.
                            const offset = transition && pairCount(transition.from, transition.to) ? 7 : 0;
                            const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
                            const nx = (-(b.y - a.y) / length) * offset;
                            const ny = ((b.x - a.x) / length) * offset;
                            const start = edgePoint(from, b);
                            const end = edgePoint(to, a);
                            const isSelected = transition && selected?.kind === "transition" && selected.id === transition.id;
                            const color = !transition ? "text-amber-400/70" : isSelected ? "text-indigo-300" : from.kind === "any" ? "text-teal-400/80" : "text-zinc-400";
                            if (self) {
                                const c = center(from);
                                return (
                                    <g key={key} className={cx(color, "cursor-pointer")} data-transition={transition?.id}>
                                        <path d={`M ${c.x + 20} ${from.y} C ${c.x + 40} ${from.y - 40}, ${c.x - 40} ${from.y - 40}, ${c.x - 20} ${from.y}`} fill="none" stroke="currentColor" strokeWidth={isSelected ? 2.5 : 1.5} markerEnd="url(#animator-arrow)" />
                                        {transition ? <title>{conditionSummary(component, transition, t)}</title> : null}
                                    </g>
                                );
                            }
                            const x1 = start.x + nx;
                            const y1 = start.y + ny;
                            const x2 = end.x + nx;
                            const y2 = end.y + ny;
                            return (
                                <g key={key} className={cx(color, transition ? "cursor-pointer" : undefined)} data-transition={transition?.id}>
                                    {/* A wide invisible line makes thin transitions easy to click. */}
                                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={12} />
                                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth={isSelected ? 2.5 : 1.5} strokeDasharray={transition ? undefined : "5 4"} />
                                    <polyline points={`${(x1 + x2) / 2},${(y1 + y2) / 2} ${(x1 + x2) / 2 + (x2 - x1) / length},${(y1 + y2) / 2 + (y2 - y1) / length}`} fill="none" stroke="currentColor" strokeWidth={1.5} markerEnd="url(#animator-arrow)" />
                                    {transition ? <title>{conditionSummary(component, transition, t)}</title> : null}
                                </g>
                            );
                        })}
                        {linking ? (() => {
                            const from = byId.get(linking.from);
                            if (!from) return null;
                            const start = edgePoint(from, linking.to);
                            return <line x1={start.x} y1={start.y} x2={linking.to.x} y2={linking.to.y} className="text-indigo-300" stroke="currentColor" strokeWidth={2} strokeDasharray="4 4" />;
                        })() : null}
                        {nodes.map((node) => {
                            const state = node.kind === "state" ? component.states.find((item) => item.id === node.id) : undefined;
                            const isCurrent = live?.stateId === node.id;
                            const isDefault = node.id === defaultId;
                            const isSelected = selected?.kind === "state" && selected.id === node.id;
                            const fill = node.kind === "entry" ? "fill-emerald-500/20" : node.kind === "any" ? "fill-teal-500/20" : isCurrent ? "fill-indigo-500/35" : "fill-zinc-800";
                            const stroke = isSelected ? "stroke-white" : node.kind === "entry" ? "stroke-emerald-400/70" : node.kind === "any" ? "stroke-teal-400/70" : isCurrent ? "stroke-indigo-300" : isDefault ? "stroke-amber-400/80" : "stroke-white/15";
                            return (
                                <g key={node.id} data-node={node.id} className={playing ? "cursor-default" : "cursor-move"} data-animator-node={state?.name ?? node.kind}>
                                    <rect x={node.x} y={node.y} width={node.w} height={node.h} rx={10} className={cx(fill, stroke)} strokeWidth={isSelected || isCurrent ? 2 : 1.25} />
                                    {node.kind === "state" ? (
                                        <>
                                            <text x={node.x + 12} y={node.y + 19} className="fill-zinc-100 text-[12.5px] font-semibold">{state?.name}</text>
                                            <text x={node.x + 12} y={node.y + 35} className="fill-zinc-500 text-[10.5px]">{state?.clip ?? t("animatorNoClip")}{isDefault ? ` · ${t("animatorDefault")}` : ""}</text>
                                            {isCurrent ? <rect x={node.x + 8} y={node.y + node.h - 5} width={Math.max(2, (node.w - 16) * (live?.progress ?? 0))} height={2.5} rx={1.25} className="fill-indigo-300" /> : null}
                                        </>
                                    ) : (
                                        <text x={node.x + node.w / 2} y={node.y + node.h / 2 + 4} textAnchor="middle" className={cx("text-[11.5px] font-bold", node.kind === "entry" ? "fill-emerald-200" : "fill-teal-200")}>{node.kind === "entry" ? t("animatorEntry") : t("animatorAnyState")}</text>
                                    )}
                                    {!playing ? <circle data-link-from={node.id} cx={node.x + node.w} cy={node.y + node.h / 2} r={5.5} className="cursor-crosshair fill-zinc-950 stroke-indigo-300" strokeWidth={1.5} /> : null}
                                </g>
                            );
                        })}
                    </g>
                </svg>
                <aside className="scrollbar-thin hidden w-48 shrink-0 overflow-y-auto border-l border-white/[0.06] p-2 sm:block" aria-label={t("animatorParameters")}>
                    <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">{t("animatorParameters")}</p>
                    {!component.parameters.length ? <p className="text-[11px] text-zinc-600">—</p> : null}
                    <ul className="space-y-1">
                        {component.parameters.map((parameter) => {
                            const value = live ? live.values[parameter.name] ?? 0 : parameter.value;
                            return (
                                <li key={parameter.name} className="flex items-center gap-1.5 text-[11.5px]">
                                    <span className="min-w-0 flex-1 truncate font-mono text-zinc-300" title={parameter.type}>{parameter.name}</span>
                                    {parameter.type === "trigger" ? (
                                        <button type="button" disabled={!live} onClick={() => setLiveValue(parameter.name, 1)} className={cx("inline-flex h-5 items-center gap-1 rounded px-1.5 text-[10.5px] font-semibold transition disabled:opacity-40", value ? "bg-amber-400/30 text-amber-100" : "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]")}>
                                            <Zap className="h-3 w-3" />{t("animatorFire")}
                                        </button>
                                    ) : parameter.type === "bool" ? (
                                        <input type="checkbox" checked={value !== 0} disabled={!live} aria-label={parameter.name} onChange={(event) => setLiveValue(parameter.name, event.target.checked ? 1 : 0)} className="h-3.5 w-3.5 accent-indigo-400" />
                                    ) : (
                                        <input type="number" value={Number(value.toFixed(3))} step={parameter.type === "int" ? 1 : 0.1} disabled={!live} aria-label={parameter.name} onChange={(event) => {
                                            const next = Number(event.target.value);
                                            if (Number.isFinite(next)) setLiveValue(parameter.name, parameter.type === "int" ? Math.round(next) : next);
                                        }} className="h-5 w-16 rounded border border-white/10 bg-zinc-900 px-1 text-right font-mono text-[11px] text-zinc-100 disabled:opacity-60" />
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                    <p className="mt-2 text-[10.5px] leading-snug text-zinc-500">{t("animatorLiveHint")}</p>
                </aside>
            </div>
        </div>
    );
}
