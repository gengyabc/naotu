import { describe, expect, it } from "vitest";
import { cullProjectionToViewport, shouldCullProjection } from "../core/viewport-culling";
import type { ProjectedNode } from "../types/mindmap";

describe("shouldCullProjection", () => {
  it("respects the feature toggle", () => {
    expect(shouldCullProjection(1000, { enableViewportCulling: false, cullingNodeThreshold: 1 })).toBe(false);
  });

  it("uses the configured threshold", () => {
    expect(shouldCullProjection(500, { enableViewportCulling: true, cullingNodeThreshold: 500 })).toBe(false);
    expect(shouldCullProjection(501, { enableViewportCulling: true, cullingNodeThreshold: 500 })).toBe(true);
  });

  it("culls using screen-space rects after semantic zoom projection", () => {
    const visibleNode: ProjectedNode = {
      id: "visible",
      sourceNodeId: "visible",
      kind: "text",
      title: "Visible",
      worldX: 0,
      worldY: 0,
      projectedX: 20,
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
      showOpenNotebookButton: false,
      showResizeHandle: false,
      usesCustomSize: false,
    };
    const offscreenNode: ProjectedNode = {
      ...visibleNode,
      id: "offscreen",
      sourceNodeId: "offscreen",
      title: "Offscreen",
      projectedX: 400,
      projectedY: 20,
    };

    const result = cullProjectionToViewport(
      [visibleNode, offscreenNode],
      [
        { id: "edge1", source: "visible", target: "offscreen", relation: "mindmap", type: "curve" },
      ],
      { x: 0, y: 0, width: 240, height: 120 },
      { x: 0, y: 0, k: 1 },
      0,
    );

    expect(result.nodes.map((node) => node.id)).toEqual(["visible"]);
    expect(result.edges).toEqual([]);
  });
});
