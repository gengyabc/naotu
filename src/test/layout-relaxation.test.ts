import { describe, expect, it } from "vitest";

import { relaxProjectedNodes } from "../core/layout-relaxation";
import type { ProjectedNode } from "../types/mindmap";

function createProjectedNode(id: string, x: number): ProjectedNode {
  return {
    id,
    sourceNodeId: id,
    kind: "text",
    title: id,
    notebook: undefined,
    worldX: x,
    worldY: 0,
    projectedX: x,
    projectedY: 0,
    displayWidth: 180,
    displayHeight: 56,
    detailLevel: 3,
    depth: 1,
    isRoot: false,
    isFocus: false,
    isSelected: false,
    isHovered: false,
    isAncestorPath: false,
    hasChildren: false,
    childrenExpanded: true,
    showOpenNotebookButton: false,
    showResizeHandle: false,
    usesCustomSize: false,
  };
}

describe("layout relaxation", () => {
  it("skips overlap resolution for ignored nodes", () => {
    const nodes = [createProjectedNode("dragged", 0), createProjectedNode("target", 0)];

    const relaxed = relaxProjectedNodes(nodes, { zoom: 1, iterations: 1, pushStrength: 32, ignoredNodeIds: ["dragged"] });

    expect(relaxed.find((node) => node.id === "dragged")?.projectedX).toBe(0);
    expect(relaxed.find((node) => node.id === "target")?.projectedX).toBe(0);
  });
});
