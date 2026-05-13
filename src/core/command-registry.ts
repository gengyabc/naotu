import { TFile } from "obsidian";
import type SemanticZoomMindmapPlugin from "../main";
import { t } from "../i18n";

export function registerMindmapCommands(plugin: SemanticZoomMindmapPlugin): void {
  plugin.addCommand({
    id: "create-semantic-zoom-mindmap",
    name: t("commands.createMindmap"),
    callback: async () => {
      const file = await plugin.createMindmapFile();
      await plugin.openMindmapFile(file);
    },
  });

  plugin.addCommand({
    id: "open-mindmap-file",
    name: t("commands.openMindmap"),
    callback: () => {
      plugin.openMindmapFileSelector();
    },
  });

  plugin.addCommand({
    id: "open-current-mindmap",
    name: t("commands.openCurrentMindmap"),
    checkCallback: (checking) => {
      const file = plugin.app.workspace.getActiveFile();
      const canRun = Boolean(file && file.extension === "naotu");
      if (checking) return canRun;
      if (file) {
        void plugin.openMindmapFile(file);
      }
      return true;
    },
  });

  plugin.addCommand({
    id: "create-mindmap-from-current-markdown-headings",
    name: t("commands.createFromMarkdown"),
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
    name: t("commands.createLocalKnowledgeMap"),
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
    name: t("commands.sampleMindmap100"),
    callback: async () => {
      await plugin.createSampleMindmapFile(100);
    },
  });

  plugin.addCommand({
    id: "create-sample-mindmap-1000",
    name: t("commands.sampleMindmap1000"),
    callback: async () => {
      await plugin.createSampleMindmapFile(1000);
    },
  });

  plugin.addCommand({
    id: "create-sample-mindmap-3000",
    name: t("commands.sampleMindmap3000"),
    callback: async () => {
      await plugin.createSampleMindmapFile(3000);
    },
  });
}
