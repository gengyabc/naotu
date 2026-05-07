import { TFile } from "obsidian";
import type SemanticZoomMindmapPlugin from "../main";

export function registerMindmapCommands(plugin: SemanticZoomMindmapPlugin): void {
  plugin.addCommand({
    id: "create-semantic-zoom-mindmap",
    name: "创建语义缩放脑图",
    callback: async () => {
      const file = await plugin.createMindmapFile();
      await plugin.openMindmapFile(file);
    },
  });

  plugin.addCommand({
    id: "open-mindmap-file",
    name: "打开脑图文件",
    callback: () => {
      plugin.openMindmapFileSelector();
    },
  });

  plugin.addCommand({
    id: "open-current-mindmap",
    name: "打开当前 .mindmap",
    checkCallback: (checking) => {
      const file = plugin.app.workspace.getActiveFile();
      const canRun = Boolean(file && file.extension === "mindmap");
      if (checking) return canRun;
      if (file) {
        void plugin.openMindmapFile(file);
      }
      return true;
    },
  });

  plugin.addCommand({
    id: "create-mindmap-from-current-markdown-headings",
    name: "从当前 Markdown 标题创建脑图",
    checkCallback: (checking) => {
      const file = plugin.app.workspace.getActiveFile();
      const canRun = Boolean(file && file.extension === "md");
      if (checking) return canRun;
      if (file instanceof TFile) {
        void plugin.createMindmapFromMarkdownFile(file);
      }
      return true;
    },
  });

  plugin.addCommand({
    id: "create-local-knowledge-map-from-current-file",
    name: "从当前文件创建本地知识图谱",
    checkCallback: (checking) => {
      const file = plugin.app.workspace.getActiveFile();
      const canRun = Boolean(file && file.extension === "md");
      if (checking) return canRun;
      if (file instanceof TFile) {
        void plugin.createLocalKnowledgeMapFromFile(file);
      }
      return true;
    },
  });

  plugin.addCommand({
    id: "create-sample-mindmap-100",
    name: "创建示例脑图（100 节点）",
    callback: async () => {
      await plugin.createSampleMindmapFile(100);
    },
  });

  plugin.addCommand({
    id: "create-sample-mindmap-1000",
    name: "创建示例脑图（1000 节点）",
    callback: async () => {
      await plugin.createSampleMindmapFile(1000);
    },
  });

  plugin.addCommand({
    id: "create-sample-mindmap-3000",
    name: "创建示例脑图（3000 节点）",
    callback: async () => {
      await plugin.createSampleMindmapFile(3000);
    },
  });
}
