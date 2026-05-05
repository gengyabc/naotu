import type { MindmapDocument, MindmapNode } from "../types/mindmap";
import { buildHierarchy } from "./hierarchy";

export class RadialLayoutEngine {
  layout(doc: MindmapDocument, rootNodeId?: string): MindmapDocument {
    const next = structuredClone(doc);
    const hierarchy = buildHierarchy(next);
    const rootId = rootNodeId ?? hierarchy.rootId;
    if (!rootId) return next;

    const nodeMap = new Map(next.nodes.map((node) => [node.id, node]));
    const root = nodeMap.get(rootId);
    if (!root) return next;

    root.x = 0;
    root.y = 0;

    this.layoutChildren({
      nodeId: rootId,
      nodeMap,
      childrenById: hierarchy.childrenById,
      depth: 1,
      startAngle: 0,
      endAngle: Math.PI * 2,
      radialSpacing: 280,
    });

    next.layoutMode = "radial";
    return next;
  }

  private layoutChildren(args: {
    nodeId: string;
    nodeMap: Map<string, MindmapNode>;
    childrenById: Map<string, string[]>;
    depth: number;
    startAngle: number;
    endAngle: number;
    radialSpacing: number;
  }): void {
    const children = args.childrenById.get(args.nodeId) ?? [];
    if (children.length === 0) return;

    const span = normalizeAngleSpan(args.startAngle, args.endAngle);
    children.forEach((childId, index) => {
      const node = args.nodeMap.get(childId);
      if (!node) return;

      const t = children.length === 1 ? 0.5 : index / (children.length - 1);
      const angle = args.startAngle + span * t;
      const radius = args.depth * args.radialSpacing;

      node.x = Math.cos(angle) * radius;
      node.y = Math.sin(angle) * radius;

      const childSpan = Math.min(Math.PI / 2, Math.max(Math.PI / 8, span / Math.max(children.length, 1)));
      this.layoutChildren({
        nodeId: childId,
        nodeMap: args.nodeMap,
        childrenById: args.childrenById,
        depth: args.depth + 1,
        startAngle: angle - childSpan / 2,
        endAngle: angle + childSpan / 2,
        radialSpacing: args.radialSpacing,
      });
    });
  }
}

function normalizeAngleSpan(start: number, end: number): number {
  let span = end - start;
  while (span <= 0) span += Math.PI * 2;
  return span;
}
