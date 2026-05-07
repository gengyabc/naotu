import type { MindmapDocument, MindmapEdge, MindmapNode } from "../types/mindmap";
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from "../constants";
import { DEFAULT_LAYOUT_HORIZONTAL_SPACING, DEFAULT_LAYOUT_VERTICAL_SPACING } from "../types/settings";
import { createId } from "./id";
import { TreeLayoutEngine } from "./tree-layout";

export function createSampleMindmap(nodeCount: number): MindmapDocument {
  const nodes: MindmapNode[] = [];
  const edges: MindmapEdge[] = [];
  const rootId = "root";

  nodes.push({
    id: rootId,
    kind: "text",
    title: "Sample Root",
    x: 0,
    y: 0,
    width: DEFAULT_NODE_WIDTH,
    height: DEFAULT_NODE_HEIGHT,
    treeControl: "manual-expanded",
  });

  for (let i = 1; i < nodeCount; i++) {
    const id = createId("node");
    const parentIndex = Math.floor((i - 1) / 4);
    const parentId = nodes[parentIndex]?.id ?? rootId;

    nodes.push({
      id,
      kind: i % 7 === 0 ? "notebook" : "text",
      title: `Node ${i}`,
      x: 0,
      y: 0,
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
      treeControl: i < 50 ? "manual-expanded" : "auto",
      notebook:
        i % 7 === 0
          ? {
              link: `[[Sample Node ${i}]]`,
              targetType: "file",
            }
          : undefined,
    });

    edges.push({
      id: createId("edge"),
      source: parentId,
      target: id,
      relation: "mindmap",
      type: "curve",
    });
  }

  const doc: MindmapDocument = {
    version: 1,
    title: `Sample ${nodeCount}`,
    layoutMode: "tree-mirror",
    viewport: { x: 400, y: 300, zoom: 1 },
    nodes,
    edges,
  };

  return new TreeLayoutEngine().layout(
    doc,
    {
      mode: "tree-mirror",
      horizontalSpacing: DEFAULT_LAYOUT_HORIZONTAL_SPACING,
      verticalSpacing: DEFAULT_LAYOUT_VERTICAL_SPACING,
    },
    rootId,
  );
}
