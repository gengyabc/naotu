import { describe, expect, it } from "vitest";

import { canWheelResizeNotebookNode, getElementViewportSize, getSvgZoomExtent, shouldUseTouchZoom } from "../renderer/shared-mindmap-renderer-base";

describe("shared mindmap renderer interaction guards", () => {
  it("only enables touch zoom for multi-touch starts", () => {
    expect(shouldUseTouchZoom("touchstart", 1)).toBe(false);
    expect(shouldUseTouchZoom("touchstart", 2)).toBe(true);
    expect(shouldUseTouchZoom("touchmove", 1)).toBe(true);
  });

  it("only resizes notebook nodes from wheel when they are selected or focused", () => {
    expect(canWheelResizeNotebookNode({
      nodeId: "note",
      nodeKind: "notebook",
      selectedNodeIds: ["note"],
    })).toBe(true);

    expect(canWheelResizeNotebookNode({
      nodeId: "note",
      nodeKind: "notebook",
      selectedNodeIds: [],
      lastFocusNodeId: "note",
    })).toBe(true);

    expect(canWheelResizeNotebookNode({
      nodeId: "note",
      nodeKind: "notebook",
      selectedNodeIds: [],
      lastFocusNodeId: "other",
    })).toBe(false);

    expect(canWheelResizeNotebookNode({
      nodeId: "text",
      nodeKind: "text",
      selectedNodeIds: ["text"],
      lastFocusNodeId: "text",
    })).toBe(false);
  });

  it("computes zoom extents from element bounds without reading SVG length values", () => {
    const svgElement = {
      getBoundingClientRect: () => ({ width: 640, height: 480 }),
      get width(): never {
        throw new Error("should not read SVG width.baseVal");
      },
      get height(): never {
        throw new Error("should not read SVG height.baseVal");
      },
    } as unknown as SVGSVGElement;

    const containerElement = {
      getBoundingClientRect: () => ({ width: 1200, height: 800 }),
    } as unknown as HTMLElement;

    expect(getSvgZoomExtent(svgElement, containerElement)).toEqual([[0, 0], [640, 480]]);
  });

  it("normalizes viewport dimensions to positive pixel values", () => {
    expect(getElementViewportSize({
      getBoundingClientRect: () => ({ width: 0, height: 0 } as DOMRect),
    })).toEqual({ width: 1, height: 1 });

    expect(getElementViewportSize({
      getBoundingClientRect: () => ({ width: 320, height: 240 } as DOMRect),
    })).toEqual({ width: 320, height: 240 });
  });
});
