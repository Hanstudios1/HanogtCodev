import { CommandHistory } from "./history";
import { GameEngineRuntime } from "./runtime";
import { cloneScene } from "./scene";
import { SelectionManager, type SelectionSnapshot } from "./selection";
import type { EngineMode, SceneDocument, SimulationFrame } from "./types";
import { assertValidScene } from "./validation";

export interface GameEditorSnapshot {
  scene: SceneDocument;
  mode: EngineMode;
  selection: SelectionSnapshot;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
}

type StoreListener = (snapshot: GameEditorSnapshot) => void;

/** Coordinates editing, selection, history and isolated play mode. */
export class GameEditorStore {
  readonly history: CommandHistory<SceneDocument>;
  readonly selection = new SelectionManager();
  readonly runtime: GameEngineRuntime;
  private readonly listeners = new Set<StoreListener>();
  private readonly cleanup: (() => void)[] = [];

  constructor(scene: SceneDocument, historyCapacity = 100) {
    assertValidScene(scene);
    this.history = new CommandHistory(scene, { capacity: historyCapacity, clone: cloneScene });
    this.runtime = new GameEngineRuntime(scene);
    this.cleanup.push(
      this.history.subscribe((nextScene) => {
        if (this.runtime.mode === "edit") this.runtime.loadEditScene(nextScene);
        this.selection.retain(nextScene.objects.map((object) => object.id));
        this.emit();
      }),
      this.selection.subscribe(() => this.emit()),
      this.runtime.subscribeFrame(() => this.emit()),
      this.runtime.subscribeMode(() => this.emit()),
    );
  }

  get snapshot(): GameEditorSnapshot {
    return {
      scene: this.runtime.scene,
      mode: this.runtime.mode,
      selection: this.selection.snapshot,
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      undoLabel: this.history.undoLabel,
      redoLabel: this.history.redoLabel,
    };
  }

  edit(label: string, updater: (scene: SceneDocument) => SceneDocument | void): SceneDocument {
    if (this.runtime.mode !== "edit") throw new Error("Sahne yalnızca edit modunda düzenlenebilir.");
    const draft = this.history.state;
    const result = updater(draft);
    const next = result === undefined ? draft : result;
    assertValidScene(next);
    this.history.commit(label, next);
    return this.history.state;
  }

  replaceScene(scene: SceneDocument): void {
    if (this.runtime.mode !== "edit") throw new Error("Sahne yalnızca edit modunda değiştirilebilir.");
    assertValidScene(scene);
    this.history.replace(scene, true);
    this.selection.clear();
  }

  undo(): SceneDocument | null {
    if (this.runtime.mode !== "edit") return null;
    return this.history.undo();
  }

  redo(): SceneDocument | null {
    if (this.runtime.mode !== "edit") return null;
    return this.history.redo();
  }

  play(): void {
    this.runtime.play();
  }

  pause(): void {
    this.runtime.pause();
  }

  resume(): void {
    this.runtime.resume();
  }

  stop(): void {
    this.runtime.stop();
  }

  step(): SimulationFrame | null {
    return this.runtime.step();
  }

  update(deltaTime: number): SimulationFrame | null {
    return this.runtime.update(deltaTime);
  }

  applyPlayState(label = "Oynatma değişikliklerini uygula"): SceneDocument {
    if (this.runtime.mode === "edit") throw new Error("Uygulanacak oynatma durumu yok.");
    const before = this.history.state;
    const after = this.runtime.applyPlayStateToEdit();
    this.history.commit(label, after, before);
    return this.history.state;
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    for (const cleanup of this.cleanup.splice(0)) cleanup();
    this.listeners.clear();
  }

  private emit(): void {
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
