import { describe, expect, it } from "vitest";
import { createSemanticProjection } from "../core/semantic-projection";
import { createSmallTestDocument } from "./test-fixtures";

describe("notebook custom size detail level regression", () => {
  it("uses custom size and shows handler when notebook is manually resized", () => {
    const doc = createSmallTestDocument();
    doc.nodes[1] = {
      ...doc.nodes[1]!,
      kind: "notebook",
      notebook: { link: "[[Child]]", path: "notes/child.md", targetType: "file" },
      link: "[[Child]]",
      customWidth: 200,
      customHeight: 150,
    };

    const projection = createSemanticProjection(doc, {
      zoom: 1.5,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["child"],
    });

    const child = projection.nodes.find((node) => node.id === "child");
    expect(child).toBeDefined();
    expect(child!.usesCustomSize).toBe(true);
    expect(child!.displayWidth).toBe(200);
    expect(child!.displayHeight).toBe(150);
    expect(child!.showResizeHandle).toBe(true);
  });

  it("uses custom size when notebook is manually resized to expanded size", () => {
    const doc = createSmallTestDocument();
    doc.nodes[1] = {
      ...doc.nodes[1]!,
      kind: "notebook",
      notebook: { link: "[[Child]]", path: "notes/child.md", targetType: "file" },
      link: "[[Child]]",
      customWidth: 400,
      customHeight: 350,
    };

    const projection = createSemanticProjection(doc, {
      zoom: 1.5,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["child"],
    });

    const child = projection.nodes.find((node) => node.id === "child");
    expect(child).toBeDefined();

    expect(child!.detailLevel).toBeGreaterThanOrEqual(4);
    expect(child!.usesCustomSize).toBe(true);
    expect(child!.displayWidth).toBe(400);
    expect(child!.displayHeight).toBe(350);
  });

  it("preserves size when switching from zoom to manual resize", () => {
    const doc = createSmallTestDocument();
    doc.nodes[1] = {
      ...doc.nodes[1]!,
      kind: "notebook",
      notebook: { link: "[[Child]]", path: "notes/child.md", targetType: "file" },
      link: "[[Child]]",
    };

    const zoomProjection = createSemanticProjection(doc, {
      zoom: 2.0,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["child"],
    });

    const zoomChild = zoomProjection.nodes.find((node) => node.id === "child");
    const zoomWidth = zoomChild!.displayWidth;
    const zoomHeight = zoomChild!.displayHeight;

    doc.nodes[1] = {
      ...doc.nodes[1]!,
      customWidth: zoomWidth,
      customHeight: zoomHeight,
    };

    const manualProjection = createSemanticProjection(doc, {
      zoom: 1.0,
      viewportWorldRect: { x: -1000, y: -1000, width: 2000, height: 2000 },
      selectedNodeIds: ["child"],
    });

    const manualChild = manualProjection.nodes.find((node) => node.id === "child");
    expect(manualChild!.displayWidth).toBe(zoomWidth);
    expect(manualChild!.displayHeight).toBe(zoomHeight);
  });
});