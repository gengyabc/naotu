import { describe, expect, it } from "vitest";
import {
  canInlineEditNodeTitle,
  canDragNodes,
  clampNotebookResizeSize,
  getNotebookPreviewFrame,
  screenDragDeltaToWorldDelta,
  shouldOpenEmbeddedFileOnDoubleClick,
  shouldRenderEmbeddedFilePreview,
  shouldStartInlineTitleEdit,
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
    expect(clampNotebookResizeSize(120, 90)).toEqual({ width: 200, height: 150 });
  });

  it("rounds notebook resize size before persisting", () => {
    expect(clampNotebookResizeSize(420.7, 260.2)).toEqual({ width: 421, height: 260 });
  });

  it("does not start node dragging from notebook controls", () => {
    expect(
      shouldStartNodeDrag({ closest: (selector: string) => (selector.includes("mindmap-node-resize-handle") ? {} : null) } as unknown as EventTarget),
    ).toBe(false);
    expect(shouldStartNodeDrag({ closest: () => null } as unknown as EventTarget)).toBe(true);
  });

  it("starts inline title editing only from title targets", () => {
    expect(
      shouldStartInlineTitleEdit({ closest: (selector: string) => (selector.includes(".mindmap-node-title") ? {} : null) } as unknown as EventTarget),
    ).toBe(true);
    expect(
      shouldStartInlineTitleEdit({ closest: (selector: string) => (selector.includes(".mindmap-node-title-hitbox") ? {} : null) } as unknown as EventTarget),
    ).toBe(true);
    expect(
      shouldStartInlineTitleEdit({ closest: (selector: string) => (selector === ".mindmap-node" ? {} : null) } as unknown as EventTarget),
    ).toBe(false);
    expect(
      shouldStartInlineTitleEdit({
        closest: (selector: string) => (selector.includes("mindmap-node-open-notebook") || selector === ".mindmap-node-title" ? {} : null),
      } as unknown as EventTarget),
    ).toBe(false);
    expect(shouldStartInlineTitleEdit({ closest: () => null } as unknown as EventTarget)).toBe(false);
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
