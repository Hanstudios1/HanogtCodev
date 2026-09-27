"use client";

import {
    ChevronDown,
    ChevronRight,
    Clapperboard,
    FileCode,
    FilePlus,
    Flag,
    FolderOpen,
    Image as ImageIcon,
    Package,
    Plus,
    Search,
    Upload,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { ENGINE_LIMITS } from "@/lib/game-engine/schema";
import { useEditor } from "./context";
import { addScene, createScript, instantiatePrefab, textureFromFile, touch } from "./operations";
import { useEditorState } from "./store";
import { Dropdown, IconButton, PanelHeader, cx, inputClass } from "./ui";

function Group({ title, icon: Icon, count, children, action }: { title: string; icon: typeof FileCode; count: number; children: ReactNode; action?: ReactNode }) {
    const [open, setOpen] = useState(true);
    return (
        <div className="mb-1">
            <div className="flex h-7 items-center gap-1 px-1">
                <button type="button" onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 text-left text-[11px] font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-300">
                    {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    <Icon className="h-3.5 w-3.5" />
                    <span className="truncate">{title}</span>
                    <span className="font-medium text-zinc-600">{count}</span>
                </button>
                {action}
            </div>
            {open ? <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1 px-1 pb-2">{children}</div> : null}
        </div>
    );
}

function AssetTile({ selected, onClick, onDoubleClick, draggable, onDragStart, icon, title, subtitle, badge }: {
    selected: boolean;
    onClick: () => void;
    onDoubleClick?: () => void;
    draggable?: boolean;
    onDragStart?: (event: React.DragEvent) => void;
    icon: ReactNode;
    title: string;
    subtitle?: string;
    badge?: ReactNode;
}) {
    return (
        <button
            type="button"
            draggable={draggable}
            onDragStart={onDragStart}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            className={cx(
                "flex h-11 min-w-0 items-center gap-2 rounded-lg border px-2 text-left transition",
                selected ? "border-indigo-400/50 bg-indigo-500/15" : "border-transparent bg-white/[0.025] hover:border-white/10 hover:bg-white/[0.05]",
            )}
        >
            <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-md bg-black/30">{icon}</span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium text-zinc-200">{title}</span>
                {subtitle ? <span className="block truncate text-[10.5px] text-zinc-500">{subtitle}</span> : null}
            </span>
            {badge}
        </button>
    );
}

export default function ProjectPanel() {
    const { store, t, playing, openScript, program, createAt, toast } = useEditor();
    const project = useEditorState(store, (state) => state.project);
    const selectedAsset = useEditorState(store, (state) => state.selectedAsset);
    const [query, setQuery] = useState("");
    const fileInput = useRef<HTMLInputElement | null>(null);
    const needle = query.trim().toLocaleLowerCase();
    const matches = (name: string) => !needle || name.toLocaleLowerCase().includes(needle);
    const isSelected = (kind: string, id: string) => selectedAsset?.kind === kind && selectedAsset.id === id;

    const newScript = (language: "csharp" | "cpp") => {
        let id = "";
        store.update("Yeni script", (draft) => { id = createScript(draft, "NewBehaviour", language); });
        if (id) {
            store.selectAsset({ kind: "script", id });
            openScript(id);
        }
    };

    const upload = async (files: FileList | null) => {
        if (!files?.length) return;
        for (const file of Array.from(files).slice(0, 8)) {
            if (project.textures.length >= ENGINE_LIMITS.maxTextures) {
                toast(`En fazla ${ENGINE_LIMITS.maxTextures} doku eklenebilir.`, "error");
                break;
            }
            try {
                const texture = await textureFromFile(file);
                store.update("Doku yükle", (draft) => {
                    draft.textures.push(texture);
                    touch(draft);
                });
                store.selectAsset({ kind: "texture", id: texture.id });
                toast(`"${texture.name}" yüklendi (${texture.width}×${texture.height}).`, "success");
            } catch (error) {
                toast(error instanceof Error ? error.message : "Görsel yüklenemedi.", "error");
            }
        }
        if (fileInput.current) fileInput.current.value = "";
    };

    return (
        <div className="flex h-full min-h-0 flex-col">
            <PanelHeader
                actions={(
                    <>
                        <div className="relative mr-1 hidden sm:block">
                            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500" />
                            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search")} className={cx(inputClass, "h-6 w-40 pl-6 text-[11.5px]")} />
                        </div>
                        <IconButton icon={Upload} label={t("uploadTexture")} size="sm" disabled={playing} onClick={() => fileInput.current?.click()} />
                        <Dropdown
                            align="right"
                            items={[
                                { label: "C# Script", icon: FileCode, onSelect: () => newScript("csharp") },
                                { label: "C++ Script", icon: FileCode, onSelect: () => newScript("cpp") },
                                { separator: true, label: "" },
                                { label: t("newScene"), icon: Clapperboard, onSelect: () => store.update("Yeni sahne", (draft) => { addScene(draft, "New Scene"); }, { selection: [] }) },
                                { label: t("uploadTexture"), icon: ImageIcon, onSelect: () => fileInput.current?.click() },
                            ]}
                            trigger={({ toggle }) => <IconButton icon={Plus} label={t("create")} size="sm" onClick={toggle} disabled={playing} />}
                        />
                    </>
                )}
            >
                <FolderOpen className="h-3.5 w-3.5 text-zinc-500" />
                <span className="text-[12px] font-semibold text-zinc-300">Assets</span>
            </PanelHeader>
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(event) => void upload(event.target.files)} />
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-1.5">
                <Group title={t("scenes")} icon={Clapperboard} count={project.scenes.length}>
                    {project.scenes.filter((scene) => matches(scene.name)).map((scene, index) => (
                        <AssetTile
                            key={scene.id}
                            selected={isSelected("scene", scene.id)}
                            onClick={() => store.selectAsset({ kind: "scene", id: scene.id })}
                            onDoubleClick={() => !playing && store.update("Sahne aç", (draft) => { draft.activeSceneId = scene.id; }, { selection: [] })}
                            icon={<Clapperboard className={cx("h-4 w-4", project.activeSceneId === scene.id ? "text-amber-300" : "text-zinc-500")} />}
                            title={scene.name}
                            subtitle={`#${index} · ${scene.objects.length} ${t("objects")}`}
                            badge={project.settings.startSceneId === scene.id ? <Flag className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-label={t("startScene")} /> : null}
                        />
                    ))}
                </Group>
                <Group title={t("scripts")} icon={FileCode} count={project.scripts.length} action={<IconButton icon={FilePlus} label={t("newScript")} size="sm" disabled={playing} onClick={() => newScript("csharp")} />}>
                    {project.scripts.filter((script) => matches(script.name)).map((script) => {
                        const errors = program.diagnostics.filter((item) => item.scriptId === script.id && item.severity === "error").length;
                        return (
                            <AssetTile
                                key={script.id}
                                selected={isSelected("script", script.id)}
                                onClick={() => store.selectAsset({ kind: "script", id: script.id })}
                                onDoubleClick={() => openScript(script.id)}
                                icon={<span className={cx("text-[9px] font-black", script.language === "cpp" ? "text-sky-300" : "text-emerald-300")}>{script.language === "cpp" ? "C++" : "C#"}</span>}
                                title={script.name}
                                subtitle={(program.behavioursByScript.get(script.id) ?? []).join(", ") || "—"}
                                badge={errors ? <span className="shrink-0 rounded-full bg-red-500/80 px-1.5 text-[10px] font-bold text-white">{errors}</span> : null}
                            />
                        );
                    })}
                    {!project.scripts.length ? <p className="col-span-full px-2 py-1 text-[11.5px] text-zinc-500">Henüz script yok — C# veya C++ ile başlayın.</p> : null}
                </Group>
                <Group title={t("prefabs")} icon={Package} count={project.prefabs.length}>
                    {project.prefabs.filter((prefab) => matches(prefab.name)).map((prefab) => (
                        <AssetTile
                            key={prefab.id}
                            selected={isSelected("prefab", prefab.id)}
                            onClick={() => store.selectAsset({ kind: "prefab", id: prefab.id })}
                            onDoubleClick={() => {
                                if (playing) return;
                                let id: string | null = null;
                                store.update("Prefab ekle", (draft) => { id = instantiatePrefab(draft, prefab.id, createAt()); });
                                if (id) store.setSelection([id]);
                            }}
                            draggable={!playing}
                            onDragStart={(event) => {
                                event.dataTransfer.setData("application/x-hanogt-prefab", prefab.id);
                                event.dataTransfer.effectAllowed = "copy";
                            }}
                            icon={<Package className="h-4 w-4 text-sky-300" />}
                            title={prefab.name}
                            subtitle={`${prefab.entities.length} ${t("objects")}`}
                        />
                    ))}
                    {!project.prefabs.length ? <p className="col-span-full px-2 py-1 text-[11.5px] text-zinc-500">Hiyerarşide bir nesneye sağ tıklayıp “{t("makePrefab")}” seçin.</p> : null}
                </Group>
                <Group title={t("textures")} icon={ImageIcon} count={project.textures.length} action={<IconButton icon={Upload} label={t("uploadTexture")} size="sm" disabled={playing} onClick={() => fileInput.current?.click()} />}>
                    {project.textures.filter((texture) => matches(texture.name)).map((texture) => (
                        <AssetTile
                            key={texture.id}
                            selected={isSelected("texture", texture.id)}
                            onClick={() => store.selectAsset({ kind: "texture", id: texture.id })}
                            draggable={!playing}
                            onDragStart={(event) => {
                                event.dataTransfer.setData("application/x-hanogt-texture", texture.id);
                                event.dataTransfer.effectAllowed = "copy";
                            }}
                            // eslint-disable-next-line @next/next/no-img-element
                            icon={<img src={texture.dataUrl} alt="" className="h-full w-full object-cover" style={{ imageRendering: texture.filter === "nearest" ? "pixelated" : "auto" }} />}
                            title={texture.name}
                            subtitle={`${texture.width}×${texture.height}`}
                        />
                    ))}
                    {!project.textures.length ? <p className="col-span-full px-2 py-1 text-[11.5px] text-zinc-500">PNG/JPG/WEBP yükleyip sprite veya materyallerde kullanın. Sahneye sürükleyebilirsiniz.</p> : null}
                </Group>
            </div>
        </div>
    );
}
