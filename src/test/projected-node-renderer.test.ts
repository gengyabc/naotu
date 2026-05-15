import { describe, expect, it } from "vitest";
import {
  canInlineEditNodeTitle,
  canDragNodes,
  clampNotebookResizeSize,
  getNotebookPreviewFrame,
  screenDragDeltaToWorldDelta,
  shouldOpenEmbeddedFileOnDoubleClick,
  shouldRenderEmbeddedFilePreview,
  shouldStartInlineEditForDblClick,
  shouldStartNodeDrag,
} from "../renderer/projected-node-renderer";

describe("projected node dragging", () => {
  it("maps screen drag deltas directly to document movement under semantic zoom", () => {
    expect(screenDragDeltaToWorldDelta({ dx: 32, dy: -18 })).toEqual({ dx: 32, dy: -18 });
    expect(screenDragDeltaToWorldDelta({ dx: 12.5, dy: 7.25 })).toEqual({ dx: 12.5, dy: 7.25 });
  });

  it("preserves incremental drag deltas for accumulation", () => {
    const first = screenDragDeltaToWorldDelta({ dx: 5, dy: 3 });
    const second = screenDragDeltaToWorldDelta({ dx: 4, dy: -2 });

    expect({ x: first.dx + second.dx, y: first.dy + second.dy }).toEqual({ x: 9, y: 1 });
  });

  it("clamps notebook resize size to minimum bounds", () => {
    expect(clampNotebookResizeSize(120, 40)).toEqual({ width: 190, height: 66 });
  });

  it("rounds notebook resize size before persisting", () => {
    expect(clampNotebookResizeSize(420.7, 260.2)).toEqual({ width: 421, height: 260 });
  });

  it("preserves aspect ratio when resizing embedded file nodes", () => {
    expect(clampNotebookResizeSize(300, 200, 1.5, "image")).toEqual({ width: 300, height: 200 });
    expect(clampNotebookResizeSize(600, 400, 2, "image")).toEqual({ width: 600, height: 300 });
    expect(clampNotebookResizeSize(400, 300, 1.33, "image")).toEqual({ width: 400, height: 301 });
  });

  it("can derive aspect-ratio resize from vertical drag intent", () => {
    expect(clampNotebookResizeSize(300, 260, 2, "image", "height")).toEqual({ width: 520, height: 260 });
    expect(clampNotebookResizeSize(300, 100, 2, "image", "height")).toEqual({ width: 240, height: 120 });
  });

  it("enforces minimum width when preserving aspect ratio", () => {
    expect(clampNotebookResizeSize(50, 100, 0.5)).toEqual({ width: 200, height: 400 });
  });

  it("keeps embedded drag resize aligned with the small embedded preset", () => {
    expect(clampNotebookResizeSize(50, 100, 0.5, "image")).toEqual({ width: 90, height: 180 });
    expect(clampNotebookResizeSize(120, 50, undefined, "image")).toEqual({ width: 240, height: 96 });
  });

  it("does not start node dragging from notebook controls", () => {
    expect(
      shouldStartNodeDrag({ closest: (selector: string) => (selector.includes("mindmap-node-resize-handle") ? {} : null) } as unknown as EventTarget),
    ).toBe(false);
    expect(shouldStartNodeDrag({ closest: () => null } as unknown as EventTarget)).toBe(true);
  });

  it("starts inline edit on any area for text nodes, title area only for notebooks", () => {
    const titleTarget = { closest: (selector: string) => (selector.includes(".mindmap-node-title") ? {} : null) } as unknown as EventTarget;
    const hitboxTarget = { closest: (selector: string) => (selector.includes(".mindmap-node-title-hitbox") ? {} : null) } as unknown as EventTarget;
    const nodeBgTarget = { closest: (selector: string) => (selector === ".mindmap-node" ? {} : null) } as unknown as EventTarget;
    const buttonTarget = {
      closest: (selector: string) => (selector.includes("mindmap-node-open-notebook") ? {} : null),
    } as unknown as EventTarget;

    expect(shouldStartInlineEditForDblClick(titleTarget, "text")).toBe(true);
    expect(shouldStartInlineEditForDblClick(hitboxTarget, "text")).toBe(true);
    expect(shouldStartInlineEditForDblClick(nodeBgTarget, "text")).toBe(true);
    expect(shouldStartInlineEditForDblClick(buttonTarget, "text")).toBe(false);
    expect(shouldStartInlineEditForDblClick({} as unknown as EventTarget, "text")).toBe(false);
    expect(shouldStartInlineEditForDblClick({ closest: () => undefined } as unknown as EventTarget, "notebook")).toBe(false);

    expect(shouldStartInlineEditForDblClick(titleTarget, "notebook")).toBe(true);
    expect(shouldStartInlineEditForDblClick(hitboxTarget, "notebook")).toBe(true);
    expect(shouldStartInlineEditForDblClick(nodeBgTarget, "notebook")).toBe(false);
    expect(shouldStartInlineEditForDblClick(buttonTarget, "notebook")).toBe(false);
  });

  it("only enables node dragging in free layout", () => {
    expect(canDragNodes("free")).toBe(true);
    expect(canDragNodes("tree-mirror")).toBe(false);
    expect(canDragNodes("tree-right")).toBe(false);
  });

  it("treats image and excalidraw notebooks as embedded previews", () => {
    expect(shouldRenderEmbeddedFilePreview({ kind: "notebook", targetKind: "image", showPreview: true })).toBe(true);
    expect(shouldRenderEmbeddedFilePreview({ kind: "notebook", targetKind: "excalidraw", showPreview: true })).toBe(true);
    expect(shouldRenderEmbeddedFilePreview({ kind: "notebook", targetKind: "markdown", showPreview: true })).toBe(false);
    expect(shouldRenderEmbeddedFilePreview({ kind: "notebook", targetKind: "image", showPreview: false })).toBe(true);
  });

  it("opens embedded file nodes on double click instead of editing titles", () => {
    expect(
      shouldOpenEmbeddedFileOnDoubleClick({
        kind: "notebook",
        notebook: { link: "![[assets/photo.png]]", path: "assets/photo.png", targetType: "file", targetKind: "image" },
      }),
    ).toBe(true);
    expect(
      shouldOpenEmbeddedFileOnDoubleClick({
        kind: "notebook",
        notebook: { link: "[[notes/doc.md]]", path: "notes/doc.md", targetType: "file", targetKind: "markdown" },
      }),
    ).toBe(false);
    expect(
      shouldOpenEmbeddedFileOnDoubleClick({
        kind: "text",
      }),
    ).toBe(false);
  });

  it("disables inline title editing for embedded file nodes", () => {
    expect(
      canInlineEditNodeTitle({
        kind: "notebook",
        notebook: { link: "[[assets/photo.png]]", path: "assets/photo.png", targetType: "file", targetKind: "image" },
      }),
    ).toBe(false);
    expect(
      canInlineEditNodeTitle({
        kind: "notebook",
        notebook: { link: "[[notes/doc.md]]", path: "notes/doc.md", targetType: "file", targetKind: "markdown" },
      }),
    ).toBe(true);
    expect(canInlineEditNodeTitle({ kind: "text" })).toBe(true);
  });

  it("uses a full-height preview frame for embedded file nodes", () => {
    expect(getNotebookPreviewFrame({ displayWidth: 360, displayHeight: 300, embeddedFilePreview: false })).toEqual({
      x: 8,
      y: 62,
      width: 344,
      height: 218,
    });
    expect(getNotebookPreviewFrame({ displayWidth: 360, displayHeight: 300, embeddedFilePreview: true })).toEqual({
      x: 8,
      y: 8,
      width: 344,
      height: 284,
    });
  });
});
