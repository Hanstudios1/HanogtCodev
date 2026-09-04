export interface SelectionSnapshot {
  ids: readonly string[];
  activeId: string | null;
}

type SelectionListener = (selection: SelectionSnapshot) => void;

export class SelectionManager {
  private selected = new Set<string>();
  private active: string | null = null;
  private readonly listeners = new Set<SelectionListener>();

  get snapshot(): SelectionSnapshot {
    return { ids: [...this.selected], activeId: this.active };
  }

  get size(): number {
    return this.selected.size;
  }

  has(id: string): boolean {
    return this.selected.has(id);
  }

  select(id: string, additive = false): void {
    if (!additive) this.selected.clear();
    this.selected.add(id);
    this.active = id;
    this.emit();
  }

  toggle(id: string): void {
    if (this.selected.has(id)) {
      this.selected.delete(id);
      if (this.active === id) this.active = [...this.selected].at(-1) ?? null;
    } else {
      this.selected.add(id);
      this.active = id;
    }
    this.emit();
  }

  set(ids: Iterable<string>, activeId?: string | null): void {
    this.selected = new Set([...ids].filter(Boolean));
    const requestedActive = activeId === undefined ? [...this.selected].at(-1) ?? null : activeId;
    this.active = requestedActive && this.selected.has(requestedActive) ? requestedActive : null;
    this.emit();
  }

  remove(id: string): void {
    if (!this.selected.delete(id)) return;
    if (this.active === id) this.active = [...this.selected].at(-1) ?? null;
    this.emit();
  }

  retain(existingIds: Iterable<string>): void {
    const existing = new Set(existingIds);
    const next = [...this.selected].filter((id) => existing.has(id));
    if (next.length === this.selected.size) return;
    this.selected = new Set(next);
    if (this.active && !this.selected.has(this.active)) this.active = next.at(-1) ?? null;
    this.emit();
  }

  clear(): void {
    if (this.selected.size === 0 && this.active === null) return;
    this.selected.clear();
    this.active = null;
    this.emit();
  }

  subscribe(listener: SelectionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
