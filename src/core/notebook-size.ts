import type { MindmapNode } from "../types/mindmap";

export const NOTEBOOK_MIN_CUSTOM_WIDTH = 200;
export const NOTEBOOK_MIN_CUSTOM_HEIGHT = 150;

export function clampNotebookAspectRatioSize(
  width: number,
  height: number,
  aspectRatio: number,
  axis: "width" | "height" = "width",
): { width: number; height: number } {
  if (!(aspectRatio > 0)) {
    return {
      width: Math.max(NOTEBOOK_MIN_CUSTOM_WIDTH, Math.round(width)),
      height: Math.max(NOTEBOOK_MIN_CUSTOM_HEIGHT, Math.round(height)),
    };
  }

  if (axis === "height") {
    let nextHeight = Math.max(NOTEBOOK_MIN_CUSTOM_HEIGHT, Math.round(height));
    let nextWidth = Math.round(nextHeight * aspectRatio);
    if (nextWidth < NOTEBOOK_MIN_CUSTOM_WIDTH) {
      nextWidth = NOTEBOOK_MIN_CUSTOM_WIDTH;
      nextHeight = Math.max(NOTEBOOK_MIN_CUSTOM_HEIGHT, Math.round(nextWidth / aspectRatio));
    }
    return { width: nextWidth, height: nextHeight };
  }

  let nextWidth = Math.max(NOTEBOOK_MIN_CUSTOM_WIDTH, Math.round(width));
  let nextHeight = Math.round(nextWidth / aspectRatio);
  if (nextHeight < NOTEBOOK_MIN_CUSTOM_HEIGHT) {
    nextHeight = NOTEBOOK_MIN_CUSTOM_HEIGHT;
    nextWidth = Math.max(NOTEBOOK_MIN_CUSTOM_WIDTH, Math.round(nextHeight * aspectRatio));
  }
  return { width: nextWidth, height: nextHeight };
}

export function getCustomNotebookSize(node: MindmapNode): { width: number; height: number } | null {
  if (
    node.kind !== "notebook" ||
    typeof node.customWidth !== "number" ||
    typeof node.customHeight !== "number"
  ) {
    return null;
  }

  if (typeof node.aspectRatio === "number" && node.aspectRatio > 0) {
    return clampNotebookAspectRatioSize(node.customWidth, node.customHeight, node.aspectRatio);
  }

  return {
    width: Math.max(NOTEBOOK_MIN_CUSTOM_WIDTH, Math.round(node.customWidth)),
    height: Math.max(NOTEBOOK_MIN_CUSTOM_HEIGHT, Math.round(node.customHeight)),
  };
}

export function getStoredNodeSize(node: MindmapNode): { width: number; height: number } {
  return getCustomNotebookSize(node) ?? { width: node.width, height: node.height };
}
