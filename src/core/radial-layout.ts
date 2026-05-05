import type { MindmapDocument, MindmapNode } from "../types/mindmap";
import { buildHierarchy } from "./hierarchy";

export class RadialLayoutEngine {
  layout(doc: MindmapDocument, rootNodeId?: string): MindmapDocument {
    const next = structuredClone(doc);
    const hierarchy = buildHierarchy(next);
    const rootId = rootNodeId ?? hierarchy.rootId;
    if (!rootId) return next;

    const nodeMap = new Map(next.nodes.map((node) => [node.id, node]));
    const subtreeWeights = computeSubtreeWeights(rootId, hierarchy.childrenById);
    const root = nodeMap.get(rootId);
    if (!root) return next;

    root.x = 0;
    root.y = 0;

    this.layoutChildrenWeighted({
      nodeId: rootId,
      nodeMap,
      childrenById: hierarchy.childrenById,
      subtreeWeights,
      depth: 1,
      startAngle: 0,
      endAngle: Math.PI * 2,
      radialSpacing: 300,
      visited: new Set<string>(),
    });

    next.layoutMode = "radial";
    return next;
  }

  private layoutChildrenWeighted(args: {
    nodeId: string;
    nodeMap: Map<string, MindmapNode>;
    childrenById: Map<string, string[]>;
    subtreeWeights: Map<string, number>;
    depth: number;
    startAngle: number;
    endAngle: number;
    radialSpacing: number;
    visited: Set<string>;
  }): void {
    if (args.visited.has(args.nodeId)) return;
    args.visited.add(args.nodeId);

    const children = args.childrenById.get(args.nodeId) ?? [];
    if (children.length === 0) return;

    const totalWeight = children.reduce((sum, id) => sum + (args.subtreeWeights.get(id) ?? 1), 0);
    const span = normalizeAngleSpan(args.startAngle, args.endAngle);
    let cursor = args.startAngle;

    for (const childId of children) {
      const node = args.nodeMap.get(childId);
      if (!node) continue;

      const weight = args.subtreeWeights.get(childId) ?? 1;
      const childSpan = span * (weight / totalWeight);
      const angle = cursor + childSpan / 2;
      const radius = args.depth * args.radialSpacing;

      node.x = Math.cos(angle) * radius;
      node.y = Math.sin(angle) * radius;

      const nextSpan = Math.min(Math.PI, Math.max(Math.PI / 8, childSpan));
      this.layoutChildrenWeighted({
        nodeId: childId,
        nodeMap: args.nodeMap,
        childrenById: args.childrenById,
        subtreeWeights: args.subtreeWeights,
        depth: args.depth + 1,
        startAngle: angle - nextSpan / 2,
        endAngle: angle + nextSpan / 2,
        radialSpacing: args.radialSpacing,
        visited: args.visited,
      });

      cursor += childSpan;
    }
  }
}

function computeSubtreeWeights(rootId: string, childrenById: Map<string, string[]>): Map<string, number> {
  const weights = new Map<string, number>();
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(id: string): number {
    if (visiting.has(id) || visited.has(id)) return weights.get(id) ?? 1;
    visiting.add(id);
    const children = childrenById.get(id) ?? [];
    let weight = 1;
    for (const child of children) weight += dfs(child);
    visiting.delete(id);
    visited.add(id);
    weights.set(id, weight);
    return weight;
  }

  dfs(rootId);
  return weights;
}

function normalizeAngleSpan(start: number, end: number): number {
  let span = end - start;
  while (span <= 0) span += Math.PI * 2;
  return span;
}
