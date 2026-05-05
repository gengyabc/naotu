import type { ProjectedEdge, ProjectedNode } from "../types/mindmap";

export interface EdgeRoute {
  d: string;
}

export function routeEdge(args: {
  edge: ProjectedEdge;
  source: ProjectedNode;
  target: ProjectedNode;
}): EdgeRoute {
  if (args.edge.relation === "reference") {
    return routeReferenceEdge(args.source, args.target);
  }

  return routeMindmapEdge(args.source, args.target);
}

function routeMindmapEdge(source: ProjectedNode, target: ProjectedNode): EdgeRoute {
  const s = getAnchorPoint(source, target);
  const t = getAnchorPoint(target, source);

  const dx = t.x - s.x;
  const curvature = Math.min(160, Math.max(60, Math.abs(dx) * 0.45));

  const c1x = s.x + Math.sign(dx || 1) * curvature;
  const c2x = t.x - Math.sign(dx || 1) * curvature;

  return {
    d: `M ${s.x} ${s.y} C ${c1x} ${s.y}, ${c2x} ${t.y}, ${t.x} ${t.y}`,
  };
}

function routeReferenceEdge(source: ProjectedNode, target: ProjectedNode): EdgeRoute {
  const s = getAnchorPoint(source, target);
  const t = getAnchorPoint(target, source);

  const mx = (s.x + t.x) / 2;
  const my = (s.y + t.y) / 2;

  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;

  const normalX = -dy / length;
  const normalY = dx / length;
  const bend = 40;

  return {
    d: `M ${s.x} ${s.y} Q ${mx + normalX * bend} ${my + normalY * bend}, ${t.x} ${t.y}`,
  };
}

function getAnchorPoint(node: ProjectedNode, toward: ProjectedNode): { x: number; y: number } {
  const cx = node.projectedX + node.displayWidth / 2;
  const cy = node.projectedY + node.displayHeight / 2;

  const tx = toward.projectedX + toward.displayWidth / 2;
  const ty = toward.projectedY + toward.displayHeight / 2;

  const dx = tx - cx;
  const dy = ty - cy;

  if (Math.abs(dx) > Math.abs(dy)) {
    return {
      x: dx > 0 ? node.projectedX + node.displayWidth : node.projectedX,
      y: cy,
    };
  }

  return {
    x: cx,
    y: dy > 0 ? node.projectedY + node.displayHeight : node.projectedY,
  };
}
