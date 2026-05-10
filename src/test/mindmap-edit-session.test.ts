import { describe, expect, it, vi } from "vitest";

import type { MindmapDocument } from "../types/mindmap";
import { MindmapEditSession } from "../view/mindmap-edit-session";
import { createSmallTestDocument } from "./test-fixtures";

function createStore(doc: MindmapDocument, events: string[]) {
  let current = structuredClone(doc);
  let saveError: unknown = null;

  return {
    getDocument: vi.fn(() => current),
    replaceDocument: vi.fn((next: MindmapDocument) => {
      events.push("replaceDocument");
      current = structuredClone(next);
    }),
    save: vi.fn(async () => {
      events.push("save");
      if (saveError) throw saveError;
    }),
    updateNodeTitle(id: string, title: string) {
      const node = current.nodes.find((item) => item.id === id);
      if (!node) return;
      node.title = title;
      events.push("mutate");
    },
    setSaveError(error: unknown) {
      saveError = error;
    },
  };
}

describe("MindmapEditSession", () => {
  it("applies mutation side effects in stable order", () => {
    const events: string[] = [];
    const store = createStore(createSmallTestDocument(), events);
    const session = new MindmapEditSession(store as never, {
      relayoutDocument: (doc) => {
        events.push("relayout");
        return doc;
      },
      render: () => {
        events.push("render");
      },
      getAutosaveConfig: () => ({ enabled: true, delayMs: 25 }),
    });

    session.applyDocumentChange(() => {
      store.updateNodeTitle("root", "Renamed Root");
    });

    expect(store.getDocument().nodes.find((node) => node.id === "root")?.title).toBe("Renamed Root");
    expect(session.getDirtyState()).toBe("dirty");
    expect(events).toEqual(["mutate", "relayout", "replaceDocument", "render"]);
  });

  it("undoes and redoes replaced documents", () => {
    const events: string[] = [];
    const store = createStore(createSmallTestDocument(), events);
    const session = new MindmapEditSession(store as never, {
      relayoutDocument: (doc) => doc,
      render: () => {},
      getAutosaveConfig: () => ({ enabled: true, delayMs: 25 }),
    });

    const renamed = structuredClone(store.getDocument());
    renamed.nodes[0]!.title = "Renamed Root";

    session.applyReplacedDocument(renamed);
    expect(store.getDocument().nodes[0]?.title).toBe("Renamed Root");

    session.undo();
    expect(store.getDocument().nodes[0]?.title).toBe("Root");

    session.redo();
    expect(store.getDocument().nodes[0]?.title).toBe("Renamed Root");
  });

  it("flushes autosave through the shared save pipeline", async () => {
    vi.useFakeTimers();
    try {
      const events: string[] = [];
      const store = createStore(createSmallTestDocument(), events);
      const session = new MindmapEditSession(store as never, {
        relayoutDocument: (doc) => doc,
        render: () => {},
        getAutosaveConfig: () => ({ enabled: true, delayMs: 25 }),
      });

      session.markDirty();
      session.scheduleAutosave();
      await vi.advanceTimersByTimeAsync(25);

      expect(events).toContain("save");
      expect(session.getDirtyState()).toBe("saved");
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks the session errored and delegates save failures", async () => {
    vi.useFakeTimers();
    try {
      const events: string[] = [];
      const store = createStore(createSmallTestDocument(), events);
      const onSaveError = vi.fn();
      const session = new MindmapEditSession(store as never, {
        relayoutDocument: (doc) => doc,
        render: () => {},
        getAutosaveConfig: () => ({ enabled: true, delayMs: 25 }),
        onSaveError,
      });
      const error = new Error("save failed");
      store.setSaveError(error);

      session.markDirty();
      session.scheduleAutosave();
      await vi.advanceTimersByTimeAsync(25);

      expect(events).toContain("save");
      expect(session.getDirtyState()).toBe("error");
      expect(onSaveError).toHaveBeenCalledWith(error);
    } finally {
      vi.useRealTimers();
    }
  });

  it("notifies history listeners on history changes", () => {
    const events: string[] = [];
    const store = createStore(createSmallTestDocument(), events);
    const session = new MindmapEditSession(store as never, {
      relayoutDocument: (doc) => doc,
      render: () => {},
      getAutosaveConfig: () => ({ enabled: true, delayMs: 25 }),
    });

    const historyEvents: string[] = [];
    const unsubscribe = session.subscribeHistory(() => {
      historyEvents.push("changed");
    });

    session.commitHistory();
    expect(historyEvents).toEqual(["changed"]);
    expect(session.canUndo()).toBe(true);
    expect(session.canRedo()).toBe(false);

    session.undo();
    expect(historyEvents).toEqual(["changed", "changed"]);
    expect(session.canUndo()).toBe(false);
    expect(session.canRedo()).toBe(true);

    session.redo();
    expect(historyEvents).toEqual(["changed", "changed", "changed"]);
    expect(session.canUndo()).toBe(true);
    expect(session.canRedo()).toBe(false);

    session.clearHistory();
    expect(historyEvents).toEqual(["changed", "changed", "changed", "changed"]);
    expect(session.canUndo()).toBe(false);
    expect(session.canRedo()).toBe(false);

    unsubscribe();
    session.commitHistory();
    expect(historyEvents).toEqual(["changed", "changed", "changed", "changed"]);
  });
});
