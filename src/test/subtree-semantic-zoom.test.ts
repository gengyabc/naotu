import { describe, expect, it } from "vitest";

import { planSubtreeSemanticZoom } from "../core/subtree-semantic-zoom";
import type { MindmapDocument } from "../types/mindmap";

function createDoc(): MindmapDocument {
  return {
    version: 1,
    title: "Test",
    layoutMode: "tree-mirror",
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      { id: "root", kind: "text", title: "Root", x: 0, y: 0, width: 180, height: 56, treeControl: "manual-expanded" },
      { id: "child-a", kind: "text", title: "Child A", x: 0, y: 0, width: 180, height: 56, treeControl: "auto" },
      { id: "child-b", kind: "text", title: "Child B", x: 0, y: 0, width: 180, height: 56, treeControl: "auto" },
      { id: "grandchild-a", kind: "text", title: "Grandchild A", x: 0, y: 0, width: 180, height: 56, treeControl: "auto" },
      { id: "grandchild-b", kind: "text", title: "Grandchild B", x: 0, y: 0, width: 180, height: 56, treeControl: "auto" },
      { id: "great-grandchild", kind: "text", title: "Great Grandchild", x: 0, y: 0, width: 180, height: 56, treeControl: "auto" },
    ],
    edges: [
      { id: "e1", source: "root", target: "child-a", relation: "mindmap", type: "curve" },
      { id: "e2", source: "root", target: "child-b", relation: "mindmap", type: "curve" },
      { id: "e3", source: "child-a", target: "grandchild-a", relation: "mindmap", type: "curve" },
      { id: "e4", source: "child-b", target: "grandchild-b", relation: "mindmap", type: "curve" },
      { id: "e5", source: "grandchild-a", target: "great-grandchild", relation: "mindmap", type: "curve" },
    ],
  };
}

describe("planSubtreeSemanticZoom", () => {
  it("expands the newly reached depth bucket", () => {
    const plan = planSubtreeSemanticZoom({
      doc: createDoc(),
      rootId: "child-a",
      currentVirtualZoom: 0.65,
      projectionZoom: 0.65,
      factor: 1.2,
    });

    expect(plan?.previousVisibleDepth).toBe(1);
    expect(plan?.nextVisibleDepth).toBe(2);
    expect([...((plan?.controls ?? new Map()).entries())]).toEqual([
      ["child-a", "manual-expanded"],
      ["grandchild-a", "manual-expanded"],
    ]);
  });

  it("collapses the target depth and all deeper descendants", () => {
    const plan = planSubtreeSemanticZoom({
      doc: createDoc(),
      rootId: "root",
      currentVirtualZoom: 0.8,
      projectionZoom: 1,
      factor: 1 / 1.2,
    });

    expect(plan?.previousVisibleDepth).toBe(3);
    expect(plan?.nextVisibleDepth).toBe(2);
    expect(new Map(plan?.controls)).toEqual(
      new Map([
        ["root", "manual-expanded"],
        ["child-a", "manual-expanded"],
        ["child-b", "manual-expanded"],
        ["grandchild-a", "manual-collapsed"],
      ]),
    );
  });

  it("limits a single zoom input to three depth steps", () => {
    const plan = planSubtreeSemanticZoom({
      doc: createDoc(),
      rootId: "root",
      currentVirtualZoom: 0.2,
      projectionZoom: 0.2,
      factor: 20,
    });

    expect(plan?.previousVisibleDepth).toBe(1);
    expect(plan?.nextVisibleDepth).toBe(3);
    expect(new Set(plan?.controls.keys())).toEqual(new Set(["root", "child-a", "child-b", "grandchild-a"]));
  });

  it("returns an empty control patch for leaf selections", () => {
    const plan = planSubtreeSemanticZoom({
      doc: createDoc(),
      rootId: "great-grandchild",
      currentVirtualZoom: 1,
      projectionZoom: 1,
      factor: 1.2,
    });

    expect(plan?.controls.size).toBe(0);
    expect(plan?.nextVisibleDepth).toBe(0);
  });

  it("terminates on cyclic tree edges", () => {
    const doc = createDoc();
    doc.edges.push({ id: "e6", source: "great-grandchild", target: "root", relation: "mindmap", type: "curve" });

    const plan = planSubtreeSemanticZoom({
      doc,
      rootId: "root",
      currentVirtualZoom: 0.8,
      projectionZoom: 0.8,
      factor: 1.2,
    });

    expect(plan).not.toBeNull();
    expect(plan?.nextVisibleDepth).toBeGreaterThanOrEqual(0);
  });

  it("uses the current projection visibility as the starting depth", () => {
    const doc = createDoc();
    const childA = doc.nodes.find((node) => node.id === "child-a");
    if (!childA) throw new Error("missing child-a");
    childA.treeControl = "manual-collapsed";

    const plan = planSubtreeSemanticZoom({
      doc,
      rootId: "root",
      currentVirtualZoom: 1.4,
      projectionZoom: 1,
      factor: 0.2,
    });

    expect(plan?.previousVisibleDepth).toBe(1);
    expect(plan?.nextVisibleDepth).toBe(0);
    expect(new Set(plan?.controls.keys())).toEqual(new Set(["root", "child-a", "child-b", "grandchild-a"]));
  });

  it("can collapse the selected node's direct children by writing the selected node control", () => {
    const plan = planSubtreeSemanticZoom({
      doc: createDoc(),
      rootId: "root",
      currentVirtualZoom: 0.8,
      projectionZoom: 0.8,
      factor: 0.2,
    });

    expect(plan?.nextVisibleDepth).toBe(0);
    expect(plan?.controls.get("root")).toBe("manual-collapsed");
  });
});
