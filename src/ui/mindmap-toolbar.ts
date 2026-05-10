import { setButtonA11y } from "../core/accessibility";

type LayoutMode = "tree-mirror" | "tree-right" | "free";

export interface MindmapToolbar {
  setLayoutMode(mode: LayoutMode): void;
  setSaveStatus(label: string): void;
  focusSearchInput(): void;
}

export interface MindmapToolbarOptions {
  layoutMode: LayoutMode;
  searchQuery: string;
  saveStatus: string;
  onChangeLayoutMode(mode: LayoutMode): void;
  onOpenMindmap(): void;
  onSaveMindmap(): void;
  onSearchChange(query: string): void;
  onSearchSubmit(): void;
}

export function createMindmapToolbar(container: HTMLElement, options: MindmapToolbarOptions): MindmapToolbar {
  const toolbar = container.createDiv({ cls: "semantic-mindmap-toolbar" });

  const mirrorLayoutButton = toolbar.createEl("button", { text: "镜像树" });
  setButtonA11y(mirrorLayoutButton, "镜像树布局");
  mirrorLayoutButton.onclick = () => options.onChangeLayoutMode("tree-mirror");

  const rightLayoutButton = toolbar.createEl("button", { text: "右向树" });
  setButtonA11y(rightLayoutButton, "右向树布局");
  rightLayoutButton.onclick = () => options.onChangeLayoutMode("tree-right");

  const freeLayoutButton = toolbar.createEl("button", { text: "自由布局" });
  setButtonA11y(freeLayoutButton, "自由布局");
  freeLayoutButton.onclick = () => options.onChangeLayoutMode("free");

  const openButton = toolbar.createEl("button", { text: "打开" });
  setButtonA11y(openButton, "打开脑图");
  openButton.onclick = () => options.onOpenMindmap();

  const saveButton = toolbar.createEl("button", { text: "保存" });
  setButtonA11y(saveButton, "保存脑图");
  saveButton.onclick = () => options.onSaveMindmap();

  const searchInput = toolbar.createEl("input", {
    type: "text",
    placeholder: "搜索节点...",
  });
  searchInput.value = options.searchQuery;
  searchInput.oninput = () => options.onSearchChange(searchInput.value);
  searchInput.onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      options.onSearchSubmit();
    }
  };

  const saveStatusEl = toolbar.createSpan({
    cls: "mindmap-save-status",
    text: options.saveStatus,
  });

  const setLayoutMode = (mode: LayoutMode): void => {
    mirrorLayoutButton.toggleClass("is-active", mode === "tree-mirror");
    rightLayoutButton.toggleClass("is-active", mode === "tree-right");
    freeLayoutButton.toggleClass("is-active", mode === "free");
  };

  setLayoutMode(options.layoutMode);

  return {
    setLayoutMode,
    setSaveStatus(label): void {
      saveStatusEl.setText(label);
    },
    focusSearchInput(): void {
      searchInput.focus();
      searchInput.select();
    },
  };
}
