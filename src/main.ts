import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { registerMindmapCommands } from "./core/command-registry";
import { createLocalKnowledgeMap } from "./core/local-knowledge-map";
import { createMindmapFromMarkdown } from "./core/mindmap-from-markdown";
import { globalPreviewCache } from "./core/preview-cache";
import { VIEW_TYPE_MINDMAP } from "./constants";
import { createSampleMindmap } from "./core/sample-data";
import { assertNoTelemetry } from "./core/telemetry-disabled";
import { DEFAULT_SETTINGS, type SemanticMindmapSettings } from "./types/settings";
import { SemanticMindmapSettingTab } from "./ui/settings-tab";
import { MindmapView } from "./view/mindmap-view";

import { MindmapFileSuggestModal } from "./ui/mindmap-file-suggest-modal";

export default class SemanticZoomMindmapPlugin extends Plugin {
  settings!: SemanticMindmapSettings;

  async onload(): Promise<void> {
    await this.loadSettings();
    assertNoTelemetry();
    this.addSettingTab(new SemanticMindmapSettingTab(this.app, this));

    this.registerView(VIEW_TYPE_MINDMAP, (leaf: WorkspaceLeaf) => new MindmapView(leaf, this));
    this.registerExtensions(["naotu"], VIEW_TYPE_MINDMAP);

    this.addRibbonIcon("git-fork", "创建语义缩放脑图", async () => {
      const file = await this.createMindmapFile();
      await this.openMindmapFile(file);
    });

    registerMindmapCommands(this);

    this.registerEvent(
      this.app.vault.on("rename", async () => {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP);
        for (const leaf of leaves) {
          const view = leaf.view;
          if (view instanceof MindmapView) await view.refreshNotebookLinks();
        }
      }),
    );

    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        globalPreviewCache.clear();

        if (!(file instanceof TFile)) return;
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP);
        for (const leaf of leaves) {
          const view = leaf.view;
          if (view instanceof MindmapView) await view.handleVaultModify(file);
        }
      }),
    );

    this.registerEvent(
      this.app.vault.on("delete", async (file) => {
        globalPreviewCache.clear();
        if (!(file instanceof TFile)) return;
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP);
        for (const leaf of leaves) {
          const view = leaf.view;
          if (view instanceof MindmapView) await view.handleVaultDelete(file);
        }
      }),
    );
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_MINDMAP);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async createMindmapFile(): Promise<TFile> {
    const active = this.app.workspace.getActiveFile();
    const folder = active?.parent?.path ?? "";
    const path = folder ? `${folder}/Untitled-${Date.now()}.naotu` : `Untitled-${Date.now()}.naotu`;

    const content = JSON.stringify(
      {
        version: 1,
        title: "Untitled Mindmap",
        layoutMode: "tree-mirror",
        viewport: { x: 400, y: 300, zoom: 1 },
        nodes: [
          { id: "root", kind: "text", title: "中心主题", x: 0, y: 0, width: 180, height: 56, treeControl: "auto" },
        ],
        edges: [],
      },
      null,
      2,
    );

    return await this.app.vault.create(path, content);
  }

  async openMindmapFile(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({
      type: VIEW_TYPE_MINDMAP,
      active: true,
      state: { file: file.path },
    });
    this.app.workspace.revealLeaf(leaf);
  }

  openMindmapFileSelector(): void {
    new MindmapFileSuggestModal(this.app, async (file) => {
      await this.openMindmapFile(file);
    }).open();
  }

  async createMindmapFromMarkdownFile(file: TFile): Promise<void> {
    const markdown = await this.app.vault.read(file);
    const doc = createMindmapFromMarkdown({
      markdown,
      fileBasename: file.basename,
      filePath: file.path,
      headingsAsNotebookNodes: this.settings.importHeadingsAsNotebookNodes,
    });

    const path = file.parent?.path ? `${file.parent.path}/${file.basename}.naotu` : `${file.basename}.naotu`;
    const existing = this.app.vault.getAbstractFileByPath(path);

    let target: TFile;
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, JSON.stringify(doc, null, 2));
      target = existing;
    } else {
      target = await this.app.vault.create(path, JSON.stringify(doc, null, 2));
    }

    await this.openMindmapFile(target);
  }

  async createLocalKnowledgeMapFromFile(file: TFile): Promise<void> {
    const doc = createLocalKnowledgeMap({
      app: this.app,
      file,
      maxNodes: this.settings.maxBacklinkMapNodes,
    });

    const path = file.parent?.path
      ? `${file.parent.path}/${file.basename}.local-map.naotu`
      : `${file.basename}.local-map.naotu`;
    const existing = this.app.vault.getAbstractFileByPath(path);

    let target: TFile;
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, JSON.stringify(doc, null, 2));
      target = existing;
    } else {
      target = await this.app.vault.create(path, JSON.stringify(doc, null, 2));
    }

    await this.openMindmapFile(target);
  }

  async createSampleMindmapFile(nodeCount: number): Promise<void> {
    const doc = createSampleMindmap(nodeCount);
    const path = `Sample-${nodeCount}-${Date.now()}.naotu`;
    const file = await this.app.vault.create(path, JSON.stringify(doc, null, 2));
    await this.openMindmapFile(file);
  }

  

  async notifyLayoutSettingsChanged(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof MindmapView) view.handleLayoutSettingsChanged();
    }
  }
}
