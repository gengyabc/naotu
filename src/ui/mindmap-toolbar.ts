type LayoutMode = "tree-mirror" | "tree-right" | "free";

export interface MindmapToolbar {
  setLayoutMode(mode: LayoutMode): void;
  setSaveStatus(label: string): void;
  focusSearchInput(): void;
  setCanUndo(can: boolean): void;
  setCanRedo(can: boolean): void;
  setCanSelectRoot(can: boolean): void;
  setCanFitRoot(can: boolean): void;
  setCanZoomIn(can: boolean): void;
  setCanZoomOut(can: boolean): void;
  setCanAddChild(can: boolean): void;
  setCanAddSibling(can: boolean): void;
  setCanToggleExpand(can: boolean): void;
  setCanEdit(can: boolean): void;
}

export interface MindmapToolbarOptions {
  layoutMode: LayoutMode;
  searchQuery: string;
  saveStatus: string;
  onChangeLayoutMode(mode: LayoutMode): void;
  onOpenMindmap(): void;
  onSearchChange(query: string): void;
  onSearchSubmit(): void;
  onUndo(): void;
  onRedo(): void;
  onSelectRoot(): void;
  onFitRoot(): void;
  onZoomIn(): void;
  onZoomOut(): void;
  onAddChild(): void;
  onAddSibling(): void;
  onToggleExpand(): void;
  onEdit(): void;
}

type ToolbarIconId = 
  | "folder-open" 
  | "layout-mirror" 
  | "layout-right" 
  | "layout-free" 
  | "search" 
  | "undo" 
  | "redo"
  | "home"
  | "zoom-in"
  | "zoom-out"
  | "plus"
  | "git-branch"
  | "chevrons-up-down"
  | "pencil"
  | "target";

const TOOLBAR_ICON_PATHS: Record<ToolbarIconId, string> = {
  "folder-open": `<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>`,
  "layout-mirror": `<path d="M12 3v18" stroke-width="1.5"/><path d="M12 6h4c1.1 0 2 .9 2 2v1c0 1.1-.9 2-2 2h-4" stroke-width="1.5"/><path d="M12 13h4c1.1 0 2 .9 2 2v1c0 1.1-.9 2-2 2h-4" stroke-width="1.5"/><path d="M12 6H8c-1.1 0-2 .9-2 2v1c0 1.1.9 2 2 2h4" stroke-width="1.5"/><path d="M12 13H8c-1.1 0-2 .9-2 2v1c0 1.1.9 2 2 2h4" stroke-width="1.5"/><circle cx="12" cy="3" r="1.5" fill="currentColor" stroke="none"/><circle cx="18" cy="9" r="1.5" fill="currentColor" stroke="none"/><circle cx="18" cy="16" r="1.5" fill="currentColor" stroke="none"/><circle cx="6" cy="9" r="1.5" fill="currentColor" stroke="none"/><circle cx="6" cy="16" r="1.5" fill="currentColor" stroke="none"/>`,
  "layout-right": `<path d="M5 3v18" stroke-width="1.5"/><path d="M5 7h10c1.1 0 2 .9 2 2v0c0 1.1-.9 2-2 2h-10" stroke-width="1.5"/><path d="M5 12h10c1.1 0 2 .9 2 2v0c0 1.1-.9 2-2 2h-10" stroke-width="1.5"/><path d="M5 17h10c1.1 0 2 .9 2 2v0c0 1.1-.9 2-2 2h-10" stroke-width="1.5"/><circle cx="5" cy="3" r="1.5" fill="currentColor" stroke="none"/><circle cx="17" cy="10" r="1.5" fill="currentColor" stroke="none"/><circle cx="17" cy="15" r="1.5" fill="currentColor" stroke="none"/><circle cx="17" cy="20" r="1.5" fill="currentColor" stroke="none"/>`,
  "layout-free": `<circle cx="7" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><circle cx="12" cy="17" r="3"/><path d="M9 9l1 6" stroke-width="1.5"/><path d="M15 9l-1 6" stroke-width="1.5"/>`,
  search: `<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>`,
  undo: `<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>`,
  redo: `<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/>`,
  home: `<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>`,
  "zoom-in": `<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>`,
  "zoom-out": `<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>`,
  plus: `<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>`,
  "git-branch": `<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>`,
  "chevrons-up-down": `<polyline points="7 15 12 20 17 15"/><polyline points="7 4 12 9 17 4"/>`,
  pencil: `<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>`,
  target: `<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>`,
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

function isMacOS(): boolean {
  if ("userAgentData" in navigator) {
    const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
    if (uaData?.platform) {
      return uaData.platform.toLowerCase().includes("mac");
    }
  }
  return navigator.platform.toLowerCase().includes("mac");
}

function getModifierKey(): string {
  return isMacOS() ? "Cmd" : "Ctrl";
}

export function createMindmapToolbar(container: HTMLElement, options: MindmapToolbarOptions): MindmapToolbar {
  const toolbar = container.createDiv({ cls: "semantic-mindmap-toolbar" });
  const modKey = getModifierKey();

  const openButton = toolbar.createEl("button");
  openButton.append(createToolbarIcon("folder-open"));
  openButton.appendText("打开");
  openButton.onclick = () => options.onOpenMindmap();

  const undoButton = toolbar.createEl("button");
  undoButton.append(createToolbarIcon("undo"));
  undoButton.appendText("撤销");
  undoButton.title = `${modKey} Z`;
  undoButton.onclick = () => options.onUndo();

  const redoButton = toolbar.createEl("button");
  redoButton.append(createToolbarIcon("redo"));
  redoButton.appendText("重做");
  redoButton.title = `${modKey} Shift Z`;
  redoButton.onclick = () => options.onRedo();

  const selectRootButton = toolbar.createEl("button");
  selectRootButton.append(createToolbarIcon("home"));
  selectRootButton.appendText("根节点");
  selectRootButton.title = "Home";
  selectRootButton.onclick = () => options.onSelectRoot();

  const fitRootButton = toolbar.createEl("button");
  fitRootButton.append(createToolbarIcon("target"));
  fitRootButton.appendText("适应");
  fitRootButton.title = `${modKey} 0`;
  fitRootButton.onclick = () => options.onFitRoot();

  const zoomOutButton = toolbar.createEl("button");
  zoomOutButton.append(createToolbarIcon("zoom-out"));
  zoomOutButton.appendText("缩小");
  zoomOutButton.title = `${modKey} -`;
  zoomOutButton.onclick = () => options.onZoomOut();

  const zoomInButton = toolbar.createEl("button");
  zoomInButton.append(createToolbarIcon("zoom-in"));
  zoomInButton.appendText("放大");
  zoomInButton.title = `${modKey} =`;
  zoomInButton.onclick = () => options.onZoomIn();

  const addChildButton = toolbar.createEl("button");
  addChildButton.append(createToolbarIcon("plus"));
  addChildButton.appendText("子节点");
  addChildButton.title = "Tab";
  addChildButton.onclick = () => options.onAddChild();

  const addSiblingButton = toolbar.createEl("button");
  addSiblingButton.append(createToolbarIcon("git-branch"));
  addSiblingButton.appendText("兄弟节点");
  addSiblingButton.title = "Enter";
  addSiblingButton.onclick = () => options.onAddSibling();

  const toggleExpandButton = toolbar.createEl("button");
  toggleExpandButton.append(createToolbarIcon("chevrons-up-down"));
  toggleExpandButton.appendText("切换折叠");
  toggleExpandButton.title = "Space";
  toggleExpandButton.onclick = () => options.onToggleExpand();

  const editButton = toolbar.createEl("button");
  editButton.append(createToolbarIcon("pencil"));
  editButton.appendText("编辑");
  editButton.title = "F2";
  editButton.onclick = () => options.onEdit();

  const mirrorLayoutButton = toolbar.createEl("button");
  mirrorLayoutButton.append(createToolbarIcon("layout-mirror"));
  mirrorLayoutButton.appendText("镜像树");
  mirrorLayoutButton.onclick = () => options.onChangeLayoutMode("tree-mirror");

  const rightLayoutButton = toolbar.createEl("button");
  rightLayoutButton.append(createToolbarIcon("layout-right"));
  rightLayoutButton.appendText("右向树");
  rightLayoutButton.onclick = () => options.onChangeLayoutMode("tree-right");

  const freeLayoutButton = toolbar.createEl("button");
  freeLayoutButton.append(createToolbarIcon("layout-free"));
  freeLayoutButton.appendText("自由布局");
  freeLayoutButton.onclick = () => options.onChangeLayoutMode("free");

  const searchWrapper = toolbar.createDiv({ cls: "mindmap-search-wrapper" });
  searchWrapper.append(createToolbarIcon("search"));
  const searchInput = searchWrapper.createEl("input", {
    type: "text",
    placeholder: "搜索节点...",
  });
  searchInput.title = `${modKey} F`;
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
    setCanUndo(can: boolean): void {
      undoButton.disabled = !can;
    },
    setCanRedo(can: boolean): void {
      redoButton.disabled = !can;
    },
    setCanSelectRoot(can: boolean): void {
      selectRootButton.disabled = !can;
    },
    setCanFitRoot(can: boolean): void {
      fitRootButton.disabled = !can;
    },
    setCanZoomIn(can: boolean): void {
      zoomInButton.disabled = !can;
    },
    setCanZoomOut(can: boolean): void {
      zoomOutButton.disabled = !can;
    },
    setCanAddChild(can: boolean): void {
      addChildButton.disabled = !can;
    },
    setCanAddSibling(can: boolean): void {
      addSiblingButton.disabled = !can;
    },
    setCanToggleExpand(can: boolean): void {
      toggleExpandButton.disabled = !can;
    },
    setCanEdit(can: boolean): void {
      editButton.disabled = !can;
    },
  };
}
