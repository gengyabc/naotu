import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH, DEFAULT_TEXT_NODE_TITLE } from "../constants";
import type { MindmapDocument, MindmapNode } from "../types/mindmap";
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
