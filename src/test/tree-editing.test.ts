import { describe, expect, it } from "vitest";
import { buildHierarchy } from "../core/hierarchy";
import {
  addChildMindmapNode,
  addSiblingMindmapNode,
  createTextNodeNearParent,
  expandDraggedNodeMoves,
  getSubtreeNodeIds,
  moveMindmapNode,
  resolveDraggedNodeIds,
} from "../core/tree-editing";
import { createSmallTestDocument } from "./test-fixtures";

describe("tree editing", () => {
  it("can reorder among siblings", () => {
    const doc = createSmallTestDocument();
    doc.nodes.push({ id: "child2", kind: "text", title: "Child2", x: 0, y: 0, width: 180, height: 56, treeControl: "auto" });
    doc.edges.push({ id: "edge2", source: "root", target: "child2", relation: "mindmap", type: "curve" });
    const next = moveMindmapNode(doc, { nodeId: "child2", newParentId: "root", targetIndex: 0 });
    expect(buildHierarchy(next).childrenById.get("root")).toEqual(["child2", "child"]);
  });

  it("keeps root unmoved", () => {
    const doc = createSmallTestDocument();
    const next = moveMindmapNode(doc, { nodeId: "root", newParentId: "child", targetIndex: 0 });
    expect(next).toEqual(doc);
  });

  it("does not allow moving a node under itself", () => {
    const doc = createSmallTestDocument();
    const next = moveMindmapNode(doc, { nodeId: "child", newParentId: "child", targetIndex: 0 });
    expect(next).toEqual(doc);
  });

  it("does not allow moving a node under its descendant", () => {
    const doc = createSmallTestDocument();
    doc.nodes.push({ id: "grandchild", kind: "text", title: "Grandchild", x: 0, y: 0, width: 180, height: 56, treeControl: "auto" });
    doc.edges.push({ id: "edge2", source: "child", target: "grandchild", relation: "mindmap", type: "curve" });

    const next = moveMindmapNode(doc, { nodeId: "child", newParentId: "grandchild", targetIndex: 0 });
    expect(buildHierarchy(next).childrenById.get("root")).toEqual(["child"]);
    expect(buildHierarchy(next).childrenById.get("child")).toEqual(["grandchild"]);
  });

  it("adds a child with exactly one incoming mindmap edge", () => {
    const doc = createSmallTestDocument();
    const next = addChildMindmapNode(doc, "child", {
      id: "grandchild",
      kind: "text",
      title: "Grandchild",
      x: 0,
      y: 0,
      width: 180,
      height: 56,
      treeControl: "auto",
    });

    const incoming = next.edges.filter((edge) => edge.relation === "mindmap" && edge.target === "grandchild");
    expect(incoming).toHaveLength(1);
    expect(incoming[0]?.source).toBe("child");
  });

  it("creates new child nodes expanded by default", () => {
    const doc = createSmallTestDocument();
    const child = createTextNodeNearParent(doc.nodes[1]!);

    expect(child.treeControl).toBe("manual-expanded");
  });

  it("adds a sibling immediately after the selected node", () => {
    const doc = createSmallTestDocument();
    doc.nodes.push({ id: "child2", kind: "text", title: "Child2", x: 0, y: 0, width: 180, height: 56, treeControl: "auto" });
    doc.edges.push({ id: "edge2", source: "root", target: "child2", relation: "mindmap", type: "curve" });

    const next = addSiblingMindmapNode(doc, "child", {
      id: "sibling",
      kind: "text",
      title: "Sibling",
      x: 0,
      y: 0,
      width: 180,
      height: 56,
      treeControl: "auto",
    });

    expect(buildHierarchy(next).childrenById.get("root")).toEqual(["child", "sibling", "child2"]);
  });

  it("collects the full subtree for free-layout dragging", () => {
    const doc = createSmallTestDocument();
    doc.nodes.push({ id: "grandchild", kind: "text", title: "Grandchild", x: 0, y: 0, width: 180, height: 56, treeControl: "auto" });
    doc.edges.push({ id: "edge2", source: "child", target: "grandchild", relation: "mindmap", type: "curve" });

    expect(getSubtreeNodeIds(doc, "child")).toEqual(["child", "grandchild"]);
    expect(resolveDraggedNodeIds(doc, "child", [])).toEqual(["child", "grandchild"]);
  });

  it("deduplicates descendant selections when dragging multiple selected roots", () => {
    const doc = createSmallTestDocument();
    doc.nodes.push({ id: "grandchild", kind: "text", title: "Grandchild", x: 0, y: 0, width: 180, height: 56, treeControl: "auto" });
    doc.edges.push({ id: "edge2", source: "child", target: "grandchild", relation: "mindmap", type: "curve" });

    expect(resolveDraggedNodeIds(doc, "child", ["child", "grandchild"])).toEqual(["child", "grandchild"]);
  });

  it("keeps leaf dragging scoped to the leaf node", () => {
    const doc = createSmallTestDocument();
    expect(resolveDraggedNodeIds(doc, "child", [])).toEqual(["child"]);
  });

  it("expands visible drag moves to hidden subtree nodes with the same delta", () => {
    const doc = createSmallTestDocument();
    doc.nodes.push({ id: "grandchild", kind: "text", title: "Grandchild", x: 320, y: 40, width: 180, height: 56, treeControl: "auto" });
    doc.edges.push({ id: "edge2", source: "child", target: "grandchild", relation: "mindmap", type: "curve" });

    expect(expandDraggedNodeMoves(doc, {
      draggedNodeId: "child",
      selectedIds: ["child"],
      moves: [{ id: "child", x: 240, y: 20 }],
    })).toEqual([
      { id: "child", x: 240, y: 20 },
      { id: "grandchild", x: 360, y: 60 },
    ]);
  });
});
