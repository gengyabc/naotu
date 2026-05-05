import type { ProjectedNode, Rect } from "../types/mindmap";

export function projectedNodeRect(node: ProjectedNode): Rect {
  return {
    x: node.projectedX,
    y: node.projectedY,
    width: node.displayWidth,
    height: node.displayHeight,
  };
}

export function rectsOverlap(a: Rect, b: Rect, padding = 12): boolean {
  return !(a.x + a.width + padding < b.x || b.x + b.width + padding < a.x || a.y + a.height + padding < b.y || b.y + b.height + padding < a.y);
}

export function overlapVector(a: Rect, b: Rect): { x: number; y: number } {
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  const dx = ax - bx || 1;
  const dy = ay - by || 1;
  const length = Math.sqrt(dx * dx + dy * dy);
  return { x: dx / length, y: dy / length };
}
