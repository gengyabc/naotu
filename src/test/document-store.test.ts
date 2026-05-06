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
      layoutMode: "tree-mirror",
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [],
      edges: [],
    });
    const changedOnDisk = JSON.stringify({
      version: 1,
      title: "Changed elsewhere",
      layoutMode: "tree-mirror",
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
      layoutMode: "tree-mirror",
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [],
      edges: [],
    });

    await expect(store.save()).rejects.toThrow("脑图文件已在外部修改");
    expect(modify).not.toHaveBeenCalled();
  });

  it("updates custom notebook size fields", () => {
    const store = new MindmapDocumentStore({
      vault: {},
    } as never);

    store.replaceDocument({
      version: 1,
      title: "Edited here",
      layoutMode: "tree-mirror",
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "node-1",
          kind: "notebook",
          title: "Notebook",
          x: 0,
          y: 0,
          width: 180,
          height: 56,
          treeControl: "auto",
        },
      ],
      edges: [],
    });

    store.updateNodeSize("node-1", 480, 260);

    expect(store.getDocument().nodes[0]).toMatchObject({
      customWidth: 480,
      customHeight: 260,
    });
  });
});
