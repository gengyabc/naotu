import type { MindmapNode, ProjectedNode, Rect } from "../types/mindmap";
import { getStoredNodeSize } from "./notebook-size";

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
  const size = getStoredNodeSize(node);
  return {
    x: node.x - size.width / 2,
    y: node.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

export function projectedNodeWorldRect(node: ProjectedNode, zoom: number): Rect {
  return {
    x: node.worldX - node.displayWidth / (2 * zoom),
    y: node.worldY - node.displayHeight / (2 * zoom),
    width: node.displayWidth / zoom,
    height: node.displayHeight / zoom,
  };
}
