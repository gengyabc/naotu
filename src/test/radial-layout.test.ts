import { describe, expect, it } from "vitest";
import { RadialLayoutEngine } from "../core/radial-layout";
import { createSmallTestDocument } from "./test-fixtures";

describe("RadialLayoutEngine", () => {
  it("puts root at center", () => {
    const doc = createSmallTestDocument();
    const next = new RadialLayoutEngine().layout(doc, "root");

    const root = next.nodes.find((node) => node.id === "root");

    expect(root?.x).toBe(0);
    expect(root?.y).toBe(0);
  });
});
