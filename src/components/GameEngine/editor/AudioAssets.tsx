"use client";

/**
 * Audio files of a project in the editor (V4): uploading (to the account's
 * library for cloud projects, to this device for local ones), the Audio group
 * of the Project panel, the asset inspector with a preview, and the library
 * dialog with the plan's audio storage.
 */
import { Library, Music, Pause, Play, Plus, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    AUDIO_ACCEPT,
    AUDIO_MAX_BYTES,
    AudioStoreError,
    audioDuration,
    deleteAccountAudio,
    listAccountAudio,
    loadAudioBytes,
    saveLocalAudio,
    sha256Hex,
    sniffAudioType,
    uploadAudio,
    type AccountAudioFile,
    type AccountAudioUsage,
} from "@/lib/game-engine/audio-store";
import { createEngineId } from "@/lib/game-engine/ids";
import { ENGINE_LIMITS } from "@/lib/game-engine/schema";
import type { AudioAsset, GameProjectDocument } from "@/lib/game-engine/types";
import { useEditor } from "./context";
import { touch } from "./operations";
import { useEditorState } from "./store";
import { Button, IconButton, Modal, TextInput, cx } from "./ui";

export function formatBytes(bytes: number) {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatSeconds(seconds: number) {
    if (!seconds) return "";
    const whole = Math.round(seconds);
    return whole >= 60 ? `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}` : `${seconds.toFixed(1)} s`;
}

/** A name not used by another audio file of the project. */
function uniqueName(project: GameProjectDocument, wanted: string) {
    const base = wanted.replace(/\.[a-z0-9]{2,4}$/i, "").replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 60) || "Sound";
    const taken = new Set((project.audio ?? []).map((item) => item.name.toLocaleLowerCase()));
    let name = base;
    for (let index = 2; taken.has(name.toLocaleLowerCase()); index += 1) name = `${base} ${index}`;
    return name;
}

/** Uploads chosen files and adds them to the project. */
export function useAudioUpload() {
    const { store, t, toast, projectSource } = useEditor();
    const [busy, setBusy] = useState(false);
    const [usage, setUsage] = useState<AccountAudioUsage | null>(null);

    const upload = useCallback(async (files: FileList | File[] | null) => {
        if (!files || !files.length) return;
        setBusy(true);
        try {
            for (const file of Array.from(files).slice(0, 8)) {
                const project = store.getState().project;
                if ((project.audio ?? []).length >= ENGINE_LIMITS.maxAudio) {
                    toast(t("audioLimitProject").replace("{count}", String(ENGINE_LIMITS.maxAudio)), "error");
                    break;
                }
                if (file.size > AUDIO_MAX_BYTES) {
                    toast(t("audioTooLarge").replace("{name}", file.name).replace("{size}", formatBytes(AUDIO_MAX_BYTES)), "error");
                    continue;
                }
                const bytes = await file.arrayBuffer();
                const contentType = sniffAudioType(new Uint8Array(bytes));
                if (!contentType) {
                    toast(t("audioWrongType").replace("{name}", file.name), "error");
                    continue;
                }
                try {
                    let hash: string;
                    if (projectSource === "cloud") {
                        const uploaded = await uploadAudio(bytes, file.name);
                        hash = uploaded.hash;
                        setUsage(uploaded.usage);
                    } else {
                        hash = await sha256Hex(bytes);
                    }
                    // Kept on this device too: plays at once and works offline.
                    await saveLocalAudio(hash, bytes);
                    const duration = await audioDuration(bytes);
                    const latest = store.getState().project;
                    const existing = (latest.audio ?? []).find((item) => item.hash === hash);
                    if (existing) {
                        store.selectAsset({ kind: "audio", id: existing.id });
                        toast(t("audioAlreadyInProject").replace("{name}", existing.name), "info");
                        continue;
                    }
                    const asset: AudioAsset = { id: createEngineId("audio"), name: uniqueName(latest, file.name), hash, contentType, size: bytes.byteLength, duration };
                    store.update(t("hUploadAudio"), (draft) => {
                        draft.audio = [...(draft.audio ?? []), asset];
                        touch(draft);
                    });
                    store.selectAsset({ kind: "audio", id: asset.id });
                    toast(t("audioUploaded").replace("{name}", asset.name), "success");
                } catch (error) {
                    const message = error instanceof AudioStoreError && error.code === "audio_quota" ? t("audioQuotaFull") : error instanceof Error ? error.message : t("audioUploadFailed");
                    toast(message, "error");
                    if (error instanceof AudioStoreError && error.code === "audio_quota") break;
                }
            }
        } finally {
            setBusy(false);
        }
    }, [projectSource, store, t, toast]);

    return { upload, busy, usage };
}

/** Plays one file in the editor (outside the game). */
function usePreview() {
    const audio = useRef<HTMLAudioElement | null>(null);
    const url = useRef<string | null>(null);
    const [playing, setPlaying] = useState<string | null>(null);
    const stop = useCallback(() => {
        audio.current?.pause();
        audio.current = null;
        if (url.current) URL.revokeObjectURL(url.current);
        url.current = null;
        setPlaying(null);
    }, []);
    useEffect(() => stop, [stop]);
    const toggle = useCallback(async (asset: AudioAsset) => {
        if (playing === asset.id) {
            stop();
            return;
        }
        stop();
        const bytes = await loadAudioBytes(asset);
        if (!bytes) return;
        url.current = URL.createObjectURL(new Blob([bytes], { type: asset.contentType }));
        const element = new Audio(url.current);
        element.onended = stop;
        audio.current = element;
        setPlaying(asset.id);
        void element.play().catch(stop);
    }, [playing, stop]);
    return { playing, toggle, stop };
}

/** The Audio group of the Project panel. */
export function AudioGroupItems({ matches, Tile }: {
    matches: (name: string) => boolean;
    Tile: (props: { selected: boolean; onClick: () => void; icon: React.ReactNode; title: string; subtitle?: string }) => React.ReactNode;
}) {
    const { store, t } = useEditor();
    const project = useEditorState(store, (state) => state.project);
    const selected = useEditorState(store, (state) => state.selectedAsset);
    const audio = project.audio ?? [];
    return (
        <>
            {audio.filter((item) => matches(item.name)).map((item) => (
                <Tile
                    key={item.id}
                    selected={selected?.kind === "audio" && selected.id === item.id}
                    onClick={() => store.selectAsset({ kind: "audio", id: item.id })}
                    icon={<Music className="h-4 w-4 text-teal-300" />}
                    title={item.name}
                    subtitle={[formatSeconds(item.duration), formatBytes(item.size)].filter(Boolean).join(" · ")}
                />
            ))}
            {!audio.length ? <p className="col-span-full px-2 py-1 text-[11.5px] text-zinc-500">{t("audioHint")}</p> : null}
        </>
    );
}

/** Upload and library buttons of the Audio group header. */
export function AudioGroupActions() {
    const { t, playing, projectSource } = useEditor();
    const input = useRef<HTMLInputElement | null>(null);
    const { upload, busy } = useAudioUpload();
    const [library, setLibrary] = useState(false);
    return (
        <>
            <input ref={input} type="file" accept={AUDIO_ACCEPT} multiple hidden data-audio-input onChange={(event) => {
                void upload(event.target.files);
                event.target.value = "";
            }} />
            {projectSource === "cloud" ? <IconButton icon={Library} label={t("audioLibrary")} size="sm" disabled={playing} onClick={() => setLibrary(true)} /> : null}
            <IconButton icon={Upload} label={busy ? t("audioUploading") : t("uploadAudio")} size="sm" disabled={playing || busy} onClick={() => input.current?.click()} />
            {library ? <AudioLibraryDialog onClose={() => setLibrary(false)} /> : null}
        </>
    );
}

/** Inspector of a selected audio file. */
export function AudioInspector({ id }: { id: string }) {
    const { store, t, playing: gamePlaying, projectSource } = useEditor();
    const project = useEditorState(store, (state) => state.project);
    const asset = (project.audio ?? []).find((item) => item.id === id);
    const preview = usePreview();
    if (!asset) return null;
    const used = project.scenes.some((scene) => scene.objects.some((entity) => entity.components.some((component) => component.type === "audioSource" && component.audioId === asset.id)));
    return (
        <div className="space-y-3 p-3" data-audio-inspector>
            <div className="flex items-center gap-2">
                <Music className="h-5 w-5 text-teal-300" />
                <TextInput value={asset.name} disabled={gamePlaying} maxLength={60} onChange={(value) => {
                    const clean = value.replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 60);
                    if (!clean) return;
                    store.update(t("hAudioName"), (draft) => {
                        const target = (draft.audio ?? []).find((item) => item.id === asset.id);
                        if (target) target.name = clean;
                        touch(draft);
                    });
                }} />
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-zinc-950/60 p-2">
                <IconButton icon={preview.playing === asset.id ? Pause : Play} label={preview.playing === asset.id ? t("pause") : t("play")} onClick={() => void preview.toggle(asset)} />
                <div className="min-w-0 flex-1 text-[11.5px] text-zinc-400">
                    <p className="truncate font-mono text-zinc-200">{asset.contentType.replace("audio/", "").toUpperCase()} · {formatBytes(asset.size)}{asset.duration ? ` · ${formatSeconds(asset.duration)}` : ""}</p>
                    <p className="truncate">{projectSource === "cloud" ? t("audioInLibrary") : t("audioOnDevice")}</p>
                </div>
            </div>
            <div className="space-y-1 rounded-lg bg-white/[0.03] p-2 font-mono text-[11px] leading-relaxed text-zinc-400">
                <p className="font-sans text-[11px] text-zinc-500">{t("audioUsage")}</p>
                <p><span className="text-sky-300">Audio</span>.Play(<span className="text-amber-300">&quot;{asset.name}&quot;</span>);</p>
                <p><span className="text-sky-300">Audio</span>.PlayMusic(<span className="text-amber-300">&quot;{asset.name}&quot;</span>);</p>
            </div>
            <Button variant="danger" className="w-full" disabled={gamePlaying} onClick={() => {
                if (!window.confirm(`"${asset.name}" ${t("audioRemoveConfirm")}${used ? `\n\n${t("audioUsedWarning")}` : ""}`)) return;
                preview.stop();
                store.update(t("hRemoveAudio"), (draft) => {
                    draft.audio = (draft.audio ?? []).filter((item) => item.id !== asset.id);
                    for (const scene of draft.scenes) {
                        for (const entity of scene.objects) {
                            for (const component of entity.components) if (component.type === "audioSource" && component.audioId === asset.id) component.audioId = null;
                        }
                    }
                    touch(draft);
                });
                store.selectAsset(null);
            }}><Trash2 className="h-4 w-4" />{t("audioRemoveFromProject")}</Button>
        </div>
    );
}

/** The account's uploaded files: add them to this project, or delete them to free storage. */
function AudioLibraryDialog({ onClose }: { onClose: () => void }) {
    const { store, t, toast } = useEditor();
    const project = useEditorState(store, (state) => state.project);
    const [files, setFiles] = useState<AccountAudioFile[] | null>(null);
    const [usage, setUsage] = useState<AccountAudioUsage | null>(null);
    const [error, setError] = useState<string | null>(null);
    const preview = usePreview();

    useEffect(() => {
        let alive = true;
        listAccountAudio().then((result) => {
            if (!alive) return;
            // The library holds models too (V5); this list is the sounds.
            setFiles(result.files.filter((file) => file.contentType.startsWith("audio/")));
            setUsage(result.usage);
        }, (reason: unknown) => alive && setError(reason instanceof Error ? reason.message : t("audioUploadFailed")));
        return () => {
            alive = false;
        };
    }, [t]);

    const inProject = new Set((project.audio ?? []).map((item) => item.hash));
    const add = (file: AccountAudioFile) => {
        const contentType = file.contentType === "audio/wav" || file.contentType === "audio/ogg" ? file.contentType : "audio/mpeg";
        const asset: AudioAsset = { id: createEngineId("audio"), name: uniqueName(project, file.name), hash: file.hash, contentType, size: file.size, duration: 0 };
        store.update(t("hUploadAudio"), (draft) => {
            draft.audio = [...(draft.audio ?? []), asset];
            touch(draft);
        });
        toast(t("audioUploaded").replace("{name}", asset.name), "success");
    };
    const remove = async (file: AccountAudioFile) => {
        if (!window.confirm(`"${file.name}" ${t("audioDeleteAccountConfirm")}`)) return;
        try {
            const result = await deleteAccountAudio(file.hash);
            setUsage(result.usage);
            setFiles((current) => (current ?? []).filter((item) => item.hash !== file.hash));
        } catch (reason) {
            toast(reason instanceof Error ? reason.message : t("audioUploadFailed"), "error");
        }
    };
    const percent = usage ? Math.min(100, (usage.bytes / Math.max(1, usage.limit.bytes)) * 100) : 0;

    return (
        <Modal open onClose={onClose} title={t("audioLibrary")} icon={Library} width="max-w-lg" footer={<Button variant="primary" onClick={onClose}>{t("ok")}</Button>}>
            <div className="space-y-3" data-audio-library>
                {usage ? (
                    <div>
                        <div className="flex items-center justify-between text-[11.5px] text-zinc-400">
                            <span>{t("audioStorage")}</span>
                            <span className="font-mono text-zinc-300">{formatBytes(usage.bytes)} / {formatBytes(usage.limit.bytes)} · {usage.files}/{usage.limit.files}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
                            <div className={cx("h-full rounded-full", percent > 90 ? "bg-red-400" : "bg-teal-400")} style={{ width: `${percent}%` }} />
                        </div>
                        <p className="mt-1 text-[11px] text-zinc-500">{t("audioStorageHint")}</p>
                    </div>
                ) : null}
                {error ? <p role="alert" className="text-[12px] text-red-300">{error}</p> : null}
                {files === null && !error ? <p className="text-[12px] text-zinc-500">…</p> : null}
                {files && !files.length ? <p className="text-[12px] text-zinc-500">{t("audioLibraryEmpty")}</p> : null}
                <ul className="space-y-1">
                    {(files ?? []).map((file) => {
                        const asset: AudioAsset = { id: file.hash, name: file.name, hash: file.hash, contentType: "audio/mpeg", size: file.size, duration: 0 };
                        return (
                            <li key={file.hash} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-zinc-950/40 px-2 py-1.5">
                                <IconButton icon={preview.playing === file.hash ? Pause : Play} label={t("play")} size="sm" onClick={() => void preview.toggle(asset)} />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[12px] text-zinc-200">{file.name}</span>
                                    <span className="block text-[10.5px] text-zinc-500">{formatBytes(file.size)}</span>
                                </span>
                                <Button className="h-7 px-2 text-[11px]" disabled={inProject.has(file.hash)} onClick={() => add(file)}><Plus className="h-3.5 w-3.5" />{inProject.has(file.hash) ? t("audioInProject") : t("audioAddToProject")}</Button>
                                <IconButton icon={Trash2} label={t("audioDeleteFromAccount")} size="sm" tone="danger" onClick={() => void remove(file)} />
                            </li>
                        );
                    })}
                </ul>
            </div>
        </Modal>
    );
}
