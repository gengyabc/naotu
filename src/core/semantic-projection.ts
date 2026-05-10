import type {
  MindmapDocument,
  MindmapNode,
  NodeDetailLevel,
  ProjectedEdge,
  ProjectedNode,
  ProjectionContext,
  SemanticProjection,
} from "../types/mindmap";
import { buildHierarchy, getAncestorPath } from "./hierarchy";
import { resolveFocusNodeId } from "./focus";
import { clampDetailLevel, getVisualSpec } from "./detail-level";
import { applyNotebookFocusPolicy, computeSemanticDetailLevel } from "./semantic-zoom-policy";
import { relaxProjectedNodes } from "./layout-relaxation";
import { getCustomNotebookSize, getStoredNodeSize } from "./notebook-size";
import { areChildrenExpanded } from "./tree-control";
import { getTextNodeDisplaySize } from "./text-layout";
import { isEmbeddedFileNodeTargetKind } from "./file-node-support";

export interface CreateSemanticProjectionExtra {
  searchResultIds?: Set<string>;
  forcedDetailLevels?: ReadonlyMap<string, NodeDetailLevel>;
  prevFrozenNotebookLevels?: ReadonlyMap<string, NodeDetailLevel>;
  nextFrozenNotebookLevels?: Map<string, NodeDetailLevel>;
}

export function createSemanticProjection(
  doc: MindmapDocument,
  context: ProjectionContext,
  extra: CreateSemanticProjectionExtra = {},
): SemanticProjection {
  const hierarchy = buildHierarchy(doc);
  const isTreeLayout = doc.layoutMode === "tree-mirror" || doc.layoutMode === "tree-right";
  const focusNodeId = isTreeLayout
    ? hierarchy.rootId
    : resolveFocusNodeId({
        doc,
        hierarchy,
        selectedNodeIds: context.selectedNodeIds,
        lastFocusNodeId: context.lastFocusNodeId,
        viewportWorldRect: context.viewportWorldRect,
      });

  const focusPath = focusNodeId ? getAncestorPath(focusNodeId, hierarchy) : [];
  const selectedNodeId = context.selectedNodeIds.find((id) => hierarchy.nodes.has(id));
  const selectedPath = selectedNodeId ? getAncestorPath(selectedNodeId, hierarchy) : [];
  const focusPathSet = new Set(focusPath);
  const forcedExpandedNodeIds = new Set([
    ...focusPath.filter((id) => id !== focusNodeId),
    ...selectedPath.filter((id) => id !== selectedNodeId),
  ]);
  const visibleNodeIds = new Set<string>();

  if (hierarchy.rootId) visibleNodeIds.add(hierarchy.rootId);
  if (focusNodeId) visibleNodeIds.add(focusNodeId);
  for (const id of focusPath) visibleNodeIds.add(id);
  if (selectedNodeId) visibleNodeIds.add(selectedNodeId);
  for (const id of selectedPath) visibleNodeIds.add(id);

  if (hierarchy.rootId) {
    collectVisibleTree({ nodeId: hierarchy.rootId, hierarchy, visibleNodeIds, forcedExpandedNodeIds, zoom: context.zoom });
  }

  includeReferenceNeighbors({ doc, hierarchy, visibleNodeIds, viewportWorldRect: context.viewportWorldRect });

  let projectedNodes: ProjectedNode[] = [];
  const focusNode = focusNodeId ? doc.nodes.find((node) => node.id === focusNodeId) : undefined;
  const prevFrozenLevels = extra.prevFrozenNotebookLevels ?? new Map<string, NodeDetailLevel>();
  const nextFrozenLevels = extra.nextFrozenNotebookLevels ?? new Map<string, NodeDetailLevel>();

  for (const node of doc.nodes) {
    if (!visibleNodeIds.has(node.id)) continue;

    const hNode = hierarchy.nodes.get(node.id);
    const depth = hNode?.depth ?? 0;

    const isRoot = node.id === hierarchy.rootId;
    const isFocus = node.id === focusNodeId;
    const isSelected = context.selectedNodeIds.includes(node.id);
    const isHovered = context.hoveredNodeId === node.id;
    const isAncestorPath = focusPathSet.has(node.id) && !isFocus;
    const children = hierarchy.childrenById.get(node.id) ?? [];

    const computedDetail: NodeDetailLevel = computeSemanticDetailLevel({
      zoom: context.zoom,
      kind: node.kind,
      isRoot,
      isFocus,
      isSelected,
      isHovered,
      isAncestorPath,
      hasNotebook: Boolean(node.notebook),
      hasChildren: children.length > 0,
      distanceToFocus: focusNode ? distance(node, focusNode) : 0,
    });

    let afterNotebookPolicy: NodeDetailLevel = applyNotebookFocusPolicy({
      nodeId: node.id,
      kind: node.kind,
      isFocus,
      focusNodeId,
      focusOnRoot: !!focusNodeId && focusNodeId === hierarchy.rootId,
      computedLevel: computedDetail,
      prevFrozenLevels,
    });

    if (isRoot || isAncestorPath) afterNotebookPolicy = clampDetailLevel(Math.max(afterNotebookPolicy, 1));
    if (isHovered && node.kind !== "notebook") afterNotebookPolicy = clampDetailLevel(Math.max(afterNotebookPolicy, 2));

    if (node.kind === "notebook") {
      nextFrozenLevels.set(node.id, afterNotebookPolicy);
    }

    const forcedDetail = extra.forcedDetailLevels?.get(node.id);
    const detail: NodeDetailLevel = forcedDetail !== undefined && forcedDetail > afterNotebookPolicy ? forcedDetail : afterNotebookPolicy;

    const resolvedSize = resolveProjectedDisplaySize({ node, detail });
    const projectedCenter = projectNodeCenter({ node, context });
    const childrenExpanded = children.some((childId) => visibleNodeIds.has(childId));
    const embeddedFileNotebook = node.kind === "notebook" && isEmbeddedFileNodeTargetKind(node.notebook?.targetKind);

    projectedNodes.push({
      id: node.id,
      sourceNodeId: node.id,
      kind: node.kind,
      title: node.title,
      notebook: node.notebook,
      worldX: node.x,
      worldY: node.y,
      projectedX: projectedCenter.x - resolvedSize.width / (2 * context.zoom),
      projectedY: projectedCenter.y - resolvedSize.height / (2 * context.zoom),
      displayWidth: resolvedSize.width,
      displayHeight: resolvedSize.height,
      aspectRatio: node.aspectRatio,
      detailLevel: detail,
      isRoot,
      isFocus,
      isSelected,
      isHovered,
      isAncestorPath,
      isSearchMatch: extra.searchResultIds?.has(node.id) ?? false,
      hasChildren: children.length > 0,
      childrenExpanded,
      showOpenNotebookButton: node.kind === "notebook" && detail >= 4 && Boolean(node.notebook?.link),
      showResizeHandle: node.kind === "notebook" && (detail >= 4 || (embeddedFileNotebook && resolvedSize.usesCustomSize)),
      usesCustomSize: resolvedSize.usesCustomSize,
    });
  }

  const hasExpandedNotebook = projectedNodes.some((node) => node.kind === "notebook" && node.detailLevel >= 4);

  // Free layout: skip relaxation — user positions are authoritative; auto-pushing
  // nodes apart would fight manual placement and cause drift on selection/zoom.
  const needsRelaxation = hasExpandedNotebook || (isTreeLayout && hasDynamicNodeSizes(projectedNodes));
   
  if (needsRelaxation) {
    projectedNodes = relaxProjectedNodes(projectedNodes, {
      zoom: context.zoom,
      iterations: hasExpandedNotebook ? 12 : doc.nodes.length > 300 ? 4 : 8,
      pushStrength: hasExpandedNotebook ? 36 : 32,
      maxMovePerIteration: hasExpandedNotebook ? 72 : 56,
      settleUntilNoOverlap: hasExpandedNotebook,
      maxSettlePasses: hasExpandedNotebook ? 8 : 12,
      overlapPadding: hasExpandedNotebook ? 16 : 14,
    });
  }

  const projectedEdges: ProjectedEdge[] = doc.edges
    .filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
    .map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      relation: edge.relation,
      type: edge.type,
      label: edge.label,
    }));

  return { rootNodeId: hierarchy.rootId, focusNodeId, visibleNodeIds, nodes: projectedNodes, edges: projectedEdges };
}

function collectVisibleTree(args: {
  nodeId: string;
  hierarchy: ReturnType<typeof buildHierarchy>;
  visibleNodeIds: Set<string>;
  forcedExpandedNodeIds: Set<string>;
  zoom: number;
  visited?: Set<string>;
}): void {
  const visited = args.visited ?? new Set<string>();
  if (visited.has(args.nodeId)) return;
  visited.add(args.nodeId);

  const hNode = args.hierarchy.nodes.get(args.nodeId);
  if (!hNode) return;

  const expanded = areChildrenExpanded(hNode.node.treeControl, args.zoom, hNode.depth);
  if (!expanded && !args.forcedExpandedNodeIds.has(args.nodeId)) return;

  const children = args.hierarchy.childrenById.get(args.nodeId) ?? [];
  for (const childId of children) {
    args.visibleNodeIds.add(childId);
    collectVisibleTree({ ...args, nodeId: childId, visited });
  }
}

function projectNodeCenter(args: {
  node: { x: number; y: number };
  context: ProjectionContext;
}): { x: number; y: number } {
  const viewportCenterX = args.context.viewportWorldRect.x + args.context.viewportWorldRect.width / 2;
  const viewportCenterY = args.context.viewportWorldRect.y + args.context.viewportWorldRect.height / 2;

  return {
    x: viewportCenterX + (args.node.x - viewportCenterX) / args.context.zoom,
    y: viewportCenterY + (args.node.y - viewportCenterY) / args.context.zoom,
  };
}

function includeReferenceNeighbors(args: {
  doc: MindmapDocument;
  hierarchy: ReturnType<typeof buildHierarchy>;
  visibleNodeIds: Set<string>;
  viewportWorldRect: { x: number; y: number; width: number; height: number };
}): void {
  const nodeMap = new Map(args.doc.nodes.map((node) => [node.id, node]));

  for (const edge of args.hierarchy.referenceEdges) {
    const sVisible = args.visibleNodeIds.has(edge.source);
    const tVisible = args.visibleNodeIds.has(edge.target);

    if (sVisible && !tVisible) {
      const node = nodeMap.get(edge.target);
      if (node && isNearViewport(node, args.viewportWorldRect)) args.visibleNodeIds.add(edge.target);
    }

    if (tVisible && !sVisible) {
      const node = nodeMap.get(edge.source);
      if (node && isNearViewport(node, args.viewportWorldRect)) args.visibleNodeIds.add(edge.source);
    }
  }
}

function isNearViewport(node: MindmapNode, rect: { x: number; y: number; width: number; height: number }): boolean {
  const size = getStoredNodeSize(node);
  const padding = 800;
  const left = node.x - size.width / 2;
  const right = node.x + size.width / 2;
  const top = node.y - size.height / 2;
  const bottom = node.y + size.height / 2;
  return !(
    right < rect.x - padding ||
    left > rect.x + rect.width + padding ||
    bottom < rect.y - padding ||
    top > rect.y + rect.height + padding
  );
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function resolveProjectedDisplaySize(args: {
  node: MindmapNode;
  detail: NodeDetailLevel;
}): { width: number; height: number; usesCustomSize: boolean } {
  const customSize = args.node.kind === "notebook" ? getCustomNotebookSize(args.node) : null;
  const preserveEmbeddedFilePreviewSize = args.node.kind === "notebook" && isEmbeddedFileNodeTargetKind(args.node.notebook?.targetKind);
  if (customSize && (args.detail >= 4 || preserveEmbeddedFilePreviewSize)) {
    return {
      width: customSize.width,
      height: customSize.height,
      usesCustomSize: true,
    };
  }

  const visual = getVisualSpec(args.node.kind, args.detail);
  
  if (args.node.kind === "text") {
    const dynamicSize = getTextNodeDisplaySize({
      title: args.node.title,
      fontSize: visual.titleFontSize,
    });
    return {
      width: dynamicSize.width,
      height: dynamicSize.height,
      usesCustomSize: false,
    };
  }

  return {
    width: visual.width,
    height: visual.height,
    usesCustomSize: false,
  };
}

function hasDynamicNodeSizes(nodes: ProjectedNode[]): boolean {
  for (const node of nodes) {
    if (node.kind === "text") {
      const textLength = node.title.length;
      if (textLength > 10) return true;
    }
    if (node.kind === "notebook" && node.usesCustomSize) {
      return true;
    }
  }
  return false;
}
