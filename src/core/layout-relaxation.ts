import type { ProjectedNode } from "../types/mindmap";
import { overlapVector, projectedNodeRect, rectsOverlap } from "./layout-collision";

export interface RelaxProjectionOptions {
  zoom?: number;
  iterations?: number;
  pushStrength?: number;
  maxMovePerIteration?: number;
}

export function relaxProjectedNodes(nodes: ProjectedNode[], options: RelaxProjectionOptions = {}): ProjectedNode[] {
  const zoom = Math.max(options.zoom ?? 1, 0.001);
  const iterations = options.iterations ?? 4;
  const pushStrength = options.pushStrength ?? 28;
  const maxMove = options.maxMovePerIteration ?? 48;
  const next = nodes.map((node) => ({ ...node }));

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < next.length; i++) {
      for (let j = i + 1; j < next.length; j++) {
        const a = next[i];
        const b = next[j];
        const aRect = projectedNodeScreenRect(a, zoom);
        const bRect = projectedNodeScreenRect(b, zoom);
        if (!rectsOverlap(aRect, bRect, 12)) continue;

        const aFixed = a.isFocus || a.isSelected;
        const bFixed = b.isFocus || b.isSelected;
        if (aFixed && bFixed) continue;

        const direction = overlapVector(aRect, bRect);
        const moveX = Math.max(-maxMove, Math.min(maxMove, direction.x * pushStrength));
        const moveY = Math.max(-maxMove, Math.min(maxMove, direction.y * pushStrength));
        const worldMoveX = moveX / zoom;
        const worldMoveY = moveY / zoom;

        if (aFixed) {
          b.projectedX -= worldMoveX;
          b.projectedY -= worldMoveY;
          continue;
        }

        if (bFixed) {
          a.projectedX += worldMoveX;
          a.projectedY += worldMoveY;
          continue;
        }

        a.projectedX += worldMoveX / 2;
        a.projectedY += worldMoveY / 2;
        b.projectedX -= worldMoveX / 2;
        b.projectedY -= worldMoveY / 2;
      }
    }
  }

  return next;
}

function projectedNodeScreenRect(node: ProjectedNode, zoom: number) {
  return projectedNodeRect({
    ...node,
    projectedX: node.projectedX * zoom,
    projectedY: node.projectedY * zoom,
  });
}
