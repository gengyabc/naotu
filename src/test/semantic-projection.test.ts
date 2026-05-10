import { describe, expect, it } from "vitest";
import { createSemanticProjection } from "../core/semantic-projection";
import { applyNotebookFocusPolicy } from "../core/semantic-zoom-policy";
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

  it("keeps text node size stable across zoom levels", () => {
    const doc = createSmallTestDocument();

    const zoomedOut = createSemanticProjection(doc, {
      zoom: 0.2,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: [],
    });
    const zoomedIn = createSemanticProjection(doc, {
      zoom: 2,
      viewportWorldRect: { x: -100, y: -100, width: 200, height: 200 },
      selectedNodeIds: [],
    });

    const outChild = zoomedOut.nodes.find((node) => node.id === "child");
    const inChild = zoomedIn.nodes.find((node) => node.id === "child");

    expect(outChild?.displayWidth).toBe(inChild?.displayWidth);
    expect(outChild?.displayHeight).toBe(inChild?.displayHeight);
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

  it("honors manual tree toggles regardless of zoom", () => {
    const doc = createSmallTestDocument();
    doc.nodes[1]!.treeControl = "manual-collapsed";
    doc.nodes.push({
      id: "grandchild",
      kind: "text",
      title: "Grandchild",
      x: 400,
      y: 0,
      width: 180,
      height: 56,
      treeControl: "manual-expanded",
    });
    doc.edges.push({ id: "edge2", source: "child", target: "grandchild", relation: "mindmap", type: "curve" });

    const collapsed = createSemanticProjection(doc, {
      zoom: 2,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["root"],
    });

    expect(collapsed.visibleNodeIds.has("grandchild")).toBe(false);

    doc.nodes[1]!.treeControl = "manual-expanded";
    const expanded = createSemanticProjection(doc, {
      zoom: 0.2,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["root"],
    });

    expect(expanded.visibleNodeIds.has("grandchild")).toBe(true);
  });

  it("treats focus-forced visible children as expanded in the projection", () => {
    const doc = createSmallTestDocument();
    doc.nodes[0]!.treeControl = "manual-collapsed";

    const projection = createSemanticProjection(doc, {
      zoom: 1,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["child"],
    });

    const root = projection.nodes.find((node) => node.id === "root");
    expect(root?.childrenExpanded).toBe(true);
  });

  it("does not reveal a focused node's collapsed children in free layout", () => {
    const doc = createSmallTestDocument();
    doc.nodes[1]!.treeControl = "manual-collapsed";
    doc.nodes.push({
      id: "grandchild",
      kind: "text",
      title: "Grandchild",
      x: 400,
      y: 0,
      width: 180,
      height: 56,
      treeControl: "auto",
    });
    doc.edges.push({ id: "edge2", source: "child", target: "grandchild", relation: "mindmap", type: "curve" });

    const projection = createSemanticProjection(doc, {
      zoom: 1,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["child"],
    });

    const child = projection.nodes.find((node) => node.id === "child");
    expect(projection.visibleNodeIds.has("grandchild")).toBe(false);
    expect(child?.childrenExpanded).toBe(false);
  });

  it("keeps tree layout visibility stable when selecting a node", () => {
    const doc = createSmallTestDocument();
    doc.layoutMode = "tree-mirror";
    doc.nodes.push({
      id: "grandchild",
      kind: "text",
      title: "Grandchild",
      x: 400,
      y: 0,
      width: 180,
      height: 56,
      treeControl: "auto",
    });
    doc.edges.push({ id: "edge2", source: "child", target: "grandchild", relation: "mindmap", type: "curve" });

    const projection = createSemanticProjection(doc, {
      zoom: 0.5,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["child"],
    });

    expect(projection.visibleNodeIds.has("child")).toBe(true);
    expect(projection.visibleNodeIds.has("grandchild")).toBe(false);
  });

  it("always uses root as focus in tree layout regardless of selection", () => {
    const doc = createSmallTestDocument();
    doc.layoutMode = "tree-mirror";

    const projection = createSemanticProjection(doc, {
      zoom: 1,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["child"],
    });

    expect(projection.focusNodeId).toBe("root");
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

  it("keeps level 4 notebook UI the same as level 5", () => {
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
        forcedDetailLevels: new Map([["child", 4]]),
      },
    );

    const child = projection.nodes.find((node) => node.id === "child");
    expect(child?.detailLevel).toBe(4);
    expect(child?.displayWidth).toBe(520);
    expect(child?.displayHeight).toBe(260);
    expect(child?.showOpenNotebookButton).toBe(true);
    expect(child?.showResizeHandle).toBe(true);
    expect(child?.usesCustomSize).toBe(true);
  });

  it("keeps embedded file notebooks at preview size after focus moves away", () => {
    const doc = createSmallTestDocument();
    doc.nodes[1] = {
      ...doc.nodes[1]!,
      kind: "notebook",
      notebook: { link: "![[assets/photo.png]]", path: "assets/photo.png", targetType: "file", targetKind: "image" },
      link: "![[assets/photo.png]]",
      customWidth: 360,
      customHeight: 300,
    };
    doc.nodes.push({
      id: "other",
      kind: "text",
      title: "Other",
      x: 0,
      y: 300,
      width: 180,
      height: 56,
      treeControl: "auto",
    });
    doc.edges.push({ id: "edge-other", source: "root", target: "other", relation: "mindmap", type: "curve" });

    const projection = createSemanticProjection(doc, {
      zoom: 2,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["other"],
      lastFocusNodeId: "other",
    });

    const child = projection.nodes.find((node) => node.id === "child");
    expect(child?.detailLevel).toBe(3);
    expect(child?.displayWidth).toBe(360);
    expect(child?.displayHeight).toBe(300);
    expect(child?.usesCustomSize).toBe(true);
  });

  it("scales notebook size by detail level", () => {
    const doc = createSmallTestDocument();
    doc.nodes[1] = {
      ...doc.nodes[1]!,
      kind: "notebook",
      notebook: { link: "[[Child]]", path: "notes/child.md", targetType: "file" },
      link: "[[Child]]",
    };

    const lowDetail = createSemanticProjection(doc, {
      zoom: 0.2,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: [],
    });
    const highDetail = createSemanticProjection(doc, {
      zoom: 2,
      viewportWorldRect: { x: -100, y: -100, width: 200, height: 200 },
      selectedNodeIds: [],
    });

    const lowChild = lowDetail.nodes.find((node) => node.id === "child");
    const highChild = highDetail.nodes.find((node) => node.id === "child");

    expect(lowChild?.displayWidth).toBeLessThan(highChild!.displayWidth);
    expect(lowChild?.displayHeight).toBeLessThan(highChild!.displayHeight);
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

  it("settles forced expanded notebook overlaps in tree layout", () => {
    const doc = createSmallTestDocument();
    doc.layoutMode = "tree-mirror";
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
        selectedNodeIds: ["root"],
        lastFocusNodeId: "root",
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

  it("keeps a forced notebook expanded while a child node is selected", () => {
    const doc = createSmallTestDocument();
    doc.layoutMode = "tree-mirror";
    doc.nodes[0] = {
      ...doc.nodes[0]!,
      kind: "notebook",
      notebook: { link: "[[Root]]", path: "notes/root.md", targetType: "file" },
      link: "[[Root]]",
    };

    const projection = createSemanticProjection(
      doc,
      {
        zoom: 1,
        viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
        selectedNodeIds: ["child"],
        lastFocusNodeId: "child",
      },
      {
        forcedDetailLevels: new Map([["root", 5]]),
      },
    );

    const root = projection.nodes.find((node) => node.id === "root");
    expect(root?.childrenExpanded).toBe(true);
    expect(root?.displayWidth).toBe(360);
    expect(root?.displayHeight).toBe(300);
  });

  it("does not auto-resolve overlaps in free layout even for custom-sized notebooks", () => {
    const doc = createSmallTestDocument();
    doc.nodes[0] = {
      ...doc.nodes[0]!,
      kind: "notebook",
      notebook: { link: "[[Root]]", path: "notes/root.md", targetType: "file" },
      customWidth: 400,
      customHeight: 280,
      x: 0,
      y: 0,
    };
    doc.nodes[1] = {
      ...doc.nodes[1]!,
      kind: "text",
      x: 50,
      y: 0,
    };

    const projectionNoSelection = createSemanticProjection(
      doc,
      {
        zoom: 1,
        viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
        selectedNodeIds: [],
      },
      {
        forcedDetailLevels: new Map([["root", 4]]),
      },
    );

    const projectionWithSelection = createSemanticProjection(
      doc,
      {
        zoom: 1,
        viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
        selectedNodeIds: ["root"],
        lastFocusNodeId: "root",
      },
      {
        forcedDetailLevels: new Map([["root", 4]]),
      },
    );

    const rootNoSel = projectionNoSelection.nodes.find((node) => node.id === "root");
    const childNoSel = projectionNoSelection.nodes.find((node) => node.id === "child");
    const rootSel = projectionWithSelection.nodes.find((node) => node.id === "root");
    const childSel = projectionWithSelection.nodes.find((node) => node.id === "child");

    expect(rootNoSel).toBeDefined();
    expect(childNoSel).toBeDefined();
    expect(rootSel).toBeDefined();
    expect(childSel).toBeDefined();

    expect(rootSel!.projectedX).toBeCloseTo(rootNoSel!.projectedX, 1);
    expect(rootSel!.projectedY).toBeCloseTo(rootNoSel!.projectedY, 1);
    expect(childSel!.projectedX).toBeCloseTo(childNoSel!.projectedX, 1);
    expect(childSel!.projectedY).toBeCloseTo(childNoSel!.projectedY, 1);
  });

  it("does not move overlapping nodes when one is selected in free layout", () => {
    const doc = createSmallTestDocument();
    doc.nodes[0]!.x = 0;
    doc.nodes[0]!.y = 0;
    doc.nodes[1]!.x = 5;
    doc.nodes[1]!.y = 5;

    const projectionWithoutSelection = createSemanticProjection(doc, {
      zoom: 1,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: [],
    });

    const projectionWithSelection = createSemanticProjection(doc, {
      zoom: 1,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["child"],
    });

    const childUnselected = projectionWithoutSelection.nodes.find((n) => n.id === "child");
    const rootUnselected = projectionWithoutSelection.nodes.find((n) => n.id === "root");
    const childSelected = projectionWithSelection.nodes.find((n) => n.id === "child");
    const rootSelected = projectionWithSelection.nodes.find((n) => n.id === "root");

    expect(childUnselected).toBeDefined();
    expect(rootUnselected).toBeDefined();
    expect(childSelected).toBeDefined();
    expect(rootSelected).toBeDefined();

    expect(childSelected!.projectedX).toBeCloseTo(childUnselected!.projectedX, 1);
    expect(childSelected!.projectedY).toBeCloseTo(childUnselected!.projectedY, 1);
    expect(rootSelected!.projectedX).toBeCloseTo(rootUnselected!.projectedX, 1);
    expect(rootSelected!.projectedY).toBeCloseTo(rootUnselected!.projectedY, 1);
  });

  it("settles custom-sized notebook overlaps in tree layout at level 4", () => {
    const doc = createSmallTestDocument();
    doc.layoutMode = "tree-right";
    doc.nodes[0] = {
      ...doc.nodes[0]!,
      kind: "notebook",
      notebook: { link: "[[Root]]", path: "notes/root.md", targetType: "file" },
      customWidth: 400,
      customHeight: 280,
      x: 0,
      y: 0,
    };
    doc.nodes[1] = {
      ...doc.nodes[1]!,
      kind: "text",
      x: 50,
      y: 0,
    };

    const projection = createSemanticProjection(
      doc,
      {
        zoom: 1,
        viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
        selectedNodeIds: ["root"],
        lastFocusNodeId: "root",
      },
      {
        forcedDetailLevels: new Map([["root", 4]]),
      },
    );

    const root = projection.nodes.find((node) => node.id === "root");
    const child = projection.nodes.find((node) => node.id === "child");
    expect(root).toBeDefined();
    expect(child).toBeDefined();
    expect(root?.usesCustomSize).toBe(true);

    const rootRect = toScreenRect(root!, 1, -1000, -1000);
    const childRect = toScreenRect(child!, 1, -1000, -1000);
    expect(childRect.left >= rootRect.right || rootRect.left >= childRect.right || childRect.top >= rootRect.bottom || rootRect.top >= childRect.bottom).toBe(true);
  });

  it("settles regular expanded notebook overlaps in tree layout at level 4", () => {
    const doc = createSmallTestDocument();
    doc.layoutMode = "tree-right";
    doc.nodes[0] = {
      ...doc.nodes[0]!,
      kind: "notebook",
      notebook: { link: "[[Root]]", path: "notes/root.md", targetType: "file" },
      x: 0,
      y: 0,
    };
    doc.nodes[1] = {
      ...doc.nodes[1]!,
      kind: "text",
      x: 50,
      y: 0,
    };

    const projection = createSemanticProjection(
      doc,
      {
        zoom: 1.5,
        viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
        selectedNodeIds: ["root"],
        lastFocusNodeId: "root",
      },
      {
        forcedDetailLevels: new Map([["root", 4]]),
      },
    );

    const root = projection.nodes.find((node) => node.id === "root");
    const child = projection.nodes.find((node) => node.id === "child");
    expect(root).toBeDefined();
    expect(child).toBeDefined();

    const rootRect = toScreenRect(root!, 1.5, -1000, -1000);
    const childRect = toScreenRect(child!, 1.5, -1000, -1000);
    expect(childRect.left >= rootRect.right || rootRect.left >= childRect.right || childRect.top >= rootRect.bottom || rootRect.top >= childRect.bottom).toBe(true);
  });

  it("does not change relaxed tree layout positions when selecting a notebook", () => {
    const doc = createSmallTestDocument();
    doc.layoutMode = "tree-right";
    doc.nodes[0] = {
      ...doc.nodes[0]!,
      kind: "notebook",
      notebook: { link: "[[Root]]", path: "notes/root.md", targetType: "file" },
      customWidth: 400,
      customHeight: 280,
      x: 0,
      y: 0,
    };
    doc.nodes[1] = {
      ...doc.nodes[1]!,
      kind: "notebook",
      notebook: { link: "[[Child]]", path: "notes/child.md", targetType: "file" },
      customWidth: 320,
      customHeight: 220,
      x: 50,
      y: 0,
    };

    const projectionWithoutNotebookSelection = createSemanticProjection(
      doc,
      {
        zoom: 1,
        viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
        selectedNodeIds: ["root"],
        lastFocusNodeId: "root",
      },
      {
        forcedDetailLevels: new Map([["root", 4], ["child", 4]]),
      },
    );

    const projectionWithNotebookSelection = createSemanticProjection(
      doc,
      {
        zoom: 1,
        viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
        selectedNodeIds: ["child"],
        lastFocusNodeId: "child",
      },
      {
        forcedDetailLevels: new Map([["root", 4], ["child", 4]]),
      },
    );

    const rootBase = projectionWithoutNotebookSelection.nodes.find((node) => node.id === "root");
    const childBase = projectionWithoutNotebookSelection.nodes.find((node) => node.id === "child");
    const rootSelected = projectionWithNotebookSelection.nodes.find((node) => node.id === "root");
    const childSelected = projectionWithNotebookSelection.nodes.find((node) => node.id === "child");

    expect(rootBase).toBeDefined();
    expect(childBase).toBeDefined();
    expect(rootSelected).toBeDefined();
    expect(childSelected).toBeDefined();

    expect(rootSelected!.projectedX).toBeCloseTo(rootBase!.projectedX, 1);
    expect(rootSelected!.projectedY).toBeCloseTo(rootBase!.projectedY, 1);
    expect(childSelected!.projectedX).toBeCloseTo(childBase!.projectedX, 1);
    expect(childSelected!.projectedY).toBeCloseTo(childBase!.projectedY, 1);
  });

  it("still scales notebook size with zoom in tree layout", () => {
    const doc = createSmallTestDocument();
    doc.layoutMode = "tree-right";
    doc.nodes[1] = {
      ...doc.nodes[1]!,
      kind: "notebook",
      notebook: { link: "[[Child]]", path: "notes/child.md", targetType: "file" },
      link: "[[Child]]",
    };

    const lowZoom = createSemanticProjection(doc, {
      zoom: 0.2,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["root"],
      lastFocusNodeId: "root",
    });

    const highZoom = createSemanticProjection(doc, {
      zoom: 2,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["root"],
      lastFocusNodeId: "root",
    });

    const lowChild = lowZoom.nodes.find((node) => node.id === "child");
    const highChild = highZoom.nodes.find((node) => node.id === "child");

    expect(lowChild).toBeDefined();
    expect(highChild).toBeDefined();
    expect(lowChild!.displayWidth).toBeLessThan(highChild!.displayWidth);
    expect(lowChild!.displayHeight).toBeLessThan(highChild!.displayHeight);
  });
});

describe("applyNotebookFocusPolicy", () => {
  it("allows full level when notebook is the focus node", () => {
    const prev = new Map<string, 0 | 1 | 2 | 3 | 4 | 5>();
    const result = applyNotebookFocusPolicy({
      nodeId: "nb",
      kind: "notebook",
      isFocus: true,
      focusNodeId: "nb",
      focusOnRoot: false,
      computedLevel: 5,
      prevFrozenLevels: prev,
    });
    expect(result).toBe(5);
  });

  it("keeps zoom-driven level when focus is root", () => {
    const prev = new Map<string, 0 | 1 | 2 | 3 | 4 | 5>();
    const result = applyNotebookFocusPolicy({
      nodeId: "nb",
      kind: "notebook",
      isFocus: false,
      focusNodeId: "root",
      focusOnRoot: true,
      computedLevel: 5,
      prevFrozenLevels: prev,
    });
    expect(result).toBe(5);
  });

  it("caps at level 3 when there is no focus", () => {
    const prev = new Map<string, 0 | 1 | 2 | 3 | 4 | 5>();
    const result = applyNotebookFocusPolicy({
      nodeId: "nb",
      kind: "notebook",
      isFocus: false,
      focusNodeId: undefined,
      focusOnRoot: false,
      computedLevel: 5,
      prevFrozenLevels: prev,
    });
    expect(result).toBe(3);
  });

  it("freezes at previous level when focus is on another node", () => {
    const prev = new Map<string, 0 | 1 | 2 | 3 | 4 | 5>([["nb", 2]]);
    const result = applyNotebookFocusPolicy({
      nodeId: "nb",
      kind: "notebook",
      isFocus: false,
      focusNodeId: "other",
      focusOnRoot: false,
      computedLevel: 4,
      prevFrozenLevels: prev,
    });
    expect(result).toBe(2);
  });

  it("defaults to cap 3 for new notebook when focus is on another node and no previous frozen level", () => {
    const prev = new Map<string, 0 | 1 | 2 | 3 | 4 | 5>();
    const result = applyNotebookFocusPolicy({
      nodeId: "nb",
      kind: "notebook",
      isFocus: false,
      focusNodeId: "other",
      focusOnRoot: false,
      computedLevel: 5,
      prevFrozenLevels: prev,
    });
    expect(result).toBe(3);
  });

  it("passes through for text nodes", () => {
    const prev = new Map<string, 0 | 1 | 2 | 3 | 4 | 5>();
    const result = applyNotebookFocusPolicy({
      nodeId: "t",
      kind: "text",
      isFocus: false,
      focusNodeId: "root",
      focusOnRoot: true,
      computedLevel: 2,
      prevFrozenLevels: prev,
    });
    expect(result).toBe(2);
  });
});

describe("notebook focus policy in projection", () => {
  function makeDocWithNotebook() {
    const doc = createSmallTestDocument();
    doc.nodes[1] = {
      ...doc.nodes[1]!,
      kind: "notebook",
      notebook: { link: "[[Child]]", path: "notes/child.md", targetType: "file" },
      link: "[[Child]]",
    };
    return doc;
  }

  it("allows notebook to scale to full detail when focus is root", () => {
    const doc = makeDocWithNotebook();
    const projection = createSemanticProjection(doc, {
      zoom: 2,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["root"],
      lastFocusNodeId: "root",
    });
    const child = projection.nodes.find((n) => n.id === "child");
    expect(child?.detailLevel).toBe(5);
    expect(child?.displayWidth).toBe(360);
    expect(child?.displayHeight).toBe(300);
  });

  it("does not increase notebook detail when selected in tree layout", () => {
    const doc = makeDocWithNotebook();
    doc.layoutMode = "tree-mirror";

    const unselected = createSemanticProjection(doc, {
      zoom: 0.2,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["root"],
      lastFocusNodeId: "root",
    });

    const selected = createSemanticProjection(doc, {
      zoom: 0.2,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["child"],
      lastFocusNodeId: "child",
    });

    const childUnselected = unselected.nodes.find((n) => n.id === "child");
    const childSelected = selected.nodes.find((n) => n.id === "child");

    expect(childUnselected?.detailLevel).toBe(0);
    expect(childSelected?.detailLevel).toBe(0);
    expect(childSelected?.displayWidth).toBe(childUnselected?.displayWidth);
    expect(childSelected?.displayHeight).toBe(childUnselected?.displayHeight);
  });

  it("allows notebook to reach level 4-5 when it is the focus", () => {
    const doc = makeDocWithNotebook();
    const projection = createSemanticProjection(doc, {
      zoom: 2,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["child"],
      lastFocusNodeId: "child",
    });
    const child = projection.nodes.find((n) => n.id === "child");
    expect(child?.detailLevel).toBe(5);
  });

  it("freezes notebook level when focus shifts to another non-root node", () => {
    const doc = makeDocWithNotebook();
    doc.nodes.push({
      id: "other",
      kind: "text",
      title: "Other",
      x: 0,
      y: 300,
      width: 180,
      height: 56,
      treeControl: "auto",
    });
    doc.edges.push({ id: "edge-other", source: "root", target: "other", relation: "mindmap", type: "curve" });

    const nextFrozen = new Map<string, 0 | 1 | 2 | 3 | 4 | 5>();

    const proj1 = createSemanticProjection(doc, {
      zoom: 1,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["child"],
      lastFocusNodeId: "child",
    }, { nextFrozenNotebookLevels: nextFrozen });

    const child1 = proj1.nodes.find((n) => n.id === "child");
    expect(child1?.detailLevel).toBeGreaterThanOrEqual(3);

    const proj2 = createSemanticProjection(doc, {
      zoom: 2,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["other"],
      lastFocusNodeId: "other",
    }, { prevFrozenNotebookLevels: nextFrozen, nextFrozenNotebookLevels: new Map() });

    const child2 = proj2.nodes.find((n) => n.id === "child");
    expect(child2?.detailLevel).toBe(child1?.detailLevel);
  });

  it("does not increase notebook detail on hover when frozen below", () => {
    const doc = makeDocWithNotebook();
    doc.nodes.push({
      id: "other",
      kind: "text",
      title: "Other",
      x: 0,
      y: 300,
      width: 180,
      height: 56,
      treeControl: "auto",
    });
    doc.edges.push({ id: "edge-other", source: "root", target: "other", relation: "mindmap", type: "curve" });

    const prev = new Map<string, 0 | 1 | 2 | 3 | 4 | 5>([["child", 0]]);
    const next = new Map<string, 0 | 1 | 2 | 3 | 4 | 5>();
    const projection = createSemanticProjection(doc, {
      zoom: 2,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["other"],
      lastFocusNodeId: "other",
      hoveredNodeId: "child",
    }, { prevFrozenNotebookLevels: prev, nextFrozenNotebookLevels: next });

    const child = projection.nodes.find((n) => n.id === "child");
    expect(child?.detailLevel).toBe(0);
    expect(next.get("child")).toBe(0);
  });

  it("keeps notebook frozen detail on hover", () => {
    const doc = makeDocWithNotebook();
    doc.nodes.push({
      id: "other",
      kind: "text",
      title: "Other",
      x: 0,
      y: 300,
      width: 180,
      height: 56,
      treeControl: "auto",
    });
    doc.edges.push({ id: "edge-other", source: "root", target: "other", relation: "mindmap", type: "curve" });

    const prev = new Map<string, 0 | 1 | 2 | 3 | 4 | 5>([["child", 1]]);
    const next = new Map<string, 0 | 1 | 2 | 3 | 4 | 5>();
    const projection = createSemanticProjection(doc, {
      zoom: 0.4,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["other"],
      lastFocusNodeId: "other",
      hoveredNodeId: "child",
    }, { prevFrozenNotebookLevels: prev, nextFrozenNotebookLevels: next });

    const child = projection.nodes.find((n) => n.id === "child");
    expect(child?.detailLevel).toBe(1);
    expect(next.get("child")).toBe(1);
  });

  it("maintains independent frozen levels for multiple notebooks", () => {
    const doc = createSmallTestDocument();
    doc.nodes[1] = {
      ...doc.nodes[1]!,
      kind: "notebook",
      notebook: { link: "[[Child]]", path: "notes/child.md", targetType: "file" },
      link: "[[Child]]",
    };
    doc.nodes.push({
      id: "other",
      kind: "text",
      title: "Other",
      x: 0,
      y: 300,
      width: 180,
      height: 56,
      treeControl: "auto",
    });
    doc.edges.push({ id: "edge-other", source: "root", target: "other", relation: "mindmap", type: "curve" });
    doc.nodes.push({
      id: "nb2",
      kind: "notebook",
      title: "NB2",
      x: 0,
      y: 600,
      width: 180,
      height: 54,
      treeControl: "auto",
      notebook: { link: "[[NB2]]", path: "notes/nb2.md", targetType: "file" },
      link: "[[NB2]]",
    });
    doc.edges.push({ id: "edge-nb2", source: "root", target: "nb2", relation: "mindmap", type: "curve" });

    const prev = new Map<string, 0 | 1 | 2 | 3 | 4 | 5>([["child", 1], ["nb2", 4]]);
    const next = new Map<string, 0 | 1 | 2 | 3 | 4 | 5>();
    const projection = createSemanticProjection(doc, {
      zoom: 2,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["other"],
      lastFocusNodeId: "other",
    }, { prevFrozenNotebookLevels: prev, nextFrozenNotebookLevels: next });

    const child = projection.nodes.find((n) => n.id === "child");
    const nb2 = projection.nodes.find((n) => n.id === "nb2");
    expect(child?.detailLevel).toBe(1);
    expect(nb2?.detailLevel).toBe(4);
  });

  it("resumes zoom-driven notebook detail when focus returns to root", () => {
    const doc = makeDocWithNotebook();

    const nextFrozen = new Map<string, 0 | 1 | 2 | 3 | 4 | 5>();

    createSemanticProjection(doc, {
      zoom: 1,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["child"],
      lastFocusNodeId: "child",
    }, { nextFrozenNotebookLevels: nextFrozen });

    doc.nodes.push({
      id: "other",
      kind: "text",
      title: "Other",
      x: 0,
      y: 300,
      width: 180,
      height: 56,
      treeControl: "auto",
    });
    doc.edges.push({ id: "edge-other", source: "root", target: "other", relation: "mindmap", type: "curve" });

    createSemanticProjection(doc, {
      zoom: 2,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["other"],
      lastFocusNodeId: "other",
    }, { prevFrozenNotebookLevels: nextFrozen, nextFrozenNotebookLevels: new Map() });

    const projRoot = createSemanticProjection(doc, {
      zoom: 2,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["root"],
      lastFocusNodeId: "root",
    });

    const child = projRoot.nodes.find((n) => n.id === "child");
    expect(child?.detailLevel).toBe(5);
    expect(child?.displayWidth).toBe(360);
  });

  it("allows forcedDetailLevels to override notebook focus policy", () => {
    const doc = makeDocWithNotebook();
    const projection = createSemanticProjection(doc, {
      zoom: 2,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["root"],
      lastFocusNodeId: "root",
    }, {
      forcedDetailLevels: new Map([["child", 5]]),
    });

    const child = projection.nodes.find((n) => n.id === "child");
    expect(child?.detailLevel).toBe(5);
  });
});
