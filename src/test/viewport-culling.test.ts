import { describe, expect, it } from "vitest";
import { shouldCullProjection } from "../core/viewport-culling";

describe("shouldCullProjection", () => {
  it("respects the feature toggle", () => {
    expect(shouldCullProjection(1000, { enableViewportCulling: false, cullingNodeThreshold: 1 })).toBe(false);
  });

  it("uses the configured threshold", () => {
    expect(shouldCullProjection(500, { enableViewportCulling: true, cullingNodeThreshold: 500 })).toBe(false);
    expect(shouldCullProjection(501, { enableViewportCulling: true, cullingNodeThreshold: 500 })).toBe(true);
  });
});
