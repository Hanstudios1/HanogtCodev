"use client";

/**
 * GLB models of a project in the editor (V5): uploading (to the account's
 * library for cloud projects, to this device for local ones), the Models group
 * of the Project panel, and the model inspector. A Mesh Renderer shows a model
 * instead of its primitive when one is picked.
 */
import { Box, Plus, Trash2, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { AudioStoreError, saveLocalAudio, sha256Hex, uploadAudio } from "@/lib/game-engine/audio-store";
import { createMeshRenderer, createTransform } from "@/lib/game-engine/components";
import { GLB_ACCEPT, GLB_MAX_BYTES, inspectGlb } from "@/lib/game-engine/glb";
import { createEngineId } from "@/lib/game-engine/ids";
import { uniqueName as uniqueEntityName } from "@/lib/game-engine/scene";
import { ENGINE_LIMITS } from "@/lib/game-engine/schema";
import type { GameProjectDocument, ModelAsset, Vector3 } from "@/lib/game-engine/types";
import { formatBytes } from "./AudioAssets";
import { useEditor } from "./context";
import { activeScene, touch } from "./operations";
import { useEditorState } from "./store";
import { Button, IconButton, TextInput } from "./ui";

/** Drag data of a model tile (dropped on the Scene view). */
export const MODEL_DRAG_TYPE = "application/x-hanogt-model";

export function formatTriangles(count: number) {
    return count >= 1000 ? `${(count / 1000).toFixed(count >= 10_000 ? 0 : 1)}k` : String(count);
}

/** A name not used by another model of the project. */
function uniqueModelName(project: GameProjectDocument, wanted: string) {
    const base = wanted.replace(/\.glb$/i, "").replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 60) || "Model";
    const taken = new Set((project.models ?? []).map((item) => item.name.toLocaleLowerCase()));
    let name = base;
    for (let index = 2; taken.has(name.toLocaleLowerCase()); index += 1) name = `${base} ${index}`;
    return name;
}

/** Adds an object showing a model to the active scene and returns its id. */
export function addModelObject(draft: GameProjectDocument, model: ModelAsset, position: Vector3): string {
    const scene = activeScene(draft);
    const id = createEngineId("entity");
    scene.objects.push({
        id,
        name: uniqueEntityName(model.name, scene.objects.map((item) => item.name)),
        tag: "Untagged",
        parentId: null,
        active: true,
        components: [createTransform({ position }), createMeshRenderer({ modelId: model.id })],
    });
    touch(draft);
    return id;
}

/** Uploads chosen GLB files and adds them to the project. */
export function useModelUpload() {
    const { store, t, toast, projectSource } = useEditor();
    const [busy, setBusy] = useState(false);

    const upload = useCallback(async (files: FileList | File[] | null) => {
        if (!files || !files.length) return;
        setBusy(true);
        try {
            for (const file of Array.from(files).slice(0, 8)) {
                const project = store.getState().project;
                if ((project.models ?? []).length >= ENGINE_LIMITS.maxModels) {
                    toast(t("modelLimitProject").replace("{count}", String(ENGINE_LIMITS.maxModels)), "error");
                    break;
                }
                if (file.size > GLB_MAX_BYTES) {
                    toast(t("modelTooLarge").replace("{name}", file.name).replace("{size}", formatBytes(GLB_MAX_BYTES)), "error");
                    continue;
                }
                const bytes = await file.arrayBuffer();
                const check = inspectGlb(new Uint8Array(bytes));
                if (!check.ok) {
                    toast(`${file.name}: ${check.message}`, "error");
                    continue;
                }
                try {
                    let hash: string;
                    if (projectSource === "cloud") hash = (await uploadAudio(bytes, file.name)).hash;
                    else hash = await sha256Hex(bytes);
                    // Kept on this device too: shows at once and works offline.
                    await saveLocalAudio(hash, bytes);
                    const latest = store.getState().project;
                    const existing = (latest.models ?? []).find((item) => item.hash === hash);
                    if (existing) {
                        store.selectAsset({ kind: "model", id: existing.id });
                        toast(t("modelAlreadyInProject").replace("{name}", existing.name), "info");
                        continue;
                    }
                    const asset: ModelAsset = { id: createEngineId("model"), name: uniqueModelName(latest, file.name), hash, size: bytes.byteLength, triangles: check.info.triangles };
                    store.update(t("hUploadModel"), (draft) => {
                        draft.models = [...(draft.models ?? []), asset];
                        touch(draft);
                    });
                    store.selectAsset({ kind: "model", id: asset.id });
                    toast(t("modelUploaded").replace("{name}", asset.name), "success");
                } catch (error) {
                    const quota = error instanceof AudioStoreError && error.code === "audio_quota";
                    toast(quota ? t("audioQuotaFull") : error instanceof Error ? error.message : t("modelUploadFailed"), "error");
                    if (quota) break;
                }
            }
        } finally {
            setBusy(false);
        }
    }, [projectSource, store, t, toast]);

    return { upload, busy };
}

/** The Models group of the Project panel. */
export function ModelGroupItems({ matches, Tile }: {
    matches: (name: string) => boolean;
    Tile: (props: { selected: boolean; onClick: () => void; draggable?: boolean; onDragStart?: (event: React.DragEvent) => void; icon: React.ReactNode; title: string; subtitle?: string }) => React.ReactNode;
}) {
    const { store, t, playing } = useEditor();
    const models = useEditorState(store, (state) => state.project.models ?? []);
    const selected = useEditorState(store, (state) => state.selectedAsset);
    return (
        <>
            {models.filter((item) => matches(item.name)).map((item) => (
                <Tile
                    key={item.id}
                    selected={selected?.kind === "model" && selected.id === item.id}
                    onClick={() => store.selectAsset({ kind: "model", id: item.id })}
                    draggable={!playing}
                    onDragStart={(event) => {
                        event.dataTransfer.setData(MODEL_DRAG_TYPE, item.id);
                        event.dataTransfer.effectAllowed = "copy";
                    }}
                    icon={<Box className="h-4 w-4 text-indigo-300" />}
                    title={item.name}
                    subtitle={`${formatTriangles(item.triangles)} ${t("triangles")} · ${formatBytes(item.size)}`}
                />
            ))}
            {!models.length ? <p className="col-span-full px-2 py-1 text-[11.5px] text-zinc-500">{t("modelsHint")}</p> : null}
        </>
    );
}

/** Upload button of the Models group header. */
export function ModelGroupActions() {
    const { t, playing } = useEditor();
    const input = useRef<HTMLInputElement | null>(null);
    const { upload, busy } = useModelUpload();
    return (
        <>
            <input ref={input} type="file" accept={GLB_ACCEPT} multiple hidden data-model-input onChange={(event) => {
                void upload(event.target.files);
                event.target.value = "";
            }} />
            <IconButton icon={Upload} label={busy ? t("audioUploading") : t("uploadModel")} size="sm" disabled={playing || busy} onClick={() => input.current?.click()} />
        </>
    );
}

/** Inspector of a selected model. */
export function ModelInspector({ id }: { id: string }) {
    const { store, t, playing, projectSource } = useEditor();
    const project = useEditorState(store, (state) => state.project);
    const asset = (project.models ?? []).find((item) => item.id === id);
    if (!asset) return null;
    const users = project.scenes.flatMap((scene) => scene.objects).filter((entity) => entity.components.some((component) => component.type === "meshRenderer" && component.modelId === asset.id)).length;
    return (
        <div className="space-y-3 p-3" data-model-inspector>
            <div className="flex items-center gap-2">
                <Box className="h-5 w-5 text-indigo-300" />
                <TextInput value={asset.name} disabled={playing} maxLength={60} onChange={(value) => {
                    const clean = value.replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 60);
                    if (!clean) return;
                    store.update(t("hModelName"), (draft) => {
                        const target = (draft.models ?? []).find((item) => item.id === asset.id);
                        if (target) target.name = clean;
                        touch(draft);
                    });
                }} />
            </div>
            <dl className="grid grid-cols-2 gap-2 rounded-xl border border-white/[0.06] bg-zinc-950/60 p-2 text-[11.5px]">
                <div><dt className="text-zinc-500">{t("triangles")}</dt><dd className="font-mono text-zinc-200">{formatTriangles(asset.triangles)}</dd></div>
                <div><dt className="text-zinc-500">GLB</dt><dd className="font-mono text-zinc-200">{formatBytes(asset.size)}</dd></div>
                <div className="col-span-2"><dt className="text-zinc-500">{t("modelUsedBy")}</dt><dd className="text-zinc-200">{users}</dd></div>
            </dl>
            <p className="text-[11px] leading-snug text-zinc-500">{projectSource === "cloud" ? t("modelInLibrary") : t("modelOnDevice")} {t("modelStaticHint")}</p>
            <Button className="w-full" disabled={playing} onClick={() => {
                let created = "";
                store.update(t("hAddModelObject"), (draft) => { created = addModelObject(draft, asset, { x: 0, y: 0, z: 0 }); });
                if (created) store.setSelection([created]);
            }}><Plus className="h-4 w-4" />{t("modelAddToScene")}</Button>
            <Button variant="danger" className="w-full" disabled={playing} onClick={() => {
                if (!window.confirm(`"${asset.name}" ${t("modelRemoveConfirm")}`)) return;
                store.update(t("hRemoveModel"), (draft) => {
                    draft.models = (draft.models ?? []).filter((item) => item.id !== asset.id);
                    for (const entity of [...draft.scenes.flatMap((scene) => scene.objects), ...draft.prefabs.flatMap((prefab) => prefab.entities)]) {
                        for (const component of entity.components) if (component.type === "meshRenderer" && component.modelId === asset.id) component.modelId = null;
                    }
                    touch(draft);
                });
                store.selectAsset(null);
            }}><Trash2 className="h-4 w-4" />{t("modelRemoveFromProject")}</Button>
        </div>
    );
}
