import { describe, expect, it } from "vitest";
import { routeEdge } from "../core/edge-routing";
import { worldToScreen } from "../core/screen-transform";
import type { ProjectedEdge, ProjectedNode } from "../types/mindmap";

function extractPathNumbers(path: string): number[] {
  return path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
}

function extractCubicBezierEndpoint(path: string): { x: number; y: number } {
  const nums = extractPathNumbers(path);
  return { x: nums[4], y: nums[5] };
}

function extractCubicBezierStartPoint(path: string): { x: number; y: number } {
  const nums = extractPathNumbers(path);
  return { x: nums[0], y: nums[1] };
}

function toScreenNode(node: ProjectedNode, transform: { x: number; y: number; k: number }): ProjectedNode {
  const screen = worldToScreen({ x: node.projectedX, y: node.projectedY }, transform);
  return { ...node, projectedX: screen.x, projectedY: screen.y };
}

function createBaseNode(overrides: Partial<ProjectedNode> & { id: string; sourceNodeId: string; title: string }): ProjectedNode {
  return {
    kind: "text",
    worldX: 0,
    worldY: 0,
    projectedX: 0,
    projectedY: 0,
    displayWidth: 180,
    displayHeight: 56,
    detailLevel: 3,
    depth: 0,
    isRoot: false,
    isFocus: false,
    isSelected: false,
    isHovered: false,
    isAncestorPath: false,
    hasChildren: false,
    childrenExpanded: false,
    showOpenNotebookButton: false,
    showResizeHandle: false,
    usesCustomSize: false,
    ...overrides,
  };
}

describe("projected edge rendering", () => {
  it("keeps edge anchors aligned with fixed-size nodes after zoom", () => {
    const source = createBaseNode({ id: "source", sourceNodeId: "source", title: "Source", projectedX: 10, projectedY: 20 });
    const target: ProjectedNode = {
      ...source,
      id: "target",
      sourceNodeId: "target",
      title: "Target",
      projectedX: 260,
      projectedY: 20,
    };
    const edge: ProjectedEdge = { id: "edge", source: "source", target: "target", relation: "mindmap", type: "curve" };
    const transform = { x: 35, y: 12, k: 1.7 };

    const screenRoute = routeEdge({ edge, source: toScreenNode(source, transform), target: toScreenNode(target, transform) }).d;
    const legacyRoute = routeEdge({ edge, source, target }).d;

    const screenSourceLeft = worldToScreen({ x: source.projectedX, y: source.projectedY }, transform).x;
    const expectedAnchorX = screenSourceLeft + source.displayWidth;
    expect(screenRoute).toContain(`M ${expectedAnchorX} `);

    const legacyAnchorX = (source.projectedX + source.displayWidth) * transform.k + transform.x;
    expect(legacyAnchorX).not.toBe(expectedAnchorX);
    expect(legacyRoute).not.toBe(screenRoute);
  });

  it("does not overshoot bezier handles when nodes are close together", () => {
    const source = createBaseNode({ id: "source", sourceNodeId: "source", title: "Source", projectedX: 10, projectedY: 20 });
    const target: ProjectedNode = {
      ...source,
      id: "target",
      sourceNodeId: "target",
      title: "Target",
      projectedX: 220,
      projectedY: 20,
    };
    const edge: ProjectedEdge = { id: "edge", source: "source", target: "target", relation: "mindmap", type: "curve" };

    const route = routeEdge({ edge, source, target }).d;
    const [startX, , control1X, , control2X, , endX] = extractPathNumbers(route);

    expect(startX).toBe(190);
    expect(endX).toBe(220);
    expect(control1X).toBeGreaterThanOrEqual(startX);
    expect(control1X).toBeLessThanOrEqual(endX);
    expect(control2X).toBeGreaterThanOrEqual(startX);
    expect(control2X).toBeLessThanOrEqual(endX);
  });

  it("anchors underline nodes to bottom edge in horizontal layout", () => {
    const parent = createBaseNode({ id: "parent", sourceNodeId: "parent", title: "Parent", projectedX: 10, projectedY: 20, depth: 0, isRoot: true, hasChildren: true, childrenExpanded: true });
    const child = createBaseNode({ id: "child", sourceNodeId: "child", title: "Child", projectedX: 260, projectedY: 80, depth: 2 });
    const edge: ProjectedEdge = { id: "edge", source: "parent", target: "child", relation: "mindmap", type: "curve" };

    const route = routeEdge({ edge, source: parent, target: child }).d;
    const { y: endY } = extractCubicBezierEndpoint(route);

    expect(endY).toBe(child.projectedY + child.displayHeight);
  });

  it("does not force bottom anchor for underline nodes when parent is above", () => {
    const parent = createBaseNode({ id: "parent", sourceNodeId: "parent", title: "Parent", projectedX: 80, projectedY: -80, depth: 0, isRoot: true, hasChildren: true, childrenExpanded: true });
    const child = createBaseNode({ id: "child", sourceNodeId: "child", title: "Child", projectedX: 80, projectedY: 20, depth: 2 });
    const edge: ProjectedEdge = { id: "edge", source: "parent", target: "child", relation: "mindmap", type: "curve" };

    const route = routeEdge({ edge, source: parent, target: child }).d;
    const { y: endY } = extractCubicBezierEndpoint(route);

    expect(endY).toBe(child.projectedY);
  });

  it("does not anchor non-underline nodes to bottom edge", () => {
    const parent = createBaseNode({ id: "parent", sourceNodeId: "parent", title: "Parent", projectedX: 10, projectedY: 20, depth: 0, isRoot: true, hasChildren: true, childrenExpanded: true });
    const child = createBaseNode({ id: "child", sourceNodeId: "child", title: "Child", projectedX: 260, projectedY: 80, depth: 1 });
    const edge: ProjectedEdge = { id: "edge", source: "parent", target: "child", relation: "mindmap", type: "curve" };

    const route = routeEdge({ edge, source: parent, target: child }).d;
    const { y: endY } = extractCubicBezierEndpoint(route);

    expect(endY).toBe(child.projectedY + child.displayHeight / 2);
  });

  it("anchors both endpoints to bottom when source and target are underline nodes", () => {
    const parent = createBaseNode({ id: "parent", sourceNodeId: "parent", title: "Parent", projectedX: 10, projectedY: 20, depth: 2 });
    const child = createBaseNode({ id: "child", sourceNodeId: "child", title: "Child", projectedX: 260, projectedY: 80, depth: 2 });
    const edge: ProjectedEdge = { id: "edge", source: "parent", target: "child", relation: "mindmap", type: "curve" };

    const route = routeEdge({ edge, source: parent, target: child }).d;
    const { y: startY } = extractCubicBezierStartPoint(route);
    const { y: endY } = extractCubicBezierEndpoint(route);

    expect(startY).toBe(parent.projectedY + parent.displayHeight);
    expect(endY).toBe(child.projectedY + child.displayHeight);
  });

  it("uses default anchor for reference edges to underline nodes", () => {
    const parent = createBaseNode({ id: "parent", sourceNodeId: "parent", title: "Parent", projectedX: 10, projectedY: 20, depth: 0, isRoot: true, hasChildren: true, childrenExpanded: true });
    const child = createBaseNode({ id: "child", sourceNodeId: "child", title: "Child", projectedX: 260, projectedY: 80, depth: 2 });
    const edge: ProjectedEdge = { id: "edge", source: "parent", target: "child", relation: "reference", type: "curve" };

    const route = routeEdge({ edge, source: parent, target: child }).d;
    const { y: endY } = extractCubicBezierEndpoint(route);

    expect(endY).toBe(child.projectedY + child.displayHeight);
  });

  it("anchors underline node to bottom edge when dy is exactly zero", () => {
    const parent = createBaseNode({ id: "parent", sourceNodeId: "parent", title: "Parent", projectedX: 10, projectedY: 20, depth: 0, isRoot: true, hasChildren: true, childrenExpanded: true });
    const child = createBaseNode({ id: "child", sourceNodeId: "child", title: "Child", projectedX: 260, projectedY: 20, depth: 2 });
    const edge: ProjectedEdge = { id: "edge", source: "parent", target: "child", relation: "mindmap", type: "curve" };

    const route = routeEdge({ edge, source: parent, target: child }).d;
    const { y: endY } = extractCubicBezierEndpoint(route);

    expect(endY).toBe(child.projectedY + child.displayHeight);
  });

  it("anchors underline node to bottom edge when toward-node is directly below", () => {
    const parent = createBaseNode({ id: "parent", sourceNodeId: "parent", title: "Parent", projectedX: 80, projectedY: 100, depth: 0, isRoot: true, hasChildren: true, childrenExpanded: true });
    const child = createBaseNode({ id: "child", sourceNodeId: "child", title: "Child", projectedX: 80, projectedY: -100, depth: 2 });
    const edge: ProjectedEdge = { id: "edge", source: "parent", target: "child", relation: "mindmap", type: "curve" };

    const route = routeEdge({ edge, source: parent, target: child }).d;
    const { y: endY } = extractCubicBezierEndpoint(route);

    expect(endY).toBe(child.projectedY + child.displayHeight);
  });
});
