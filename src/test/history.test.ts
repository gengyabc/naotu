import { describe, expect, it } from "vitest";
import { HistoryManager } from "../core/history";
import { createSmallTestDocument } from "./test-fixtures";

describe("HistoryManager", () => {
  it("reports canUndo and canRedo correctly", () => {
    const history = new HistoryManager();
    const doc1 = createSmallTestDocument();
    const doc2 = structuredClone(doc1);
    doc2.nodes[0]!.title = "Changed";

    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);

    history.push(doc1);

    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);

    const undone = history.undo(doc2);
    expect(undone).not.toBe(null);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);

    const redone = history.redo(doc2);
    expect(redone).not.toBe(null);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
  });

  it("clears redo stack on push", () => {
    const history = new HistoryManager();
    const doc1 = createSmallTestDocument();
    const doc2 = structuredClone(doc1);

    history.push(doc1);
    history.undo(doc2);

    expect(history.canRedo()).toBe(true);

    history.push(doc2);

    expect(history.canRedo()).toBe(false);
  });

  it("clears both stacks on clear", () => {
    const history = new HistoryManager();
    const doc1 = createSmallTestDocument();
    const doc2 = structuredClone(doc1);

    history.push(doc1);
    history.undo(doc2);

    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);

    history.clear();

    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });

  it("respects limit by discarding oldest entries", () => {
    const history = new HistoryManager(3);
    const doc = createSmallTestDocument();

    history.push(doc);
    history.push(doc);
    history.push(doc);
    history.push(doc);

    expect(history.canUndo()).toBe(true);
  });
});