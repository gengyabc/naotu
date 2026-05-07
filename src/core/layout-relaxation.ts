import type { ProjectedNode } from "../types/mindmap";
import { overlapVector, projectedNodeRect, rectsOverlap } from "./layout-collision";

export interface RelaxProjectionOptions {
  zoom?: number;
  iterations?: number;
  pushStrength?: number;
  maxMovePerIteration?: number;
  settleUntilNoOverlap?: boolean;
  maxSettlePasses?: number;
  overlapPadding?: number;
}

export function relaxProjectedNodes(nodes: ProjectedNode[], options: RelaxProjectionOptions = {}): ProjectedNode[] {
  const zoom = Math.max(options.zoom ?? 1, 0.001);
  const iterations = options.iterations ?? 4;
  const pushStrength = options.pushStrength ?? 28;
  const maxMove = options.maxMovePerIteration ?? 48;
  const settleUntilNoOverlap = options.settleUntilNoOverlap ?? false;
  const maxSettlePasses = options.maxSettlePasses ?? 0;
  const overlapPadding = options.overlapPadding ?? 12;
  const next = nodes.map((node) => ({ ...node }));

  for (let iter = 0; iter < iterations; iter++) {
    resolveOverlaps(next, { zoom, pushStrength, maxMove, overlapPadding });
  }

  if (settleUntilNoOverlap) {
    for (let pass = 0; pass < maxSettlePasses; pass++) {
      if (!hasAnyOverlap(next, zoom, overlapPadding)) break;
      const moved = resolveOverlaps(next, { zoom, pushStrength, maxMove, overlapPadding });
      if (!moved) break;
    }
  }

  return next;
}

function resolveOverlaps(
  nodes: ProjectedNode[],
  options: { zoom: number; pushStrength: number; maxMove: number; overlapPadding: number },
): boolean {
  let moved = false;

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const aRect = projectedNodeScreenRect(a, options.zoom);
      const bRect = projectedNodeScreenRect(b, options.zoom);
      if (!rectsOverlap(aRect, bRect, options.overlapPadding)) continue;

      const aExpandedNotebook = isExpandedNotebook(a);
      const bExpandedNotebook = isExpandedNotebook(b);
      const aFixed = a.isFocus || a.isSelected;
      const bFixed = b.isFocus || b.isSelected;
      if (!aExpandedNotebook && !bExpandedNotebook && aFixed && bFixed) continue;

      const direction = overlapVector(aRect, bRect);
      const moveX = Math.max(-options.maxMove, Math.min(options.maxMove, direction.x * options.pushStrength));
      const moveY = Math.max(-options.maxMove, Math.min(options.maxMove, direction.y * options.pushStrength));
      const worldMoveX = moveX / options.zoom;
      const worldMoveY = moveY / options.zoom;

      if (aExpandedNotebook && !bExpandedNotebook) {
        b.projectedX -= worldMoveX;
        b.projectedY -= worldMoveY;
        moved = true;
        continue;
      }

      if (!aExpandedNotebook && bExpandedNotebook) {
        a.projectedX += worldMoveX;
        a.projectedY += worldMoveY;
        moved = true;
        continue;
      }

      if (aExpandedNotebook && bExpandedNotebook) {
        if (aFixed && !bFixed) {
          b.projectedX -= worldMoveX;
          b.projectedY -= worldMoveY;
          moved = true;
          continue;
        }

        if (!aFixed && bFixed) {
          a.projectedX += worldMoveX;
          a.projectedY += worldMoveY;
          moved = true;
          continue;
        }

        a.projectedX += worldMoveX / 2;
        a.projectedY += worldMoveY / 2;
        b.projectedX -= worldMoveX / 2;
        b.projectedY -= worldMoveY / 2;
        moved = true;
        continue;
      }

      if (aFixed) {
        b.projectedX -= worldMoveX;
        b.projectedY -= worldMoveY;
        moved = true;
        continue;
      }

      if (bFixed) {
        a.projectedX += worldMoveX;
        a.projectedY += worldMoveY;
        moved = true;
        continue;
      }

      a.projectedX += worldMoveX / 2;
      a.projectedY += worldMoveY / 2;
      b.projectedX -= worldMoveX / 2;
      b.projectedY -= worldMoveY / 2;
      moved = true;
    }
  }

  return moved;
}

function isExpandedNotebook(node: ProjectedNode): boolean {
  return node.kind === "notebook";
}

function hasAnyOverlap(nodes: ProjectedNode[], zoom: number, padding: number): boolean {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const aRect = projectedNodeScreenRect(nodes[i], zoom);
      const bRect = projectedNodeScreenRect(nodes[j], zoom);
      if (rectsOverlap(aRect, bRect, padding)) return true;
    }
  }

  return false;
}

function projectedNodeScreenRect(node: ProjectedNode, zoom: number) {
  return projectedNodeRect({
    ...node,
    projectedX: node.projectedX * zoom,
    projectedY: node.projectedY * zoom,
  });
}
