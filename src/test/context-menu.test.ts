import { describe, expect, it, vi } from "vitest";

import { closeActiveContextMenu, createNodeContextMenu } from "../ui/context-menu";

describe("MindmapContextMenu", () => {
  it("closes safely when removal re-enters close", () => {
    const onDeleteNode = vi.fn();
    const menu = createNodeContextMenu({
      nodeKind: "text",
      ownerDocument: document,
      onConvertNotebookToText: vi.fn(),
      onCreateNotebook: vi.fn(),
      onBindExistingNotebook: vi.fn(),
      onRebindNotebook: vi.fn(),
      onDeleteNode,
    });

    menu.showAtPosition({ x: 40, y: 80 });

    const container = document.body.children[0] as HTMLDivElement | undefined;
    expect(container).toBeTruthy();
    if (!container) {
      throw new Error("Expected context menu container");
    }

    const originalRemove = container.remove.bind(container);
    let removeCalls = 0;
    container.remove = vi.fn(() => {
      removeCalls += 1;
      if (removeCalls > 1) {
        throw new DOMException(
          "Failed to execute 'remove' on 'Element': The node to be removed is no longer a child of this node.",
          "NotFoundError"
        );
      }
      originalRemove();
      closeActiveContextMenu();
    });

    expect(() => closeActiveContextMenu()).not.toThrow();
    expect(removeCalls).toBe(1);
    expect(Array.from(document.body.children)).not.toContain(container);
  });
});
