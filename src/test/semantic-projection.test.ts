import { describe, expect, it } from "vitest";
import { createSemanticProjection } from "../core/semantic-projection";
import { createSmallTestDocument } from "./test-fixtures";

describe("createSemanticProjection", () => {
  it("keeps root visible", () => {
    const doc = createSmallTestDocument();

    const projection = createSemanticProjection(doc, {
      zoom: 0.2,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: [],
    });

    expect(projection.visibleNodeIds.has("root")).toBe(true);
  });

  it("shows edges when both endpoints are visible", () => {
    const doc = createSmallTestDocument();

    const projection = createSemanticProjection(doc, {
      zoom: 1,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: [],
    });

    expect(projection.edges.some((edge) => edge.id === "edge1")).toBe(true);
  });
});
