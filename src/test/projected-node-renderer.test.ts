import { describe, expect, it } from "vitest";
import { screenDragDeltaToWorldDelta } from "../renderer/projected-node-renderer";

describe("projected node dragging", () => {
  it("maps screen drag deltas directly to document movement under semantic zoom", () => {
    expect(screenDragDeltaToWorldDelta({ dx: 32, dy: -18 })).toEqual({ dx: 32, dy: -18 });
    expect(screenDragDeltaToWorldDelta({ dx: 12.5, dy: 7.25 })).toEqual({ dx: 12.5, dy: 7.25 });
  });
});
