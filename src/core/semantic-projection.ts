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
import { clampDetailLevel, getVisualSpec, sizeToDetailLevel } from "./detail-level";
import { applyNotebookFocusPolicy, computeSemanticDetailLevel } from "./semantic-zoom-policy";
import { relaxProjectedNodes } from "./layout-relaxation";
import { getCustomNotebookSize, getStoredNodeSize } from "./notebook-size";
import { areChildrenExpanded } from "./tree-control";
import { getLayoutNodeSize } from "./tree-layout";
import { getTextNodeDisplaySize } from "./text-layout";
import { getFontSizeForDepth } from "./font-size";
import { isEmbeddedFileNodeTargetKind } from "./file-node-support";
import { computeBranchMeta } from "./branch-color";

const TREE_SIDE_LEFT = -1;
const TREE_SIDE_RIGHT = 1;

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

  const docNodeMap = new Map(doc.nodes.map((n) => [n.id, n]));
  includeReferenceNeighbors({ hierarchy, visibleNodeIds, viewportWorldRect: context.viewportWorldRect, docNodeMap });

  let projectedNodes: ProjectedNode[] = [];
  const focusNode = focusNodeId ? docNodeMap.get(focusNodeId) : undefined;
  const rootNode = hierarchy.rootId ? docNodeMap.get(hierarchy.rootId) : undefined;
  const prevFrozenLevels = extra.prevFrozenNotebookLevels ?? new Map<string, NodeDetailLevel>();
  const nextFrozenLevels = extra.nextFrozenNotebookLevels ?? new Map<string, NodeDetailLevel>();
  const layoutSizeCache = isTreeLayout
    ? new Map(doc.nodes.map((n) => {
        const hNode = hierarchy.nodes.get(n.id);
        const depth = hNode?.depth ?? 0;
        return [n.id, getLayoutNodeSize(n, depth)];
      }))
    : undefined;

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

    const customSize = node.kind === "notebook" ? getCustomNotebookSize(node) : null;
    const isEmbeddedFile = node.kind === "notebook" && isEmbeddedFileNodeTargetKind(node.notebook?.targetKind);
    
    let finalSize: { width: number; height: number };
    let finalDetail: NodeDetailLevel;
    
    if (customSize && isEmbeddedFile) {
      finalSize = { width: customSize.width, height: customSize.height };
      
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
      if (node.kind === "notebook") {
        nextFrozenLevels.set(node.id, afterNotebookPolicy);
      }

      const forcedDetail = extra.forcedDetailLevels?.get(node.id);
      finalDetail = forcedDetail !== undefined && forcedDetail > afterNotebookPolicy ? forcedDetail : afterNotebookPolicy;
    } else if (customSize) {
      finalSize = { width: customSize.width, height: customSize.height };
      const sizeBasedDetail = sizeToDetailLevel(customSize.width, customSize.height);
      const forcedDetail = extra.forcedDetailLevels?.get(node.id);
      finalDetail = forcedDetail !== undefined ? forcedDetail : sizeBasedDetail;
    } else {
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
      finalDetail = forcedDetail !== undefined && forcedDetail > afterNotebookPolicy ? forcedDetail : afterNotebookPolicy;

      const visual = getVisualSpec(node.kind, finalDetail);
      
      if (node.kind === "text") {
        const fontSize = getFontSizeForDepth(depth);
        const dynamicSize = getTextNodeDisplaySize({
          title: node.title,
          fontSize,
        });
        finalSize = { width: dynamicSize.width, height: dynamicSize.height };
      } else {
        finalSize = { width: visual.width, height: visual.height };
      }
    }

    const projectedCenter = projectNodeCenter({ node, context });
    const projectedPosition = projectNodeTopLeft({
      node,
      projectedCenter,
      finalSize,
      context,
      isTreeLayout,
      isRoot,
      rootNode,
      layoutSizeCache,
      depth,
    });
    const childrenExpanded = children.some((childId) => visibleNodeIds.has(childId));
    const usesCustomSize = Boolean(customSize);

    projectedNodes.push({
      id: node.id,
      sourceNodeId: node.id,
      kind: node.kind,
      title: node.title,
      notebook: node.notebook,
      worldX: node.x,
      worldY: node.y,
      projectedX: projectedPosition.x,
      projectedY: projectedPosition.y,
      displayWidth: finalSize.width,
      displayHeight: finalSize.height,
      aspectRatio: node.aspectRatio,
      detailLevel: finalDetail,
      depth,
      isRoot,
      isFocus,
      isSelected,
      isHovered,
      isAncestorPath,
      isSearchMatch: extra.searchResultIds?.has(node.id) ?? false,
      hasChildren: children.length > 0,
      childrenExpanded,
      showOpenNotebookButton: node.kind === "notebook" && finalDetail >= 4 && Boolean(node.notebook?.link),
      showResizeHandle: node.kind === "notebook" && (finalDetail >= 4 || usesCustomSize || (isSelected && finalDetail >= 2)),
      usesCustomSize,
    });
  }

  const hasExpandedNotebook = projectedNodes.some((node) => node.kind === "notebook" && node.detailLevel >= 4);

  const branchMeta = computeBranchMeta({
    rootId: hierarchy.rootId,
    childrenById: hierarchy.childrenById,
    visibleNodeIds,
  });

  for (const node of projectedNodes) {
    const meta = branchMeta.get(node.id);
    if (meta) {
      node.branchColor = meta.branchColor;
      node.branchColorSoft = meta.branchColorSoft;
      node.branchColorBorder = meta.branchColorBorder;
    }
  }

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
    .map((edge) => {
      const sourceMeta = branchMeta.get(edge.source);
      const targetMeta = branchMeta.get(edge.target);
      const branchColor = sourceMeta?.branchColor ?? targetMeta?.branchColor;
      const branchColorBorder = sourceMeta?.branchColorBorder ?? targetMeta?.branchColorBorder;
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        relation: edge.relation,
        type: edge.type,
        label: edge.label,
        branchColor,
        branchColorBorder,
        isFromRoot: edge.source === hierarchy.rootId,
      };
    });

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

function projectNodeTopLeft(args: {
  node: MindmapNode;
  projectedCenter: { x: number; y: number };
  finalSize: { width: number; height: number };
  context: ProjectionContext;
  isTreeLayout: boolean;
  isRoot: boolean;
  rootNode?: MindmapNode;
  layoutSizeCache?: Map<string, { width: number; height: number }>;
  depth?: number;
}): { x: number; y: number } {
  const centeredX = args.projectedCenter.x - args.finalSize.width / (2 * args.context.zoom);
  const centeredY = args.projectedCenter.y - args.finalSize.height / (2 * args.context.zoom);

  if (!args.isTreeLayout || args.isRoot || !args.rootNode) {
    return { x: centeredX, y: centeredY };
  }

  if (args.node.x === args.rootNode.x) {
    return { x: centeredX, y: centeredY };
  }

  const layoutSize = args.layoutSizeCache?.get(args.node.id) ?? getLayoutNodeSize(args.node, args.depth);
  const side = args.node.x < args.rootNode.x ? TREE_SIDE_LEFT : TREE_SIDE_RIGHT;
  const x = side === TREE_SIDE_RIGHT
    ? args.projectedCenter.x - layoutSize.width / (2 * args.context.zoom)
    : args.projectedCenter.x + layoutSize.width / (2 * args.context.zoom) - args.finalSize.width / args.context.zoom;

  // Y remains centered: vertical expansion is left to the relaxation pass,
  // which already resolves overlaps from height changes.
  return { x, y: centeredY };
}

function includeReferenceNeighbors(args: {
  hierarchy: ReturnType<typeof buildHierarchy>;
  visibleNodeIds: Set<string>;
  viewportWorldRect: { x: number; y: number; width: number; height: number };
  docNodeMap: Map<string, MindmapNode>;
}): void {
  for (const edge of args.hierarchy.referenceEdges) {
    const sVisible = args.visibleNodeIds.has(edge.source);
    const tVisible = args.visibleNodeIds.has(edge.target);

    if (sVisible && !tVisible) {
      const node = args.docNodeMap.get(edge.target);
      if (node && isNearViewport(node, args.viewportWorldRect)) args.visibleNodeIds.add(edge.target);
    }

    if (tVisible && !sVisible) {
      const node = args.docNodeMap.get(edge.source);
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
