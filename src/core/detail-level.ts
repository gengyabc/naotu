import type { NodeDetailLevel, NodeKind } from "../types/mindmap";

export interface DetailVisualSpec {
  width: number;
  height: number;
  titleFontSize: number;
  fontSize: number;
  showSummary: boolean;
  showLink: boolean;
  showPreview: boolean;
}

export function zoomToBaseDetailLevel(zoom: number): NodeDetailLevel {
  if (zoom < 0.25) return 0;
  if (zoom < 0.5) return 1;
  if (zoom < 0.9) return 2;
  if (zoom < 1.4) return 3;
  if (zoom < 2.0) return 4;
  return 5;
}

export function clampDetailLevel(value: number): NodeDetailLevel {
  if (value <= 0) return 0;
  if (value === 1) return 1;
  if (value === 2) return 2;
  if (value === 3) return 3;
  if (value === 4) return 4;
  return 5;
}

export function getVisualSpec(kind: NodeKind, level: NodeDetailLevel): DetailVisualSpec {
  if (kind === "text") return getTextSpec(level);
  return getNotebookSpec(level);
}

function getTextSpec(level: NodeDetailLevel): DetailVisualSpec {
  if (level === 0) {
    return {
      width: 96,
      height: 32,
      titleFontSize: 12,
      fontSize: 12,
      showSummary: false,
      showLink: false,
      showPreview: false,
    };
  }

  return {
    width: 180,
    height: 54,
    titleFontSize: 14,
    fontSize: 13,
    showSummary: false,
    showLink: false,
    showPreview: false,
  };
}

function getNotebookSpec(level: NodeDetailLevel): DetailVisualSpec {
  switch (level) {
    case 0:
      return { width: 110, height: 34, titleFontSize: 12, fontSize: 12, showSummary: false, showLink: false, showPreview: false };
    case 1:
      return { width: 150, height: 46, titleFontSize: 14, fontSize: 13, showSummary: false, showLink: false, showPreview: false };
    case 2:
      return { width: 190, height: 66, titleFontSize: 14, fontSize: 13, showSummary: false, showLink: false, showPreview: false };
    case 3:
      return { width: 240, height: 96, titleFontSize: 14, fontSize: 13, showSummary: true, showLink: false, showPreview: false };
    case 4:
      return { width: 280, height: 126, titleFontSize: 14, fontSize: 13, showSummary: true, showLink: true, showPreview: false };
    case 5:
      return { width: 360, height: 300, titleFontSize: 14, fontSize: 13, showSummary: true, showLink: true, showPreview: true };
  }
}
