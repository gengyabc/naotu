import { worldToScreen } from "./screen-transform";
import type { ViewTransform } from "./screen-transform";
import type { ProjectedEdge, ProjectedNode, Rect } from "../types/mindmap";
import type { SemanticMindmapSettings } from "../types/settings";

export interface CulledProjection {
  nodes: ProjectedNode[];
  edges: ProjectedEdge[];
}

export function cullProjectionToViewport(
  nodes: ProjectedNode[],
  edges: ProjectedEdge[],
  viewportScreenRect: Rect,
  transform: ViewTransform,
  padding = 1200,
): CulledProjection {
  const visibleNodeIds = new Set<string>();
  const padded: Rect = {
    x: viewportScreenRect.x - padding,
    y: viewportScreenRect.y - padding,
    width: viewportScreenRect.width + padding * 2,
    height: viewportScreenRect.height + padding * 2,
  };

  const visibleNodes = nodes.filter((node) => {
    const topLeft = worldToScreen({ x: node.projectedX, y: node.projectedY }, transform);
    const visible = rectIntersects(
      {
        x: topLeft.x,
        y: topLeft.y,
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
