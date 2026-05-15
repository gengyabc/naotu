import type { MindmapNode } from "../types/mindmap";
import { isEmbeddedFileNodeTargetKind } from "./file-node-support";

export const NOTEBOOK_MIN_CUSTOM_WIDTH = 200;
export const NOTEBOOK_MIN_CUSTOM_HEIGHT = 150;
export const NOTEBOOK_COMPACT_WIDTH = 190;
export const NOTEBOOK_COMPACT_HEIGHT = 66;
export const NOTEBOOK_SUMMARY_WIDTH = 240;
export const NOTEBOOK_SUMMARY_HEIGHT = 96;
export const NOTEBOOK_EXPANDED_WIDTH = 360;
export const NOTEBOOK_EXPANDED_HEIGHT = 300;

type NotebookPresetSize = { width: number; height: number };

const MARKDOWN_NOTEBOOK_WHEEL_PRESETS: NotebookPresetSize[] = [
  { width: NOTEBOOK_COMPACT_WIDTH, height: NOTEBOOK_COMPACT_HEIGHT },
  { width: NOTEBOOK_SUMMARY_WIDTH, height: NOTEBOOK_SUMMARY_HEIGHT },
  { width: NOTEBOOK_EXPANDED_WIDTH, height: NOTEBOOK_EXPANDED_HEIGHT },
];

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

export function clampMarkdownNotebookSize(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.max(NOTEBOOK_COMPACT_WIDTH, Math.round(width)),
    height: Math.max(NOTEBOOK_COMPACT_HEIGHT, Math.round(height)),
  };
}

export function getDefaultMarkdownNotebookSize(): { width: number; height: number } {
  return { width: NOTEBOOK_SUMMARY_WIDTH, height: NOTEBOOK_SUMMARY_HEIGHT };
}

export function getNextMarkdownNotebookWheelSize(args: {
  width: number;
  height: number;
  direction: "grow" | "shrink";
}): { width: number; height: number } | null {
  if (args.direction === "grow") {
    return MARKDOWN_NOTEBOOK_WHEEL_PRESETS.find((preset) => preset.width > args.width || preset.height > args.height) ?? null;
  }

  for (let index = MARKDOWN_NOTEBOOK_WHEEL_PRESETS.length - 1; index >= 0; index -= 1) {
    const preset = MARKDOWN_NOTEBOOK_WHEEL_PRESETS[index];
    if (preset.width < args.width || preset.height < args.height) return preset;
  }

  return null;
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
    if (isEmbeddedFileNodeTargetKind(node.notebook?.targetKind)) {
      return {
        width: Math.max(1, Math.round(node.customWidth)),
        height: Math.max(1, Math.round(node.customHeight)),
      };
    }
    return clampNotebookAspectRatioSize(node.customWidth, node.customHeight, node.aspectRatio);
  }

  return {
    width: Math.max(NOTEBOOK_COMPACT_WIDTH, Math.round(node.customWidth)),
    height: Math.max(NOTEBOOK_COMPACT_HEIGHT, Math.round(node.customHeight)),
  };
}

export function getStoredNodeSize(node: MindmapNode): { width: number; height: number } {
  return getCustomNotebookSize(node) ?? { width: node.width, height: node.height };
}
