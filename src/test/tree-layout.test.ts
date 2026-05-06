import { describe, expect, it } from "vitest";
import { TreeLayoutEngine } from "../core/tree-layout";
import { createSmallTestDocument } from "./test-fixtures";

describe("TreeLayoutEngine", () => {
  it("puts root at origin in tree-right and children on right", () => {
    const doc = createSmallTestDocument();
    const next = new TreeLayoutEngine().layout(doc, { mode: "tree-right", horizontalSpacing: 220, verticalSpacing: 80 }, "root");
    const root = next.nodes.find((n) => n.id === "root");
    const child = next.nodes.find((n) => n.id === "child");
    expect(root?.x).toBe(0);
    expect(root?.y).toBe(0);
    expect((child?.x ?? 0) > 0).toBe(true);
  });

  it("handles cyclic mindmap edges without throwing", () => {
    const doc = createSmallTestDocument();
    doc.edges.push({ id: "edge2", source: "child", target: "root", relation: "mindmap", type: "curve" });
    expect(() =>
      new TreeLayoutEngine().layout(doc, { mode: "tree-mirror", horizontalSpacing: 220, verticalSpacing: 80 }, "root"),
    ).not.toThrow();
  });
});
