import type { MindmapDocument, MindmapEdge, MindmapNode } from "../types/mindmap";

export interface HierarchyNode {
  id: string;
  node: MindmapNode;
  parentId?: string;
  childrenIds: string[];
  depth: number;
}

export interface MindmapHierarchy {
  rootId?: string;
  nodes: Map<string, HierarchyNode>;
  parentById: Map<string, string>;
  childrenById: Map<string, string[]>;
  mindmapEdges: MindmapEdge[];
  referenceEdges: MindmapEdge[];
}

export function buildHierarchy(doc: MindmapDocument): MindmapHierarchy {
  const nodes = new Map<string, HierarchyNode>();
  const parentById = new Map<string, string>();
  const childrenById = new Map<string, string[]>();

  for (const node of doc.nodes) {
    nodes.set(node.id, { id: node.id, node, childrenIds: [], depth: 0 });
    childrenById.set(node.id, []);
  }

  const mindmapEdges = doc.edges.filter((edge) => edge.relation === "mindmap");
  const referenceEdges = doc.edges.filter((edge) => edge.relation === "reference");

  for (const edge of mindmapEdges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) continue;
    if (parentById.has(edge.target)) continue;
    parentById.set(edge.target, edge.source);
    childrenById.get(edge.source)?.push(edge.target);
  }

  for (const [id, children] of childrenById) {
    const item = nodes.get(id);
    if (!item) continue;
    item.childrenIds = children;
    for (const childId of children) {
      const child = nodes.get(childId);
      if (child) child.parentId = id;
    }
  }

  const rootId = doc.nodes.find((node) => !parentById.has(node.id))?.id ?? doc.nodes[0]?.id;
  if (rootId) assignDepth(rootId, 0, nodes, childrenById, new Set());

  return { rootId, nodes, parentById, childrenById, mindmapEdges, referenceEdges };
}

function assignDepth(
  id: string,
  depth: number,
  nodes: Map<string, HierarchyNode>,
  childrenById: Map<string, string[]>,
  visited: Set<string>,
): void {
  if (visited.has(id)) return;
  visited.add(id);
  const item = nodes.get(id);
  if (item) item.depth = depth;
  for (const childId of childrenById.get(id) ?? []) {
    assignDepth(childId, depth + 1, nodes, childrenById, visited);
  }
}

export function getAncestorPath(id: string, hierarchy: MindmapHierarchy): string[] {
  const result: string[] = [];
  let current: string | undefined = id;
  while (current) {
    result.push(current);
    current = hierarchy.parentById.get(current);
  }
  return result.reverse();
}
