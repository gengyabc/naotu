import { describe, expect, it } from "vitest";

import { isMeaningfulBoxSelectDrag, shouldUseTouchZoom } from "../renderer/shared-mindmap-renderer-base";

describe("shared mindmap renderer interaction guards", () => {
  it("only enables touch zoom for multi-touch starts", () => {
    expect(shouldUseTouchZoom("touchstart", 1)).toBe(false);
    expect(shouldUseTouchZoom("touchstart", 2)).toBe(true);
    expect(shouldUseTouchZoom("touchmove", 1)).toBe(true);
  });

  it("ignores tiny box-select drags", () => {
    expect(isMeaningfulBoxSelectDrag(0, 0)).toBe(false);
    expect(isMeaningfulBoxSelectDrag(3, 3)).toBe(false);
    expect(isMeaningfulBoxSelectDrag(5, 0)).toBe(true);
    expect(isMeaningfulBoxSelectDrag(4, 4)).toBe(true);
  });
});
