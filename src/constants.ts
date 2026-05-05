import type { MindmapDocument } from "./types/mindmap";

export const VIEW_TYPE_MINDMAP = "semantic-zoom-mindmap-view";

export const DEFAULT_NOTEBOOK_FOLDER = "notebooks";

export const DEFAULT_NODE_WIDTH = 180;
export const DEFAULT_NODE_HEIGHT = 56;

export const DEFAULT_TEXT_NODE_TITLE = "新节点";
export const UNTITLED_NODE_TITLE = "未命名节点";

export const DEFAULT_MINDMAP_DOCUMENT: MindmapDocument = {
  version: 1,
  title: "Untitled Mindmap",
  layoutMode: "radial",
  viewport: {
    x: 0,
    y: 0,
    zoom: 1,
  },
  nodes: [
    {
      id: "root",
      kind: "text",
      title: "中心主题",
      x: 0,
      y: 0,
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
      treeControl: "auto",
    },
  ],
  edges: [],
};
