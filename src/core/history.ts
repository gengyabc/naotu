import type { MindmapDocument } from "../types/mindmap";

export class HistoryManager {
  private undoStack: MindmapDocument[] = [];
  private redoStack: MindmapDocument[] = [];

  constructor(private limit = 80) {}

  push(doc: MindmapDocument): void {
    this.undoStack.push(structuredClone(doc));

    if (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }

    this.redoStack = [];
  }

  undo(current: MindmapDocument): MindmapDocument | null {
    const previous = this.undoStack.pop();
    if (!previous) return null;

    this.redoStack.push(structuredClone(current));
    return structuredClone(previous);
  }

  redo(current: MindmapDocument): MindmapDocument | null {
    const next = this.redoStack.pop();
    if (!next) return null;

    this.undoStack.push(structuredClone(current));
    return structuredClone(next);
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
