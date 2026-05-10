import { describe, expect, it, vi } from "vitest";
import { createMindmapToolbar } from "../ui/mindmap-toolbar";

class FakeEvent {
  defaultPrevented = false;

  constructor(public key: string) {}

  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

class FakeElement {
  textContent = "";
  value = "";
  focused = false;
  selected = false;
  children: FakeElement[] = [];
  classNames = new Set<string>();
  attributes = new Map<string, string>();
  onclick: (() => void) | null = null;
  oninput: (() => void) | null = null;
  onkeydown: ((event: FakeEvent) => void) | null = null;

  constructor(
    readonly tagName: string,
    readonly options: { text?: string; cls?: string; type?: string; placeholder?: string } = {},
  ) {
    if (options.text) this.textContent = options.text;
    if (options.cls) this.classNames.add(options.cls);
  }

  createDiv(options: { cls?: string } = {}): FakeElement {
    return this.createEl("div", options);
  }

  createSpan(options: { cls?: string; text?: string } = {}): FakeElement {
    return this.createEl("span", options);
  }

  createEl(tagName: string, options: { text?: string; cls?: string; type?: string; placeholder?: string } = {}): FakeElement {
    const child = new FakeElement(tagName, options);
    this.children.push(child);
    return child;
  }

  toggleClass(name: string, enabled: boolean): void {
    if (enabled) this.classNames.add(name);
    else this.classNames.delete(name);
  }

  setText(value: string): void {
    this.textContent = value;
  }

  setAttr(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  focus(): void {
    this.focused = true;
  }

  select(): void {
    this.selected = true;
  }
}

function getButton(container: FakeElement, text: string): FakeElement {
  const button = container.children[0]?.children.find((child) => child.tagName === "button" && child.textContent === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

function getInput(container: FakeElement): FakeElement {
  const input = container.children[0]?.children.find((child) => child.tagName === "input");
  if (!input) throw new Error("Input not found");
  return input;
}

function getSaveStatus(container: FakeElement): FakeElement {
  const status = container.children[0]?.children.find((child) => child.tagName === "span" && child.classNames.has("mindmap-save-status"));
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
    input.onkeydown?.(enter);

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
