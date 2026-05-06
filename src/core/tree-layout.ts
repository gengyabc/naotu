import type { MindmapDocument, MindmapNode } from "../types/mindmap";
import { buildHierarchy } from "./hierarchy";

export interface TreeLayoutOptions {
  mode: "tree-mirror" | "tree-right";
  horizontalSpacing: number;
  verticalSpacing: number;
}

export class TreeLayoutEngine {
  layout(doc: MindmapDocument, options: TreeLayoutOptions, rootNodeId?: string): MindmapDocument {
    const next = structuredClone(doc);
    const hierarchy = buildHierarchy(next);
    const rootId = rootNodeId ?? hierarchy.rootId;
    if (!rootId) return next;

    const nodeMap = new Map(next.nodes.map((node) => [node.id, node]));
    const root = nodeMap.get(rootId);
    if (!root) return next;

    root.x = 0;
    root.y = 0;

    const weights = computeVisibleSubtreeWeights(rootId, hierarchy.childrenById, nodeMap);
    const rootChildren = hierarchy.childrenById.get(rootId) ?? [];

    if (options.mode === "tree-right") {
      layoutDirectedSubtree({
        parentId: rootId,
        children: rootChildren,
        direction: 1,
        childrenById: hierarchy.childrenById,
        weights,
        nodeMap,
        horizontalSpacing: options.horizontalSpacing,
        verticalSpacing: options.verticalSpacing,
        visiting: new Set<string>(),
      });
    } else {
      const split = splitRootChildrenForMirror(rootChildren, weights);
      layoutDirectedSubtree({
        parentId: rootId,
        children: split.left,
        direction: -1,
        childrenById: hierarchy.childrenById,
        weights,
        nodeMap,
        horizontalSpacing: options.horizontalSpacing,
        verticalSpacing: options.verticalSpacing,
        visiting: new Set<string>(),
      });
      layoutDirectedSubtree({
        parentId: rootId,
        children: split.right,
        direction: 1,
        childrenById: hierarchy.childrenById,
        weights,
        nodeMap,
        horizontalSpacing: options.horizontalSpacing,
        verticalSpacing: options.verticalSpacing,
        visiting: new Set<string>(),
      });
    }

    next.layoutMode = options.mode;
    return next;
  }
}

function computeVisibleSubtreeWeights(
  rootId: string,
  childrenById: Map<string, string[]>,
  nodeMap: Map<string, MindmapNode>,
): Map<string, number> {
  const result = new Map<string, number>();
  const visiting = new Set<string>();

  const dfs = (nodeId: string): number => {
    if (visiting.has(nodeId)) return result.get(nodeId) ?? 1;
    const existing = result.get(nodeId);
    if (existing !== undefined) return existing;

    visiting.add(nodeId);
    const node = nodeMap.get(nodeId);
    if (!node) {
      visiting.delete(nodeId);
      result.set(nodeId, 1);
      return 1;
    }

    if (isCollapsedForLayout(node)) {
      visiting.delete(nodeId);
      result.set(nodeId, 1);
      return 1;
    }

    const children = childrenById.get(nodeId) ?? [];
    if (children.length === 0) {
      visiting.delete(nodeId);
      result.set(nodeId, 1);
      return 1;
    }

    let total = 0;
    for (const childId of children) {
      total += dfs(childId);
    }

    const weight = Math.max(1, total);
    visiting.delete(nodeId);
    result.set(nodeId, weight);
    return weight;
  };

  dfs(rootId);
  return result;
}

function splitRootChildrenForMirror(children: string[], weights: Map<string, number>): { left: string[]; right: string[] } {
  const total = children.reduce((sum, childId) => sum + (weights.get(childId) ?? 1), 0);
  let bestIndex = 0;
  let bestDiff = Number.POSITIVE_INFINITY;
  let prefix = 0;

  for (let i = 0; i <= children.length; i++) {
    const diff = Math.abs(prefix - (total - prefix));
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
    if (i < children.length) prefix += weights.get(children[i] ?? "") ?? 1;
  }

  return {
    left: children.slice(0, bestIndex),
    right: children.slice(bestIndex),
  };
}

function layoutDirectedSubtree(args: {
  parentId: string;
  children: string[];
  direction: -1 | 1;
  childrenById: Map<string, string[]>;
  weights: Map<string, number>;
  nodeMap: Map<string, MindmapNode>;
  horizontalSpacing: number;
  verticalSpacing: number;
  visiting: Set<string>;
}): void {
  if (args.visiting.has(args.parentId)) return;
  args.visiting.add(args.parentId);

  const parent = args.nodeMap.get(args.parentId);
  if (!parent) {
    args.visiting.delete(args.parentId);
    return;
  }

  const totalHeight = args.children.reduce((sum, childId) => sum + (args.weights.get(childId) ?? 1) * args.verticalSpacing, 0);
  let cursorTop = parent.y - totalHeight / 2;

  for (const childId of args.children) {
    const child = args.nodeMap.get(childId);
    if (!child) continue;

    const childHeight = (args.weights.get(childId) ?? 1) * args.verticalSpacing;
    const childCenterY = cursorTop + childHeight / 2;
    child.x = parent.x + args.direction * args.horizontalSpacing;
    child.y = childCenterY;

    if (!isCollapsedForLayout(child)) {
      layoutDirectedSubtree({
        ...args,
        parentId: childId,
        children: args.childrenById.get(childId) ?? [],
      });
    }
    cursorTop += childHeight;
  }

  args.visiting.delete(args.parentId);
}

function isCollapsedForLayout(node: MindmapNode): boolean {
  return node.treeControl === "manual-collapsed";
}
