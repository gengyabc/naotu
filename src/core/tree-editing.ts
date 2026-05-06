import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH, DEFAULT_TEXT_NODE_TITLE } from "../constants";
import type { MindmapDocument, MindmapEdge, MindmapNode } from "../types/mindmap";
import { buildHierarchy } from "./hierarchy";
import { createId } from "./id";

export function createTextNodeNearParent(parent: MindmapNode): MindmapNode {
  return {
    id: createId("node"),
    kind: "text",
    title: DEFAULT_TEXT_NODE_TITLE,
    x: parent.x + 220,
    y: parent.y + 80,
    width: DEFAULT_NODE_WIDTH,
    height: DEFAULT_NODE_HEIGHT,
    treeControl: "auto",
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
  if (ancestorId === nodeId) return false;
  const childrenById = getMindmapChildrenById(doc);

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

export function moveMindmapNode(
  doc: MindmapDocument,
  args: { nodeId: string; newParentId: string; targetIndex: number },
): MindmapDocument {
  const next = structuredClone(doc);
  if (args.nodeId === args.newParentId) return next;
  const incomingIndex = next.edges.findIndex((edge) => edge.relation === "mindmap" && edge.target === args.nodeId);
  if (incomingIndex < 0) return next;

  if (isDescendantNode(next, args.nodeId, args.newParentId)) return next;

  const incomingEdge = next.edges[incomingIndex] as MindmapEdge;
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

function getMindmapChildrenById(doc: MindmapDocument): Map<string, string[]> {
  const childrenById = new Map<string, string[]>();
  for (const node of doc.nodes) childrenById.set(node.id, []);
  for (const edge of doc.edges) {
    if (edge.relation !== "mindmap") continue;
    childrenById.get(edge.source)?.push(edge.target);
  }
  return childrenById;
}
