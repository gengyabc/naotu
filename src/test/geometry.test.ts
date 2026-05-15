import { describe, expect, it } from "vitest";
import { nodeWorldRect } from "../core/geometry";

describe("nodeWorldRect", () => {
  it("uses clamped custom notebook size when present", () => {
    expect(
      nodeWorldRect({
        id: "n1",
        kind: "notebook",
        title: "Notebook",
        x: 400,
        y: 300,
        width: 180,
        height: 56,
        customWidth: 120,
        customHeight: 90,
        treeControl: "auto",
      }),
    ).toEqual({ x: 305, y: 255, width: 190, height: 90 });
  });
});
