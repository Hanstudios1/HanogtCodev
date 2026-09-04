import { stepPhysicsMutable } from "./physics";
import { cloneScene } from "./scene";
import type { EngineMode, SceneDocument, SimulationFrame } from "./types";
import { assertValidScene } from "./validation";

export interface EngineSystemContext {
  scene: SceneDocument;
  deltaTime: number;
  elapsedTime: number;
}

export interface EngineSystem {
  id: string;
  enabled?: boolean;
  update(context: EngineSystemContext): void;
}

type FrameListener = (frame: SimulationFrame) => void;
type ModeListener = (mode: EngineMode) => void;

/**
 * Edit/play isolation for the browser editor. ScriptComponent.source is never
 * evaluated here; systems are trusted functions registered by application code.
 */
export class GameEngineRuntime {
  private editSnapshot: SceneDocument;
  private playSnapshot: SceneDocument | null = null;
  private currentMode: EngineMode = "edit";
  private accumulator = 0;
  private elapsed = 0;
  private readonly systems = new Map<string, EngineSystem>();
  private readonly frameListeners = new Set<FrameListener>();
  private readonly modeListeners = new Set<ModeListener>();

  constructor(scene: SceneDocument) {
    assertValidScene(scene);
    this.editSnapshot = cloneScene(scene);
  }

  get mode(): EngineMode {
    return this.currentMode;
  }

  get scene(): SceneDocument {
    return cloneScene(this.playSnapshot ?? this.editSnapshot);
  }

  get elapsedTime(): number {
    return this.elapsed;
  }

  loadEditScene(scene: SceneDocument): void {
    if (this.currentMode !== "edit") throw new Error("Yeni sahne yüklemeden önce oynatma modunu durdurun.");
    assertValidScene(scene);
    this.editSnapshot = cloneScene(scene);
    this.accumulator = 0;
    this.elapsed = 0;
    this.emitFrame(0, []);
  }

  updateEditScene(updater: (scene: SceneDocument) => SceneDocument | void): SceneDocument {
    if (this.currentMode !== "edit") throw new Error("Düzenleme sahnesi yalnızca edit modunda değiştirilebilir.");
    const draft = cloneScene(this.editSnapshot);
    const result = updater(draft);
    const next = result === undefined ? draft : result;
    assertValidScene(next);
    this.editSnapshot = cloneScene(next);
    this.emitFrame(0, []);
    return this.scene;
  }

  play(): void {
    if (this.currentMode !== "edit") return;
    this.playSnapshot = cloneScene(this.editSnapshot);
    this.accumulator = 0;
    this.elapsed = 0;
    this.setMode("playing");
    this.emitFrame(0, []);
  }

  pause(): void {
    if (this.currentMode === "playing") this.setMode("paused");
  }

  resume(): void {
    if (this.currentMode === "paused") this.setMode("playing");
  }

  stop(): void {
    if (this.currentMode === "edit") return;
    this.playSnapshot = null;
    this.accumulator = 0;
    this.elapsed = 0;
    this.setMode("edit");
    this.emitFrame(0, []);
  }

  /** Explicitly keeps the simulated state; normal stop discards it. */
  applyPlayStateToEdit(): SceneDocument {
    if (!this.playSnapshot) throw new Error("Uygulanacak etkin bir oynatma sahnesi yok.");
    assertValidScene(this.playSnapshot);
    this.editSnapshot = cloneScene(this.playSnapshot);
    this.stop();
    return this.scene;
  }

  step(): SimulationFrame | null {
    if (!this.playSnapshot || this.currentMode === "edit") return null;
    return this.runFixedStep(this.playSnapshot.settings.physics.fixedTimeStep);
  }

  update(frameDelta: number): SimulationFrame | null {
    if (!this.playSnapshot || this.currentMode !== "playing") return null;
    const fixedStep = this.playSnapshot.settings.physics.fixedTimeStep;
    const maxSubSteps = this.playSnapshot.settings.physics.maxSubSteps;
    this.accumulator += Math.min(Math.max(frameDelta, 0), 0.25);
    let subSteps = 0;
    let latest: SimulationFrame | null = null;
    while (this.accumulator >= fixedStep && subSteps < maxSubSteps) {
      latest = this.runFixedStep(fixedStep);
      this.accumulator -= fixedStep;
      subSteps += 1;
    }
    if (subSteps === maxSubSteps) this.accumulator = 0;
    return latest;
  }

  registerSystem(system: EngineSystem): () => void {
    if (!system.id.trim()) throw new Error("Sistem kimliği boş olamaz.");
    if (this.systems.has(system.id)) throw new Error(`Sistem zaten kayıtlı: ${system.id}`);
    this.systems.set(system.id, system);
    return () => this.systems.delete(system.id);
  }

  subscribeFrame(listener: FrameListener): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  subscribeMode(listener: ModeListener): () => void {
    this.modeListeners.add(listener);
    return () => this.modeListeners.delete(listener);
  }

  private runFixedStep(deltaTime: number): SimulationFrame {
    const scene = this.playSnapshot as SceneDocument;
    for (const system of this.systems.values()) {
      if (system.enabled !== false) system.update({ scene, deltaTime, elapsedTime: this.elapsed });
    }
    const { collisions } = stepPhysicsMutable(scene, deltaTime);
    this.elapsed += deltaTime;
    return this.emitFrame(deltaTime, collisions);
  }

  private emitFrame(deltaTime: number, collisions: SimulationFrame["collisions"]): SimulationFrame {
    const frame: SimulationFrame = {
      scene: this.scene,
      mode: this.currentMode,
      deltaTime,
      elapsedTime: this.elapsed,
      collisions,
    };
    for (const listener of this.frameListeners) listener(frame);
    return frame;
  }

  private setMode(mode: EngineMode): void {
    this.currentMode = mode;
    for (const listener of this.modeListeners) listener(mode);
  }
}

export class EngineLoop {
  private running = false;
  private frameHandle: number | ReturnType<typeof setTimeout> | null = null;
  private lastTimestamp = 0;

  constructor(private readonly runtime: GameEngineRuntime) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTimestamp = 0;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.frameHandle === null) return;
    if (typeof globalThis.cancelAnimationFrame === "function" && typeof this.frameHandle === "number") {
      globalThis.cancelAnimationFrame(this.frameHandle);
    } else {
      clearTimeout(this.frameHandle as ReturnType<typeof setTimeout>);
    }
    this.frameHandle = null;
  }

  private schedule(): void {
    const callback = (timestamp: number) => {
      if (!this.running) return;
      const delta = this.lastTimestamp === 0 ? 0 : (timestamp - this.lastTimestamp) / 1000;
      this.lastTimestamp = timestamp;
      this.runtime.update(delta);
      this.schedule();
    };
    if (typeof globalThis.requestAnimationFrame === "function") {
      this.frameHandle = globalThis.requestAnimationFrame(callback);
    } else {
      this.frameHandle = setTimeout(() => callback(Date.now()), 16);
    }
  }
}
