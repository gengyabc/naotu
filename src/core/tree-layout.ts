import type { MindmapDocument, MindmapNode } from "../types/mindmap";
import { buildHierarchy } from "./hierarchy";
import { getStoredNodeSize } from "./notebook-size";
import { getTextNodeDisplaySize } from "./text-layout";

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

    const spans = computeVisibleSubtreeSpans(rootId, hierarchy.childrenById, nodeMap, options.verticalSpacing);
    const rootChildren = hierarchy.childrenById.get(rootId) ?? [];

    if (options.mode === "tree-right") {
      layoutDirectedSubtree({
        parentId: rootId,
        children: rootChildren,
        direction: 1,
        childrenById: hierarchy.childrenById,
        spans,
        nodeMap,
        horizontalSpacing: options.horizontalSpacing,
        verticalSpacing: options.verticalSpacing,
        visiting: new Set<string>(),
      });
    } else {
      const split = splitRootChildrenForMirror(rootChildren, spans);
      layoutDirectedSubtree({
        parentId: rootId,
        children: split.left,
        direction: -1,
        childrenById: hierarchy.childrenById,
        spans,
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
        spans,
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

function computeVisibleSubtreeSpans(
  rootId: string,
  childrenById: Map<string, string[]>,
  nodeMap: Map<string, MindmapNode>,
  verticalSpacing: number,
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

    const nodeHeight = getLayoutNodeSize(node).height;

    if (isCollapsedForLayout(node)) {
      visiting.delete(nodeId);
      result.set(nodeId, nodeHeight);
      return nodeHeight;
    }

    const children = childrenById.get(nodeId) ?? [];
    if (children.length === 0) {
      visiting.delete(nodeId);
      result.set(nodeId, nodeHeight);
      return nodeHeight;
    }

    let total = 0;
    for (let index = 0; index < children.length; index++) {
      total += dfs(children[index]);
      if (index < children.length - 1) total += verticalSpacing;
    }

    const span = Math.max(nodeHeight, total);
    visiting.delete(nodeId);
    result.set(nodeId, span);
    return span;
  };

  dfs(rootId);
  return result;
}

function splitRootChildrenForMirror(children: string[], spans: Map<string, number>): { left: string[]; right: string[] } {
  const total = children.reduce((sum, childId) => sum + (spans.get(childId) ?? 0), 0);
  let bestIndex = 0;
  let bestDiff = Number.POSITIVE_INFINITY;
  let prefix = 0;

  for (let i = 0; i <= children.length; i++) {
    const diff = Math.abs(prefix - (total - prefix));
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
    if (i < children.length) prefix += spans.get(children[i] ?? "") ?? 0;
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
  spans: Map<string, number>;
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

  const parentSize = getLayoutNodeSize(parent);
  const totalHeight = args.children.reduce((sum, childId, index) => {
    const childSpan = args.spans.get(childId) ?? 0;
    return sum + childSpan + (index < args.children.length - 1 ? args.verticalSpacing : 0);
  }, 0);
  let cursorTop = parent.y - totalHeight / 2;

  for (const childId of args.children) {
    const child = args.nodeMap.get(childId);
    if (!child) continue;

    const childSize = getLayoutNodeSize(child);
    const childSpan = args.spans.get(childId) ?? childSize.height;
    const childCenterY = cursorTop + childSpan / 2;
    child.x = parent.x + args.direction * (parentSize.width / 2 + args.horizontalSpacing + childSize.width / 2);
    child.y = childCenterY;

    if (!isCollapsedForLayout(child)) {
      layoutDirectedSubtree({
        ...args,
        parentId: childId,
        children: args.childrenById.get(childId) ?? [],
      });
    }
    cursorTop += childSpan + args.verticalSpacing;
  }

  args.visiting.delete(args.parentId);
}

function isCollapsedForLayout(node: MindmapNode): boolean {
  return node.treeControl === "manual-collapsed";
}

function getLayoutNodeSize(node: MindmapNode): { width: number; height: number } {
  if (node.kind === "text") {
    return getTextNodeDisplaySize({ title: node.title, fontSize: 14 });
  }

  return getStoredNodeSize(node);
}
