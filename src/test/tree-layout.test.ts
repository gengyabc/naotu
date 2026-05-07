import { describe, expect, it } from "vitest";
import { TreeLayoutEngine } from "../core/tree-layout";
import { nodeWorldRect } from "../core/geometry";
import { createSmallTestDocument } from "./test-fixtures";

describe("TreeLayoutEngine", () => {
  it("puts root at origin in tree-right and children on right", () => {
    const doc = createSmallTestDocument();
    const next = new TreeLayoutEngine().layout(doc, { mode: "tree-right", horizontalSpacing: 220, verticalSpacing: 80 }, "root");
    const root = next.nodes.find((n) => n.id === "root");
    const child = next.nodes.find((n) => n.id === "child");
    expect(root?.x).toBe(0);
    expect(root?.y).toBe(0);
    expect((child?.x ?? 0) > 0).toBe(true);
  });

  it("handles cyclic mindmap edges without throwing", () => {
    const doc = createSmallTestDocument();
    doc.edges.push({ id: "edge2", source: "child", target: "root", relation: "mindmap", type: "curve" });
    expect(() =>
      new TreeLayoutEngine().layout(doc, { mode: "tree-mirror", horizontalSpacing: 220, verticalSpacing: 80 }, "root"),
    ).not.toThrow();
  });

  it("separates custom-sized parent and child horizontally", () => {
    const doc = createSmallTestDocument();
    doc.nodes[0] = {
      ...doc.nodes[0]!,
      kind: "notebook",
      customWidth: 420,
      customHeight: 240,
      notebook: { link: "[[Root]]", path: "notes/root.md", targetType: "file" },
    };
    doc.nodes[1] = {
      ...doc.nodes[1]!,
      kind: "notebook",
      customWidth: 320,
      customHeight: 220,
      notebook: { link: "[[Child]]", path: "notes/child.md", targetType: "file" },
    };

    const next = new TreeLayoutEngine().layout(doc, { mode: "tree-right", horizontalSpacing: 220, verticalSpacing: 80 }, "root");
    const root = next.nodes.find((node) => node.id === "root");
    const child = next.nodes.find((node) => node.id === "child");

    expect(root).toBeDefined();
    expect(child).toBeDefined();

    const rootRect = nodeWorldRect(root!);
    const childRect = nodeWorldRect(child!);
    expect(childRect.x).toBeGreaterThanOrEqual(rootRect.x + rootRect.width + 220);
  });

  it("separates custom-sized sibling subtrees vertically after adding nodes", () => {
    const doc = createSmallTestDocument();
    doc.nodes[1] = {
      ...doc.nodes[1]!,
      kind: "notebook",
      customWidth: 360,
      customHeight: 260,
      notebook: { link: "[[Child]]", path: "notes/child.md", targetType: "file" },
    };
    doc.nodes.push({
      id: "child2",
      kind: "notebook",
      title: "Child2",
      x: 0,
      y: 0,
      width: 180,
      height: 56,
      customWidth: 340,
      customHeight: 240,
      treeControl: "auto",
      notebook: { link: "[[Child2]]", path: "notes/child2.md", targetType: "file" },
    });
    doc.edges.push({ id: "edge2", source: "root", target: "child2", relation: "mindmap", type: "curve" });

    const next = new TreeLayoutEngine().layout(doc, { mode: "tree-right", horizontalSpacing: 220, verticalSpacing: 80 }, "root");
    const child = next.nodes.find((node) => node.id === "child");
    const child2 = next.nodes.find((node) => node.id === "child2");

    expect(child).toBeDefined();
    expect(child2).toBeDefined();

    const firstRect = nodeWorldRect(child!);
    const secondRect = nodeWorldRect(child2!);
    expect(secondRect.y).toBeGreaterThanOrEqual(firstRect.y + firstRect.height + 80);
  });
});
