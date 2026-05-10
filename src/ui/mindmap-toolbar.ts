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
  onSearchChange(query: string): void;
  onSearchSubmit(): void;
}

type ToolbarIconId = "folder-open" | "layout-mirror" | "layout-right" | "layout-free" | "search";

const TOOLBAR_ICON_PATHS: Record<ToolbarIconId, string> = {
  "folder-open": `<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>`,
  "layout-mirror": `<path d="M12 3v18"/><path d="M3 9h6"/><path d="M3 15h6"/><path d="M15 9h6"/><path d="M15 15h6"/>`,
  "layout-right": `<path d="M3 3v18"/><path d="M7 7h12"/><path d="M7 12h12"/><path d="M7 17h12"/>`,
  "layout-free": `<circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/>`,
  search: `<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>`,
};

function createToolbarIcon(iconId: ToolbarIconId): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = TOOLBAR_ICON_PATHS[iconId];
  return svg;
}

export function createMindmapToolbar(container: HTMLElement, options: MindmapToolbarOptions): MindmapToolbar {
  const toolbar = container.createDiv({ cls: "semantic-mindmap-toolbar" });

  const openButton = toolbar.createEl("button");
  openButton.append(createToolbarIcon("folder-open"));
  openButton.appendText("打开");
  setButtonA11y(openButton, "打开脑图");
  openButton.onclick = () => options.onOpenMindmap();

  const mirrorLayoutButton = toolbar.createEl("button");
  mirrorLayoutButton.append(createToolbarIcon("layout-mirror"));
  mirrorLayoutButton.appendText("镜像树");
  setButtonA11y(mirrorLayoutButton, "镜像树布局");
  mirrorLayoutButton.onclick = () => options.onChangeLayoutMode("tree-mirror");

  const rightLayoutButton = toolbar.createEl("button");
  rightLayoutButton.append(createToolbarIcon("layout-right"));
  rightLayoutButton.appendText("右向树");
  setButtonA11y(rightLayoutButton, "右向树布局");
  rightLayoutButton.onclick = () => options.onChangeLayoutMode("tree-right");

  const freeLayoutButton = toolbar.createEl("button");
  freeLayoutButton.append(createToolbarIcon("layout-free"));
  freeLayoutButton.appendText("自由布局");
  setButtonA11y(freeLayoutButton, "自由布局");
  freeLayoutButton.onclick = () => options.onChangeLayoutMode("free");

  const searchWrapper = toolbar.createDiv({ cls: "mindmap-search-wrapper" });
  searchWrapper.append(createToolbarIcon("search"));
  const searchInput = searchWrapper.createEl("input", {
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
