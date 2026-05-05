import type { MindmapDocument, ProjectedNode } from "../types/mindmap";
import { buildHierarchy } from "./hierarchy";

export type Direction = "up" | "down" | "left" | "right";

export function findNearestNodeInDirection(args: {
  fromNodeId: string;
  nodes: ProjectedNode[];
  direction: Direction;
}): string | null {
  const from = args.nodes.find((node) => node.id === args.fromNodeId);
  if (!from) return null;

  const fromCx = from.projectedX + from.displayWidth / 2;
  const fromCy = from.projectedY + from.displayHeight / 2;

  let bestId: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const node of args.nodes) {
    if (node.id === from.id) continue;

    const cx = node.projectedX + node.displayWidth / 2;
    const cy = node.projectedY + node.displayHeight / 2;

    const dx = cx - fromCx;
    const dy = cy - fromCy;

    if (!matchesDirection(dx, dy, args.direction)) continue;

    const distance = Math.sqrt(dx * dx + dy * dy);
    const anglePenalty = getAnglePenalty(dx, dy, args.direction);
    const score = distance + anglePenalty * 200;

    if (score < bestScore) {
      bestScore = score;
      bestId = node.id;
    }
  }

  return bestId;
}

function matchesDirection(dx: number, dy: number, direction: Direction): boolean {
  switch (direction) {
    case "left":
      return dx < 0 && Math.abs(dx) >= Math.abs(dy) * 0.35;
    case "right":
      return dx > 0 && Math.abs(dx) >= Math.abs(dy) * 0.35;
    case "up":
      return dy < 0 && Math.abs(dy) >= Math.abs(dx) * 0.35;
    case "down":
      return dy > 0 && Math.abs(dy) >= Math.abs(dx) * 0.35;
  }
}

function getAnglePenalty(dx: number, dy: number, direction: Direction): number {
  if (direction === "left" || direction === "right") {
    return Math.abs(dy) / (Math.abs(dx) + 1);
  }

  return Math.abs(dx) / (Math.abs(dy) + 1);
}

export function findRootNodeId(doc: MindmapDocument): string | undefined {
  return buildHierarchy(doc).rootId;
}
