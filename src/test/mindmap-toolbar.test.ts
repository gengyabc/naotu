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
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const onSelectRoot = vi.fn();
    const onFitRoot = vi.fn();
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    const onAddChild = vi.fn();
    const onAddSibling = vi.fn();
    const onToggleExpand = vi.fn();
    const onEdit = vi.fn();

    const container = new FakeElement("div");
    const toolbar = createMindmapToolbar(container as never, {
      layoutMode: "tree-right",
      searchQuery: "root",
      saveStatus: "Saved",
      onChangeLayoutMode,
      onOpenMindmap,
      onSearchChange,
      onSearchSubmit,
      onUndo,
      onRedo,
      onSelectRoot,
      onFitRoot,
      onZoomIn,
      onZoomOut,
      onAddChild,
      onAddSibling,
      onToggleExpand,
      onEdit,
    });

    getButton(container, "右向树").onclick?.();
    getButton(container, "打开").onclick?.();
    getButton(container, "撤销").onclick?.();
    getButton(container, "重做").onclick?.();

    const input = getInput(container);
    input.value = "child";
    input.oninput?.();
    const enter = new FakeEvent("Enter");
    input.onkeydown?.(enter as unknown as KeyboardEvent);

    expect(onChangeLayoutMode).toHaveBeenCalledWith("tree-right");
    expect(onOpenMindmap).toHaveBeenCalledTimes(1);
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith("child");
    expect(onSearchSubmit).toHaveBeenCalledTimes(1);
    expect(enter.defaultPrevented).toBe(true);

    expect(getButton(container, "右向树").classNames.has("is-active")).toBe(true);

    toolbar.setLayoutMode("free");
    toolbar.setSaveStatus("Unsaved");
    toolbar.focusSearchInput();
    toolbar.setCanUndo(true);
    toolbar.setCanRedo(false);
    toolbar.setCanSelectRoot(true);
    toolbar.setCanFitRoot(true);
    toolbar.setCanZoomIn(true);
    toolbar.setCanZoomOut(false);
    toolbar.setCanAddChild(true);
    toolbar.setCanAddSibling(false);
    toolbar.setCanToggleExpand(true);
    toolbar.setCanEdit(false);

    expect(getButton(container, "右向树").classNames.has("is-active")).toBe(false);
    expect(getButton(container, "自由布局").classNames.has("is-active")).toBe(true);
    expect(getSaveStatus(container).textContent).toBe("Unsaved");
    expect(input.focused).toBe(true);
    expect(input.selected).toBe(true);
    expect(getButton(container, "撤销").disabled).toBe(false);
    expect(getButton(container, "重做").disabled).toBe(true);
    expect(getButton(container, "缩小").disabled).toBe(true);
    expect(getButton(container, "放大").disabled).toBe(false);
    expect(getButton(container, "子节点").disabled).toBe(false);
    expect(getButton(container, "兄弟节点").disabled).toBe(true);
    expect(getButton(container, "切换折叠").disabled).toBe(false);
    expect(getButton(container, "编辑").disabled).toBe(true);
  });
});
