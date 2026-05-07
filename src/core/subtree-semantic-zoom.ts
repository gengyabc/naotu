import { buildHierarchy } from "./hierarchy";
import { areChildrenExpanded, shouldAutoExpandChildren } from "./tree-control";
import type { MindmapDocument, TreeControl } from "../types/mindmap";
import type { MindmapHierarchy } from "./hierarchy";

const MIN_ZOOM = 0.12;
const MAX_ZOOM = 4;

export interface SubtreeSemanticZoomPlan {
  nextVirtualZoom: number;
  previousVisibleDepth: number;
  nextVisibleDepth: number;
  controls: Map<string, TreeControl>;
}

export function planSubtreeSemanticZoom(args: {
  doc: MindmapDocument;
  rootId: string;
  currentVirtualZoom: number;
  projectionZoom: number;
  factor: number;
  maxDepthStep?: number;
}): SubtreeSemanticZoomPlan | null {
  const hierarchy = buildHierarchy(args.doc);
  const root = hierarchy.nodes.get(args.rootId);
  if (!root) return null;

  const depthBuckets = collectDepthBuckets(args.rootId, hierarchy.childrenById);
  const maxOffset = Math.max(0, depthBuckets.length - 1);
  const nextVirtualZoom = clampZoom(args.currentVirtualZoom * args.factor);
  if (maxOffset === 0) {
    return {
      nextVirtualZoom,
      previousVisibleDepth: 0,
      nextVisibleDepth: 0,
      controls: new Map(),
    };
  }

  const previousVisibleDepth = currentVisibleDepth({
    hierarchy,
    rootId: args.rootId,
    zoom: args.projectionZoom,
    depthBuckets,
  });
  const rawNextVisibleDepth = zoomToVisibleDepth(nextVirtualZoom, root.depth, maxOffset);
  const maxDepthStep = Math.max(1, args.maxDepthStep ?? 3);
  const nextVisibleDepth = clampVisibleDepth(
    rawNextVisibleDepth,
    previousVisibleDepth - maxDepthStep,
    previousVisibleDepth + maxDepthStep,
    maxOffset,
  );

  const controls = new Map<string, TreeControl>();
  if (nextVisibleDepth !== previousVisibleDepth) {
    for (let offset = 0; offset < maxOffset; offset += 1) {
      const desired: TreeControl = offset < nextVisibleDepth ? "manual-expanded" : "manual-collapsed";
      for (const id of depthBuckets[offset] ?? []) {
        if ((hierarchy.childrenById.get(id) ?? []).length === 0) continue;
        controls.set(id, desired);
      }
    }
  }

  return {
    nextVirtualZoom,
    previousVisibleDepth,
    nextVisibleDepth,
    controls,
  };
}

function currentVisibleDepth(args: {
  hierarchy: MindmapHierarchy;
  rootId: string;
  zoom: number;
  depthBuckets: string[][];
}): number {
  const visibleNodeIds = new Set<string>();
  const visited = new Set<string>();

  const visit = (nodeId: string, offset: number): void => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    visibleNodeIds.add(nodeId);

    const hNode = args.hierarchy.nodes.get(nodeId);
    if (!hNode) return;
    if (!areChildrenExpanded(hNode.node.treeControl, args.zoom, hNode.depth)) return;

    for (const childId of args.hierarchy.childrenById.get(nodeId) ?? []) {
      visit(childId, offset + 1);
    }
  };

  visit(args.rootId, 0);
  let visibleDepth = 0;
  for (let offset = 1; offset < args.depthBuckets.length; offset += 1) {
    const bucket = args.depthBuckets[offset] ?? [];
    if (bucket.length === 0) break;
    if (!bucket.every((id) => visibleNodeIds.has(id))) break;
    visibleDepth = offset;
  }
  return visibleDepth;
}

function collectDepthBuckets(rootId: string, childrenById: ReadonlyMap<string, string[]>): string[][] {
  const buckets: string[][] = [[rootId]];
  let frontier = [rootId];
  let offset = 1;
  const visited = new Set(frontier);

  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const childId of childrenById.get(id) ?? []) {
        if (visited.has(childId)) continue;
        visited.add(childId);
        next.push(childId);
      }
    }
    if (next.length === 0) break;
    buckets[offset] = next;
    frontier = next;
    offset += 1;
  }

  return buckets;
}

function zoomToVisibleDepth(zoom: number, rootDepth: number, maxOffset: number): number {
  let visibleDepth = 0;
  for (let offset = 1; offset <= maxOffset; offset += 1) {
    if (!shouldAutoExpandChildren(zoom, rootDepth + offset - 1)) break;
    visibleDepth = offset;
  }
  return visibleDepth;
}

function clampVisibleDepth(value: number, min: number, max: number, maxOffset: number): number {
  return Math.max(0, Math.min(maxOffset, Math.max(min, Math.min(max, value))));
}

function clampZoom(value: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}
