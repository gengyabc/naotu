import { TFile } from "obsidian";
import type SemanticZoomMindmapPlugin from "../main";
import { t } from "../i18n";

export function registerMindmapCommands(plugin: SemanticZoomMindmapPlugin): void {
  plugin.addCommand({
    id: "create-mindmap",
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
    id: "open-current-file",
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
    id: "import-current-markdown-headings",
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
    id: "create-local-map-from-current-file",
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
    id: "create-sample-100",
    name: t("commands.sampleMindmap100"),
    callback: async () => {
      await plugin.createSampleMindmapFile(100);
    },
  });

  plugin.addCommand({
    id: "create-sample-1000",
    name: t("commands.sampleMindmap1000"),
    callback: async () => {
      await plugin.createSampleMindmapFile(1000);
    },
  });

  plugin.addCommand({
    id: "create-sample-3000",
    name: t("commands.sampleMindmap3000"),
    callback: async () => {
      await plugin.createSampleMindmapFile(3000);
    },
  });
}
