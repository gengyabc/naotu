import type { ProjectedEdge, ProjectedNode, Rect } from "../types/mindmap";
import type { SemanticMindmapSettings } from "../types/settings";

export interface CulledProjection {
  nodes: ProjectedNode[];
  edges: ProjectedEdge[];
}

export function cullProjectionToViewport(
  nodes: ProjectedNode[],
  edges: ProjectedEdge[],
  viewportWorldRect: Rect,
  padding = 1200,
): CulledProjection {
  const visibleNodeIds = new Set<string>();
  const padded: Rect = {
    x: viewportWorldRect.x - padding,
    y: viewportWorldRect.y - padding,
    width: viewportWorldRect.width + padding * 2,
    height: viewportWorldRect.height + padding * 2,
  };

  const visibleNodes = nodes.filter((node) => {
    const visible = rectIntersects(
      {
        x: node.projectedX,
        y: node.projectedY,
        width: node.displayWidth,
        height: node.displayHeight,
      },
      padded,
    );
    if (visible) visibleNodeIds.add(node.id);
    return visible;
  });

  const visibleEdges = edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target));
  return { nodes: visibleNodes, edges: visibleEdges };
}

export function shouldCullProjection(nodeCount: number, settings: Pick<SemanticMindmapSettings, "enableViewportCulling" | "cullingNodeThreshold">): boolean {
  return settings.enableViewportCulling && nodeCount > settings.cullingNodeThreshold;
}

function rectIntersects(a: Rect, b: Rect): boolean {
  return !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y);
}
