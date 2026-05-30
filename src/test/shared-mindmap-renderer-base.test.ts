import { describe, expect, it } from "vitest";

import { canWheelResizeNotebookNode, shouldUseTouchZoom } from "../renderer/shared-mindmap-renderer-base";

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
});
