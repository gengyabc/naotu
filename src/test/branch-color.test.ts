import { describe, it, expect } from "vitest";
import { computeBranchMeta, getBranchPaletteItem } from "../core/branch-color";

function makeArgs(overrides: {
  rootId?: string;
  childrenById?: Map<string, string[]>;
  visibleNodeIds?: Set<string>;
}) {
  return {
    rootId: overrides.rootId,
    childrenById: overrides.childrenById ?? new Map(),
    visibleNodeIds: overrides.visibleNodeIds ?? new Set(),
  };
}

describe("computeBranchMeta", () => {
  it("returns empty map when rootId is undefined", () => {
    const result = computeBranchMeta(makeArgs({ rootId: undefined }));
    expect(result.size).toBe(0);
  });

  it("returns empty map when root has no children", () => {
    const result = computeBranchMeta(
      makeArgs({
        rootId: "root",
        childrenById: new Map([["root", []]]),
        visibleNodeIds: new Set(["root"]),
      }),
    );
    expect(result.size).toBe(0);
  });

  it("assigns distinct branch colors to root's immediate children", () => {
    const childrenById = new Map([
      ["root", ["a", "b", "c"]],
      ["a", []],
      ["b", []],
      ["c", []],
    ]);
    const visible = new Set(["root", "a", "b", "c"]);
    const result = computeBranchMeta(makeArgs({ rootId: "root", childrenById, visibleNodeIds: visible }));

    expect(result.size).toBe(3);
    expect(result.get("a")!.branchColor).not.toBe(result.get("b")!.branchColor);
    expect(result.get("b")!.branchColor).not.toBe(result.get("c")!.branchColor);
  });

  it("propagates parent branch color to descendants", () => {
    const childrenById = new Map([
      ["root", ["a"]],
      ["a", ["a1", "a2"]],
      ["a1", []],
      ["a2", []],
    ]);
    const visible = new Set(["root", "a", "a1", "a2"]);
    const result = computeBranchMeta(makeArgs({ rootId: "root", childrenById, visibleNodeIds: visible }));

    expect(result.get("a")!.branchColor).toBe(result.get("a1")!.branchColor);
    expect(result.get("a")!.branchColor).toBe(result.get("a2")!.branchColor);
  });

  it("wraps around palette after 8 branches", () => {
    const children = Array.from({ length: 10 }, (_, i) => `c${i}`);
    const childrenById = new Map([["root", children]]);
    children.forEach((c) => childrenById.set(c, []));
    const visible = new Set(["root", ...children]);
    const result = computeBranchMeta(makeArgs({ rootId: "root", childrenById, visibleNodeIds: visible }));

    expect(result.get("c0")!.branchColor).toBe(result.get("c8")!.branchColor);
    expect(result.get("c1")!.branchColor).toBe(result.get("c9")!.branchColor);
  });

  it("skips invisible children", () => {
    const childrenById = new Map([
      ["root", ["a", "b"]],
      ["a", []],
      ["b", []],
    ]);
    const visible = new Set(["root", "a"]);
    const result = computeBranchMeta(makeArgs({ rootId: "root", childrenById, visibleNodeIds: visible }));

    expect(result.has("a")).toBe(true);
    expect(result.has("b")).toBe(false);
  });

  it("does not assign branch meta to root itself", () => {
    const childrenById = new Map([
      ["root", ["a"]],
      ["a", []],
    ]);
    const visible = new Set(["root", "a"]);
    const result = computeBranchMeta(makeArgs({ rootId: "root", childrenById, visibleNodeIds: visible }));

    expect(result.has("root")).toBe(false);
  });

  it("handles cycles in hierarchy without infinite recursion", () => {
    const childrenById = new Map([
      ["root", ["a"]],
      ["a", ["root"]],
    ]);
    const visible = new Set(["root", "a"]);
    const result = computeBranchMeta(makeArgs({ rootId: "root", childrenById, visibleNodeIds: visible }));

    expect(result.has("a")).toBe(true);
    expect(result.has("root")).toBe(true);
    expect(result.size).toBe(2);
  });
});

describe("getBranchPaletteItem", () => {
  it("returns palette items with color, soft, and border", () => {
    const item = getBranchPaletteItem(0);
    expect(item.color).toContain("var(--mindmap-branch-1)");
    expect(item.soft).toContain("var(--mindmap-branch-1-soft)");
    expect(item.border).toContain("var(--mindmap-branch-1-border)");
  });

  it("wraps around for index >= 8", () => {
    expect(getBranchPaletteItem(8)).toEqual(getBranchPaletteItem(0));
    expect(getBranchPaletteItem(9)).toEqual(getBranchPaletteItem(1));
  });
});
