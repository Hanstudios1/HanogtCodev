"use client";

import {
    ArrowLeft,
    BookOpen,
    Check,
    Cloud,
    CloudOff,
    Download,
    FileJson,
    FolderTree,
    Globe,
    HardDrive,
    Info,
    LoaderCircle,
    Move3d,
    Package,
    Pause,
    Play,
    Redo2,
    Rocket,
    Rotate3d,
    Save,
    Scale3d,
    Settings2,
    SlidersHorizontal,
    Square,
    StepForward,
    Terminal,
    Undo2,
    Upload,
    Volume2,
    VolumeX,
    X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import type { GamePlayer, PlayerState } from "@/lib/game-engine/player/game-player";
import type { GizmoMode } from "@/lib/game-engine/render/renderer";
import { compileScripts } from "@/lib/game-engine/script/compiler";
import type { LogEntry } from "@/lib/game-engine/runtime/world";
import type { GameEntity, GameProjectDocument } from "@/lib/game-engine/types";
import ConsolePanel from "./ConsolePanel";
import { EditorContext, type ConsoleEntry, type EditorContextValue } from "./context";
import { PublishDialog, SettingsDialog, captureThumbnail } from "./Dialogs";
import { GamePreview, GameView } from "./GameView";
import HierarchyPanel, { CLIPBOARD_KEY, copyEntitiesToClipboard } from "./HierarchyPanel";
import { exportStandaloneHtml } from "./html-export";
import InspectorPanel from "./InspectorPanel";
import { activeScene, deleteEntities, duplicateEntities, pasteEntities } from "./operations";
import { exportProjectJson, importProjectFile, saveCloudProject, saveLocalProject, PersistenceError, type ProjectSource } from "./persistence";
import ProjectPanel from "./ProjectPanel";
import SceneView, { type SceneViewApi } from "./SceneView";
import ScriptEditorPanel from "./ScriptEditorPanel";
import { EditorStore, useEditorState } from "./store";
import { engineLocale, useEngineText } from "./text";
import { Dropdown, IconButton, TabButton, Toasts, cx, useToasts } from "./ui";

type SaveStatus = "idle" | "saving" | "error" | "conflict";

const LAYOUT_KEY = "hanogt-engine:layout";

function readLayout() {
    try {
        const parsed = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "{}") as Partial<{ left: number; right: number; bottom: number }>;
        return { left: parsed.left ?? 260, right: parsed.right ?? 320, bottom: parsed.bottom ?? 230 };
    } catch {
        return { left: 260, right: 320, bottom: 230 };
    }
}

function ResizeHandle({ direction, onResize, onEnd }: { direction: "x" | "y"; onResize: (delta: number) => void; onEnd: () => void }) {
    const last = useRef(0);
    return (
        <div
            role="separator"
            aria-orientation={direction === "x" ? "vertical" : "horizontal"}
            onPointerDown={(event) => {
                event.preventDefault();
                (event.target as HTMLElement).setPointerCapture(event.pointerId);
                last.current = direction === "x" ? event.clientX : event.clientY;
            }}
            onPointerMove={(event) => {
                if (!(event.target as HTMLElement).hasPointerCapture(event.pointerId)) return;
                const current = direction === "x" ? event.clientX : event.clientY;
                onResize(current - last.current);
                last.current = current;
            }}
            onPointerUp={onEnd}
            className={cx(
                "relative z-10 shrink-0 bg-white/[0.04] transition hover:bg-indigo-500/60 active:bg-indigo-500",
                direction === "x" ? "w-[3px] cursor-col-resize" : "h-[3px] cursor-row-resize",
            )}
        />
    );
}

function isTypingTarget(target: EventTarget | null) {
    const element = target as HTMLElement | null;
    if (!element) return false;
    if (element.closest?.(".monaco-editor")) return true;
    return element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT" || element.isContentEditable;
}

export default function EngineEditor({ initialProject, source, initialRevision, initialArcadeId, onExit }: {
    initialProject: GameProjectDocument;
    source: ProjectSource;
    initialRevision: string | null;
    initialArcadeId: string | null;
    onExit: () => void;
}) {
    const [store] = useState(() => new EditorStore(initialProject));
    const project = useEditorState(store, (state) => state.project);
    const revision = useEditorState(store, (state) => state.revision);
    const savedRevision = useEditorState(store, (state) => state.savedRevision);
    const canUndo = useEditorState(store, (state) => state.canUndo);
    const canRedo = useEditorState(store, (state) => state.canRedo);
    const undoLabel = useEditorState(store, (state) => state.undoLabel);
    const t = useEngineText();
    const { language } = useI18n();
    const { toasts, push: toast, dismiss } = useToasts();
    const program = useMemo(() => compileScripts(project.scripts), [project.scripts]);

    const [gizmoMode, setGizmoMode] = useState<GizmoMode>("translate");
    const [gizmoSpace, setGizmoSpace] = useState<"world" | "local">("world");
    const [view, setView] = useState<"scene" | "game">("scene");
    const [session, setSession] = useState<{ project: GameProjectDocument; program: ReturnType<typeof compileScripts>; sceneId: string; key: number } | null>(null);
    const [playerState, setPlayerState] = useState<PlayerState>("idle");
    const [muted, setMuted] = useState(false);
    const playerRef = useRef<GamePlayer | null>(null);
    const sceneApi = useRef<SceneViewApi | null>(null);
    // Read lazily so the publish dialog captures the scene as it looks when the button is pressed.
    const snapshotScene = useCallback(() => {
        const api = sceneApi.current;
        if (!api) throw new Error("scene view is not mounted");
        return api.snapshot();
    }, []);
    const [gameLogs, setGameLogs] = useState<ConsoleEntry[]>([]);
    const logBuffer = useRef<{ entries: Map<number, ConsoleEntry>; timer: number }>({ entries: new Map(), timer: 0 });
    const [bottomTab, setBottomTab] = useState<"project" | "console">("project");
    const [scriptTabs, setScriptTabs] = useState<string[]>([]);
    const [activeScript, setActiveScript] = useState<string | null>(null);
    const [showScripts, setShowScripts] = useState(false);
    const [gotoRequest, setGotoRequest] = useState<{ id: string; line: number; nonce: number } | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [publishOpen, setPublishOpen] = useState(false);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
    const [arcadeId, setArcadeId] = useState(initialArcadeId);
    const serverRevision = useRef(initialRevision);
    const saving = useRef<Promise<boolean> | null>(null);
    const savesSinceThumb = useRef(99);
    const [layout, setLayout] = useState({ left: 260, right: 320, bottom: 230 });
    const [mobilePanel, setMobilePanel] = useState<null | "hierarchy" | "inspector" | "project" | "console">(null);
    const importInput = useRef<HTMLInputElement | null>(null);
    const playing = session !== null;
    const dirty = revision !== savedRevision;

    useEffect(() => {
        const frame = requestAnimationFrame(() => setLayout(readLayout()));
        return () => cancelAnimationFrame(frame);
    }, []);

    const persistLayout = useCallback(() => {
        try {
            localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
        } catch {
            // ignore
        }
    }, [layout]);

    // ------------------------------------------------------------------
    // Saving
    // ------------------------------------------------------------------

    const save = useCallback(async (options: { thumbnail?: boolean } = {}): Promise<boolean> => {
        if (saving.current) await saving.current.catch(() => false);
        const state = store.getState();
        if (state.revision === state.savedRevision && !options.thumbnail) return true;
        const snapshotRevision = state.revision;
        const task = (async () => {
            setSaveStatus("saving");
            try {
                savesSinceThumb.current += 1;
                const wantThumb = options.thumbnail || savesSinceThumb.current >= 6;
                const thumbnail = wantThumb ? await captureThumbnail(snapshotScene) : null;
                if (thumbnail) savesSinceThumb.current = 0;
                if (source === "cloud") {
                    const result = await saveCloudProject(state.project, serverRevision.current, thumbnail);
                    serverRevision.current = result.revision;
                } else {
                    await saveLocalProject(state.project, thumbnail);
                }
                store.markSaved(snapshotRevision);
                setSaveStatus("idle");
                return true;
            } catch (error) {
                if (error instanceof PersistenceError && error.status === 409) {
                    setSaveStatus("conflict");
                    toast("Proje başka bir sekmede/cihazda değişti. Sayfayı yenileyip güncel sürümü yükleyin; bu sekmedeki değişiklikleri kaybetmemek için önce JSON olarak dışa aktarabilirsiniz.", "error");
                } else {
                    setSaveStatus("error");
                    toast(error instanceof Error ? error.message : t("saveFailed"), "error");
                }
                return false;
            }
        })();
        saving.current = task;
        const result = await task;
        saving.current = null;
        return result;
    }, [snapshotScene, store, source, toast, t]);

    // Autosave after edits settle (not while playing, not after a conflict).
    useEffect(() => {
        if (!dirty || playing || saveStatus === "conflict") return;
        const timer = window.setTimeout(() => void save(), source === "cloud" ? 2500 : 1200);
        return () => window.clearTimeout(timer);
    }, [revision, dirty, playing, save, source, saveStatus]);

    useEffect(() => {
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            if (store.getState().revision === store.getState().savedRevision) return;
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [store]);

    // ------------------------------------------------------------------
    // Console
    // ------------------------------------------------------------------

    const onLog = useCallback((entry: LogEntry) => {
        const buffer = logBuffer.current;
        buffer.entries.set(entry.id, { ...entry, origin: "game" });
        if (buffer.timer) return;
        buffer.timer = window.setTimeout(() => {
            buffer.timer = 0;
            const updates = buffer.entries;
            buffer.entries = new Map();
            setGameLogs((current) => {
                const next = current.slice();
                const index = new Map(next.map((item, position) => [item.id, position]));
                for (const [id, item] of updates) {
                    const position = index.get(id);
                    if (position !== undefined) next[position] = item;
                    else next.push(item);
                }
                return next.length > 1500 ? next.slice(-1500) : next;
            });
            for (const item of updates.values()) {
                if (item.level === "error" && item.count === 1) setBottomTab("console");
            }
        }, 120);
    }, []);

    useEffect(() => () => window.clearTimeout(logBuffer.current.timer), []);

    const editorEntries = useMemo<ConsoleEntry[]>(() => program.diagnostics.map((diagnostic, index) => ({
        id: -1 - index,
        level: diagnostic.severity === "error" ? "error" : "warning",
        message: `${diagnostic.message}`,
        count: 1,
        time: 0,
        frame: 0,
        source: { scriptName: diagnostic.scriptName, line: diagnostic.line },
        origin: "editor",
    })), [program]);
    const consoleEntries = useMemo(() => [...editorEntries, ...gameLogs], [editorEntries, gameLogs]);
    const errorCount = consoleEntries.filter((entry) => entry.level === "error").length;

    // ------------------------------------------------------------------
    // Play mode
    // ------------------------------------------------------------------

    const startPlay = useCallback(() => {
        window.dispatchEvent(new CustomEvent("hanogt-engine:flush-scripts"));
        const snapshot = store.getState().project;
        const compiled = compileScripts(snapshot.scripts);
        if (!compiled.ok) {
            setBottomTab("console");
            setMobilePanel("console");
            toast(t("playBlocked"), "error");
            return;
        }
        setGameLogs([]);
        setSession({ project: snapshot, program: compiled, sceneId: snapshot.activeSceneId, key: Date.now() });
        setView("game");
        setPlayerState("running");
    }, [store, toast, t]);

    const stopPlay = useCallback(() => {
        setSession(null);
        setPlayerState("idle");
        setView("scene");
    }, []);

    const togglePause = () => {
        const player = playerRef.current;
        if (!player) return;
        if (player.playerState === "paused") player.resume();
        else player.pause();
    };

    // ------------------------------------------------------------------
    // Scripts
    // ------------------------------------------------------------------

    const openScript = useCallback((scriptId: string, line?: number) => {
        setScriptTabs((current) => (current.includes(scriptId) ? current : [...current, scriptId]));
        setActiveScript(scriptId);
        setShowScripts(true);
        setMobilePanel(null);
        if (line) setGotoRequest({ id: scriptId, line, nonce: Date.now() });
    }, []);

    // Tabs of scripts that were deleted (or undone away) drop out during render instead of in an extra effect pass.
    const scriptIds = useMemo(() => new Set(project.scripts.map((script) => script.id)), [project.scripts]);
    const openScriptTabs = scriptTabs.filter((id) => scriptIds.has(id));
    const currentScript = activeScript && scriptIds.has(activeScript) ? activeScript : null;

    // ------------------------------------------------------------------
    // Keyboard shortcuts
    // ------------------------------------------------------------------

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const mod = event.ctrlKey || event.metaKey;
            const key = event.key.toLowerCase();
            if (mod && key === "s") {
                event.preventDefault();
                window.dispatchEvent(new CustomEvent("hanogt-engine:flush-scripts"));
                void save({ thumbnail: true });
                return;
            }
            if (mod && key === "p") {
                event.preventDefault();
                if (playing) stopPlay();
                else startPlay();
                return;
            }
            if (playing || isTypingTarget(event.target)) return;
            const selection = store.getState().selection;
            if (mod && key === "z" && !event.shiftKey) {
                event.preventDefault();
                store.undo();
            } else if (mod && (key === "y" || (key === "z" && event.shiftKey))) {
                event.preventDefault();
                store.redo();
            } else if (mod && key === "d" && selection.length) {
                event.preventDefault();
                let created: string[] = [];
                store.update("Çoğalt", (draft) => { created = duplicateEntities(draft, selection); });
                store.setSelection(created);
            } else if (mod && key === "c" && selection.length) {
                copyEntitiesToClipboard(activeScene(store.getState().project).objects, selection);
            } else if (mod && key === "v") {
                window.dispatchEvent(new CustomEvent("hanogt-engine:paste"));
            } else if ((event.key === "Delete" || event.key === "Backspace") && selection.length) {
                event.preventDefault();
                store.update("Sil", (draft) => deleteEntities(draft, selection), { selection: [] });
            } else if (!mod && key === "f" && selection.length) {
                sceneApi.current?.focus(selection[0]);
            } else if (event.key === "F2" && selection.length === 1) {
                event.preventDefault();
                window.dispatchEvent(new CustomEvent("hanogt-engine:rename", { detail: selection[0] }));
            } else if (!mod && key === "w") setGizmoMode("translate");
            else if (!mod && key === "e") setGizmoMode("rotate");
            else if (!mod && key === "r") setGizmoMode("scale");
            else if (event.key === "Escape") store.setSelection([]);
        };
        const onPaste = () => {
            if (playing) return;
            try {
                const raw = sessionStorage.getItem(CLIPBOARD_KEY);
                if (!raw) return;
                const groups = JSON.parse(raw) as GameEntity[][];
                if (!Array.isArray(groups)) return;
                let created: string[] = [];
                store.update("Yapıştır", (draft) => { created = pasteEntities(draft, groups); });
                store.setSelection(created);
            } catch {
                toast("Pano içeriği okunamadı.", "error");
            }
        };
        window.addEventListener("keydown", onKey);
        window.addEventListener("hanogt-engine:paste", onPaste);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("hanogt-engine:paste", onPaste);
        };
    }, [store, playing, save, startPlay, stopPlay, toast]);

    // ------------------------------------------------------------------
    // Import / export
    // ------------------------------------------------------------------

    const exportHtml = async () => {
        window.dispatchEvent(new CustomEvent("hanogt-engine:flush-scripts"));
        const compiled = compileScripts(store.getState().project.scripts);
        if (!compiled.ok) {
            toast(t("playBlocked"), "error");
            setBottomTab("console");
            return;
        }
        try {
            await exportStandaloneHtml(store.getState().project);
            toast("Oynanabilir HTML dosyası indirildi.", "success");
        } catch (error) {
            toast(error instanceof Error ? error.message : "Dışa aktarılamadı.", "error");
        }
    };

    const importProject = async (file: File | undefined) => {
        if (!file) return;
        try {
            const imported = await importProjectFile(file);
            if (!window.confirm(`"${imported.name}" içe aktarılsın mı? Bu projenin içeriği değiştirilecek (geri alınabilir).`)) return;
            store.update("Proje içe aktar", (draft) => {
                const keepId = draft.id;
                Object.assign(draft, { ...imported, id: keepId, dimension: draft.dimension === imported.dimension ? draft.dimension : imported.dimension });
            }, { selection: [] });
            toast("Proje içe aktarıldı.", "success");
        } catch (error) {
            toast(error instanceof Error ? error.message : "İçe aktarılamadı.", "error");
        } finally {
            if (importInput.current) importInput.current.value = "";
        }
    };

    // ------------------------------------------------------------------
    // Context
    // ------------------------------------------------------------------

    const contextValue = useMemo<EditorContextValue>(() => ({
        store,
        t,
        locale: engineLocale(language),
        toast,
        program,
        playing,
        openScript,
        focusEntity: (id) => sceneApi.current?.focus(id),
        createAt: () => {
            const point = sceneApi.current?.center() ?? { x: 0, y: 0, z: 0 };
            return project.dimension === "2d" ? { x: Math.round(point.x), y: Math.round(point.y), z: 0 } : { x: Math.round(point.x), y: Math.max(0, Math.round(point.y)), z: Math.round(point.z) };
        },
    }), [store, t, language, toast, program, playing, openScript, project.dimension]);

    const scene = activeScene(project);

    const saveIndicator = (() => {
        if (saveStatus === "saving") return { icon: <LoaderCircle className="h-3.5 w-3.5 animate-spin" />, text: t("saving"), className: "text-zinc-400" };
        if (saveStatus === "error" || saveStatus === "conflict") return { icon: <CloudOff className="h-3.5 w-3.5" />, text: t("saveFailed"), className: "text-red-300" };
        if (dirty) return { icon: <span className="h-2 w-2 rounded-full bg-amber-300" />, text: t("unsaved"), className: "text-amber-200" };
        return { icon: source === "cloud" ? <Cloud className="h-3.5 w-3.5" /> : <HardDrive className="h-3.5 w-3.5" />, text: source === "cloud" ? t("saved") : t("savedLocal"), className: "text-emerald-300/90" };
    })();

    const panel = (content: ReactNode, key: string) => <div key={key} className="h-full min-h-0">{content}</div>;

    const bottomPanel = (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex h-9 shrink-0 items-center gap-1 border-b border-white/[0.06] px-2">
                <TabButton active={bottomTab === "project"} onClick={() => setBottomTab("project")}><Package className="h-3.5 w-3.5" />{t("project")}</TabButton>
                <TabButton active={bottomTab === "console"} onClick={() => setBottomTab("console")} count={errorCount}><Terminal className="h-3.5 w-3.5" />{t("console")}</TabButton>
            </div>
            <div className="min-h-0 flex-1">
                {bottomTab === "project" ? panel(<ProjectPanel />, "project") : panel(<ConsolePanel entries={consoleEntries} onClear={() => setGameLogs([])} />, "console")}
            </div>
        </div>
    );

    return (
        <EditorContext.Provider value={contextValue}>
            <div className="fixed inset-0 flex flex-col overflow-hidden bg-zinc-950 text-zinc-100 [color-scheme:dark]">
                {/* Top bar */}
                <header className={cx("flex h-12 shrink-0 items-center gap-1 border-b px-2 transition-colors", playing ? "border-indigo-500/40 bg-indigo-950/60" : "border-white/[0.07] bg-zinc-900/80")}>
                    <IconButton icon={ArrowLeft} label={t("hub")} onClick={async () => {
                        window.dispatchEvent(new CustomEvent("hanogt-engine:flush-scripts"));
                        if (store.getState().revision !== store.getState().savedRevision) {
                            const ok = await save();
                            if (!ok && !window.confirm(t("unsavedLeave"))) return;
                        }
                        onExit();
                    }} />
                    <div className="mr-1 flex min-w-0 items-center gap-2">
                        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-[10px] font-black">{project.dimension.toUpperCase()}</div>
                        <div className="min-w-0">
                            <p className="max-w-[26vw] truncate text-[13px] font-bold leading-tight">{project.name}</p>
                            <p className={cx("flex items-center gap-1 text-[10.5px] leading-tight", saveIndicator.className)}>{saveIndicator.icon}<span className="truncate">{saveIndicator.text}</span></p>
                        </div>
                    </div>
                    <div className="hidden items-center gap-0.5 border-l border-white/[0.07] pl-1.5 md:flex">
                        <IconButton icon={Undo2} label={`${t("undo")}${undoLabel ? `: ${undoLabel}` : ""} (Ctrl+Z)`} disabled={!canUndo || playing} onClick={() => store.undo()} />
                        <IconButton icon={Redo2} label={`${t("redo")} (Ctrl+Y)`} disabled={!canRedo || playing} onClick={() => store.redo()} />
                        <IconButton icon={Save} label={`${t("save")} (Ctrl+S)`} disabled={playing} onClick={() => {
                            window.dispatchEvent(new CustomEvent("hanogt-engine:flush-scripts"));
                            void save({ thumbnail: true });
                        }} />
                    </div>
                    <div className="hidden items-center gap-0.5 border-l border-white/[0.07] pl-1.5 lg:flex">
                        <IconButton icon={Move3d} label={t("move")} active={gizmoMode === "translate"} onClick={() => setGizmoMode("translate")} />
                        <IconButton icon={Rotate3d} label={t("rotate")} active={gizmoMode === "rotate"} onClick={() => setGizmoMode("rotate")} />
                        <IconButton icon={Scale3d} label={t("scale")} active={gizmoMode === "scale"} onClick={() => setGizmoMode("scale")} />
                        <button type="button" onClick={() => setGizmoSpace(gizmoSpace === "world" ? "local" : "world")} className="ml-0.5 h-7 rounded-md px-2 text-[11px] font-semibold text-zinc-400 hover:bg-white/8 hover:text-zinc-100" title={gizmoSpace === "world" ? t("worldSpace") : t("localSpace")}>
                            {gizmoSpace === "world" ? "Global" : "Local"}
                        </button>
                    </div>
                    <div className="flex flex-1 items-center justify-center gap-1">
                        <div className="flex items-center gap-0.5 rounded-xl border border-white/[0.08] bg-black/30 p-0.5">
                            <button
                                type="button"
                                onClick={playing ? stopPlay : startPlay}
                                title={`${playing ? t("stop") : t("play")} (Ctrl+P)`}
                                aria-label={playing ? t("stop") : t("play")}
                                className={cx("grid h-8 w-10 place-items-center rounded-lg transition", playing ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30" : "text-emerald-300 hover:bg-white/10")}
                            >
                                {playing ? <Square className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
                            </button>
                            <IconButton icon={Pause} label={playerState === "paused" ? t("resume") : t("pause")} active={playerState === "paused"} disabled={!playing} onClick={togglePause} />
                            <IconButton icon={StepForward} label={t("step")} disabled={playerState !== "paused"} onClick={() => playerRef.current?.step()} />
                            <IconButton icon={muted ? VolumeX : Volume2} label={muted ? "Sesi aç" : "Sesi kapat"} onClick={() => setMuted(!muted)} />
                        </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                        <IconButton icon={Settings2} label={t("settings")} onClick={() => setSettingsOpen(true)} />
                        <Dropdown
                            align="right"
                            items={[
                                { label: t("exportHtml"), icon: Globe, onSelect: () => void exportHtml() },
                                { label: t("exportJson"), icon: FileJson, onSelect: () => exportProjectJson(store.getState().project) },
                                { separator: true, label: "" },
                                { label: t("importProject"), icon: Upload, disabled: playing, onSelect: () => importInput.current?.click() },
                            ]}
                            trigger={({ toggle }) => <IconButton icon={Download} label={t("export")} onClick={toggle} />}
                        />
                        <Link href="/game-engine/docs" target="_blank" className="hidden h-8 w-8 place-items-center rounded-md text-zinc-400 hover:bg-white/8 hover:text-zinc-100 sm:grid" title={t("docs")} aria-label={t("docs")}><BookOpen className="h-4 w-4" /></Link>
                        <button type="button" onClick={() => setPublishOpen(true)} className="ml-1 hidden h-8 items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-3 text-[12px] font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:brightness-110 sm:inline-flex">
                            <Rocket className="h-3.5 w-3.5" />{arcadeId ? t("published") : t("publishShort")}
                        </button>
                    </div>
                    <input ref={importInput} type="file" accept=".json,application/json" hidden onChange={(event) => void importProject(event.target.files?.[0])} />
                </header>

                <div className="flex min-h-0 flex-1">
                    {/* Left: hierarchy */}
                    <aside className="hidden min-h-0 shrink-0 border-r border-white/[0.06] bg-zinc-900/60 lg:block" style={{ width: layout.left }}>
                        <HierarchyPanel />
                    </aside>
                    <div className="hidden lg:block"><ResizeHandle direction="x" onResize={(delta) => setLayout((current) => ({ ...current, left: Math.max(190, Math.min(460, current.left + delta)) }))} onEnd={persistLayout} /></div>

                    {/* Center */}
                    <main className="flex min-w-0 flex-1 flex-col">
                        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-white/[0.06] bg-zinc-900/40 px-2">
                            <TabButton active={view === "scene"} onClick={() => setView("scene")}><Move3d className="h-3.5 w-3.5" />{t("scene")}</TabButton>
                            <TabButton active={view === "game"} onClick={() => setView("game")}><Play className="h-3.5 w-3.5" />{t("game")}</TabButton>
                            <div className="flex-1" />
                            {playing ? <span className="flex items-center gap-1.5 rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-100"><span className={cx("h-1.5 w-1.5 rounded-full", playerState === "paused" ? "bg-amber-300" : "animate-pulse bg-emerald-400")} />{playerState === "paused" ? t("pause") : t("playingNote")}</span> : null}
                            {!program.ok ? <button type="button" onClick={() => setBottomTab("console")} className="flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-red-200"><X className="h-3 w-3" />{t("compileErrors")}</button> : null}
                            {openScriptTabs.length ? (
                                <button type="button" onClick={() => setShowScripts(!showScripts)} className={cx("ml-1 flex h-7 items-center gap-1.5 rounded-md px-2 text-[11.5px] font-semibold", showScripts ? "bg-emerald-500/15 text-emerald-200" : "text-zinc-400 hover:bg-white/5")}>
                                    <Info className="h-3.5 w-3.5" />Kod ({openScriptTabs.length})
                                </button>
                            ) : null}
                        </div>
                        <div className="relative min-h-0 flex-1">
                            <SceneView apiRef={sceneApi} gizmoMode={gizmoMode} gizmoSpace={gizmoSpace} hidden={view !== "scene"} />
                            {session ? (
                                <div className={cx("absolute inset-0", view !== "game" && "invisible")}>
                                    <GameView
                                        key={session.key}
                                        project={session.project}
                                        program={session.program}
                                        sceneId={session.sceneId}
                                        controlRef={playerRef}
                                        onLog={onLog}
                                        onState={(state) => setPlayerState(state)}
                                        muted={muted}
                                    />
                                </div>
                            ) : view === "game" ? <GamePreview project={project} scene={scene} /> : null}
                            {session && view !== "game" ? (
                                <button type="button" onClick={() => setView("game")} className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-lg bg-indigo-500/90 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-lg">
                                    <Play className="h-3 w-3 fill-current" />{t("game")}
                                </button>
                            ) : null}
                            {openScriptTabs.length ? (
                                <div className={cx("absolute inset-0 z-20", showScripts ? "animate-fade-up" : "hidden")}>
                                    <ScriptEditorPanel
                                        tabs={openScriptTabs}
                                        activeId={currentScript}
                                        onActivate={setActiveScript}
                                        onCloseTab={(id) => {
                                            const next = openScriptTabs.filter((item) => item !== id);
                                            setScriptTabs(next);
                                            if (currentScript === id) setActiveScript(next[next.length - 1] ?? null);
                                            if (!next.length) setShowScripts(false);
                                        }}
                                        onClose={() => setShowScripts(false)}
                                        goto={gotoRequest}
                                    />
                                </div>
                            ) : null}
                        </div>
                        <div className="hidden lg:block"><ResizeHandle direction="y" onResize={(delta) => setLayout((current) => ({ ...current, bottom: Math.max(120, Math.min(window.innerHeight * 0.6, current.bottom - delta)) }))} onEnd={persistLayout} /></div>
                        <div className="hidden shrink-0 border-t border-white/[0.06] bg-zinc-900/60 lg:block" style={{ height: layout.bottom }}>
                            {bottomPanel}
                        </div>
                    </main>

                    <div className="hidden lg:block"><ResizeHandle direction="x" onResize={(delta) => setLayout((current) => ({ ...current, right: Math.max(260, Math.min(560, current.right - delta)) }))} onEnd={persistLayout} /></div>
                    {/* Right: inspector */}
                    <aside className="hidden min-h-0 shrink-0 border-l border-white/[0.06] bg-zinc-900/60 lg:block" style={{ width: layout.right }}>
                        <InspectorPanel />
                    </aside>
                </div>

                {/* Mobile panels */}
                {mobilePanel ? (
                    <div className="fixed inset-x-0 bottom-14 top-12 z-40 flex flex-col border-t border-white/10 bg-zinc-900/98 backdrop-blur-xl lg:hidden animate-fade-up">
                        <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/[0.06] px-3">
                            <span className="text-[13px] font-semibold">{mobilePanel === "hierarchy" ? t("hierarchy") : mobilePanel === "inspector" ? t("inspector") : mobilePanel === "project" ? t("project") : t("console")}</span>
                            <IconButton icon={X} label={t("close")} size="sm" onClick={() => setMobilePanel(null)} />
                        </div>
                        <div className="min-h-0 flex-1">
                            {mobilePanel === "hierarchy" ? <HierarchyPanel /> : mobilePanel === "inspector" ? <InspectorPanel /> : mobilePanel === "project" ? <ProjectPanel /> : <ConsolePanel entries={consoleEntries} onClear={() => setGameLogs([])} />}
                        </div>
                    </div>
                ) : null}
                <nav className="grid h-14 shrink-0 grid-cols-5 border-t border-white/[0.07] bg-zinc-900 lg:hidden" aria-label="Editör panelleri">
                    {([
                        ["hierarchy", FolderTree, t("hierarchy")],
                        ["inspector", SlidersHorizontal, t("inspector")],
                        ["project", Package, t("project")],
                        ["console", Terminal, t("console")],
                    ] as const).map(([key, Icon, label]) => (
                        <button key={key} type="button" onClick={() => setMobilePanel(mobilePanel === key ? null : key)} className={cx("flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold", mobilePanel === key ? "text-indigo-300" : "text-zinc-400")}>
                            <Icon className="h-4 w-4" />{label}
                            {key === "console" && errorCount ? <span className="absolute mt-[-26px] ml-6 h-2 w-2 rounded-full bg-red-500" /> : null}
                        </button>
                    ))}
                    <button type="button" onClick={() => setPublishOpen(true)} className="flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-fuchsia-300">
                        <Rocket className="h-4 w-4" />{t("publishShort")}
                    </button>
                </nav>

                <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
                <PublishDialog
                    open={publishOpen}
                    onClose={() => setPublishOpen(false)}
                    source={source}
                    arcadeId={arcadeId}
                    onPublished={setArcadeId}
                    onSaveFirst={() => save({ thumbnail: true })}
                    snapshot={snapshotScene}
                />
                <Toasts toasts={toasts} onDismiss={dismiss} />
                {saveStatus === "idle" && !dirty && revision > 0 ? <span className="sr-only" aria-live="polite"><Check className="h-3 w-3" />{t("saved")}</span> : null}
            </div>
        </EditorContext.Provider>
    );
}
