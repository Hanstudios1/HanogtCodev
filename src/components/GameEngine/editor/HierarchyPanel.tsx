"use client";

import {
    ChevronDown,
    ChevronRight,
    ClipboardPaste,
    Copy,
    CopyPlus,
    Crosshair,
    Eye,
    EyeOff,
    FileCode,
    FolderTree,
    Package,
    Pencil,
    Plus,
    Search,
    Trash2,
    Undo,
    X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { EntityPreset } from "@/lib/game-engine/scene";
import { COMPONENT_LABELS } from "@/lib/game-engine/components";
import type { GameComponent, GameEntity } from "@/lib/game-engine/types";
import { createMenuItems, entityIcon, useEditor } from "./context";
import { matchesSearch } from "./multi-edit";
import { activeScene, addEntity, createPrefabFromEntity, deleteEntities, duplicateEntities, reparent } from "./operations";
import { useEditorState } from "./store";
import { ContextMenu, Dropdown, IconButton, PanelHeader, cx, inputClass, type MenuItem } from "./ui";

interface TreeRow {
    entity: GameEntity;
    depth: number;
    hasChildren: boolean;
}

export const CLIPBOARD_KEY = "hanogt-engine:clipboard";

export function copyEntitiesToClipboard(entities: GameEntity[], ids: string[]) {
    const groups = ids.map((id) => {
        const output: GameEntity[] = [];
        const visit = (current: string) => {
            const entity = entities.find((item) => item.id === current);
            if (!entity) return;
            output.push(entity);
            for (const child of entities.filter((item) => item.parentId === current)) visit(child.id);
        };
        visit(id);
        return output;
    });
    try {
        sessionStorage.setItem(CLIPBOARD_KEY, JSON.stringify(groups));
    } catch {
        // clipboard is best-effort
    }
}

/** Unity names that also find a component with "t:" (t:Rigidbody2D, t:BoxCollider2D, t:Text…). */
const SEARCH_ALIASES: Partial<Record<GameComponent["type"], string[]>> = {
    rigidBody: ["Rigidbody2D"],
    collider: ["Collider2D", "BoxCollider", "BoxCollider2D", "SphereCollider", "CircleCollider2D"],
    uiText: ["Text", "TextMeshPro"],
    uiButton: ["Button"],
    uiPanel: ["Image", "Panel"],
    uiProgressBar: ["ProgressBar"],
    uiSlider: ["Slider"],
    uiToggle: ["Toggle"],
    uiInputField: ["InputField"],
    animation: ["Animator"],
    joint: ["DistanceJoint2D", "SpringJoint2D", "DistanceJoint", "SpringJoint"],
    navAgent2D: ["NavMeshAgent"],
};

export default function HierarchyPanel() {
    const { store, t, playing, focusEntity, createAt, toast, program } = useEditor();
    const project = useEditorState(store, (state) => state.project);
    const selection = useEditorState(store, (state) => state.selection);
    const scene = activeScene(project);
    const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
    const [query, setQuery] = useState("");
    const [renaming, setRenaming] = useState<string | null>(null);
    const [menu, setMenu] = useState<{ position: { x: number; y: number }; entityId: string | null } | null>(null);
    const [dropTarget, setDropTarget] = useState<{ id: string | null; zone: "before" | "inside" | "after" } | null>(null);
    const dragId = useRef<string | null>(null);
    const lastClicked = useRef<string | null>(null);

    useEffect(() => {
        const onRename = (event: Event) => {
            const id = (event as CustomEvent<string>).detail;
            if (typeof id === "string" && !playing) setRenaming(id);
        };
        window.addEventListener("hanogt-engine:rename", onRename);
        return () => window.removeEventListener("hanogt-engine:rename", onRename);
    }, [playing]);

    const rows = useMemo<TreeRow[]>(() => {
        const children = new Map<string | null, GameEntity[]>();
        const ids = new Set(scene.objects.map((entity) => entity.id));
        for (const entity of scene.objects) {
            const key = entity.parentId && ids.has(entity.parentId) ? entity.parentId : null;
            const list = children.get(key) ?? [];
            list.push(entity);
            children.set(key, list);
        }
        const output: TreeRow[] = [];
        if (query.trim()) {
            const scriptClass = (component: GameComponent) => component.type === "script" ? component.className ?? (program.behavioursByScript.get(component.scriptId) ?? [])[0] ?? null : null;
            const typeLabel = (component: GameComponent) => [COMPONENT_LABELS[component.type], ...(SEARCH_ALIASES[component.type] ?? [])];
            for (const entity of scene.objects) {
                if (matchesSearch(entity, query, scriptClass, typeLabel)) output.push({ entity, depth: 0, hasChildren: false });
            }
            return output;
        }
        const visit = (parent: string | null, depth: number) => {
            for (const entity of children.get(parent) ?? []) {
                const hasChildren = (children.get(entity.id)?.length ?? 0) > 0;
                output.push({ entity, depth, hasChildren });
                if (hasChildren && !collapsed.has(entity.id)) visit(entity.id, depth + 1);
            }
        };
        visit(null, 0);
        return output;
    }, [scene.objects, collapsed, query, program]);

    const select = (id: string, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
        if (event.ctrlKey || event.metaKey) {
            store.setSelection(selection.includes(id) ? selection.filter((item) => item !== id) : [...selection, id]);
        } else if (event.shiftKey && lastClicked.current) {
            const from = rows.findIndex((row) => row.entity.id === lastClicked.current);
            const to = rows.findIndex((row) => row.entity.id === id);
            if (from >= 0 && to >= 0) {
                const [start, end] = from < to ? [from, to] : [to, from];
                store.setSelection(rows.slice(start, end + 1).map((row) => row.entity.id));
            }
        } else {
            store.setSelection([id]);
        }
        lastClicked.current = id;
    };

    const create = (preset: EntityPreset, parentId: string | null = null) => {
        if (playing) return;
        let createdId = "";
        store.update(t("hCreateEntity"), (draft) => {
            createdId = addEntity(draft, preset, parentId ? { x: 0, y: 0, z: 0 } : createAt(), parentId).id;
        });
        if (createdId) store.setSelection([createdId]);
        if (parentId) setCollapsed((current) => {
            const next = new Set(current);
            next.delete(parentId);
            return next;
        });
    };

    const toggleActive = (entity: GameEntity) => {
        if (playing) return;
        store.update(entity.active ? t("hHideEntity") : t("hShowEntity"), (draft) => {
            const target = activeScene(draft).objects.find((item) => item.id === entity.id);
            if (target) target.active = !target.active;
        });
    };

    const rename = (id: string, name: string) => {
        const trimmed = name.trim().slice(0, 80);
        setRenaming(null);
        if (!trimmed || playing) return;
        store.update(t("rename2"), (draft) => {
            const target = activeScene(draft).objects.find((item) => item.id === id);
            if (target) target.name = trimmed;
        });
    };

    const onDragStart = (event: DragEvent, id: string) => {
        if (playing) return;
        dragId.current = id;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-hanogt-entity", id);
    };

    const onDragOver = (event: DragEvent, id: string | null) => {
        if (!dragId.current) return;
        event.preventDefault();
        if (!id) {
            setDropTarget({ id: null, zone: "after" });
            return;
        }
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        const ratio = (event.clientY - rect.top) / rect.height;
        setDropTarget({ id, zone: ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "inside" });
    };

    const onDrop = (event: DragEvent) => {
        event.preventDefault();
        const moving = dragId.current;
        const target = dropTarget;
        dragId.current = null;
        setDropTarget(null);
        if (!moving || !target || target.id === moving) return;
        store.update(t("hReparent"), (draft) => {
            const sceneDraft = activeScene(draft);
            if (!target.id) {
                reparent(draft, moving, null, null);
                return;
            }
            const targetEntity = sceneDraft.objects.find((item) => item.id === target.id);
            if (!targetEntity) return;
            if (target.zone === "inside") {
                reparent(draft, moving, target.id, null);
            } else if (target.zone === "before") {
                reparent(draft, moving, targetEntity.parentId, target.id);
            } else {
                // After: insert before the next sibling of the target.
                const siblings = sceneDraft.objects.filter((item) => item.parentId === targetEntity.parentId);
                const index = siblings.findIndex((item) => item.id === target.id);
                const next = siblings[index + 1];
                reparent(draft, moving, targetEntity.parentId, next?.id ?? null);
            }
        });
    };

    const menuItems = (entityId: string | null): MenuItem[] => {
        const createItems = createMenuItems(project.dimension, t, (preset) => create(preset, entityId));
        if (!entityId) {
            return [
                { label: t("create"), icon: Plus, items: createItems, disabled: playing },
                { label: t("paste"), icon: ClipboardPaste, onSelect: () => window.dispatchEvent(new CustomEvent("hanogt-engine:paste")), disabled: playing },
            ];
        }
        const ids = selection.includes(entityId) ? selection : [entityId];
        const entity = scene.objects.find((item) => item.id === entityId);
        return [
            { label: t("createChild"), icon: Plus, items: createItems, disabled: playing },
            { separator: true, label: "" },
            { label: t("rename"), icon: Pencil, onSelect: () => setRenaming(entityId), disabled: playing },
            { label: t("duplicate"), icon: CopyPlus, disabled: playing, onSelect: () => {
                let created: string[] = [];
                store.update(t("duplicateLabel"), (draft) => { created = duplicateEntities(draft, ids); });
                store.setSelection(created);
            } },
            { label: t("copy"), icon: Copy, onSelect: () => copyEntitiesToClipboard(scene.objects, ids) },
            { label: t("paste"), icon: ClipboardPaste, onSelect: () => window.dispatchEvent(new CustomEvent("hanogt-engine:paste")), disabled: playing },
            { separator: true, label: "" },
            { label: t("focus"), icon: Crosshair, onSelect: () => focusEntity(entityId) },
            { label: t("makePrefab"), icon: Package, disabled: playing, onSelect: () => {
                let prefabId: string | null = null;
                store.update(t("makePrefab"), (draft) => { prefabId = createPrefabFromEntity(draft, entityId); });
                if (prefabId) toast(`"${entity?.name}" prefab olarak kaydedildi.`, "success");
            } },
            ...(entity?.parentId ? [{ label: t("unparent"), icon: Undo, disabled: playing, onSelect: () => store.update(t("hUnparent"), (draft) => reparent(draft, entityId, null, null)) }] : []),
            { separator: true, label: "" },
            { label: t("delete"), icon: Trash2, danger: true, disabled: playing, onSelect: () => store.update("Sil", (draft) => deleteEntities(draft, ids), { selection: [] }) },
        ];
    };

    return (
        <div className="flex h-full min-h-0 flex-col">
            <PanelHeader
                actions={(
                    <Dropdown
                        align="right"
                        items={createMenuItems(project.dimension, t, (preset) => create(preset))}
                        trigger={({ toggle }) => <IconButton icon={Plus} label={t("create")} onClick={toggle} size="sm" disabled={playing} />}
                    />
                )}
            >
                <FolderTree className="h-3.5 w-3.5 text-zinc-500" />
                <span className="truncate text-[12px] font-semibold text-zinc-300">{scene.name}</span>
                <span className="text-[11px] text-zinc-600">({scene.objects.length})</span>
            </PanelHeader>
            <div className="px-2 pt-2">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search")} title={t("multiSearchHint")} aria-label={t("search")} className={cx(inputClass, "pl-7")} />
                    {query ? <button type="button" onClick={() => setQuery("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200" aria-label={t("clear")}><X className="h-3.5 w-3.5" /></button> : null}
                </div>
                {query.trim() ? (
                    <div className="flex items-center justify-between gap-2 px-1 pt-1 text-[11px] text-zinc-500" aria-live="polite">
                        <span>{rows.length}</span>
                        {rows.length > 1 ? <button type="button" onClick={() => store.setSelection(rows.map((row) => row.entity.id))} className="font-semibold text-indigo-300 hover:text-indigo-200">{t("multiSelectResults")}</button> : null}
                    </div>
                ) : null}
            </div>
            <div
                role="tree"
                aria-label={t("hierarchy")}
                className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-1 py-1.5"
                onContextMenu={(event) => {
                    if (event.target !== event.currentTarget) return;
                    event.preventDefault();
                    setMenu({ position: { x: event.clientX, y: event.clientY }, entityId: null });
                }}
                onDragOver={(event) => onDragOver(event, null)}
                onDrop={onDrop}
                onClick={(event) => {
                    if (event.target === event.currentTarget) store.setSelection([]);
                }}
            >
                {rows.map(({ entity, depth, hasChildren }) => {
                    const selected = selection.includes(entity.id);
                    const { icon: Icon, className } = entityIcon(entity);
                    const isDrop = dropTarget?.id === entity.id;
                    const hasScript = entity.components.some((component) => component.type === "script");
                    return (
                        <div
                            key={entity.id}
                            role="treeitem"
                            aria-selected={selected}
                            aria-expanded={hasChildren ? !collapsed.has(entity.id) : undefined}
                            draggable={!playing && renaming !== entity.id}
                            onDragStart={(event) => onDragStart(event, entity.id)}
                            onDragOver={(event) => {
                                event.stopPropagation();
                                onDragOver(event, entity.id);
                            }}
                            onDragLeave={() => setDropTarget((current) => (current?.id === entity.id ? null : current))}
                            onDrop={(event) => {
                                event.stopPropagation();
                                onDrop(event);
                            }}
                            onDragEnd={() => {
                                dragId.current = null;
                                setDropTarget(null);
                            }}
                            onClick={(event) => select(entity.id, event)}
                            onDoubleClick={() => focusEntity(entity.id)}
                            onContextMenu={(event) => {
                                event.preventDefault();
                                if (!selection.includes(entity.id)) store.setSelection([entity.id]);
                                setMenu({ position: { x: event.clientX, y: event.clientY }, entityId: entity.id });
                            }}
                            className={cx(
                                "group relative flex h-7 cursor-default select-none items-center gap-1 rounded-md pr-1 text-[12.5px] transition",
                                selected ? "bg-indigo-500/25 text-white" : "text-zinc-300 hover:bg-white/[0.05]",
                                !entity.active && "opacity-50",
                                isDrop && dropTarget?.zone === "inside" && "ring-1 ring-inset ring-indigo-400",
                            )}
                            style={{ paddingLeft: 4 + depth * 14 }}
                        >
                            {isDrop && dropTarget?.zone === "before" ? <span className="absolute inset-x-1 top-0 h-0.5 rounded bg-indigo-400" /> : null}
                            {isDrop && dropTarget?.zone === "after" ? <span className="absolute inset-x-1 bottom-0 h-0.5 rounded bg-indigo-400" /> : null}
                            <button
                                type="button"
                                tabIndex={-1}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setCollapsed((current) => {
                                        const next = new Set(current);
                                        if (next.has(entity.id)) next.delete(entity.id);
                                        else next.add(entity.id);
                                        return next;
                                    });
                                }}
                                className={cx("grid h-4 w-4 shrink-0 place-items-center text-zinc-500 hover:text-zinc-200", !hasChildren && "invisible")}
                                aria-label={t("toggleExpand")}
                            >
                                {collapsed.has(entity.id) ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </button>
                            <Icon className={cx("h-3.5 w-3.5 shrink-0", className)} />
                            {renaming === entity.id ? (
                                <input
                                    autoFocus
                                    defaultValue={entity.name}
                                    onClick={(event) => event.stopPropagation()}
                                    onBlur={(event) => rename(entity.id, event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                                        if (event.key === "Escape") setRenaming(null);
                                        event.stopPropagation();
                                    }}
                                    className="h-5 min-w-0 flex-1 rounded border border-indigo-400/60 bg-zinc-950 px-1 text-[12px] text-white outline-none"
                                />
                            ) : (
                                <span className="min-w-0 flex-1 truncate">{entity.name}</span>
                            )}
                            {hasScript ? <FileCode className="h-3 w-3 shrink-0 text-emerald-400/70" aria-label="Script" /> : null}
                            <button
                                type="button"
                                tabIndex={-1}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    toggleActive(entity);
                                }}
                                className={cx("grid h-5 w-5 shrink-0 place-items-center rounded text-zinc-500 hover:text-zinc-100", entity.active && "opacity-0 group-hover:opacity-100")}
                                aria-label={entity.active ? t("hide") : t("show")}
                                title={t("active")}
                            >
                                {entity.active ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                            </button>
                        </div>
                    );
                })}
                {!rows.length ? (
                    <p className="px-3 py-6 text-center text-[12px] leading-relaxed text-zinc-500">{query ? "—" : t("emptyObject")}</p>
                ) : null}
            </div>
            <ContextMenu position={menu?.position ?? null} items={menu ? menuItems(menu.entityId) : []} onClose={() => setMenu(null)} />
        </div>
    );
}
