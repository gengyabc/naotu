import type { MindmapNode } from "../types/mindmap";

export const NOTEBOOK_MIN_CUSTOM_WIDTH = 200;
export const NOTEBOOK_MIN_CUSTOM_HEIGHT = 150;

export function getCustomNotebookSize(node: MindmapNode): { width: number; height: number } | null {
  if (
    node.kind !== "notebook" ||
    typeof node.customWidth !== "number" ||
    typeof node.customHeight !== "number"
  ) {
    return null;
  }

  return {
    width: Math.max(NOTEBOOK_MIN_CUSTOM_WIDTH, Math.round(node.customWidth)),
    height: Math.max(NOTEBOOK_MIN_CUSTOM_HEIGHT, Math.round(node.customHeight)),
  };
}

export function getStoredNodeSize(node: MindmapNode): { width: number; height: number } {
  return getCustomNotebookSize(node) ?? { width: node.width, height: node.height };
}
