import { describe, expect, it } from "vitest";
import { clampNotebookResizeSize, screenDragDeltaToWorldDelta, shouldStartNodeDrag } from "../renderer/projected-node-renderer";

describe("projected node dragging", () => {
  it("maps screen drag deltas directly to document movement under semantic zoom", () => {
    expect(screenDragDeltaToWorldDelta({ dx: 32, dy: -18 })).toEqual({ dx: 32, dy: -18 });
    expect(screenDragDeltaToWorldDelta({ dx: 12.5, dy: 7.25 })).toEqual({ dx: 12.5, dy: 7.25 });
  });

  it("clamps notebook resize size to minimum bounds", () => {
    expect(clampNotebookResizeSize(120, 90)).toEqual({ width: 200, height: 150 });
  });

  it("rounds notebook resize size before persisting", () => {
    expect(clampNotebookResizeSize(420.7, 260.2)).toEqual({ width: 421, height: 260 });
  });

  it("does not start node dragging from notebook controls", () => {
    expect(
      shouldStartNodeDrag({ closest: (selector: string) => (selector.includes("mindmap-node-resize-handle") ? {} : null) } as unknown as EventTarget),
    ).toBe(false);
    expect(shouldStartNodeDrag({ closest: () => null } as unknown as EventTarget)).toBe(true);
  });
});
