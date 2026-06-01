import { describe, expect, it } from "vitest";
import { partitionForHybridRender } from "../core/render-partition";
import type { ProjectedEdge, ProjectedNode } from "../types/mindmap";

function createNode(overrides: Partial<ProjectedNode>): ProjectedNode {
  return {
    id: "node",
    sourceNodeId: "node",
    kind: "text",
    title: "Node",
    worldX: 0,
    worldY: 0,
    projectedX: 0,
    projectedY: 0,
    displayWidth: 180,
    displayHeight: 56,
    detailLevel: 0,
    depth: 2,
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
    ...overrides,
  };
}

describe("partitionForHybridRender", () => {
  it("keeps low-detail text nodes in canvas so hybrid mode can offload them", () => {
    const textNode = createNode({ id: "text-low", detailLevel: 0, kind: "text", depth: 2 });
    const notebookNode = createNode({ id: "notebook", kind: "notebook", detailLevel: 0, notebook: { link: "[[Doc]]", targetType: "file", targetKind: "markdown" } });
    const edge: ProjectedEdge = {
      id: "edge-1",
      source: textNode.id,
      target: notebookNode.id,
      relation: "mindmap",
      type: "curve",
    };

    const partition = partitionForHybridRender([textNode, notebookNode], [edge]);

    expect(partition.canvasNodes.map((node) => node.id)).toContain(textNode.id);
    expect(partition.svgNodes.map((node) => node.id)).not.toContain(textNode.id);
    expect(partition.svgEdges).toEqual([edge]);
  });
});
