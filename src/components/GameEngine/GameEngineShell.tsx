"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    ArrowLeft,
    Check,
    ChevronDown,
    Cloud,
    CloudOff,
    Gamepad2,
    LoaderCircle,
    Menu,
    MonitorPlay,
    PanelRight,
    Pause,
    Play,
    Redo2,
    Save,
    Square,
    StepForward,
    Undo2,
    X,
} from "lucide-react";
import {
    cloneProject,
    createCollider,
    createEngineId,
    createRigidBody,
    createScriptComponent,
    EngineLoop,
    GameEngineRuntime,
    nowIso,
    type EngineMode,
    type GameComponent,
    type GameDimension,
    type GameEntity,
    type GameProjectDocument,
    type SceneDocument,
    type ScriptLanguage,
    type Vector3,
} from "@/lib/game-engine";
import AssetsConsolePanel, { type EngineLog } from "./AssetsConsolePanel";
import EngineViewport from "./EngineViewport";
import HierarchyPanel from "./HierarchyPanel";
import InspectorPanel from "./InspectorPanel";
import ScriptDialog from "./ScriptDialog";
import { createEntity, createStarterProject, getActiveScene, getTransform, projectFromApi, projectToApi, type GameObjectKind } from "./model";

type SaveState = "saved" | "saving" | "local" | "error";
type ScriptComponent = Extract<GameComponent, { type: "script" }>;
type ApiScript = {
    id?: string;
    name?: string;
    language?: ScriptLanguage;
    content?: string;
    enabled?: boolean;
};

const formatTime = () => new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date());

export default function GameEngineShell() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const requestedId = searchParams.get("id");
    const initialDimension: GameDimension = searchParams.get("dimension") === "2d" ? "2d" : "3d";
    const initialName = searchParams.get("name")?.slice(0, 80) || (initialDimension === "2d" ? "Yeni 2D Oyun" : "Yeni 3D Oyun");
    const localId = useRef(requestedId || createEngineId("local-game"));
    const [project, setProject] = useState<GameProjectDocument>(() => createStarterProject(localId.current, initialName, initialDimension));
    const projectRef = useRef(project);
    const revisionRef = useRef<string | null>(null);
    const [projectScripts, setProjectScripts] = useState<ScriptComponent[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [mode, setMode] = useState<EngineMode>("edit");
    const [elapsed, setElapsed] = useState(0);
    const [previewScene, setPreviewScene] = useState<SceneDocument | null>(null);
    const [loading, setLoading] = useState(Boolean(requestedId));
    const [saveState, setSaveState] = useState<SaveState>(requestedId ? "saving" : "local");
    const [leftOpen, setLeftOpen] = useState(false);
    const [rightOpen, setRightOpen] = useState(false);
    const [bottomCollapsed, setBottomCollapsed] = useState(false);
    const [scriptDialog, setScriptDialog] = useState(false);
    const [scriptBusy, setScriptBusy] = useState(false);
    const [scriptError, setScriptError] = useState("");
    const [logs, setLogs] = useState<EngineLog[]>([
        { id: createEngineId("log"), level: "info", message: "Hanogt Engine sahne düzenleyicisi hazır.", time: formatTime() },
        { id: createEngineId("log"), level: "info", message: "C# ve C++ dosyaları yalnızca yapılandırılmış harici araç zincirinde derlenir.", time: formatTime() },
    ]);
    const [toast, setToast] = useState<string | null>(null);
    const undoStack = useRef<GameProjectDocument[]>([]);
    const redoStack = useRef<GameProjectDocument[]>([]);
    const [historyVersion, setHistoryVersion] = useState(0);
    const playSnapshot = useRef<GameProjectDocument | null>(null);
    const runtimeRef = useRef<GameEngineRuntime | null>(null);
    const loopRef = useRef<EngineLoop | null>(null);
    const unsubscribeFrameRef = useRef<(() => void) | null>(null);
    const hydrated = useRef(false);
    const savingRef = useRef(false);
    const saveQueuedRef = useRef(false);
    const feedbackQueuedRef = useRef(false);
    const persistRef = useRef<(showFeedback?: boolean) => Promise<void>>(async () => undefined);

    const scene = getActiveScene(project);
    const selectedEntity = scene.objects.find((entity) => entity.id === selectedId) ?? null;
    const storageKey = `hanogt_game_engine_${localId.current}`;

    useEffect(() => { projectRef.current = project; }, [project]);

    const addLog = useCallback((message: string, level: EngineLog["level"] = "info") => {
        setLogs((current) => [...current.slice(-99), { id: createEngineId("log"), level, message, time: formatTime() }]);
    }, []);

    const notify = useCallback((message: string) => {
        setToast(message);
        window.setTimeout(() => setToast((current) => current === message ? null : current), 2600);
    }, []);

    const replaceProject = useCallback((next: GameProjectDocument, recordHistory = true) => {
        const current = projectRef.current;
        if (recordHistory) {
            undoStack.current = [...undoStack.current.slice(-39), cloneProject(current)];
            redoStack.current = [];
            setHistoryVersion((value) => value + 1);
        }
        next.metadata.updatedAt = nowIso();
        const active = getActiveScene(next);
        active.metadata.updatedAt = nowIso();
        projectRef.current = next;
        setProject(next);
    }, []);

    const updateProject = useCallback((updater: (draft: GameProjectDocument) => void, recordHistory = true) => {
        const next = cloneProject(projectRef.current);
        updater(next);
        replaceProject(next, recordHistory);
    }, [replaceProject]);

    const undo = useCallback(() => {
        const previous = undoStack.current.pop();
        if (!previous || mode !== "edit") return;
        redoStack.current.push(cloneProject(projectRef.current));
        projectRef.current = previous;
        setProject(previous);
        setHistoryVersion((value) => value + 1);
        addLog("Son sahne değişikliği geri alındı.");
    }, [addLog, mode]);

    const redo = useCallback(() => {
        const next = redoStack.current.pop();
        if (!next || mode !== "edit") return;
        undoStack.current.push(cloneProject(projectRef.current));
        projectRef.current = next;
        setProject(next);
        setHistoryVersion((value) => value + 1);
        addLog("Sahne değişikliği yeniden uygulandı.");
    }, [addLog, mode]);

    useEffect(() => {
        let cancelled = false;
        const hydrate = async () => {
            const cached = window.localStorage.getItem(storageKey);
            if (cached) {
                try {
                    const parsed = projectFromApi(JSON.parse(cached), localId.current);
                    if (!cancelled) {
                        projectRef.current = parsed;
                        setProject(parsed);
                        setSelectedId(getActiveScene(parsed).objects[0]?.id ?? null);
                        setSaveState(requestedId ? "saving" : "local");
                    }
                } catch {
                    window.localStorage.removeItem(storageKey);
                }
            }

            if (requestedId) {
                try {
                    const response = await fetch(`/api/game-projects/${encodeURIComponent(requestedId)}`, { cache: "no-store" });
                    if (!response.ok) throw new Error(response.status === 404 ? "Oyun projesi bulunamadı." : "Proje sunucudan açılamadı.");
                    const payload = await response.json() as { project?: ({ revision?: string | null } & Record<string, unknown>); scripts?: ApiScript[] };
                    const loaded = projectFromApi(payload, requestedId);
                    if (!cancelled) {
                        projectRef.current = loaded;
                        setProject(loaded);
                        revisionRef.current = typeof payload.project?.revision === "string" ? payload.project.revision : null;
                        setProjectScripts((payload.scripts || []).flatMap((item) => {
                            if (!item.id || (item.language !== "csharp" && item.language !== "cpp")) return [];
                            const component = createScriptComponent(item.language, item.name || (item.language === "cpp" ? "GameScript.cpp" : "GameScript.cs"));
                            return [{
                                ...component,
                                id: item.id,
                                fileName: item.name || component.fileName,
                                source: item.content ?? component.source,
                                enabled: item.enabled !== false,
                            }];
                        }));
                        setSelectedId(getActiveScene(loaded).objects[0]?.id ?? null);
                        setSaveState("saved");
                        addLog(`“${loaded.name}” projesi güvenli çalışma alanına yüklendi.`);
                    }
                } catch (error) {
                    if (!cancelled) {
                        setSaveState("local");
                        addLog(error instanceof Error ? `${error.message} Yerel kopya kullanılıyor.` : "Yerel kopya kullanılıyor.", "warning");
                    }
                }
            }
            if (!cancelled) {
                setLoading(false);
                window.setTimeout(() => { hydrated.current = true; }, 0);
            }
        };
        void hydrate();
        return () => { cancelled = true; };
    }, [addLog, requestedId, storageKey]);

    const persist = useCallback(async (showFeedback = false) => {
        const current = projectRef.current;
        const serialized = JSON.stringify(current);
        if (new Blob([serialized]).size > 512 * 1024) {
            setSaveState("error");
            addLog("Sahne 512 KB güvenli kayıt sınırını aşıyor.", "error");
            return;
        }
        window.localStorage.setItem(storageKey, serialized);
        if (!requestedId) {
            setSaveState("local");
            if (showFeedback) notify("Yerel taslak kaydedildi");
            return;
        }
        if (savingRef.current) {
            saveQueuedRef.current = true;
            feedbackQueuedRef.current ||= showFeedback;
            return;
        }
        savingRef.current = true;
        setSaveState("saving");
        try {
            const body = { ...projectToApi(current), scenes: current.scenes, activeSceneId: current.activeSceneId, revision: revisionRef.current };
            const response = await fetch(`/api/game-projects/${encodeURIComponent(requestedId)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const payload = await response.json().catch(() => ({})) as { project?: { revision?: string | null }; error?: string };
            if (!response.ok) throw new Error(payload.error || "Otomatik kayıt başarısız oldu.");
            revisionRef.current = typeof payload.project?.revision === "string" ? payload.project.revision : null;
            setSaveState("saved");
            if (showFeedback) notify("Proje buluta kaydedildi");
        } catch (error) {
            setSaveState("error");
            addLog(error instanceof Error ? error.message : "Otomatik kayıt başarısız oldu.", "error");
        } finally {
            savingRef.current = false;
            if (saveQueuedRef.current) {
                const queuedFeedback = feedbackQueuedRef.current;
                saveQueuedRef.current = false;
                feedbackQueuedRef.current = false;
                window.setTimeout(() => { void persistRef.current(queuedFeedback); }, 0);
            }
        }
    }, [addLog, notify, requestedId, storageKey]);
    persistRef.current = persist;

    useEffect(() => {
        if (!hydrated.current || mode !== "edit") return;
        setSaveState(requestedId ? "saving" : "local");
        const timer = window.setTimeout(() => { void persist(false); }, 900);
        return () => window.clearTimeout(timer);
    }, [mode, persist, project, requestedId]);

    useEffect(() => () => {
        loopRef.current?.stop();
        unsubscribeFrameRef.current?.();
    }, []);

    const startPlay = () => {
        if (mode === "paused" && runtimeRef.current) {
            runtimeRef.current.resume();
            loopRef.current?.start();
            setMode("playing");
            addLog("Oyun önizlemesi sürdürüldü.");
            return;
        }
        if (mode === "edit") {
            try {
                playSnapshot.current = cloneProject(projectRef.current);
                const runtime = new GameEngineRuntime(getActiveScene(projectRef.current));
                const loop = new EngineLoop(runtime);
                unsubscribeFrameRef.current?.();
                unsubscribeFrameRef.current = runtime.subscribeFrame((frame) => {
                    setPreviewScene(frame.scene);
                    setElapsed(frame.elapsedTime);
                });
                runtimeRef.current = runtime;
                loopRef.current = loop;
                runtime.play();
                loop.start();
                setElapsed(0);
                addLog("Fizik önizlemesi başlatıldı. Oynatma değişiklikleri Stop ile atılır.");
            } catch (error) {
                addLog(error instanceof Error ? error.message : "Oyun önizlemesi başlatılamadı.", "error");
                return;
            }
        }
        setMode("playing");
    };
    const pausePlay = () => {
        runtimeRef.current?.pause();
        loopRef.current?.stop();
        setMode("paused");
        addLog("Oyun önizlemesi duraklatıldı.");
    };
    const stepPlay = () => {
        if (mode !== "paused" || !runtimeRef.current) return;
        const frame = runtimeRef.current.step();
        if (frame) {
            setPreviewScene(frame.scene);
            setElapsed(frame.elapsedTime);
        }
    };
    const stopPlay = () => {
        loopRef.current?.stop();
        runtimeRef.current?.stop();
        unsubscribeFrameRef.current?.();
        unsubscribeFrameRef.current = null;
        runtimeRef.current = null;
        loopRef.current = null;
        setPreviewScene(null);
        if (playSnapshot.current) {
            projectRef.current = playSnapshot.current;
            setProject(playSnapshot.current);
        }
        playSnapshot.current = null;
        setMode("edit");
        setElapsed(0);
        addLog("Oyun önizlemesi durduruldu; sahne düzenleme durumuna döndü.");
    };

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const editingText = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void persist(true); }
            if (!editingText && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) { event.preventDefault(); undo(); }
            if (!editingText && ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y" || ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "z"))) { event.preventDefault(); redo(); }
            if (!editingText && event.key === "Delete" && selectedId && mode === "edit") {
                updateProject((draft) => { const active = getActiveScene(draft); active.objects = active.objects.filter((entity) => entity.id !== selectedId && entity.parentId !== selectedId); });
                setSelectedId(null);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [mode, persist, redo, selectedId, undo, updateProject]);

    const createObject = (kind: GameObjectKind) => {
        if (mode !== "edit") return;
        const next = createEntity(kind, project.dimension, scene.objects.length, null);
        updateProject((draft) => getActiveScene(draft).objects.push(next));
        setSelectedId(next.id);
        addLog(`${next.name} sahneye eklendi.`);
    };

    const updateEntity = (updater: (entity: GameEntity) => GameEntity) => {
        if (!selectedId || mode !== "edit") return;
        updateProject((draft) => {
            const active = getActiveScene(draft);
            active.objects = active.objects.map((entity) => entity.id === selectedId ? updater(entity) : entity);
        });
    };

    const toggleEntity = (id: string) => updateProject((draft) => {
        const entity = getActiveScene(draft).objects.find((item) => item.id === id);
        if (entity) entity.active = !entity.active;
    });

    const duplicateEntity = (id: string) => {
        const source = scene.objects.find((item) => item.id === id);
        if (!source) return;
        const copy = structuredClone(source);
        copy.id = createEngineId("entity");
        copy.name = `${source.name} Copy`;
        copy.components = copy.components.map((component) => ({ ...component, id: createEngineId(component.type === "script" ? "script" : "component") }));
        const transform = getTransform(copy);
        if (transform) transform.position = { ...transform.position, x: transform.position.x + 0.6 };
        updateProject((draft) => getActiveScene(draft).objects.push(copy));
        setSelectedId(copy.id);
        addLog(`${source.name} çoğaltıldı.`);
    };

    const deleteEntity = (id: string) => {
        const name = scene.objects.find((item) => item.id === id)?.name ?? "Nesne";
        updateProject((draft) => {
            const active = getActiveScene(draft);
            active.objects = active.objects.filter((entity) => entity.id !== id);
            active.objects.forEach((entity) => { if (entity.parentId === id) entity.parentId = null; });
        });
        if (selectedId === id) setSelectedId(null);
        addLog(`${name} sahneden silindi.`, "warning");
    };

    const addComponent = (type: "rigidBody" | "collider") => {
        if (!selectedEntity) return;
        if (selectedEntity.components.some((component) => component.type === type)) { notify("Bu bileşen zaten nesneye bağlı"); return; }
        updateEntity((entity) => ({ ...entity, components: [...entity.components, type === "rigidBody" ? createRigidBody() : createCollider()] }));
        addLog(`${type === "rigidBody" ? "Rigid Body" : "Collider"} bileşeni ${selectedEntity.name} nesnesine eklendi.`);
    };

    const moveEntity = (id: string, position: Vector3) => {
        if (mode !== "edit") return;
        updateProject((draft) => {
            const entity = getActiveScene(draft).objects.find((item) => item.id === id);
            const transform = entity && getTransform(entity);
            if (transform) transform.position = position;
        }, false);
    };

    const beginTransformEntity = () => {
        if (mode !== "edit") return;
        undoStack.current = [...undoStack.current.slice(-39), cloneProject(projectRef.current)];
        redoStack.current = [];
        setHistoryVersion((value) => value + 1);
    };

    const rotateEntity = (id: string, rotation: Vector3) => {
        if (mode !== "edit") return;
        updateProject((draft) => {
            const entity = getActiveScene(draft).objects.find((item) => item.id === id);
            const transform = entity && getTransform(entity);
            if (transform) transform.rotation = rotation;
        }, false);
    };

    const scaleEntity = (id: string, scale: Vector3) => {
        if (mode !== "edit") return;
        updateProject((draft) => {
            const entity = getActiveScene(draft).objects.find((item) => item.id === id);
            const transform = entity && getTransform(entity);
            if (transform) transform.scale = scale;
        }, false);
    };

    const changeDimension = (dimension: GameDimension) => {
        if (dimension === project.dimension || mode !== "edit") return;
        updateProject((draft) => {
            draft.dimension = dimension;
            const active = getActiveScene(draft);
            active.dimension = dimension;
            active.settings.backgroundColor = dimension === "2d" ? "#111827" : "#0f172a";
            active.objects.forEach((entity) => {
                const transform = getTransform(entity);
                if (transform && dimension === "2d") transform.position.z = 0;
                const camera = entity.components.find((component) => component.type === "camera");
                if (camera?.type === "camera") camera.projection = dimension === "2d" ? "orthographic" : "perspective";
            });
        });
        addLog(`Sahne ${dimension.toUpperCase()} düzenleme moduna geçirildi.`, "warning");
    };

    const routeToEditor = (script: ScriptComponent) => {
        const returnTo = `/game-engine?id=${encodeURIComponent(project.id)}`;
        const params = new URLSearchParams({
            lang: script.language,
            gameProject: project.id,
            gameScript: script.id,
            returnTo,
        });
        router.push(`/editor?${params.toString()}`);
    };

    const createScript = async ({ name, language, attachToSelected }: { name: string; language: ScriptLanguage; attachToSelected: boolean }) => {
        setScriptBusy(true);
        setScriptError("");
        if (!requestedId) {
            setScriptError("Script oluşturmak için önce Gösterge Paneli üzerinden bir oyun projesi oluşturun.");
            setScriptBusy(false);
            return;
        }
        const localScript = createScriptComponent(language, name);
        let script = localScript;
        if (requestedId) {
            try {
                const response = await fetch(`/api/game-projects/${encodeURIComponent(requestedId)}/scripts`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, language, content: localScript.source, attachedObjectIds: attachToSelected && selectedId ? [selectedId] : [] }),
                });
                const payload = await response.json().catch(() => ({})) as { script?: { id?: string; name?: string; language?: ScriptLanguage; content?: string }; error?: string };
                if (!response.ok) throw new Error(payload.error || "Script oluşturulamadı.");
                if (payload.script) script = { ...localScript, id: payload.script.id || localScript.id, fileName: payload.script.name || localScript.fileName, language: payload.script.language || language, source: payload.script.content ?? localScript.source };
            } catch (error) {
                setScriptError(error instanceof Error ? error.message : "Script oluşturulamadı.");
                setScriptBusy(false);
                return;
            }
        }
        setProjectScripts((current) => [...current.filter((item) => item.id !== script.id), script]);
        if (attachToSelected && selectedId) updateEntity((entity) => ({ ...entity, components: [...entity.components, script] }));
        addLog(`${script.fileName} oluşturuldu; kod editörü açılıyor.`);
        setScriptBusy(false);
        setScriptDialog(false);
        routeToEditor(script);
    };

    const frameSelected = () => selectedEntity ? notify(`${selectedEntity.name} seçili`) : undefined;
    const visibleScene = previewScene ?? scene;
    const saveLabel = saveState === "saving" ? "Kaydediliyor…" : saveState === "saved" ? "Buluta kaydedildi" : saveState === "error" ? "Kayıt sorunu" : "Yerel taslak";
    const SaveIcon = saveState === "saving" ? LoaderCircle : saveState === "saved" ? Cloud : saveState === "error" ? CloudOff : Save;
    void historyVersion;

    if (loading) return <div className="grid h-screen place-items-center bg-zinc-950 text-white"><div className="text-center"><div className="relative mx-auto h-16 w-16"><div className="absolute inset-0 animate-ping rounded-2xl bg-blue-500/20" /><div className="relative grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600"><Gamepad2 className="h-7 w-7" /></div></div><p className="mt-5 text-sm font-bold">Oyun projesi hazırlanıyor…</p><p className="mt-1 text-xs text-zinc-500">Sahne ve varlıklar doğrulanıyor</p></div></div>;

    return (
        <main className="flex h-dvh min-h-[560px] flex-col overflow-hidden bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
            <header className="relative z-50 flex h-14 shrink-0 items-center border-b border-zinc-200 bg-white/95 px-2 shadow-sm backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/95">
                <button type="button" onClick={() => router.push("/dashboard")} className="mr-1 rounded-xl p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white" aria-label="Gösterge paneline dön" title="Gösterge paneline dön"><ArrowLeft className="h-4 w-4" /></button>
                <div className="mr-2 hidden h-7 w-px bg-zinc-200 sm:block dark:bg-zinc-800" />
                <div className="flex min-w-0 items-center gap-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-md shadow-blue-500/20"><Gamepad2 className="h-4 w-4" /></span>
                    <div className="hidden min-w-0 sm:block"><p className="text-[9px] font-black uppercase tracking-[0.18em] text-blue-500">Hanogt Engine</p><input value={project.name} maxLength={80} onChange={(event) => updateProject((draft) => { draft.name = event.target.value; })} className="block w-36 truncate bg-transparent text-xs font-bold outline-none lg:w-48" aria-label="Proje adı" /></div>
                </div>

                <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-700 dark:bg-zinc-900">
                    <button type="button" onClick={mode === "playing" ? pausePlay : startPlay} aria-label={mode === "playing" ? "Duraklat" : "Oynat"} className={`rounded-lg p-2 transition ${mode === "playing" ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20" : "text-zinc-500 hover:bg-white hover:text-emerald-600 dark:hover:bg-zinc-800"}`}>{mode === "playing" ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}</button>
                    <button type="button" onClick={stepPlay} disabled={mode !== "paused"} aria-label="Bir fizik karesi ilerlet" title="Bir fizik karesi ilerlet" className="rounded-lg p-2 text-zinc-500 transition hover:bg-white hover:text-blue-500 disabled:opacity-30 dark:hover:bg-zinc-800"><StepForward className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={stopPlay} disabled={mode === "edit"} aria-label="Önizlemeyi durdur" className="rounded-lg p-2 text-zinc-500 transition hover:bg-white hover:text-red-500 disabled:opacity-30 dark:hover:bg-zinc-800"><Square className="h-3.5 w-3.5 fill-current" /></button>
                </div>

                <div className="ml-auto flex items-center gap-1">
                    <div className="hidden items-center rounded-xl bg-zinc-100 p-1 md:flex dark:bg-zinc-900">
                        <button type="button" onClick={() => changeDimension("2d")} aria-pressed={project.dimension === "2d"} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black transition ${project.dimension === "2d" ? "bg-white text-blue-600 shadow-sm dark:bg-zinc-800 dark:text-blue-400" : "text-zinc-500"}`}>2D</button>
                        <button type="button" onClick={() => changeDimension("3d")} aria-pressed={project.dimension === "3d"} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black transition ${project.dimension === "3d" ? "bg-white text-blue-600 shadow-sm dark:bg-zinc-800 dark:text-blue-400" : "text-zinc-500"}`}>3D</button>
                    </div>
                    <button type="button" onClick={undo} disabled={undoStack.current.length === 0 || mode !== "edit"} aria-label="Geri al" className="hidden rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 lg:block dark:hover:bg-zinc-800"><Undo2 className="h-4 w-4" /></button>
                    <button type="button" onClick={redo} disabled={redoStack.current.length === 0 || mode !== "edit"} aria-label="Yinele" className="hidden rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 lg:block dark:hover:bg-zinc-800"><Redo2 className="h-4 w-4" /></button>
                    <button type="button" onClick={() => void persist(true)} className={`hidden items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-bold sm:flex ${saveState === "error" ? "bg-red-50 text-red-600 dark:bg-red-950/30" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`} title="Kaydet (Ctrl+S)"><SaveIcon className={`h-3.5 w-3.5 ${saveState === "saving" ? "animate-spin" : ""}`} />{saveLabel}</button>
                    <button type="button" onClick={() => setLeftOpen(true)} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 lg:hidden dark:hover:bg-zinc-800" aria-label="Hierarchy panelini aç"><Menu className="h-4 w-4" /></button>
                    <button type="button" onClick={() => setRightOpen(true)} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 lg:hidden dark:hover:bg-zinc-800" aria-label="Inspector panelini aç"><PanelRight className="h-4 w-4" /></button>
                </div>
            </header>

            <div className="flex h-10 shrink-0 items-center border-b border-zinc-200 bg-zinc-50 px-2 text-xs dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-center gap-1 text-zinc-500"><button type="button" className="rounded-lg px-2 py-1 hover:bg-zinc-200 dark:hover:bg-zinc-800">Dosya</button><button type="button" className="rounded-lg px-2 py-1 hover:bg-zinc-200 dark:hover:bg-zinc-800">Düzenle</button><button type="button" onClick={() => setScriptDialog(true)} className="rounded-lg px-2 py-1 hover:bg-zinc-200 dark:hover:bg-zinc-800">Script</button><button type="button" className="hidden rounded-lg px-2 py-1 hover:bg-zinc-200 sm:block dark:hover:bg-zinc-800">Yardım</button></div>
                <div className="ml-auto flex items-center gap-2 text-[10px] text-zinc-400"><span className="hidden items-center gap-1 md:flex"><MonitorPlay className="h-3.5 w-3.5" />Web Preview</span><span className="h-4 w-px bg-zinc-200 dark:bg-zinc-800" /><select aria-label="Aktif sahne" value={project.activeSceneId} onChange={(event) => updateProject((draft) => { draft.activeSceneId = event.target.value; })} className="max-w-36 bg-transparent font-bold text-zinc-600 outline-none dark:text-zinc-300">{project.scenes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown className="-ml-2 h-3 w-3" /></div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[238px_minmax(0,1fr)_300px]">
                <HierarchyPanel entities={scene.objects} selectedId={selectedId} onSelect={setSelectedId} onCreate={createObject} onToggleActive={toggleEntity} onDuplicate={duplicateEntity} onDelete={deleteEntity} className="hidden lg:flex" />
                <div className="flex min-h-0 min-w-0 flex-col">
                    <EngineViewport dimension={project.dimension} backgroundColor={visibleScene.settings.backgroundColor} entities={visibleScene.objects} selectedId={selectedId} mode={mode} elapsed={elapsed} onSelect={setSelectedId} onBeginTransform={beginTransformEntity} onMoveEntity={moveEntity} onRotateEntity={rotateEntity} onScaleEntity={scaleEntity} onFrameSelected={frameSelected} />
                    <AssetsConsolePanel sceneName={scene.name} entities={scene.objects} scripts={projectScripts} logs={logs} onClearLogs={() => setLogs([])} onCreateScript={() => setScriptDialog(true)} onEditScript={routeToEditor} onCreatePrimitive={() => createObject(project.dimension === "2d" ? "sprite" : "cube")} collapsed={bottomCollapsed} onCollapsedChange={setBottomCollapsed} />
                </div>
                <InspectorPanel entity={selectedEntity} onUpdateEntity={updateEntity} onAddComponent={addComponent} onCreateScript={() => setScriptDialog(true)} onEditScript={routeToEditor} className="hidden lg:flex" />
            </div>

            {leftOpen && <MobileDrawer side="left" title="Hierarchy" onClose={() => setLeftOpen(false)}><HierarchyPanel entities={scene.objects} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setLeftOpen(false); }} onCreate={createObject} onToggleActive={toggleEntity} onDuplicate={duplicateEntity} onDelete={deleteEntity} className="h-full border-r-0" /></MobileDrawer>}
            {rightOpen && <MobileDrawer side="right" title="Inspector" onClose={() => setRightOpen(false)}><InspectorPanel entity={selectedEntity} onUpdateEntity={updateEntity} onAddComponent={addComponent} onCreateScript={() => setScriptDialog(true)} onEditScript={routeToEditor} className="h-full border-l-0" /></MobileDrawer>}

            <ScriptDialog key={scriptDialog ? `open-${selectedId || "unattached"}` : "closed"} open={scriptDialog} entityName={selectedEntity?.name} busy={scriptBusy} error={scriptError} onClose={() => { setScriptDialog(false); setScriptError(""); }} onConfirm={createScript} />
            {toast && <div role="status" className="fixed bottom-5 left-1/2 z-[120] flex -translate-x-1/2 items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-xs font-bold text-white shadow-2xl"><Check className="h-4 w-4 text-emerald-400" />{toast}</div>}
        </main>
    );
}

function MobileDrawer({ side, title, onClose, children }: { side: "left" | "right"; title: string; onClose: () => void; children: React.ReactNode }) {
    return <div className="fixed inset-0 z-[80] lg:hidden"><button type="button" aria-label="Paneli kapat" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" /><div className={`absolute inset-y-0 ${side === "left" ? "left-0" : "right-0"} flex w-[min(88vw,340px)] flex-col bg-white shadow-2xl dark:bg-zinc-950`}><div className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 px-4 dark:border-zinc-800"><h2 className="text-xs font-black uppercase tracking-widest">{title}</h2><button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"><X className="h-4 w-4" /></button></div><div className="min-h-0 flex-1">{children}</div></div></div>;
}
