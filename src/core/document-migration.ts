import type { MindmapDocument, MindmapNode } from "../types/mindmap";
import { runMigrations } from "../migrations/migration-runner";

export function migrateDocument(input: Partial<MindmapDocument>): MindmapDocument {
  const migrated = runMigrations(input);
  const doc = migrated as MindmapDocument;
  const rawLayoutMode = (migrated as { layoutMode?: string }).layoutMode;

  return {
    version: 1,
    title: doc.title ?? "Untitled Mindmap",
    layoutMode:
      rawLayoutMode === "radial" || rawLayoutMode == null
        ? "tree-mirror"
        : rawLayoutMode === "tree-right" || rawLayoutMode === "free"
          ? rawLayoutMode
          : "tree-mirror",
    viewport: doc.viewport ?? { x: 0, y: 0, zoom: 1 },
    nodes: Array.isArray(doc.nodes) ? doc.nodes.map(migrateNode) : [],
    edges: Array.isArray(doc.edges)
      ? doc.edges.map((edge) => ({
          ...edge,
          relation: edge.relation ?? "mindmap",
          type: edge.type ?? "curve",
        }))
      : [],
  };
}

function migrateNode(node: MindmapNode): MindmapNode {
  const next: MindmapNode = {
    ...node,
    kind: node.kind ?? "text",
    treeControl: node.treeControl ?? "auto",
  };

  if (next.link && !next.notebook) {
    next.kind = "notebook";
    next.notebook = {
      link: next.link,
      targetType: detectNotebookTargetType(next.link),
    };
  }

  return next;
}

export function detectNotebookTargetType(link: string): "file" | "heading" | "block" {
  if (link.includes("#^")) return "block";
  if (link.includes("#")) return "heading";
  return "file";
}
