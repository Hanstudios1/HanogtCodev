import { createEngineId } from "./ids";

export interface HistoryEntry<T> {
  id: string;
  label: string;
  before: T;
  after: T;
  committedAt: string;
}

export interface CommandHistoryOptions<T> {
  capacity?: number;
  clone?: (value: T) => T;
  equals?: (left: T, right: T) => boolean;
}

type HistoryListener<T> = (state: T, history: CommandHistory<T>) => void;

function defaultClone<T>(value: T): T {
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function defaultEquals<T>(left: T, right: T): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Snapshot based command history for deterministic editor undo/redo. */
export class CommandHistory<T> {
  private current: T;
  private readonly capacity: number;
  private readonly cloneValue: (value: T) => T;
  private readonly equals: (left: T, right: T) => boolean;
  private readonly undoEntries: HistoryEntry<T>[] = [];
  private readonly redoEntries: HistoryEntry<T>[] = [];
  private readonly listeners = new Set<HistoryListener<T>>();

  constructor(initialState: T, options: CommandHistoryOptions<T> = {}) {
    this.capacity = Math.max(1, Math.min(options.capacity ?? 100, 1_000));
    this.cloneValue = options.clone ?? defaultClone;
    this.equals = options.equals ?? defaultEquals;
    this.current = this.cloneValue(initialState);
  }

  get state(): T {
    return this.cloneValue(this.current);
  }

  get canUndo(): boolean {
    return this.undoEntries.length > 0;
  }

  get canRedo(): boolean {
    return this.redoEntries.length > 0;
  }

  get undoLabel(): string | null {
    return this.undoEntries.at(-1)?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.redoEntries.at(-1)?.label ?? null;
  }

  execute(label: string, updater: (draft: T) => T | void): T {
    const before = this.cloneValue(this.current);
    const draft = this.cloneValue(this.current);
    const result = updater(draft);
    const after = this.cloneValue(result === undefined ? draft : result);
    this.commit(label, after, before);
    return this.state;
  }

  commit(label: string, nextState: T, knownBefore?: T): boolean {
    const before = this.cloneValue(knownBefore ?? this.current);
    const after = this.cloneValue(nextState);
    if (this.equals(before, after)) return false;
    this.undoEntries.push({
      id: createEngineId("command"),
      label: label.trim().slice(0, 120) || "Değişiklik",
      before,
      after: this.cloneValue(after),
      committedAt: new Date().toISOString(),
    });
    if (this.undoEntries.length > this.capacity) this.undoEntries.shift();
    this.redoEntries.length = 0;
    this.current = after;
    this.emit();
    return true;
  }

  replace(nextState: T, clearHistory = false): void {
    this.current = this.cloneValue(nextState);
    if (clearHistory) this.clear(false);
    this.emit();
  }

  undo(): T | null {
    const entry = this.undoEntries.pop();
    if (!entry) return null;
    this.redoEntries.push(entry);
    this.current = this.cloneValue(entry.before);
    this.emit();
    return this.state;
  }

  redo(): T | null {
    const entry = this.redoEntries.pop();
    if (!entry) return null;
    this.undoEntries.push(entry);
    this.current = this.cloneValue(entry.after);
    this.emit();
    return this.state;
  }

  clear(notify = true): void {
    this.undoEntries.length = 0;
    this.redoEntries.length = 0;
    if (notify) this.emit();
  }

  subscribe(listener: HistoryListener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snapshot = this.state;
    for (const listener of this.listeners) listener(snapshot, this);
  }
}
