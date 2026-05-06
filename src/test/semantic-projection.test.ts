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

  it("handles cyclic hierarchies without recursing forever", () => {
    const doc = createSmallTestDocument();
    doc.edges.push({
      id: "edge2",
      source: "child",
      target: "root",
      relation: "mindmap",
      type: "curve",
    });

    expect(() =>
      createSemanticProjection(doc, {
        zoom: 1,
        viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
        selectedNodeIds: ["child"],
      }),
    ).not.toThrow();
  });

  it("keeps center-anchored nodes separated when zoomed out", () => {
    const doc = createSmallTestDocument();
    doc.nodes[0]!.x = 0;
    doc.nodes[0]!.y = 0;
    doc.nodes[1]!.x = 220;
    doc.nodes[1]!.y = 0;

    const projection = createSemanticProjection(doc, {
      zoom: 0.2,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["child"],
    });

    const root = projection.nodes.find((node) => node.id === "root");
    const child = projection.nodes.find((node) => node.id === "child");
    expect(root).toBeDefined();
    expect(child).toBeDefined();
    expect((child?.projectedX ?? 0) - (root?.projectedX ?? 0)).toBeGreaterThan(100);
  });
});
