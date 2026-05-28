import { describe, expect, it, vi } from "vitest";
import { MindmapTreeActions, isTreeLayoutMode } from "../view/mindmap-tree-actions";
import type { MindmapDocument, MindmapNode, ProjectedNode } from "../types/mindmap";
import { createSmallTestDocument } from "./test-fixtures";

function createProjectedNode(args: {
  id: string;
  title: string;
  hasChildren?: boolean;
  childrenExpanded?: boolean;
}): ProjectedNode {
  return {
    id: args.id,
    sourceNodeId: args.id,
    kind: "text",
    title: args.title,
    worldX: 0,
    worldY: 0,
    projectedX: 0,
    projectedY: 0,
    displayWidth: 180,
    displayHeight: 56,
    detailLevel: 3,
    depth: args.id === "root" ? 0 : 1,
    isRoot: args.id === "root",
    isFocus: false,
    isSelected: false,
    isHovered: false,
    isAncestorPath: false,
    hasChildren: args.hasChildren ?? false,
    childrenExpanded: args.childrenExpanded ?? true,
    showOpenNotebookButton: false,
    showResizeHandle: false,
    usesCustomSize: false,
  };
}

function createHarness(args: { document?: MindmapDocument } = {}) {
  const document = args.document ?? createSmallTestDocument();
  let currentDoc = structuredClone(document);
  const appliedChanges: Array<{ type: string; doc?: MindmapDocument }> = [];
  let subtreeZoomStateCleared = false;

  const options = {
    getDocument: () => currentDoc,
    replaceDocument: vi.fn((doc: MindmapDocument) => {
      currentDoc = doc;
    }),
    applyReplacedDocument: vi.fn((doc: MindmapDocument, options?: { commitHistory?: boolean }) => {
      appliedChanges.push({ type: "replace", doc });
      currentDoc = doc;
    }),
    applyDocumentChange: vi.fn((mutator: () => void, options?: { relayout?: boolean }) => {
      mutator();
      appliedChanges.push({ type: "change" });
    }),
    commitHistory: vi.fn(),
    collapseTreeNode: vi.fn((id: string) => {
      const node = currentDoc.nodes.find((n) => n.id === id);
      if (node) node.treeControl = "manual-collapsed";
    }),
    setTreeControl: vi.fn((id: string, control: "manual-expanded" | "manual-collapsed") => {
      const node = currentDoc.nodes.find((n) => n.id === id);
      if (node) node.treeControl = control;
    }),
    getSelectedNodeIds: vi.fn(() => ["child"]),
    getLayoutHorizontalSpacing: vi.fn(() => 220),
    getLayoutVerticalSpacing: vi.fn(() => 80),
    clearSubtreeVirtualZoomState: vi.fn(() => {
      subtreeZoomStateCleared = true;
    }),
  };

  const actions = new MindmapTreeActions(options);

  return {
    actions,
    options,
    getDocument: () => currentDoc,
    getAppliedChanges: () => appliedChanges,
    wasSubtreeZoomStateCleared: () => subtreeZoomStateCleared,
    setDocument: (doc: MindmapDocument) => { currentDoc = doc; },
  };
}

describe("MindmapTreeActions", () => {
  describe("isTreeLayoutMode", () => {
    it("returns true for tree-mirror and tree-right modes", () => {
      expect(isTreeLayoutMode("tree-mirror")).toBe(true);
      expect(isTreeLayoutMode("tree-right")).toBe(true);
      expect(isTreeLayoutMode("free")).toBe(false);
    });
  });

  describe("relayoutDocument", () => {
    it("returns unchanged document for free layout mode", () => {
      const doc = createSmallTestDocument();
      doc.layoutMode = "free";
      const harness = createHarness({ document: doc });

      const result = harness.actions.relayoutDocument(doc);
      expect(result.nodes[0]?.x).toBe(0);
      expect(result.nodes[1]?.x).toBe(200);
    });

    it("repositions nodes in tree-right mode", () => {
      const doc = createSmallTestDocument();
      doc.layoutMode = "free";
      const harness = createHarness({ document: doc });

      const result = harness.actions.relayoutDocument(structuredClone({ ...doc, layoutMode: "tree-right" }));
      expect(result.layoutMode).toBe("tree-right");
      expect(result.nodes[1]?.x).toBeGreaterThan(doc.nodes[0]!.x);
    });
  });

  describe("applyTreeLayoutMode", () => {
    it("switches layout mode and clears subtree zoom state", () => {
      const doc = createSmallTestDocument();
      const harness = createHarness({ document: doc });

      harness.actions.applyTreeLayoutMode("tree-right");

      expect(harness.wasSubtreeZoomStateCleared()).toBe(true);
      expect(harness.options.applyReplacedDocument).toHaveBeenCalled();
      expect(harness.getDocument().layoutMode).toBe("tree-right");
    });
  });

  describe("addChildNode", () => {
    it("creates child node under selected parent", () => {
      const doc = createSmallTestDocument();
      const harness = createHarness({ document: doc });

      const child = harness.actions.addChildNode("root");

      expect(child).not.toBeNull();
      expect(child?.kind).toBe("text");
      expect(harness.getDocument().nodes.length).toBe(3);
      const newEdges = harness.getDocument().edges.filter((e) => e.target === child?.id);
      expect(newEdges.length).toBe(1);
      expect(newEdges[0]?.source).toBe("root");
    });

    it("returns null if selected node not found", () => {
      const doc = createSmallTestDocument();
      const harness = createHarness({ document: doc });

      const child = harness.actions.addChildNode("nonexistent");
      expect(child).toBeNull();
    });
  });

  describe("addSiblingNode", () => {
    it("creates sibling node after selected node", () => {
      const doc = createSmallTestDocument();
      const harness = createHarness({ document: doc });

      const sibling = harness.actions.addSiblingNode("child");

      expect(sibling).not.toBeNull();
      expect(sibling?.kind).toBe("text");
      expect(harness.getDocument().nodes.length).toBe(3);
      const newEdges = harness.getDocument().edges.filter((e) => e.target === sibling?.id);
      expect(newEdges.length).toBe(1);
      expect(newEdges[0]?.source).toBe("root");
    });

    it("returns null if selected node not found", () => {
      const doc = createSmallTestDocument();
      const harness = createHarness({ document: doc });

      const sibling = harness.actions.addSiblingNode("nonexistent");
      expect(sibling).toBeNull();
    });
  });

  describe("toggleSelectedTree", () => {
    it("expands collapsed node when projected shows collapsed", () => {
      const doc = createSmallTestDocument();
      const root = doc.nodes.find((n) => n.id === "root");
      if (root) root.treeControl = "manual-collapsed";
      const harness = createHarness({ document: doc });

      const projectedNodes = [
        createProjectedNode({ id: "root", title: "Root", hasChildren: true, childrenExpanded: false }),
      ];

      harness.actions.toggleSelectedTree("root", projectedNodes);

      expect(harness.options.setTreeControl).toHaveBeenCalledWith("root", "manual-expanded");
      expect(harness.wasSubtreeZoomStateCleared()).toBe(true);
    });

    it("collapses expanded node when projected shows expanded", () => {
      const doc = createSmallTestDocument();
      const root = doc.nodes.find((n) => n.id === "root");
      if (root) root.treeControl = "manual-expanded";
      const harness = createHarness({ document: doc });

      const projectedNodes = [
        createProjectedNode({ id: "root", title: "Root", hasChildren: true, childrenExpanded: true }),
      ];

      harness.actions.toggleSelectedTree("root", projectedNodes);

      expect(harness.options.collapseTreeNode).toHaveBeenCalledWith("root");
    });

    it("collapses from current state when projected node not available", () => {
      const doc = createSmallTestDocument();
      const harness = createHarness({ document: doc });

      harness.actions.toggleSelectedTree("root", undefined);

      expect(harness.options.collapseTreeNode).toHaveBeenCalledWith("root");
    });

    it("expands from current state when projected node not available", () => {
      const doc = createSmallTestDocument();
      const root = doc.nodes.find((n) => n.id === "root");
      if (root) root.treeControl = "manual-collapsed";
      const harness = createHarness({ document: doc });

      harness.actions.toggleSelectedTree("root", undefined);

      expect(harness.options.setTreeControl).toHaveBeenCalledWith("root", "manual-expanded");
    });
  });

  describe("resolveTreeDrop", () => {
    it("allows reparenting onto an ancestor", () => {
      const doc = createSmallTestDocument();
      doc.layoutMode = "tree-right";
      doc.nodes.push({
        id: "grandchild",
        kind: "text",
        title: "Grandchild",
        x: 440,
        y: 120,
        width: 180,
        height: 56,
        treeControl: "auto",
      });
      doc.edges.push({ id: "edge2", source: "child", target: "grandchild", relation: "mindmap", type: "curve" });

      const draggingNode = doc.nodes.find((n) => n.id === "grandchild");
      if (draggingNode) {
        draggingNode.x = 0;
        draggingNode.y = 0;
      }

      const harness = createHarness({ document: doc });

      const action = harness.actions.resolveTreeDrop("grandchild");
      expect(action).toEqual({ type: "reparent", newParentId: "root", targetIndex: 1 });
    });

    it("returns reparent action when dropped on different node", () => {
      const doc = createSmallTestDocument();
      doc.nodes.push({
        id: "target",
        kind: "text",
        title: "Target",
        x: 400,
        y: 100,
        width: 180,
        height: 56,
        treeControl: "auto",
      });
      const draggingNode = doc.nodes.find((n) => n.id === "child");
      if (draggingNode) {
        draggingNode.x = 400;
        draggingNode.y = 100;
      }
      const harness = createHarness({ document: doc });

      const action = harness.actions.resolveTreeDrop("child");
      expect(action?.type).toBe("reparent");
      expect(action?.newParentId).toBe("target");
    });

    it("returns reorder action when dropped among siblings", () => {
      const doc = createSmallTestDocument();
      doc.layoutMode = "tree-right";
      const rootNode = doc.nodes.find((n) => n.id === "root")!;
      rootNode.x = 0;
      rootNode.y = 0;
      const childNode = doc.nodes.find((n) => n.id === "child")!;
      childNode.x = 220;
      childNode.y = 0;
      doc.nodes.push({
        id: "child2",
        kind: "text",
        title: "Child2",
        x: 220,
        y: 80,
        width: 180,
        height: 56,
        treeControl: "auto",
      });
      doc.edges.push({ id: "edge2", source: "root", target: "child2", relation: "mindmap", type: "curve" });
      const draggingNode = doc.nodes.find((n) => n.id === "child")!;
      draggingNode.y = 40;
      const harness = createHarness({ document: doc });

      const action = harness.actions.resolveTreeDrop("child");
      expect(action?.type).toBe("reorder");
      expect(action?.newParentId).toBe("root");
    });

    it("returns null when node not moved significantly", () => {
      const doc = createSmallTestDocument();
      const harness = createHarness({ document: doc });

      const action = harness.actions.resolveTreeDrop("nonexistent");
      expect(action).toBeNull();
    });
  });

  describe("applyTreeDrop", () => {
    it("applies reparent when moved to different parent", () => {
      const doc = createSmallTestDocument();
      doc.nodes.push({
        id: "target",
        kind: "text",
        title: "Target",
        x: 400,
        y: 100,
        width: 180,
        height: 56,
        treeControl: "auto",
      });
      const draggingNode = doc.nodes.find((n) => n.id === "child");
      const originalX = draggingNode?.x ?? 0;
      const originalY = draggingNode?.y ?? 0;
      if (draggingNode) {
        draggingNode.x = 400;
        draggingNode.y = 100;
      }
      const harness = createHarness({ document: doc });

      harness.actions.applyTreeDrop("child", originalX, originalY, 400, 100);

      expect(harness.options.applyReplacedDocument).toHaveBeenCalled();
    });

    it("skips if node not moved", () => {
      const doc = createSmallTestDocument();
      const harness = createHarness({ document: doc });

      harness.actions.applyTreeDrop("child", 200, 0, 200, 0);

      expect(harness.options.applyReplacedDocument).not.toHaveBeenCalled();
    });
  });

  describe("applyBranchReconnect", () => {
    it("reconnects multiple selected roots under a new parent in free layout", () => {
      const doc = createSmallTestDocument();
      doc.layoutMode = "free";
      doc.nodes.push(
        { id: "child2", kind: "text", title: "Child2", x: 200, y: 80, width: 180, height: 56, treeControl: "auto" },
        { id: "target", kind: "text", title: "Target", x: 400, y: 0, width: 180, height: 56, treeControl: "auto" },
      );
      doc.edges.push(
        { id: "edge2", source: "root", target: "child2", relation: "mindmap", type: "curve" },
        { id: "edge3", source: "root", target: "target", relation: "mindmap", type: "curve" },
      );
      const harness = createHarness({ document: doc });

      harness.actions.applyBranchReconnect({ draggedNodeId: "child", selectedIds: ["child", "child2"], newParentId: "target" });

      const next = harness.getDocument();
      expect(next.edges.filter((edge) => edge.source === "target" && edge.relation === "mindmap").map((edge) => edge.target)).toEqual(["child", "child2"]);
    });
  });

  describe("handleLayoutSettingsChanged", () => {
    it("relayouts document in tree mode", () => {
      const doc = createSmallTestDocument();
      doc.layoutMode = "tree-right";
      const harness = createHarness({ document: doc });

      harness.actions.handleLayoutSettingsChanged();

      expect(harness.wasSubtreeZoomStateCleared()).toBe(true);
      expect(harness.options.applyReplacedDocument).toHaveBeenCalled();
    });

    it("skips in free layout mode", () => {
      const doc = createSmallTestDocument();
      doc.layoutMode = "free";
      const harness = createHarness({ document: doc });

      harness.actions.handleLayoutSettingsChanged();

      expect(harness.options.applyReplacedDocument).not.toHaveBeenCalled();
    });
  });
});
