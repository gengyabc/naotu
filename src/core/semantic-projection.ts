import type {
  MindmapDocument,
  NodeDetailLevel,
  ProjectedEdge,
  ProjectedNode,
  ProjectionContext,
  SemanticProjection,
} from "../types/mindmap";
import { buildHierarchy, getAncestorPath } from "./hierarchy";
import { resolveFocusNodeId } from "./focus";
import { getVisualSpec } from "./detail-level";
import { computeSemanticDetailLevel } from "./semantic-zoom-policy";
import { relaxProjectedNodes } from "./layout-relaxation";

export interface CreateSemanticProjectionExtra {
  searchResultIds?: Set<string>;
  connectionSourceId?: string;
}

export function createSemanticProjection(
  doc: MindmapDocument,
  context: ProjectionContext,
  extra: CreateSemanticProjectionExtra = {},
): SemanticProjection {
  const hierarchy = buildHierarchy(doc);
  const focusNodeId = resolveFocusNodeId({
    doc,
    hierarchy,
    selectedNodeIds: context.selectedNodeIds,
    lastFocusNodeId: context.lastFocusNodeId,
    viewportWorldRect: context.viewportWorldRect,
  });

  const focusPath = focusNodeId ? getAncestorPath(focusNodeId, hierarchy) : [];
  const focusPathSet = new Set(focusPath);
  const visibleNodeIds = new Set<string>();

  if (hierarchy.rootId) visibleNodeIds.add(hierarchy.rootId);
  if (focusNodeId) visibleNodeIds.add(focusNodeId);
  for (const id of focusPath) visibleNodeIds.add(id);

  if (hierarchy.rootId) {
    collectVisibleTree({ nodeId: hierarchy.rootId, hierarchy, visibleNodeIds, focusPathSet, zoom: context.zoom });
  }

  includeReferenceNeighbors({ doc, hierarchy, visibleNodeIds, viewportWorldRect: context.viewportWorldRect });

  let projectedNodes: ProjectedNode[] = [];
  const focusNode = focusNodeId ? doc.nodes.find((node) => node.id === focusNodeId) : undefined;

  for (const node of doc.nodes) {
    if (!visibleNodeIds.has(node.id)) continue;

    const isRoot = node.id === hierarchy.rootId;
    const isFocus = node.id === focusNodeId;
    const isSelected = context.selectedNodeIds.includes(node.id);
    const isHovered = context.hoveredNodeId === node.id;
    const isAncestorPath = focusPathSet.has(node.id) && !isFocus;
    const children = hierarchy.childrenById.get(node.id) ?? [];

    const detail: NodeDetailLevel = computeSemanticDetailLevel({
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

    const visual = getVisualSpec(node.kind, detail);
    const childrenExpanded = areChildrenExpanded(node.treeControl, context.zoom);

    projectedNodes.push({
      id: node.id,
      sourceNodeId: node.id,
      kind: node.kind,
      title: node.title,
      notebook: node.notebook,
      worldX: node.x,
      worldY: node.y,
      projectedX: node.x,
      projectedY: node.y,
      displayWidth: visual.width,
      displayHeight: visual.height,
      detailLevel: detail,
      isRoot,
      isFocus,
      isSelected,
      isHovered,
      isAncestorPath,
      isSearchMatch: extra.searchResultIds?.has(node.id) ?? false,
      isConnectionSource: extra.connectionSourceId === node.id,
      hasChildren: children.length > 0,
      childrenExpanded,
      showNotebookExpandButton: true,
    });
  }

  projectedNodes = relaxProjectedNodes(projectedNodes, {
    iterations: doc.nodes.length > 300 ? 2 : 4,
    pushStrength: 28,
  });

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
  focusPathSet: Set<string>;
  zoom: number;
}): void {
  const hNode = args.hierarchy.nodes.get(args.nodeId);
  if (!hNode) return;

  const expanded = areChildrenExpanded(hNode.node.treeControl, args.zoom);
  if (!expanded && !args.focusPathSet.has(args.nodeId)) return;

  const children = args.hierarchy.childrenById.get(args.nodeId) ?? [];
  for (const childId of children) {
    args.visibleNodeIds.add(childId);
    collectVisibleTree({ ...args, nodeId: childId });
  }
}

function areChildrenExpanded(treeControl: string | undefined, zoom: number): boolean {
  if (treeControl === "manual-expanded") return true;
  if (treeControl === "manual-collapsed") return false;
  return zoom >= 0.45;
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

function isNearViewport(
  node: { x: number; y: number; width: number; height: number },
  rect: { x: number; y: number; width: number; height: number },
): boolean {
  const padding = 800;
  return !(
    node.x + node.width < rect.x - padding ||
    node.x > rect.x + rect.width + padding ||
    node.y + node.height < rect.y - padding ||
    node.y > rect.y + rect.height + padding
  );
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
