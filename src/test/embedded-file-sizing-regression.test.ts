import { describe, expect, it } from "vitest";
import { calculateAspectRatioSize } from "../core/file-dimensions";
import { getCustomNotebookSize } from "../core/notebook-size";
import type { MindmapNode } from "../types/mindmap";

describe("embedded file sizing regressions", () => {
  it("preserves aspect ratio when minimum bounds upscale a narrow asset", () => {
    const result = calculateAspectRatioSize(100, 400);

    expect(result).toEqual({ width: 200, height: 800, aspectRatio: 0.25 });
    expect(result.width / result.height).toBeCloseTo(result.aspectRatio, 5);
  });

  it("keeps stored embedded notebook sizes aligned to aspect ratio when enforcing minimums", () => {
    const size = getCustomNotebookSize({
      id: "node-1",
      kind: "notebook",
      title: "Photo",
      x: 0,
      y: 0,
      width: 180,
      height: 56,
      customWidth: 100,
      customHeight: 400,
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

    expect(size).toEqual({ width: 200, height: 800 });
  });
});
