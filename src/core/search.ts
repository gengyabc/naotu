import type { MindmapNode } from "../types/mindmap";

export function searchNodes(nodes: MindmapNode[], query: string): MindmapNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return nodes.filter((node) => {
    const fields = [node.title, node.notebook?.link, node.notebook?.path, node.link, ...(node.tags ?? [])];

    return fields.filter(Boolean).some((field) => String(field).toLowerCase().includes(q));
  });
}
