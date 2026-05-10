import { describe, expect, it, vi } from "vitest";

import { MindmapDocumentStore } from "../core/document-store";

describe("MindmapDocumentStore", () => {
  it("does not overwrite the source file after a load failure", async () => {
    const read = vi.fn().mockResolvedValue("{not valid json");
    const modify = vi.fn().mockResolvedValue(undefined);
    const store = new MindmapDocumentStore({
      vault: { read, modify },
    } as never);

    await store.openFile({ path: "broken.naotu" } as never);

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

    await store.openFile({ path: "map.naotu" } as never);
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

  it("toggles from the node's current expanded state at the active zoom", () => {
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
          id: "root",
          kind: "text",
          title: "Root",
          x: 0,
          y: 0,
          width: 180,
          height: 56,
          treeControl: "manual-expanded",
        },
        {
          id: "child",
          kind: "text",
          title: "Child",
          x: 220,
          y: 0,
          width: 180,
          height: 56,
          treeControl: "auto",
        },
      ],
      edges: [{ id: "edge-1", source: "root", target: "child", relation: "mindmap", type: "curve" }],
    });

    store.toggleTreeControl("root", 1);
    expect(store.getDocument().nodes[0]?.treeControl).toBe("manual-collapsed");
  });

  it("keeps manual tree controls stable across viewport zoom changes", () => {
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
          id: "root",
          kind: "text",
          title: "Root",
          x: 0,
          y: 0,
          width: 180,
          height: 56,
          treeControl: "manual-expanded",
        },
        {
          id: "child",
          kind: "text",
          title: "Child",
          x: 220,
          y: 0,
          width: 180,
          height: 56,
          treeControl: "manual-collapsed",
        },
      ],
      edges: [{ id: "edge-1", source: "root", target: "child", relation: "mindmap", type: "curve" }],
    });

    store.setViewportAndSyncTreeControls(0, 0, 0.8);
    expect(store.getDocument().nodes[1]?.treeControl).toBe("manual-collapsed");

    store.toggleTreeControl("child", 0.3);
    expect(store.getDocument().nodes[1]?.treeControl).toBe("manual-expanded");

    store.setViewportAndSyncTreeControls(0, 0, 0.3);
    expect(store.getDocument().nodes[1]?.treeControl).toBe("manual-expanded");
  });

  it("deletes node with promote mode - children become siblings", () => {
    const store = new MindmapDocumentStore({
      vault: {},
    } as never);

    store.replaceDocument({
      version: 1,
      title: "Test",
      layoutMode: "free",
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        { id: "root", kind: "text", title: "Root", x: 0, y: 0, width: 100, height: 50, treeControl: "auto" },
        { id: "parent", kind: "text", title: "Parent", x: 100, y: 0, width: 100, height: 50, treeControl: "auto" },
        { id: "child1", kind: "text", title: "Child1", x: 200, y: -50, width: 100, height: 50, treeControl: "auto" },
        { id: "child2", kind: "text", title: "Child2", x: 200, y: 50, width: 100, height: 50, treeControl: "auto" },
      ],
      edges: [
        { id: "e1", source: "root", target: "parent", relation: "mindmap", type: "curve" },
        { id: "e2", source: "parent", target: "child1", relation: "mindmap", type: "curve" },
        { id: "e3", source: "parent", target: "child2", relation: "mindmap", type: "curve" },
      ],
    });

    store.deleteNode("parent", "promote");

    const doc = store.getDocument();
    expect(doc.nodes.map((n) => n.id).sort()).toEqual(["root", "child1", "child2"].sort());
    expect(doc.edges.map((e) => e.source)).toEqual(["root", "root"]);
    expect(doc.edges.map((e) => e.target).sort()).toEqual(["child1", "child2"].sort());
  });

  it("deletes node with recursive mode - children are also deleted", () => {
    const store = new MindmapDocumentStore({
      vault: {},
    } as never);

    store.replaceDocument({
      version: 1,
      title: "Test",
      layoutMode: "free",
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        { id: "root", kind: "text", title: "Root", x: 0, y: 0, width: 100, height: 50, treeControl: "auto" },
        { id: "parent", kind: "text", title: "Parent", x: 100, y: 0, width: 100, height: 50, treeControl: "auto" },
        { id: "child1", kind: "text", title: "Child1", x: 200, y: -50, width: 100, height: 50, treeControl: "auto" },
        { id: "child2", kind: "text", title: "Child2", x: 200, y: 50, width: 100, height: 50, treeControl: "auto" },
      ],
      edges: [
        { id: "e1", source: "root", target: "parent", relation: "mindmap", type: "curve" },
        { id: "e2", source: "parent", target: "child1", relation: "mindmap", type: "curve" },
        { id: "e3", source: "parent", target: "child2", relation: "mindmap", type: "curve" },
      ],
    });

    store.deleteNode("parent", "recursive");

    const doc = store.getDocument();
    expect(doc.nodes.map((n) => n.id)).toEqual(["root"]);
    expect(doc.edges).toEqual([]);
  });

  it("deletes root node children become orphans in promote mode", () => {
    const store = new MindmapDocumentStore({
      vault: {},
    } as never);

    store.replaceDocument({
      version: 1,
      title: "Test",
      layoutMode: "free",
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        { id: "root", kind: "text", title: "Root", x: 0, y: 0, width: 100, height: 50, treeControl: "auto" },
        { id: "child", kind: "text", title: "Child", x: 100, y: 0, width: 100, height: 50, treeControl: "auto" },
      ],
      edges: [{ id: "e1", source: "root", target: "child", relation: "mindmap", type: "curve" }],
    });

    store.deleteNode("root", "promote");

    const doc = store.getDocument();
    expect(doc.nodes.map((n) => n.id)).toEqual(["child"]);
    expect(doc.edges).toEqual([]);
  });
});
