import type { ProjectedNode } from "../types/mindmap";
import { overlapVector, projectedNodeRect, rectsOverlap } from "./layout-collision";

export interface RelaxProjectionOptions {
  iterations?: number;
  pushStrength?: number;
  maxMovePerIteration?: number;
}

export function relaxProjectedNodes(nodes: ProjectedNode[], options: RelaxProjectionOptions = {}): ProjectedNode[] {
  const iterations = options.iterations ?? 4;
  const pushStrength = options.pushStrength ?? 28;
  const maxMove = options.maxMovePerIteration ?? 48;
  const next = nodes.map((node) => ({ ...node }));

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < next.length; i++) {
      for (let j = i + 1; j < next.length; j++) {
        const a = next[i];
        const b = next[j];
        if (!rectsOverlap(projectedNodeRect(a), projectedNodeRect(b), 12)) continue;

        const aFixed = a.isFocus || a.isSelected;
        const bFixed = b.isFocus || b.isSelected;
        if (aFixed && bFixed) continue;

        const direction = overlapVector(projectedNodeRect(a), projectedNodeRect(b));
        const moveX = Math.max(-maxMove, Math.min(maxMove, direction.x * pushStrength));
        const moveY = Math.max(-maxMove, Math.min(maxMove, direction.y * pushStrength));

        if (aFixed) {
          b.projectedX -= moveX;
          b.projectedY -= moveY;
          continue;
        }

        if (bFixed) {
          a.projectedX += moveX;
          a.projectedY += moveY;
          continue;
        }

        a.projectedX += moveX / 2;
        a.projectedY += moveY / 2;
        b.projectedX -= moveX / 2;
        b.projectedY -= moveY / 2;
      }
    }
  }

  return next;
}
