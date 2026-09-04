"use client";

import { useMemo, useState } from "react";
import {
    Box,
    Camera,
    ChevronDown,
    ChevronRight,
    Circle,
    Copy,
    Eye,
    EyeOff,
    Layers3,
    Lightbulb,
    MoreHorizontal,
    Plus,
    Search,
    Square,
    Trash2,
} from "lucide-react";
import type { GameEntity } from "@/lib/game-engine/types";
import { type GameObjectKind } from "./model";

type Props = {
    entities: GameEntity[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    onCreate: (kind: GameObjectKind) => void;
    onToggleActive: (id: string) => void;
    onDuplicate: (id: string) => void;
    onDelete: (id: string) => void;
    className?: string;
};

const CREATE_ITEMS: Array<{ kind: GameObjectKind; label: string; icon: typeof Box }> = [
    { kind: "empty", label: "Boş nesne", icon: Layers3 },
    { kind: "sprite", label: "2D Sprite", icon: Square },
    { kind: "cube", label: "3D Küp", icon: Box },
    { kind: "sphere", label: "3D Küre", icon: Circle },
    { kind: "plane", label: "3D Düzlem", icon: Layers3 },
    { kind: "camera", label: "Kamera", icon: Camera },
    { kind: "light", label: "Işık", icon: Lightbulb },
];

function entityIcon(entity: GameEntity) {
    if (entity.components.some((component) => component.type === "camera")) return Camera;
    if (entity.components.some((component) => component.type === "light")) return Lightbulb;
    const mesh = entity.components.find((component) => component.type === "meshRenderer");
    if (mesh?.type === "meshRenderer" && mesh.mesh.kind === "primitive" && mesh.mesh.primitive === "sphere") return Circle;
    if (entity.components.some((component) => component.type === "spriteRenderer")) return Square;
    return Box;
}

export default function HierarchyPanel({
    entities,
    selectedId,
    onSelect,
    onCreate,
    onToggleActive,
    onDuplicate,
    onDelete,
    className = "",
}: Props) {
    const [query, setQuery] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [menuId, setMenuId] = useState<string | null>(null);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    const childrenByParent = useMemo(() => {
        const result = new Map<string | null, GameEntity[]>();
        entities.forEach((entity) => {
            const parentId = entity.parentId;
            const list = result.get(parentId) ?? [];
            list.push(entity);
            result.set(parentId, list);
        });
        return result;
    }, [entities]);

    const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");

    const renderEntity = (entity: GameEntity, depth = 0): React.ReactNode => {
        if (normalizedQuery && !entity.name.toLocaleLowerCase("tr-TR").includes(normalizedQuery)) return null;
        const Icon = entityIcon(entity);
        const children = childrenByParent.get(entity.id) ?? [];
        const isCollapsed = collapsed.has(entity.id);
        return (
            <div key={entity.id}>
                <div
                    role="treeitem"
                    aria-selected={selectedId === entity.id}
                    tabIndex={selectedId === entity.id ? 0 : -1}
                    onClick={() => onSelect(entity.id)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") onSelect(entity.id);
                        if (event.key === "Delete") onDelete(entity.id);
                    }}
                    className={`group relative flex h-9 cursor-default items-center gap-1 rounded-lg px-1.5 text-[13px] transition-colors ${
                        selectedId === entity.id
                            ? "bg-blue-600 text-white shadow-sm shadow-blue-950/20"
                            : "text-zinc-700 hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    }`}
                    style={{ paddingLeft: `${Math.min(depth, 5) * 14 + 6}px` }}
                >
                    {children.length > 0 ? (
                        <button
                            type="button"
                            aria-label={isCollapsed ? "Alt nesneleri aç" : "Alt nesneleri kapat"}
                            onClick={(event) => {
                                event.stopPropagation();
                                setCollapsed((current) => {
                                    const next = new Set(current);
                                    if (next.has(entity.id)) next.delete(entity.id); else next.add(entity.id);
                                    return next;
                                });
                            }}
                            className="rounded p-0.5 hover:bg-black/10"
                        >
                            {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                    ) : <span className="w-[18px]" />}
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${selectedId === entity.id ? "text-white" : "text-blue-500"}`} />
                    <span className={`min-w-0 flex-1 truncate ${entity.active ? "" : "opacity-45"}`}>{entity.name}</span>
                    <button
                        type="button"
                        aria-label={entity.active ? `${entity.name} nesnesini gizle` : `${entity.name} nesnesini göster`}
                        onClick={(event) => { event.stopPropagation(); onToggleActive(entity.id); }}
                        className="rounded p-1 opacity-0 transition hover:bg-black/10 group-hover:opacity-100 focus:opacity-100"
                    >
                        {entity.active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                    <button
                        type="button"
                        aria-label={`${entity.name} işlemleri`}
                        onClick={(event) => { event.stopPropagation(); setMenuId(menuId === entity.id ? null : entity.id); }}
                        className="rounded p-1 opacity-0 transition hover:bg-black/10 group-hover:opacity-100 focus:opacity-100"
                    >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                    {menuId === entity.id && (
                        <div className="absolute right-1 top-8 z-30 w-40 rounded-xl border border-zinc-200 bg-white p-1.5 text-zinc-700 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                            <button type="button" onClick={(event) => { event.stopPropagation(); onDuplicate(entity.id); setMenuId(null); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"><Copy className="h-3.5 w-3.5" />Çoğalt</button>
                            <button type="button" onClick={(event) => { event.stopPropagation(); onDelete(entity.id); setMenuId(null); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 className="h-3.5 w-3.5" />Sil</button>
                        </div>
                    )}
                </div>
                {!isCollapsed && children.map((child) => renderEntity(child, depth + 1))}
            </div>
        );
    };

    const roots = childrenByParent.get(null) ?? entities.filter((entity) => {
        const parentId = entity.parentId;
        return !parentId || !entities.some((candidate) => candidate.id === parentId);
    });

    return (
        <aside className={`flex min-h-0 flex-col border-r border-zinc-200 bg-zinc-50/95 dark:border-zinc-800 dark:bg-zinc-950/95 ${className}`} aria-label="Sahne hiyerarşisi">
            <div className="flex h-11 items-center justify-between border-b border-zinc-200 px-3 dark:border-zinc-800">
                <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Hierarchy</h2>
                <div className="relative">
                    <button type="button" aria-expanded={createOpen} onClick={() => setCreateOpen((value) => !value)} className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-200 hover:text-blue-600 dark:hover:bg-zinc-800" title="Nesne ekle">
                        <Plus className="h-4 w-4" />
                    </button>
                    {createOpen && (
                        <div className="absolute right-0 top-9 z-40 w-48 rounded-2xl border border-zinc-200 bg-white p-2 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
                            <p className="px-2 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Nesne oluştur</p>
                            {CREATE_ITEMS.map(({ kind, label, icon: ItemIcon }) => (
                                <button key={kind} type="button" onClick={() => { onCreate(kind); setCreateOpen(false); }} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800">
                                    <ItemIcon className="h-4 w-4 text-blue-500" />{label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <div className="p-2">
                <label className="flex h-8 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 text-zinc-400 focus-within:border-blue-500 dark:border-zinc-800 dark:bg-zinc-900">
                    <Search className="h-3.5 w-3.5" />
                    <span className="sr-only">Nesnelerde ara</span>
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nesne ara" className="min-w-0 flex-1 bg-transparent text-xs text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-100" />
                </label>
            </div>
            <div role="tree" aria-label="Sahne nesneleri" className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
                {roots.map((entity) => renderEntity(entity))}
                {entities.length === 0 && <div className="m-2 rounded-xl border border-dashed border-zinc-300 p-5 text-center text-xs leading-5 text-zinc-500 dark:border-zinc-700">Sahne boş. <strong>+</strong> ile ilk nesnenizi ekleyin.</div>}
            </div>
            <div className="border-t border-zinc-200 px-3 py-2 text-[10px] text-zinc-400 dark:border-zinc-800">{entities.length} nesne · Del ile sil</div>
        </aside>
    );
}
