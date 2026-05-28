import { describe, expect, it } from "vitest";

import { shouldUseTouchZoom } from "../renderer/shared-mindmap-renderer-base";

describe("shared mindmap renderer interaction guards", () => {
  it("only enables touch zoom for multi-touch starts", () => {
    expect(shouldUseTouchZoom("touchstart", 1)).toBe(false);
    expect(shouldUseTouchZoom("touchstart", 2)).toBe(true);
    expect(shouldUseTouchZoom("touchmove", 1)).toBe(true);
  });
});
