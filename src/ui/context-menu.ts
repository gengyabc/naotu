import { Menu } from "obsidian";
import { t } from "../i18n";
import { isMacOS } from "../core/platform";

import type { NodeKind } from "../types/mindmap";

interface MindmapNodeContextMenuOptions {
  nodeKind: NodeKind;
  onConvertNotebookToText(): void;
  onCreateNotebook(): void;
  onBindExistingNotebook(): void;
  onRebindNotebook(): void;
  onDeleteNode(mode: "promote" | "recursive"): void;
}

interface MindmapEdgeContextMenuOptions {
  onDeleteEdge(): void;
}

type ContextMenuItem = {
  title: string;
  icon: "unlink" | "plus" | "file" | "search" | "trash" | null;
  onClickCallback: (() => void) | null;
  separator?: boolean;
  shortcut?: string;
};

const MENU_ICON_PATHS: Record<NonNullable<ContextMenuItem["icon"]>, string> = {
  unlink: `<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>`,
  plus: `<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>`,
  file: `<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>`,
  search: `<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><circle cx="11.5" cy="12.5" r="2"/><path d="m15 15 2 2"/>`,
  trash: `<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>`,
};

function createIconSvg(icon: NonNullable<ContextMenuItem["icon"]>): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  svg.innerHTML = MENU_ICON_PATHS[icon];

  return svg;
}

let activeMenu: MindmapContextMenu | null = null;

export function closeActiveContextMenu(): void {
  activeMenu?.close();
}

class MindmapContextMenu {
  items: ContextMenuItem[] = [];
  private containerEl: HTMLDivElement | null = null;
  private onDocumentPointerDown = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Node)) {
      this.close();
      return;
    }
    if (!this.containerEl?.contains(target)) this.close();
  };
  private onWindowBlur = (): void => this.close();
  private onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") this.close();
  };

  addItem(title: string, icon: NonNullable<ContextMenuItem["icon"]>, onClickCallback: () => void, shortcut?: string): this {
    this.items.push({ title, icon, onClickCallback, shortcut });
    return this;
  }

  addSeparator(): this {
    this.items.push({ title: "", icon: null, onClickCallback: null, separator: true });
    return this;
  }

  showAtPosition(position: { x: number; y: number }): void {
    activeMenu?.close();
    activeMenu = this;
    (Menu as unknown as { lastShown?: unknown }).lastShown = this;

    if (typeof document === "undefined") return;

    const containerEl = document.createElement("div");
    containerEl.className = "mindmap-context-menu";

    for (const item of this.items) {
      if (item.separator) {
        const separatorEl = document.createElement("div");
        separatorEl.className = "mindmap-context-menu-separator";
        containerEl.append(separatorEl);
        continue;
      }

      const buttonEl = document.createElement("button");
      buttonEl.type = "button";
      buttonEl.className = "mindmap-context-menu-item";

      const iconEl = document.createElement("span");
      iconEl.className = "mindmap-context-menu-icon";
      if (item.icon) iconEl.append(createIconSvg(item.icon));

      const labelEl = document.createElement("span");
      labelEl.className = "mindmap-context-menu-label";
      labelEl.textContent = item.title;

      buttonEl.append(iconEl, labelEl);

      if (item.shortcut) {
        const shortcutEl = document.createElement("span");
        shortcutEl.className = "mindmap-context-menu-shortcut";
        shortcutEl.textContent = item.shortcut;
        buttonEl.append(shortcutEl);
      }

      buttonEl.addEventListener("click", () => {
        this.close();
        item.onClickCallback?.();
      });
      containerEl.append(buttonEl);
    }

    document.body.append(containerEl);
    this.containerEl = containerEl;
    this.positionContainer(position.x, position.y);
    document.addEventListener("pointerdown", this.onDocumentPointerDown, true);
    if (typeof window.addEventListener === "function") {
      window.addEventListener("blur", this.onWindowBlur);
      window.addEventListener("keydown", this.onKeydown, true);
    }
  }

  close(): void {
    if (activeMenu === this) activeMenu = null;
    if ((Menu as unknown as { lastShown?: unknown }).lastShown === this) {
      (Menu as unknown as { lastShown?: unknown }).lastShown = null;
    }
    this.containerEl?.remove();
    this.containerEl = null;
    if (typeof document !== "undefined") {
      document.removeEventListener("pointerdown", this.onDocumentPointerDown, true);
    }
    if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
      window.removeEventListener("blur", this.onWindowBlur);
      window.removeEventListener("keydown", this.onKeydown, true);
    }
  }

  private positionContainer(x: number, y: number): void {
    if (!this.containerEl) return;

    const margin = 8;
    const rect = this.containerEl.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - margin;
    const maxY = window.innerHeight - rect.height - margin;
    const left = Math.max(margin, Math.min(x, maxX));
    const top = Math.max(margin, Math.min(y, maxY));

    this.containerEl.style.left = `${left}px`;
    this.containerEl.style.top = `${top}px`;
  }
}

export function createNodeContextMenu(options: MindmapNodeContextMenuOptions): { showAtPosition(position: { x: number; y: number }): void } {
  const menu = new MindmapContextMenu();

  if (options.nodeKind === "notebook") {
    menu.addItem(t("contextMenu.convertToText"), "unlink", () => options.onConvertNotebookToText());
  }

  if (options.nodeKind === "text") {
    menu.addItem(t("contextMenu.createNotebook"), "plus", () => options.onCreateNotebook());
    menu.addItem(t("contextMenu.bindExistingFile"), "file", () => options.onBindExistingNotebook());
  }

  if (options.nodeKind === "notebook") {
    menu.addItem(t("contextMenu.rebindFile"), "search", () => options.onRebindNotebook());
  }

  menu.addSeparator();
  const delLabel = isMacOS() ? "\u232B" : "Del";
  menu.addItem(t("contextMenu.deleteKeepChildren"), "trash", () => options.onDeleteNode("promote"), delLabel);
  menu.addItem(t("contextMenu.deleteWithChildren"), "trash", () => options.onDeleteNode("recursive"), isMacOS() ? "\u21E7\u232B" : "Shift+Del");
  return menu;
}

export function createEdgeContextMenu(options: MindmapEdgeContextMenuOptions): { showAtPosition(position: { x: number; y: number }): void } {
  const menu = new MindmapContextMenu();
  menu.addItem(t("contextMenu.deleteEdge"), "trash", () => options.onDeleteEdge());
  return menu;
}
