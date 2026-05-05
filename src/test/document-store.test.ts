import { describe, expect, it, vi } from "vitest";

import { MindmapDocumentStore } from "../core/document-store";

describe("MindmapDocumentStore", () => {
  it("does not overwrite the source file after a load failure", async () => {
    const read = vi.fn().mockResolvedValue("{not valid json");
    const modify = vi.fn().mockResolvedValue(undefined);
    const store = new MindmapDocumentStore({
      vault: { read, modify },
    } as never);

    await store.openFile({ path: "broken.mindmap.json" } as never);

    expect(store.getLoadError()).toBeInstanceOf(Error);
    expect(store.canSave()).toBe(false);
    await expect(store.save()).rejects.toBeInstanceOf(Error);
    expect(modify).not.toHaveBeenCalled();
  });

  it("rejects saving when the mindmap file changed on disk after load", async () => {
    const initial = JSON.stringify({
      version: 1,
      title: "Test",
      layoutMode: "radial",
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [],
      edges: [],
    });
    const changedOnDisk = JSON.stringify({
      version: 1,
      title: "Changed elsewhere",
      layoutMode: "radial",
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [],
      edges: [],
    });

    const read = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(changedOnDisk);
    const modify = vi.fn().mockResolvedValue(undefined);
    const store = new MindmapDocumentStore({
      vault: { read, modify },
    } as never);

    await store.openFile({ path: "map.mindmap.json" } as never);
    store.replaceDocument({
      version: 1,
      title: "Edited here",
      layoutMode: "radial",
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [],
      edges: [],
    });

    await expect(store.save()).rejects.toThrow("脑图文件已在外部修改");
    expect(modify).not.toHaveBeenCalled();
  });
});
