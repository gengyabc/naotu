import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from "../constants";
import type { MindmapDocument, MindmapNode } from "../types/mindmap";
import { buildHierarchy } from "./hierarchy";
import { createId } from "./id";
import { t } from "../i18n";

export function createTextNodeNearParent(parent: MindmapNode): MindmapNode {
  return {
    id: createId("node"),
    kind: "text",
    title: t("nodeTitles.newChildNode"),
    x: parent.x + 220,
    y: parent.y + 80,
    width: DEFAULT_NODE_WIDTH,
    height: DEFAULT_NODE_HEIGHT,
    treeControl: "manual-expanded",
  };
}

export function findParentId(doc: MindmapDocument, nodeId: string): string | undefined {
  const hierarchy = buildHierarchy(doc);
  return hierarchy.parentById.get(nodeId);
}

export function findRootId(doc: MindmapDocument): string | undefined {
  return buildHierarchy(doc).rootId;
}

export function getMindmapChildIds(doc: MindmapDocument, parentId: string): string[] {
  const children: string[] = [];
  for (const edge of doc.edges) {
    if (edge.relation !== "mindmap") continue;
    if (edge.source !== parentId) continue;
    children.push(edge.target);
  }
  return children;
}

export function isDescendantNode(doc: MindmapDocument, ancestorId: string, nodeId: string): boolean {
  const childrenById = getMindmapChildrenById(doc);
  return isDescendantNodeInChildren(childrenById, ancestorId, nodeId);
}

export function getSubtreeNodeIds(doc: MindmapDocument, rootId: string): string[] {
  const childrenById = getMindmapChildrenById(doc);
  return getSubtreeNodeIdsFromChildren(childrenById, rootId);
}

export function resolveDraggedNodeIds(doc: MindmapDocument, draggedNodeId: string, selectedIds: string[]): string[] {
  const childrenById = getMindmapChildrenById(doc);
  const baseIds = selectedIds.includes(draggedNodeId) ? selectedIds : [draggedNodeId];
  const rootIds = baseIds.filter((id) => !baseIds.some((otherId) => otherId !== id && isDescendantNodeInChildren(childrenById, otherId, id)));
  const resolved: string[] = [];
  const seen = new Set<string>();

  for (const id of rootIds) {
    for (const subtreeId of getSubtreeNodeIdsFromChildren(childrenById, id)) {
      if (seen.has(subtreeId)) continue;
      seen.add(subtreeId);
      resolved.push(subtreeId);
    }
  }

  return resolved;
}

export function expandDraggedNodeMoves(
  doc: MindmapDocument,
  args: { draggedNodeId: string; selectedIds: string[]; moves: Array<{ id: string; x: number; y: number }> },
): Array<{ id: string; x: number; y: number }> {
  const draggedNode = doc.nodes.find((node) => node.id === args.draggedNodeId);
  const draggedMove = args.moves.find((move) => move.id === args.draggedNodeId);
  if (!draggedNode || !draggedMove) return args.moves;

  const deltaX = draggedMove.x - draggedNode.x;
  const deltaY = draggedMove.y - draggedNode.y;
  if (deltaX === 0 && deltaY === 0) return args.moves;

  const moveMap = new Map(args.moves.map((move) => [move.id, move]));
  for (const nodeId of resolveDraggedNodeIds(doc, args.draggedNodeId, args.selectedIds)) {
    if (moveMap.has(nodeId)) continue;
    const node = doc.nodes.find((item) => item.id === nodeId);
    if (!node) continue;
    moveMap.set(nodeId, { id: nodeId, x: node.x + deltaX, y: node.y + deltaY });
  }

  return [...moveMap.values()];
}

function isDescendantNodeInChildren(childrenById: Map<string, string[]>, ancestorId: string, nodeId: string): boolean {
  if (ancestorId === nodeId) return false;
  const queue = [...(childrenById.get(ancestorId) ?? [])];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    if (current === nodeId) return true;
    visited.add(current);
    queue.push(...(childrenById.get(current) ?? []));
  }
  return false;
}

function getSubtreeNodeIdsFromChildren(childrenById: Map<string, string[]>, rootId: string): string[] {
  if (!childrenById.has(rootId)) return [];
  const result: string[] = [];
  const queue = [rootId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    result.push(current);
    queue.push(...(childrenById.get(current) ?? []));
  }

  return result;
}

export function moveMindmapNode(
  doc: MindmapDocument,
  args: { nodeId: string; newParentId: string; targetIndex: number },
): MindmapDocument {
  const next = structuredClone(doc);
  if (args.nodeId === args.newParentId) return next;
  const incomingIndex = next.edges.findIndex((edge) => edge.relation === "mindmap" && edge.target === args.nodeId);
  if (incomingIndex < 0) return next;

  if (isDescendantNode(next, args.nodeId, args.newParentId)) return next;

  const incomingEdge = next.edges[incomingIndex];
  next.edges.splice(incomingIndex, 1);

  const parentChildIndices = next.edges
    .map((edge, index) => ({ edge, index }))
    .filter(({ edge }) => edge.relation === "mindmap" && edge.source === args.newParentId);

  const clamped = Math.max(0, Math.min(args.targetIndex, parentChildIndices.length));
  const insertAt = clamped >= parentChildIndices.length ? next.edges.length : parentChildIndices[clamped].index;

  incomingEdge.source = args.newParentId;
  next.edges.splice(insertAt, 0, incomingEdge);
  return next;
}

export function addChildMindmapNode(doc: MindmapDocument, parentId: string, child: MindmapNode): MindmapDocument {
  return insertMindmapNode(doc, { parentId, child, targetIndex: getMindmapChildIds(doc, parentId).length });
}

export function addSiblingMindmapNode(doc: MindmapDocument, nodeId: string, sibling: MindmapNode): MindmapDocument {
  const parentId = findParentId(doc, nodeId) ?? findRootId(doc);
  if (!parentId) return structuredClone(doc);

  const siblings = getMindmapChildIds(doc, parentId);
  const selectedIndex = siblings.indexOf(nodeId);
  const targetIndex = selectedIndex >= 0 ? selectedIndex + 1 : siblings.length;
  return insertMindmapNode(doc, { parentId, child: sibling, targetIndex });
}

function insertMindmapNode(
  doc: MindmapDocument,
  args: { parentId: string; child: MindmapNode; targetIndex: number },
): MindmapDocument {
  const next = structuredClone(doc);
  next.nodes.push(args.child);

  const parentChildIndices = next.edges
    .map((edge, index) => ({ edge, index }))
    .filter(({ edge }) => edge.relation === "mindmap" && edge.source === args.parentId);

  const clamped = Math.max(0, Math.min(args.targetIndex, parentChildIndices.length));
  const insertAt = clamped >= parentChildIndices.length ? next.edges.length : parentChildIndices[clamped].index;

  next.edges.splice(insertAt, 0, {
    id: createId("edge"),
    source: args.parentId,
    target: args.child.id,
    relation: "mindmap",
    type: "curve",
  });
  return next;
}

function getMindmapChildrenById(doc: MindmapDocument): Map<string, string[]> {
  const childrenById = new Map<string, string[]>();
  for (const node of doc.nodes) childrenById.set(node.id, []);
  for (const edge of doc.edges) {
    if (edge.relation !== "mindmap") continue;
    childrenById.get(edge.source)?.push(edge.target);
  }
  return childrenById;
}
