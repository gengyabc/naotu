import type { MindmapDocument } from "../types/mindmap";

export function createSmallTestDocument(): MindmapDocument {
  return {
    version: 1,
    title: "Test",
    layoutMode: "tree-mirror",
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "root",
        kind: "text",
        title: "Root",
        x: 0,
        y: 0,
        width: 180,
        height: 56,
        treeControl: "manual-expanded",
      },
      {
        id: "child",
        kind: "text",
        title: "Child",
        x: 200,
        y: 0,
        width: 180,
        height: 56,
        treeControl: "auto",
      },
    ],
    edges: [
      {
        id: "edge1",
        source: "root",
        target: "child",
        relation: "mindmap",
        type: "curve",
      },
    ],
  };
}
