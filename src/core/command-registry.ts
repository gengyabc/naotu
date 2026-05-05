import { TFile } from "obsidian";
import type SemanticZoomMindmapPlugin from "../main";

export function registerMindmapCommands(plugin: SemanticZoomMindmapPlugin): void {
  plugin.addCommand({
    id: "create-semantic-zoom-mindmap",
    name: "Create semantic zoom mindmap",
    callback: async () => {
      const file = await plugin.createMindmapFile();
      await plugin.openMindmapFile(file);
    },
  });

  plugin.addCommand({
    id: "open-current-mindmap-json",
    name: "Open current .mindmap.json",
    checkCallback: (checking) => {
      const file = plugin.app.workspace.getActiveFile();
      const canRun = Boolean(file && file.path.endsWith(".mindmap.json"));
      if (checking) return canRun;
      if (file) {
        void plugin.openMindmapFile(file);
      }
      return true;
    },
  });

  plugin.addCommand({
    id: "create-mindmap-from-current-markdown-headings",
    name: "Create mindmap from current markdown headings",
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
    name: "Create local knowledge map from current file",
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
    name: "Create sample mindmap with 100 nodes",
    callback: async () => {
      await plugin.createSampleMindmapFile(100);
    },
  });

  plugin.addCommand({
    id: "create-sample-mindmap-1000",
    name: "Create sample mindmap with 1000 nodes",
    callback: async () => {
      await plugin.createSampleMindmapFile(1000);
    },
  });

  plugin.addCommand({
    id: "create-sample-mindmap-3000",
    name: "Create sample mindmap with 3000 nodes",
    callback: async () => {
      await plugin.createSampleMindmapFile(3000);
    },
  });

  plugin.addCommand({
    id: "show-semantic-mindmap-help",
    name: "Show semantic mindmap help",
    callback: () => {
      plugin.showHelp();
    },
  });
}
