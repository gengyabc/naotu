import { describe, expect, it, vi } from "vitest";
import { createMindmapToolbar } from "../ui/mindmap-toolbar";
import { FakeElement } from "./obsidian-stub";

class FakeEvent {
  defaultPrevented = false;
  key: string;

  constructor(key: string) {
    this.key = key;
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

function getButton(container: FakeElement, text: string): FakeElement {
  const button = container.children[0]?.children.find(
    (child) => child.tagName.toUpperCase() === "BUTTON" && child.textContent.includes(text)
  );
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

function getInput(container: FakeElement): FakeElement {
  const searchWrapper = container.children[0]?.children.find(
    (child) => child.tagName.toUpperCase() === "DIV" && child.classNames.has("mindmap-search-wrapper")
  );
  if (!searchWrapper) {
    const directInput = container.children[0]?.children.find((child) => child.tagName.toUpperCase() === "INPUT");
    if (directInput) return directInput;
    throw new Error("Search wrapper not found");
  }
  const input = searchWrapper.children.find((child) => child.tagName.toUpperCase() === "INPUT");
  if (!input) throw new Error("Input not found");
  return input;
}

function getSaveStatus(container: FakeElement): FakeElement {
  const status = container.children[0]?.children.find((child) => child.tagName.toUpperCase() === "SPAN" && child.classNames.has("mindmap-save-status"));
  if (!status) throw new Error("Save status not found");
  return status;
}

describe("createMindmapToolbar", () => {
  it("wires toolbar actions and sync APIs", () => {
    const onChangeLayoutMode = vi.fn();
    const onOpenMindmap = vi.fn();
    const onSearchChange = vi.fn();
    const onSearchSubmit = vi.fn();

    const container = new FakeElement("div");
    const toolbar = createMindmapToolbar(container as never, {
      layoutMode: "tree-right",
      searchQuery: "root",
      saveStatus: "Saved",
      onChangeLayoutMode,
      onOpenMindmap,
      onSearchChange,
      onSearchSubmit,
    });

    getButton(container, "右向树").onclick?.();
    getButton(container, "打开").onclick?.();

    const input = getInput(container);
    input.value = "child";
    input.oninput?.();
    const enter = new FakeEvent("Enter");
    input.onkeydown?.(enter as unknown as KeyboardEvent);

    expect(onChangeLayoutMode).toHaveBeenCalledWith("tree-right");
    expect(onOpenMindmap).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith("child");
    expect(onSearchSubmit).toHaveBeenCalledTimes(1);
    expect(enter.defaultPrevented).toBe(true);

    expect(getButton(container, "右向树").classNames.has("is-active")).toBe(true);

    toolbar.setLayoutMode("free");
    toolbar.setSaveStatus("Unsaved");
    toolbar.focusSearchInput();

    expect(getButton(container, "右向树").classNames.has("is-active")).toBe(false);
    expect(getButton(container, "自由布局").classNames.has("is-active")).toBe(true);
    expect(getSaveStatus(container).textContent).toBe("Unsaved");
    expect(input.focused).toBe(true);
    expect(input.selected).toBe(true);
  });
});
