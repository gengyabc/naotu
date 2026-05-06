import { describe, expect, it } from "vitest";
import { createSemanticProjection } from "../core/semantic-projection";
import { createSmallTestDocument } from "./test-fixtures";

function toScreenRect(node: { projectedX: number; projectedY: number; displayWidth: number; displayHeight: number }, zoom: number, viewportX: number, viewportY: number) {
  return {
    left: node.projectedX * zoom - viewportX * zoom,
    top: node.projectedY * zoom - viewportY * zoom,
    right: node.projectedX * zoom - viewportX * zoom + node.displayWidth,
    bottom: node.projectedY * zoom - viewportY * zoom + node.displayHeight,
  };
}

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

    const rootRect = toScreenRect(root!, 0.2, -1000, -1000);
    const childRect = toScreenRect(child!, 0.2, -1000, -1000);
    expect(childRect.left).toBeGreaterThan(rootRect.right);
  });

  it("keeps screen spacing stable across zoom levels", () => {
    const doc = createSmallTestDocument();
    doc.nodes[0]!.x = 0;
    doc.nodes[1]!.x = 220;

    const zoomedOut = createSemanticProjection(doc, {
      zoom: 0.2,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["child"],
    });
    const zoomedIn = createSemanticProjection(doc, {
      zoom: 2,
      viewportWorldRect: { x: -100, y: -100, width: 200, height: 200 },
      selectedNodeIds: ["child"],
    });

    const outRoot = zoomedOut.nodes.find((node) => node.id === "root");
    const outChild = zoomedOut.nodes.find((node) => node.id === "child");
    const inRoot = zoomedIn.nodes.find((node) => node.id === "root");
    const inChild = zoomedIn.nodes.find((node) => node.id === "child");

    const outGap = toScreenRect(outChild!, 0.2, -1000, -1000).left - toScreenRect(outRoot!, 0.2, -1000, -1000).right;
    const inGap = toScreenRect(inChild!, 2, -100, -100).left - toScreenRect(inRoot!, 2, -100, -100).right;

    expect(Math.abs(outGap - inGap)).toBeLessThan(8);
  });

  it("reveals auto-expanded descendants one depth at a time", () => {
    const doc = createSmallTestDocument();
    doc.nodes.push(
      {
        id: "grandchild",
        kind: "text",
        title: "Grandchild",
        x: 400,
        y: 0,
        width: 180,
        height: 56,
        treeControl: "auto",
      },
      {
        id: "greatgrandchild",
        kind: "text",
        title: "GreatGrandchild",
        x: 600,
        y: 0,
        width: 180,
        height: 56,
        treeControl: "auto",
      },
    );
    doc.edges.push(
      { id: "edge2", source: "child", target: "grandchild", relation: "mindmap", type: "curve" },
      { id: "edge3", source: "grandchild", target: "greatgrandchild", relation: "mindmap", type: "curve" },
    );

    const z055 = createSemanticProjection(doc, {
      zoom: 0.55,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: [],
    });
    const z07 = createSemanticProjection(doc, {
      zoom: 0.7,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: [],
    });
    const z085 = createSemanticProjection(doc, {
      zoom: 0.85,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: [],
    });

    expect(z055.visibleNodeIds.has("child")).toBe(true);
    expect(z055.visibleNodeIds.has("grandchild")).toBe(false);
    expect(z07.visibleNodeIds.has("grandchild")).toBe(true);
    expect(z07.visibleNodeIds.has("greatgrandchild")).toBe(false);
    expect(z085.visibleNodeIds.has("greatgrandchild")).toBe(true);
  });

  it("applies forced detail during projection sizing", () => {
    const doc = createSmallTestDocument();
    doc.nodes[1] = {
      ...doc.nodes[1]!,
      kind: "notebook",
      notebook: { link: "[[Child]]", path: "notes/child.md", targetType: "file" },
      link: "[[Child]]",
    };

    const projection = createSemanticProjection(
      doc,
      {
        zoom: 1,
        viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
        selectedNodeIds: [],
      },
      {
        forcedDetailLevels: new Map([["child", 5]]),
      },
    );

    const child = projection.nodes.find((node) => node.id === "child");
    expect(child?.detailLevel).toBe(5);
    expect(child?.displayWidth).toBe(360);
    expect(child?.displayHeight).toBe(300);
  });

  it("uses custom size for level 5 notebook nodes", () => {
    const doc = createSmallTestDocument();
    doc.nodes[1] = {
      ...doc.nodes[1]!,
      kind: "notebook",
      notebook: { link: "[[Child]]", path: "notes/child.md", targetType: "file" },
      link: "[[Child]]",
      customWidth: 520,
      customHeight: 260,
    };

    const projection = createSemanticProjection(
      doc,
      {
        zoom: 1,
        viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
        selectedNodeIds: [],
      },
      {
        forcedDetailLevels: new Map([["child", 5]]),
      },
    );

    const child = projection.nodes.find((node) => node.id === "child");
    expect(child?.displayWidth).toBe(520);
    expect(child?.displayHeight).toBe(260);
    expect(child?.usesCustomSize).toBe(true);
  });

  it("clamps custom size for level 5 notebook nodes", () => {
    const doc = createSmallTestDocument();
    doc.nodes[1] = {
      ...doc.nodes[1]!,
      kind: "notebook",
      notebook: { link: "[[Child]]", path: "notes/child.md", targetType: "file" },
      link: "[[Child]]",
      customWidth: 120,
      customHeight: 90,
    };

    const projection = createSemanticProjection(
      doc,
      {
        zoom: 1,
        viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
        selectedNodeIds: [],
      },
      {
        forcedDetailLevels: new Map([["child", 5]]),
      },
    );

    const child = projection.nodes.find((node) => node.id === "child");
    expect(child?.displayWidth).toBe(200);
    expect(child?.displayHeight).toBe(150);
  });

  it("settles expanded notebook overlaps out of screen space", () => {
    const doc = createSmallTestDocument();
    doc.nodes[0] = {
      ...doc.nodes[0]!,
      kind: "notebook",
      notebook: { link: "[[Root]]", path: "notes/root.md", targetType: "file" },
      link: "[[Root]]",
      x: 0,
      y: 0,
    };
    doc.nodes[1] = {
      ...doc.nodes[1]!,
      kind: "text",
      x: 40,
      y: 0,
    };

    const projection = createSemanticProjection(
      doc,
      {
        zoom: 1,
        viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
        selectedNodeIds: [],
      },
      {
        forcedDetailLevels: new Map([["root", 5]]),
      },
    );

    const root = projection.nodes.find((node) => node.id === "root");
    const child = projection.nodes.find((node) => node.id === "child");
    expect(root).toBeDefined();
    expect(child).toBeDefined();

    const rootRect = toScreenRect(root!, 1, -1000, -1000);
    const childRect = toScreenRect(child!, 1, -1000, -1000);
    expect(childRect.left >= rootRect.right || rootRect.left >= childRect.right || childRect.top >= rootRect.bottom || rootRect.top >= childRect.bottom).toBe(true);
  });
});
