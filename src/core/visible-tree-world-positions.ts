import type { MindmapDocument, MindmapNode } from "../types/mindmap";
import { DEFAULT_LAYOUT_VERTICAL_SPACING } from "../types/settings";
import { buildHierarchy } from "./hierarchy";
import { getLayoutNodeSize } from "./tree-layout";

export function computeVisibleTreeWorldPositions(args: {
  doc: MindmapDocument;
  hierarchy: ReturnType<typeof buildHierarchy>;
  visibleNodeIds: Set<string>;
  layoutSizeCache?: Map<string, { width: number; height: number }>;
  verticalSpacing?: number;
}): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const rootId = args.hierarchy.rootId;
  if (!rootId) return positions;

  const nodeMap = new Map(args.doc.nodes.map((node) => [node.id, node]));
  const root = nodeMap.get(rootId);
  if (!root) return positions;

  const layoutSizeCache = args.layoutSizeCache ?? new Map(args.doc.nodes.map((node) => {
    const hNode = args.hierarchy.nodes.get(node.id);
    const depth = hNode?.depth ?? 0;
    return [node.id, getLayoutNodeSize(node, depth)];
  }));
  const verticalSpacing = args.verticalSpacing ?? DEFAULT_LAYOUT_VERTICAL_SPACING;

  positions.set(rootId, { x: root.x, y: root.y });
  const spans = computeVisibleSubtreeSpans({
    nodeId: rootId,
    hierarchy: args.hierarchy,
    visibleNodeIds: args.visibleNodeIds,
    layoutSizeCache,
    verticalSpacing,
  });

  const rootChildren = getVisibleChildren(rootId, args.hierarchy, args.visibleNodeIds);
  if (args.doc.layoutMode === "tree-right") {
    layoutVisibleTreeChildren({
      parentId: rootId,
      childIds: rootChildren,
      hierarchy: args.hierarchy,
      visibleNodeIds: args.visibleNodeIds,
      nodeMap,
      layoutSizeCache,
      spans,
      positions,
      verticalSpacing,
    });
    return positions;
  }

  const leftChildren = rootChildren.filter((childId) => {
    const child = nodeMap.get(childId);
    return (child?.x ?? root.x) < root.x;
  });
  const leftChildIdSet = new Set(leftChildren);
  const rightChildren = rootChildren.filter((childId) => !leftChildIdSet.has(childId));

  layoutVisibleTreeChildren({
    parentId: rootId,
    childIds: leftChildren,
    hierarchy: args.hierarchy,
    visibleNodeIds: args.visibleNodeIds,
    nodeMap,
    layoutSizeCache,
    spans,
    positions,
    verticalSpacing,
  });
  layoutVisibleTreeChildren({
    parentId: rootId,
    childIds: rightChildren,
    hierarchy: args.hierarchy,
    visibleNodeIds: args.visibleNodeIds,
    nodeMap,
    layoutSizeCache,
    spans,
    positions,
    verticalSpacing,
  });

  return positions;
}

function computeVisibleSubtreeSpans(args: {
  nodeId: string;
  hierarchy: ReturnType<typeof buildHierarchy>;
  visibleNodeIds: Set<string>;
  layoutSizeCache: Map<string, { width: number; height: number }>;
  verticalSpacing: number;
  cache?: Map<string, number>;
  visiting?: Set<string>;
}): Map<string, number> {
  const cache = args.cache ?? new Map<string, number>();
  const visiting = args.visiting ?? new Set<string>();

  const visit = (nodeId: string): number => {
    const cached = cache.get(nodeId);
    if (cached !== undefined) return cached;
    if (visiting.has(nodeId)) return cache.get(nodeId) ?? 0;

    const hNode = args.hierarchy.nodes.get(nodeId);
    if (!hNode) {
      cache.set(nodeId, 0);
      return 0;
    }

    visiting.add(nodeId);
    const nodeHeight = args.layoutSizeCache.get(nodeId)?.height ?? getLayoutNodeSize(hNode.node, hNode.depth).height;
    const children = getVisibleChildren(nodeId, args.hierarchy, args.visibleNodeIds);
    if (children.length === 0) {
      visiting.delete(nodeId);
      cache.set(nodeId, nodeHeight);
      return nodeHeight;
    }

    let total = 0;
    for (let index = 0; index < children.length; index++) {
      total += visit(children[index]!);
      if (index < children.length - 1) total += args.verticalSpacing;
    }

    const span = Math.max(nodeHeight, total);
    visiting.delete(nodeId);
    cache.set(nodeId, span);
    return span;
  };

  visit(args.nodeId);
  return cache;
}

function layoutVisibleTreeChildren(args: {
  parentId: string;
  childIds: string[];
  hierarchy: ReturnType<typeof buildHierarchy>;
  visibleNodeIds: Set<string>;
  nodeMap: Map<string, MindmapNode>;
  layoutSizeCache: Map<string, { width: number; height: number }>;
  spans: Map<string, number>;
  positions: Map<string, { x: number; y: number }>;
  verticalSpacing: number;
  visiting?: Set<string>;
}): void {
  if (args.childIds.length === 0) return;
  const visiting = args.visiting ?? new Set<string>();
  if (visiting.has(args.parentId)) return;

  const parent = args.nodeMap.get(args.parentId);
  const parentPosition = args.positions.get(args.parentId);
  if (!parent || !parentPosition) return;

  visiting.add(args.parentId);
  const totalHeight = args.childIds.reduce((sum, childId, index) => {
    const childSpan = args.spans.get(childId) ?? 0;
    return sum + childSpan + (index < args.childIds.length - 1 ? args.verticalSpacing : 0);
  }, 0);
  const parentShift = parentPosition.y - parent.y;
  const anchorCenter = args.childIds.reduce((sum, childId) => {
    const child = args.nodeMap.get(childId);
    return sum + ((child?.y ?? parentPosition.y) + parentShift);
  }, 0) / args.childIds.length;
  let cursorTop = anchorCenter - totalHeight / 2;

  for (const childId of args.childIds) {
    const child = args.nodeMap.get(childId);
    if (!child) continue;

    const childSpan = args.spans.get(childId)
      ?? args.layoutSizeCache.get(childId)?.height
      ?? getLayoutNodeSize(child, args.hierarchy.nodes.get(childId)?.depth).height;
    const childY = cursorTop + childSpan / 2;
    args.positions.set(childId, { x: child.x, y: childY });

    layoutVisibleTreeChildren({
      ...args,
      parentId: childId,
      childIds: getVisibleChildren(childId, args.hierarchy, args.visibleNodeIds),
      visiting,
    });
    cursorTop += childSpan + args.verticalSpacing;
  }

  visiting.delete(args.parentId);
}

function getVisibleChildren(
  nodeId: string,
  hierarchy: ReturnType<typeof buildHierarchy>,
  visibleNodeIds: Set<string>,
): string[] {
  return (hierarchy.childrenById.get(nodeId) ?? []).filter((childId) => visibleNodeIds.has(childId));
}
