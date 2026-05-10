import { Menu } from "obsidian";

import type { NodeKind } from "../types/mindmap";

interface MindmapNodeContextMenuOptions {
  nodeKind: NodeKind;
  onConvertNotebookToText(): void;
  onCreateNotebook(): void;
  onBindExistingNotebook(): void;
  onRebindNotebook(): void;
}

interface MindmapEdgeContextMenuOptions {
  onDeleteEdge(): void;
}

export function createNodeContextMenu(options: MindmapNodeContextMenuOptions): Menu {
  const menu = new Menu();

  if (options.nodeKind === "notebook") {
    menu.addItem((item) => {
      item.setTitle("转为普通节点").setIcon("unlink").onClick(() => options.onConvertNotebookToText());
    });
  }

  if (options.nodeKind === "text") {
    menu.addItem((item) => {
      item.setTitle("创建 notebook").setIcon("file-plus").onClick(() => options.onCreateNotebook());
    });
    menu.addItem((item) => {
      item.setTitle("选择已有文件...").setIcon("file-text").onClick(() => options.onBindExistingNotebook());
    });
  }

  if (options.nodeKind === "notebook") {
    menu.addItem((item) => {
      item.setTitle("重新选择文件...").setIcon("file-search").onClick(() => options.onRebindNotebook());
    });
  }

  return menu;
}

export function createEdgeContextMenu(options: MindmapEdgeContextMenuOptions): Menu {
  const menu = new Menu();
  menu.addItem((item) => {
    item.setTitle("删除连线").setIcon("trash").onClick(() => options.onDeleteEdge());
  });
  return menu;
}
