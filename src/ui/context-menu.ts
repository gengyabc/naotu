import { Menu, setIcon } from "obsidian";
import { isNodeLike, setDynamicCssProps } from "../core/dom";
import { t } from "../i18n";
import { isMacOS } from "../core/platform";

import type { NodeKind } from "../types/mindmap";

interface MindmapNodeContextMenuOptions {
  nodeKind: NodeKind;
  ownerDocument: Document;
  onConvertNotebookToText(): void;
  onCreateNotebook(): void;
  onBindExistingNotebook(): void;
  onRebindNotebook(): void;
  onDeleteNode(mode: "promote" | "recursive"): void;
}

interface MindmapEdgeContextMenuOptions {
  ownerDocument: Document;
  onDeleteEdge(): void;
}

type ContextMenuItem = {
  title: string;
  icon: "unlink" | "plus" | "file" | "search" | "trash" | null;
  onClickCallback: (() => void) | null;
  separator?: boolean;
  shortcut?: string;
};

function createIconSpan(ownerDocument: Document, icon: NonNullable<ContextMenuItem["icon"]>): HTMLSpanElement {
  const iconEl = ownerDocument.createElement("span");
  setIcon(iconEl, icon);
  iconEl.setAttribute("aria-hidden", "true");
  return iconEl;
}

let activeMenu: MindmapContextMenu | null = null;

export function closeActiveContextMenu(): void {
  activeMenu?.close();
}

class MindmapContextMenu {
  items: ContextMenuItem[] = [];
  constructor(private ownerDocument: Document) {}
  private containerEl: HTMLDivElement | null = null;
  private onDocumentPointerDown = (event: Event): void => {
    const target = event.target;
    if (!isNodeLike(target)) {
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

    const containerEl = this.ownerDocument.createElement("div");
    containerEl.className = "mindmap-context-menu";

    for (const item of this.items) {
      if (item.separator) {
        const separatorEl = this.ownerDocument.createElement("div");
        separatorEl.className = "mindmap-context-menu-separator";
        containerEl.append(separatorEl);
        continue;
      }

      const buttonEl = this.ownerDocument.createElement("button");
      buttonEl.type = "button";
      buttonEl.className = "mindmap-context-menu-item";

      const iconEl = this.ownerDocument.createElement("span");
      iconEl.className = "mindmap-context-menu-icon";
      if (item.icon) iconEl.append(createIconSpan(this.ownerDocument, item.icon));

      const labelEl = this.ownerDocument.createElement("span");
      labelEl.className = "mindmap-context-menu-label";
      labelEl.textContent = item.title;

      buttonEl.append(iconEl, labelEl);

      if (item.shortcut) {
        const shortcutEl = this.ownerDocument.createElement("span");
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

    this.ownerDocument.body.append(containerEl);
    this.containerEl = containerEl;
    this.positionContainer(position.x, position.y);
    this.ownerDocument.addEventListener("pointerdown", this.onDocumentPointerDown, true);
    this.ownerDocument.defaultView?.addEventListener("blur", this.onWindowBlur);
    this.ownerDocument.defaultView?.addEventListener("keydown", this.onKeydown, true);
  }

  close(): void {
    if (activeMenu === this) activeMenu = null;
    if ((Menu as unknown as { lastShown?: unknown }).lastShown === this) {
      (Menu as unknown as { lastShown?: unknown }).lastShown = null;
    }
    this.containerEl?.remove();
    this.containerEl = null;
    this.ownerDocument.removeEventListener("pointerdown", this.onDocumentPointerDown, true);
    this.ownerDocument.defaultView?.removeEventListener("blur", this.onWindowBlur);
    this.ownerDocument.defaultView?.removeEventListener("keydown", this.onKeydown, true);
  }

  private positionContainer(x: number, y: number): void {
    if (!this.containerEl) return;

    const ownerWindow = this.ownerDocument.defaultView;
    if (!ownerWindow) return;
    const margin = 8;
    const rect = this.containerEl.getBoundingClientRect();
    const maxX = ownerWindow.innerWidth - rect.width - margin;
    const maxY = ownerWindow.innerHeight - rect.height - margin;
    const left = Math.max(margin, Math.min(x, maxX));
    const top = Math.max(margin, Math.min(y, maxY));

    setDynamicCssProps(this.containerEl, { left: `${left}px`, top: `${top}px` });
  }
}

export function createNodeContextMenu(options: MindmapNodeContextMenuOptions): { showAtPosition(position: { x: number; y: number }): void } {
  const menu = new MindmapContextMenu(options.ownerDocument);

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
  const menu = new MindmapContextMenu(options.ownerDocument);
  menu.addItem(t("contextMenu.deleteEdge"), "trash", () => options.onDeleteEdge());
  return menu;
}
