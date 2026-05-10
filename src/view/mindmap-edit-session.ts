import { DebouncedAutosave } from "../core/autosave";
import { DirtyStateManager, type DirtyState } from "../core/dirty-state";
import { HistoryManager } from "../core/history";
import type { MindmapDocument } from "../types/mindmap";

type DocumentChangeOptions = {
  commitHistory?: boolean;
  relayout?: boolean;
  render?: boolean;
  autosave?: boolean;
};

type ReplacedDocumentOptions = {
  commitHistory?: boolean;
  render?: boolean;
  autosave?: boolean;
};

type MindmapSessionDocumentStore = {
  getDocument(): MindmapDocument;
  replaceDocument(doc: MindmapDocument): void;
  save(): Promise<void>;
};

type MindmapEditSessionOptions = {
  relayoutDocument: (doc: MindmapDocument) => MindmapDocument;
  render: () => void;
  getAutosaveConfig: () => { enabled: boolean; delayMs: number };
  onSaveError?: (error: unknown) => void;
};

export class MindmapEditSession {
  private autosave: DebouncedAutosave;
  private history = new HistoryManager();
  private dirtyState = new DirtyStateManager();
  private historyListeners = new Set<() => void>();

  constructor(
    private store: MindmapSessionDocumentStore,
    private options: MindmapEditSessionOptions,
  ) {
    this.autosave = new DebouncedAutosave(async () => {
      try {
        this.dirtyState.setState("saving");
        await this.store.save();
        this.dirtyState.setState("saved");
      } catch (error) {
        this.dirtyState.setState("error");
        this.options.onSaveError?.(error);
      }
    }, () => this.options.getAutosaveConfig());
  }

  getDirtyState(): DirtyState {
    return this.dirtyState.getState();
  }

  setDirtyState(state: DirtyState): void {
    this.dirtyState.setState(state);
  }

  subscribeDirtyState(listener: (state: DirtyState) => void): () => void {
    return this.dirtyState.subscribe(listener);
  }

  subscribeHistory(listener: () => void): () => void {
    this.historyListeners.add(listener);
    return () => this.historyListeners.delete(listener);
  }

  private notifyHistoryListeners(): void {
    for (const listener of this.historyListeners) listener();
  }

  clearHistory(): void {
    this.history.clear();
    this.notifyHistoryListeners();
  }

  commitHistory(): void {
    this.history.push(this.store.getDocument());
    this.notifyHistoryListeners();
  }

  markDirty(): void {
    this.dirtyState.setState("dirty");
  }

  scheduleAutosave(): void {
    this.autosave.schedule();
  }

  async flushAutosave(): Promise<void> {
    await this.autosave.flush();
  }

  undo(): void {
    const previous = this.history.undo(this.store.getDocument());
    if (!previous) return;
    this.applyReplacedDocument(this.options.relayoutDocument(previous), { commitHistory: false });
    this.notifyHistoryListeners();
  }

  redo(): void {
    const next = this.history.redo(this.store.getDocument());
    if (!next) return;
    this.applyReplacedDocument(this.options.relayoutDocument(next), { commitHistory: false });
    this.notifyHistoryListeners();
  }

  canUndo(): boolean {
    return this.history.canUndo();
  }

  canRedo(): boolean {
    return this.history.canRedo();
  }

  applyDocumentChange(mutator: () => void, options?: DocumentChangeOptions): void {
    if (options?.commitHistory !== false) this.commitHistory();
    mutator();
    if (options?.relayout !== false) {
      const next = this.options.relayoutDocument(structuredClone(this.store.getDocument()));
      this.store.replaceDocument(next);
    }
    if (options?.render !== false) this.options.render();
    if (options?.autosave !== false) {
      this.markDirty();
      this.scheduleAutosave();
    }
  }

  applyReplacedDocument(doc: MindmapDocument, options?: ReplacedDocumentOptions): void {
    if (options?.commitHistory !== false) this.commitHistory();
    this.store.replaceDocument(doc);
    if (options?.render !== false) this.options.render();
    if (options?.autosave !== false) {
      this.markDirty();
      this.scheduleAutosave();
    }
  }
}
