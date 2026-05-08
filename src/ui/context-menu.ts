import { Menu } from "obsidian";

import type { NodeKind } from "../types/mindmap";

interface MindmapNodeContextMenuOptions {
  nodeKind: NodeKind;
  onConvertNotebookToText(): void;
  onCreateNotebook(): void;
  onBindExistingNotebook(): void;
  onPreviewNotebook(): void;
  onRebindNotebook(): void;
  onExpandSubtree(): void;
  onCollapseSubtree(): void;
  onExpandAll(): void;
  onRestoreAutoExpand(): void;
  onDeleteNode(): void;
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
      item.setTitle("选择已有 notebook...").setIcon("file-text").onClick(() => options.onBindExistingNotebook());
    });
  }

  if (options.nodeKind === "notebook") {
    menu.addItem((item) => {
      item.setTitle("预览 notebook").setIcon("scan-search").onClick(() => options.onPreviewNotebook());
    });
    menu.addItem((item) => {
      item.setTitle("重新选择 notebook...").setIcon("file-search").onClick(() => options.onRebindNotebook());
    });
  }

  menu.addSeparator();
  menu.addItem((item) => {
    item.setTitle("展开此子树").setIcon("chevrons-down").onClick(() => options.onExpandSubtree());
  });
  menu.addItem((item) => {
    item.setTitle("收起此子树").setIcon("chevrons-up").onClick(() => options.onCollapseSubtree());
  });
  menu.addSeparator();
  menu.addItem((item) => {
    item.setTitle("展开全部").setIcon("list-tree").onClick(() => options.onExpandAll());
  });
  menu.addItem((item) => {
    item.setTitle("恢复自动展开").setIcon("refresh-cw").onClick(() => options.onRestoreAutoExpand());
  });
  menu.addItem((item) => {
    item.setTitle("删除节点").setIcon("trash").onClick(() => options.onDeleteNode());
  });

  return menu;
}

export function createEdgeContextMenu(options: MindmapEdgeContextMenuOptions): Menu {
  const menu = new Menu();
  menu.addItem((item) => {
    item.setTitle("删除连线").setIcon("trash").onClick(() => options.onDeleteEdge());
  });
  return menu;
}
