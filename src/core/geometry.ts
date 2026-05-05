import type { MindmapNode, Rect } from "../types/mindmap";

export function normalizeRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

export function rectIntersects(a: Rect, b: Rect): boolean {
  return !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y);
}

export function nodeWorldRect(node: MindmapNode): Rect {
  return {
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  };
}
