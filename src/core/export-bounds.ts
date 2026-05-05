import type { ProjectedNode, Rect } from "../types/mindmap";

export function computeProjectionBounds(nodes: ProjectedNode[], padding = 120): Rect {
  if (nodes.length === 0) {
    return { x: 0, y: 0, width: 800, height: 600 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of nodes) {
    minX = Math.min(minX, node.projectedX);
    minY = Math.min(minY, node.projectedY);
    maxX = Math.max(maxX, node.projectedX + node.displayWidth);
    maxY = Math.max(maxY, node.projectedY + node.displayHeight);
  }

  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}
