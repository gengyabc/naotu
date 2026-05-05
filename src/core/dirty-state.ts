export type DirtyState = "saved" | "dirty" | "saving" | "error";

export class DirtyStateManager {
  private state: DirtyState = "saved";
  private listeners = new Set<(state: DirtyState) => void>();

  getState(): DirtyState {
    return this.state;
  }

  setState(state: DirtyState): void {
    if (this.state === state) return;
    this.state = state;

    for (const listener of this.listeners) {
      listener(state);
    }
  }

  subscribe(listener: (state: DirtyState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
