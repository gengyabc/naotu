import type { ProjectedEdge, ProjectedNode } from "../types/mindmap";

export interface RenderPartition {
  canvasNodes: ProjectedNode[];
  canvasEdges: ProjectedEdge[];
  svgNodes: ProjectedNode[];
  svgEdges: ProjectedEdge[];
}

export function partitionForHybridRender(nodes: ProjectedNode[], edges: ProjectedEdge[]): RenderPartition {
  const svgNodeIds = new Set<string>();
  const canvasNodeIds = new Set<string>();

  for (const node of nodes) {
    if (node.isSelected || node.isHovered || node.isFocus || node.isAncestorPath || node.detailLevel >= 2 || node.kind === "notebook") {
      svgNodeIds.add(node.id);
    } else {
      canvasNodeIds.add(node.id);
    }
  }

  const svgNodes = nodes.filter((node) => svgNodeIds.has(node.id));
  const canvasNodes = nodes.filter((node) => canvasNodeIds.has(node.id));
  const svgEdges = edges.filter((edge) => svgNodeIds.has(edge.source) || svgNodeIds.has(edge.target));
  const canvasEdges = edges.filter((edge) => canvasNodeIds.has(edge.source) && canvasNodeIds.has(edge.target));

  return { canvasNodes, canvasEdges, svgNodes, svgEdges };
}
