type LayoutMode = "tree-mirror" | "tree-right" | "free";

import { setIcon } from "obsidian";
import {
  createOwnedDiv,
  createOwnedSpan,
  createOwnedSvgElement,
  getActiveDocument,
  getActiveWindow,
  setDynamicCssProps,
} from "../core/dom";
import { getModifierKey } from "../core/platform";
import { t } from "../i18n";

export interface MindmapToolbar {
  destroy(): void;
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

type SvgSpec = {
  tag: "path" | "circle" | "line" | "polyline";
  attrs: Record<string, string>;
};

const CUSTOM_TOOLBAR_ICONS: Partial<Record<ToolbarIconId, SvgSpec[]>> = {
  "layout-mirror": [
    { tag: "path", attrs: { d: "M12 3v18", "stroke-width": "1.5" } },
    { tag: "path", attrs: { d: "M12 6h4c1.1 0 2 .9 2 2v1c0 1.1-.9 2-2 2h-4", "stroke-width": "1.5" } },
    { tag: "path", attrs: { d: "M12 13h4c1.1 0 2 .9 2 2v1c0 1.1-.9 2-2 2h-4", "stroke-width": "1.5" } },
    { tag: "path", attrs: { d: "M12 6H8c-1.1 0-2 .9-2 2v1c0 1.1.9 2 2 2h4", "stroke-width": "1.5" } },
    { tag: "path", attrs: { d: "M12 13H8c-1.1 0-2 .9-2 2v1c0 1.1.9 2 2 2h4", "stroke-width": "1.5" } },
    { tag: "circle", attrs: { cx: "12", cy: "3", r: "1.5", fill: "currentColor", stroke: "none" } },
    { tag: "circle", attrs: { cx: "18", cy: "9", r: "1.5", fill: "currentColor", stroke: "none" } },
    { tag: "circle", attrs: { cx: "18", cy: "16", r: "1.5", fill: "currentColor", stroke: "none" } },
    { tag: "circle", attrs: { cx: "6", cy: "9", r: "1.5", fill: "currentColor", stroke: "none" } },
    { tag: "circle", attrs: { cx: "6", cy: "16", r: "1.5", fill: "currentColor", stroke: "none" } },
  ],
  "layout-right": [
    { tag: "path", attrs: { d: "M5 3v18", "stroke-width": "1.5" } },
    { tag: "path", attrs: { d: "M5 7h10c1.1 0 2 .9 2 2v0c0 1.1-.9 2-2 2h-10", "stroke-width": "1.5" } },
    { tag: "path", attrs: { d: "M5 12h10c1.1 0 2 .9 2 2v0c0 1.1-.9 2-2 2h-10", "stroke-width": "1.5" } },
    { tag: "path", attrs: { d: "M5 17h10c1.1 0 2 .9 2 2v0c0 1.1-.9 2-2 2h-10", "stroke-width": "1.5" } },
    { tag: "circle", attrs: { cx: "5", cy: "3", r: "1.5", fill: "currentColor", stroke: "none" } },
    { tag: "circle", attrs: { cx: "17", cy: "10", r: "1.5", fill: "currentColor", stroke: "none" } },
    { tag: "circle", attrs: { cx: "17", cy: "15", r: "1.5", fill: "currentColor", stroke: "none" } },
    { tag: "circle", attrs: { cx: "17", cy: "20", r: "1.5", fill: "currentColor", stroke: "none" } },
  ],
  "layout-free": [
    { tag: "circle", attrs: { cx: "7", cy: "7", r: "3" } },
    { tag: "circle", attrs: { cx: "17", cy: "7", r: "3" } },
    { tag: "circle", attrs: { cx: "12", cy: "17", r: "3" } },
    { tag: "path", attrs: { d: "M9 9l1 6", "stroke-width": "1.5" } },
    { tag: "path", attrs: { d: "M15 9l-1 6", "stroke-width": "1.5" } },
  ],
};

function createCustomToolbarIcon(ownerDocument: Document, specs: SvgSpec[]): SVGSVGElement {
  const svg = createOwnedSvgElement(ownerDocument, "svg") as SVGSVGElement;
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  for (const spec of specs) {
    const element = createOwnedSvgElement(ownerDocument, spec.tag);
    for (const [name, value] of Object.entries(spec.attrs)) {
      element.setAttribute(name, value);
    }
    svg.appendChild(element);
  }

  return svg;
}

function createToolbarIcon(ownerDocument: Document, iconId: ToolbarIconId): HTMLElement | SVGSVGElement {
  const customIcon = CUSTOM_TOOLBAR_ICONS[iconId];
  if (customIcon) return createCustomToolbarIcon(ownerDocument, customIcon);

  const iconEl = createOwnedSpan(ownerDocument, { cls: "semantic-mindmap-toolbar-icon" });
  setIcon(iconEl, iconId);
  iconEl.setAttribute("aria-hidden", "true");
  return iconEl;
}

export function createMindmapToolbar(container: HTMLElement, options: MindmapToolbarOptions, beforeElement?: HTMLElement): MindmapToolbar {
  const ownerDocument = container.ownerDocument ?? getActiveDocument();
  const ownerWindow = ownerDocument.defaultView ?? getActiveWindow();
  const toolbar = container.createDiv({ cls: "semantic-mindmap-toolbar" });
  if (beforeElement && toolbar.parentElement === container) {
    container.insertBefore(toolbar, beforeElement);
  }

  const modKey = getModifierKey();
  const tooltipElements: HTMLElement[] = [];
  const positionFns: Array<() => void> = [];

  const onScrollOrResize = () => {
    for (const fn of positionFns) fn();
  };

  ownerWindow.addEventListener("scroll", onScrollOrResize);
  ownerWindow.addEventListener("resize", onScrollOrResize);

  const createButtonWithTooltip = (iconId: ToolbarIconId, label: string, shortcut?: string): HTMLButtonElement => {
    const button = toolbar.createEl("button", { attr: { "aria-label": label, "data-tooltip-position": "top" } });
    button.append(createToolbarIcon(ownerDocument, iconId));
    button.createSpan({ cls: "toolbar-button-text", text: label });

    const tooltip = createOwnedDiv(ownerDocument, { cls: "semantic-mindmap-tooltip" });
    tooltip.setAttribute("aria-hidden", "true");
    tooltip.createSpan({ cls: "semantic-mindmap-tooltip-label", text: label });
    if (shortcut) tooltip.createSpan({ cls: "semantic-mindmap-tooltip-shortcut", text: shortcut });
    tooltipElements.push(tooltip);
    ownerDocument.body?.appendChild(tooltip);

    const positionTooltip = () => {
      const rect = button.getBoundingClientRect();
      setDynamicCssProps(tooltip, {
        "--mindmap-tooltip-top": `${rect.bottom + 6}px`,
        "--mindmap-tooltip-left": `${rect.left + rect.width / 2}px`,
      });
    };

    const showTooltip = () => {
      if (!toolbar.classList.contains("is-compact") || button.disabled) return;
      ownerWindow.requestAnimationFrame(() => {
        positionTooltip();
        tooltip.classList.add("is-visible");
      });
    };

    const hideTooltip = () => {
      tooltip.classList.remove("is-visible");
    };

    button.addEventListener("mouseenter", showTooltip);
    button.addEventListener("mouseleave", hideTooltip);
    positionFns.push(positionTooltip);
    return button;
  };

  const openButton = createButtonWithTooltip("folder-open", t("toolbar.open"));
  openButton.onclick = () => options.onOpenMindmap();

  const undoButton = createButtonWithTooltip("undo", t("toolbar.undo"), `${modKey} Z`);
  undoButton.onclick = () => options.onUndo();

  const redoButton = createButtonWithTooltip("redo", t("toolbar.redo"), `${modKey} Shift Z`);
  redoButton.onclick = () => options.onRedo();

  const selectRootButton = createButtonWithTooltip("home", t("toolbar.root"), "Home");
  selectRootButton.onclick = () => options.onSelectRoot();

  const fitRootButton = createButtonWithTooltip("target", t("toolbar.fit"), `${modKey} 0`);
  fitRootButton.onclick = () => options.onFitRoot();

  const zoomOutButton = createButtonWithTooltip("zoom-out", t("toolbar.zoomOut"), `${modKey} -`);
  zoomOutButton.onclick = () => options.onZoomOut();

  const zoomInButton = createButtonWithTooltip("zoom-in", t("toolbar.zoomIn"), `${modKey} =`);
  zoomInButton.onclick = () => options.onZoomIn();

  const addChildButton = createButtonWithTooltip("plus", t("toolbar.child"), "Tab");
  addChildButton.onclick = () => options.onAddChild();

  const addSiblingButton = createButtonWithTooltip("git-branch", t("toolbar.sibling"), "Enter");
  addSiblingButton.onclick = () => options.onAddSibling();

  const toggleExpandButton = createButtonWithTooltip("chevrons-up-down", t("toolbar.toggleExpand"), "Space");
  toggleExpandButton.onclick = () => options.onToggleExpand();

  const editButton = createButtonWithTooltip("pencil", t("toolbar.edit"), "F2");
  editButton.onclick = () => options.onEdit();

  const mirrorLayoutButton = createButtonWithTooltip("layout-mirror", t("toolbar.mirrorTree"));
  mirrorLayoutButton.onclick = () => options.onChangeLayoutMode("tree-mirror");

  const rightLayoutButton = createButtonWithTooltip("layout-right", t("toolbar.rightTree"));
  rightLayoutButton.onclick = () => options.onChangeLayoutMode("tree-right");

  const freeLayoutButton = createButtonWithTooltip("layout-free", t("toolbar.freeLayout"));
  freeLayoutButton.onclick = () => options.onChangeLayoutMode("free");

  const searchWrapper = toolbar.createDiv({ cls: "mindmap-search-wrapper" });
  searchWrapper.append(createToolbarIcon(ownerDocument, "search"));
  const searchInput = searchWrapper.createEl("input", {
    type: "text",
    placeholder: t("toolbar.searchPlaceholder"),
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

  const saveStatusEl = toolbar.createSpan({ cls: "mindmap-save-status", text: options.saveStatus });

  const setLayoutMode = (mode: LayoutMode): void => {
    mirrorLayoutButton.toggleClass("is-active", mode === "tree-mirror");
    rightLayoutButton.toggleClass("is-active", mode === "tree-right");
    freeLayoutButton.toggleClass("is-active", mode === "free");
  };

  setLayoutMode(options.layoutMode);

  const checkOverflow = (): void => {
    const clone = toolbar.cloneNode(true) as HTMLElement;
    clone.classList.remove("is-compact");
    clone.addClass("semantic-mindmap-toolbar-measure");
    toolbar.parentElement?.append(clone);
    const overflows = clone.scrollWidth > toolbar.clientWidth;
    clone.remove();
    toolbar.classList.toggle("is-compact", overflows);
  };

  const resizeObserver = new ResizeObserver(() => checkOverflow());
  resizeObserver.observe(toolbar);
  checkOverflow();

  return {
    destroy(): void {
      resizeObserver.disconnect();
      ownerWindow.removeEventListener("scroll", onScrollOrResize);
      ownerWindow.removeEventListener("resize", onScrollOrResize);
      tooltipElements.forEach((tooltip) => tooltip.remove());
      toolbar.remove();
    },
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
