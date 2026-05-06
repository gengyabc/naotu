import { describe, expect, it } from "vitest";
import { routeEdge } from "../core/edge-routing";
import { worldToScreen } from "../core/screen-transform";
import type { ProjectedEdge, ProjectedNode } from "../types/mindmap";

function toScreenNode(node: ProjectedNode, transform: { x: number; y: number; k: number }): ProjectedNode {
  const screen = worldToScreen({ x: node.projectedX, y: node.projectedY }, transform);
  return { ...node, projectedX: screen.x, projectedY: screen.y };
}

describe("projected edge rendering", () => {
  it("keeps edge anchors aligned with fixed-size nodes after zoom", () => {
    const source: ProjectedNode = {
      id: "source",
      sourceNodeId: "source",
      kind: "text",
      title: "Source",
      worldX: 0,
      worldY: 0,
      projectedX: 10,
      projectedY: 20,
      displayWidth: 180,
      displayHeight: 56,
      detailLevel: 3,
      isRoot: false,
      isFocus: false,
      isSelected: false,
      isHovered: false,
      isAncestorPath: false,
      hasChildren: false,
      childrenExpanded: false,
      showNotebookExpandButton: false,
    };
    const target: ProjectedNode = {
      ...source,
      id: "target",
      sourceNodeId: "target",
      title: "Target",
      projectedX: 260,
      projectedY: 20,
    };
    const edge: ProjectedEdge = { id: "edge", source: "source", target: "target", relation: "mindmap", type: "curve" };
    const transform = { x: 35, y: 12, k: 1.7 };

    const screenRoute = routeEdge({ edge, source: toScreenNode(source, transform), target: toScreenNode(target, transform) }).d;
    const legacyRoute = routeEdge({ edge, source, target }).d;

    const screenSourceLeft = worldToScreen({ x: source.projectedX, y: source.projectedY }, transform).x;
    const expectedAnchorX = screenSourceLeft + source.displayWidth;
    expect(screenRoute).toContain(`M ${expectedAnchorX} `);

    const legacyAnchorX = (source.projectedX + source.displayWidth) * transform.k + transform.x;
    expect(legacyAnchorX).not.toBe(expectedAnchorX);
    expect(legacyRoute).not.toBe(screenRoute);
  });
});
