import { describe, expect, it } from "vitest";
import {
  calculateAspectRatioSize,
  calculateInitialEmbeddedSize,
  getNextEmbeddedNotebookWheelSize,
} from "../core/file-dimensions";
import { getCustomNotebookSize } from "../core/notebook-size";
import type { MindmapNode } from "../types/mindmap";

describe("embedded file sizing regressions", () => {
  it("preserves aspect ratio when minimum bounds upscale a narrow asset", () => {
    const result = calculateAspectRatioSize(100, 400);

    expect(result).toEqual({ width: 200, height: 800, aspectRatio: 0.25 });
    expect(result.width / result.height).toBeCloseTo(result.aspectRatio, 5);
  });

  it("starts embedded notebook nodes near summary size while preserving aspect ratio", () => {
    expect(calculateInitialEmbeddedSize(1200, 600)).toEqual({ width: 240, height: 120, aspectRatio: 2 });
    expect(calculateInitialEmbeddedSize(600, 1200)).toEqual({ width: 90, height: 180, aspectRatio: 0.5 });
  });

  it("keeps stored embedded notebook sizes at their small initial aspect-ratio size", () => {
    const size = getCustomNotebookSize({
      id: "node-1",
      kind: "notebook",
      title: "Photo",
      x: 0,
      y: 0,
      width: 180,
      height: 56,
      customWidth: 90,
      customHeight: 180,
      aspectRatio: 0.25,
      treeControl: "auto",
      notebook: {
        link: "[[assets/photo.png]]",
        path: "assets/photo.png",
        targetType: "file",
        targetKind: "image",
      },
      link: "[[assets/photo.png]]",
    } satisfies MindmapNode);

    expect(size).toEqual({ width: 90, height: 180 });
  });

  it("snaps embedded wheel resize through aspect-ratio-preserving presets", () => {
    expect(getNextEmbeddedNotebookWheelSize({ width: 240, height: 120, direction: "grow", aspectRatio: 2 })).toEqual({
      width: 360,
      height: 180,
    });
    expect(getNextEmbeddedNotebookWheelSize({ width: 360, height: 180, direction: "shrink", aspectRatio: 2 })).toEqual({
      width: 240,
      height: 120,
    });
    expect(getNextEmbeddedNotebookWheelSize({ width: 500, height: 250, direction: "shrink", aspectRatio: 2 })).toEqual({
      width: 360,
      height: 180,
    });
    expect(getNextEmbeddedNotebookWheelSize({ width: 360, height: 180, direction: "grow", aspectRatio: 2 })).toBeNull();
  });

  it("never enlarges a dimension while shrinking embedded wheel presets", () => {
    expect(getNextEmbeddedNotebookWheelSize({ width: 120, height: 150, direction: "shrink", aspectRatio: 0.5 })).toBeNull();
    expect(getNextEmbeddedNotebookWheelSize({ width: 181, height: 361, direction: "shrink", aspectRatio: 0.5 })).toEqual({
      width: 150,
      height: 300,
    });
  });

  it("falls back to generic embedded wheel presets when aspect ratio is unknown", () => {
    expect(getNextEmbeddedNotebookWheelSize({ width: 240, height: 96, direction: "grow" })).toEqual({ width: 240, height: 180 });
    expect(getNextEmbeddedNotebookWheelSize({ width: 240, height: 180, direction: "grow" })).toEqual({ width: 360, height: 300 });
    expect(getNextEmbeddedNotebookWheelSize({ width: 360, height: 300, direction: "shrink" })).toEqual({ width: 240, height: 180 });
    expect(getNextEmbeddedNotebookWheelSize({ width: 240, height: 96, direction: "shrink" })).toBeNull();
  });
});
