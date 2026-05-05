import { App, Modal } from "obsidian";

export class MindmapHelpModal extends Modal {
  constructor(app: App) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "Semantic Zoom Mindmap 帮助" });

    contentEl.createEl("h3", { text: "节点类型" });
    contentEl.createEl("p", {
      text: "text 节点只是一句话，用于脑图结构表达。notebook 节点绑定 Obsidian 笔记，用于知识展开。",
    });

    contentEl.createEl("h3", { text: "主要操作" });
    const list = contentEl.createEl("ul");

    [
      "双击节点标题：编辑标题",
      "点击双下箭头：text 节点转 notebook，notebook 节点展开预览",
      "点击右侧 + / -：展开或收起子树",
      "Tab：新增子节点",
      "Enter：新增兄弟节点",
      "Space：展开 / 收起当前节点",
      "F2：编辑当前节点",
      "方向键：在节点之间移动",
      "Cmd/Ctrl + Z：撤销",
      "Cmd/Ctrl + Shift + Z：重做",
      "Cmd/Ctrl + F：搜索",
      "Cmd/Ctrl + 0：回到 root",
    ].forEach((text) => {
      list.createEl("li", { text });
    });

    contentEl.createEl("h3", { text: "语义缩放" });
    contentEl.createEl("p", {
      text: "缩放不会简单放大文字，而是改变信息粒度。缩小看结构，放大看 notebook 内容。",
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
