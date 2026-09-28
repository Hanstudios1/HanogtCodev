/**
 * GamePlayer — runs a Hanogt Engine project inside a DOM element: letterboxed
 * WebGL view, input, audio, UI overlay and the RuntimeWorld game loop. Used by
 * the editor's Play mode, the Arcade and exported HTML builds.
 */
import { compileScripts, type CompiledProgram } from "../script/compiler";
import { SceneRenderer, type RenderFrame } from "../render/renderer";
import { sceneFrame } from "../render/scene-frame";
import { SoundEngine } from "../runtime/audio";
import { InputManager } from "../runtime/input";
import { RuntimeWorld, type LogEntry } from "../runtime/world";
import type { GameProjectDocument, ProjectSettings } from "../types";
import { GameOverlay } from "./overlay";

export type PlayerState = "idle" | "running" | "paused" | "stopped";

export interface GamePlayerOptions {
    project: GameProjectDocument;
    program?: CompiledProgram;
    sceneId?: string | null;
    isEditor?: boolean;
    muted?: boolean;
    /** Overrides project.settings.touchControls ("auto" shows them on touch screens). */
    touchControls?: boolean | "auto";
    onLog?: (entry: LogEntry, updated: boolean) => void;
    onStateChange?: (state: PlayerState) => void;
    onQuit?: () => void;
    storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
}

const ASPECTS: Record<ProjectSettings["aspect"], number | null> = {
    free: null,
    "16:9": 16 / 9,
    "4:3": 4 / 3,
    "9:16": 9 / 16,
    "1:1": 1,
};

function safeStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
    try {
        return typeof window !== "undefined" ? window.localStorage : null;
    } catch {
        return null;
    }
}

export class GamePlayer {
    readonly root: HTMLDivElement;
    readonly stage: HTMLDivElement;
    readonly renderer: SceneRenderer;
    readonly overlay: GameOverlay;
    readonly input = new InputManager();
    readonly audio = new SoundEngine();
    readonly program: CompiledProgram;
    world: RuntimeWorld;
    private state: PlayerState = "idle";
    private raf = 0;
    private last = 0;
    private readonly resizeObserver: ResizeObserver | null = null;
    private readonly options: GamePlayerOptions;
    private disposed = false;
    private stepOnce = false;

    constructor(readonly container: HTMLElement, options: GamePlayerOptions) {
        this.options = options;
        this.program = options.program ?? compileScripts(options.project.scripts);
        const settings = options.project.settings;

        this.root = document.createElement("div");
        Object.assign(this.root.style, { position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#000", display: "flex", alignItems: "center", justifyContent: "center" });
        this.stage = document.createElement("div");
        Object.assign(this.stage.style, { position: "relative", width: "100%", height: "100%", overflow: "hidden" });
        this.root.appendChild(this.stage);
        container.appendChild(this.root);

        this.renderer = new SceneRenderer(this.stage, { mode: "game", antialias: settings.antialias, shadows: settings.shadows, pixelArt: settings.pixelArt });
        this.renderer.setTextures(options.project.textures);
        this.renderer.assets.onTextureLoaded = () => {
            if (this.state !== "running") this.renderFrame();
        };
        this.overlay = new GameOverlay(this.stage, {
            showFps: settings.showFps,
            touchControls: options.touchControls ?? (settings.touchControls ? "auto" : false),
            onVirtualKey: (key, down) => this.input.setVirtualKey(key, down),
        });
        this.input.attach(this.renderer.canvas, typeof window !== "undefined" ? window : this.root);
        // Keys are only captured once the game runs (so the page can still scroll before "Play").
        this.input.enabled = false;
        if (options.muted) this.audio.setMuted(true);
        this.world = this.createWorld();

        if (typeof ResizeObserver !== "undefined") {
            this.resizeObserver = new ResizeObserver(() => this.layout());
            this.resizeObserver.observe(container);
        }
        this.layout();
        document.addEventListener("visibilitychange", this.handleVisibility);
    }

    private createWorld() {
        return new RuntimeWorld({
            project: this.options.project,
            program: this.program,
            sceneId: this.options.sceneId,
            input: this.input,
            audio: this.audio,
            isEditor: this.options.isEditor,
            storage: this.options.storage === undefined ? safeStorage() : this.options.storage,
            getScreenSize: () => this.renderer.size,
            onLog: this.options.onLog,
            onQuit: () => {
                this.setState("stopped");
                this.options.onQuit?.();
            },
        });
    }

    get playerState() {
        return this.state;
    }

    private setState(state: PlayerState) {
        if (this.state === state) return;
        this.state = state;
        this.options.onStateChange?.(state);
    }

    private layout() {
        if (this.disposed) return;
        const rect = this.container.getBoundingClientRect();
        const aspect = ASPECTS[this.options.project.settings.aspect] ?? null;
        if (!aspect || rect.width <= 0 || rect.height <= 0) {
            this.stage.style.width = "100%";
            this.stage.style.height = "100%";
        } else if (rect.width / rect.height > aspect) {
            this.stage.style.height = "100%";
            this.stage.style.width = `${Math.floor(rect.height * aspect)}px`;
        } else {
            this.stage.style.width = "100%";
            this.stage.style.height = `${Math.floor(rect.width / aspect)}px`;
        }
        this.renderer.resize();
        if (this.state !== "running") this.renderFrame();
    }

    private handleVisibility = () => {
        this.last = 0;
        if (document.hidden) this.input.reset();
    };

    private frame(): RenderFrame {
        const world = this.world;
        if (world.status === "idle") return sceneFrame(world.scene, this.options.project.dimension);
        return {
            dimension: this.options.project.dimension,
            settings: world.scene.settings,
            entities: world.entities.values(),
            debugLines: world.debugLines,
        };
    }

    private renderFrame(delta = 0) {
        if (this.disposed) return;
        this.renderer.render(this.frame());
        const overlayEntities = this.world.status === "idle" ? this.world.scene.objects.filter((entity) => entity.active).map((entity) => ({ id: entity.id, visible: true, components: entity.components })) : this.world.entities.values();
        this.overlay.update(overlayEntities, this.world.hud, delta, this.renderer.size.height);
        this.overlay.setNotice(this.renderer.hasCamera ? null : "Sahnede aktif kamera yok — varsayılan görünüm kullanılıyor.");
    }

    private loop = (time: number) => {
        if (this.disposed) return;
        this.raf = requestAnimationFrame(this.loop);
        const delta = this.last ? (time - this.last) / 1000 : 1 / 60;
        this.last = time;
        if (document.hidden) return;
        if (this.state === "running" || this.stepOnce) {
            if (this.stepOnce && this.world.status === "paused") {
                this.world.resume();
                this.world.step(1 / 60);
                if ((this.world.status as string) === "running") this.world.pause();
            } else {
                this.world.step(delta);
            }
            this.stepOnce = false;
            if (this.world.status === "stopped" && this.state !== "stopped") this.setState("stopped");
            if (this.world.status === "paused" && this.state === "running") this.setState("paused");
        }
        this.renderFrame(delta);
    };

    /** Starts play mode (call from a user gesture so audio is allowed). */
    start() {
        if (this.disposed || this.state === "running") return;
        this.audio.unlock();
        if (this.state === "idle") this.world.start();
        else if (this.state === "paused") this.world.resume();
        else if (this.state === "stopped") {
            this.world = this.createWorld();
            this.world.start();
        }
        this.setState("running");
        this.input.enabled = true;
        this.last = 0;
        cancelAnimationFrame(this.raf);
        this.raf = requestAnimationFrame(this.loop);
        this.renderer.canvas.focus({ preventScroll: true });
    }

    pause() {
        if (this.state !== "running") return;
        this.world.pause();
        this.setState("paused");
    }

    resume() {
        if (this.state !== "paused") return;
        this.world.resume();
        this.setState("running");
    }

    /** Advances exactly one frame while paused. */
    step() {
        if (this.state !== "paused") return;
        this.stepOnce = true;
    }

    stop() {
        if (this.state === "stopped" || this.state === "idle") return;
        this.world.stop();
        this.input.enabled = false;
        this.setState("stopped");
    }

    restart() {
        this.world.stop();
        this.world = this.createWorld();
        this.state = "idle";
        this.start();
    }

    setMuted(muted: boolean) {
        this.audio.setMuted(muted);
    }

    toggleFullscreen() {
        if (typeof document === "undefined") return;
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
        else void this.root.requestFullscreen?.().catch(() => undefined);
    }

    snapshot(): string {
        return this.renderer.snapshot(this.frame());
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        cancelAnimationFrame(this.raf);
        document.removeEventListener("visibilitychange", this.handleVisibility);
        this.resizeObserver?.disconnect();
        try {
            this.world.stop();
        } catch {
            // ignore errors from user scripts during teardown
        }
        this.input.detach();
        this.audio.dispose();
        this.overlay.dispose();
        this.renderer.dispose();
        this.root.remove();
    }
}
