import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { createLocalKnowledgeMap } from "./core/local-knowledge-map";
import { createMindmapFromMarkdown } from "./core/mindmap-from-markdown";
import { VIEW_TYPE_MINDMAP } from "./constants";
import { DEFAULT_SETTINGS, type SemanticMindmapSettings } from "./types/settings";
import { SemanticMindmapSettingTab } from "./ui/settings-tab";
import { MindmapView } from "./view/mindmap-view";
import { globalPreviewCache } from "./core/preview-cache";

export default class SemanticZoomMindmapPlugin extends Plugin {
  settings!: SemanticMindmapSettings;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new SemanticMindmapSettingTab(this.app, this));

    this.registerView(VIEW_TYPE_MINDMAP, (leaf: WorkspaceLeaf) => new MindmapView(leaf, this));
    this.registerExtensions(["mindmap.json"], VIEW_TYPE_MINDMAP);

    this.addRibbonIcon("git-fork", "创建语义缩放脑图", async () => {
      const file = await this.createMindmapFile();
      await this.openMindmapFile(file);
    });

    this.addCommand({
      id: "create-semantic-zoom-mindmap",
      name: "Create semantic zoom mindmap",
      callback: async () => {
        const file = await this.createMindmapFile();
        await this.openMindmapFile(file);
      },
    });

    this.addCommand({
      id: "open-current-mindmap-json",
      name: "Open current .mindmap.json",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const canRun = Boolean(file && file.path.endsWith(".mindmap.json"));
        if (checking) return canRun;
        if (file) void this.openMindmapFile(file);
        return true;
      },
    });

    this.addCommand({
      id: "create-mindmap-from-current-markdown-headings",
      name: "Create mindmap from current markdown headings",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const canRun = Boolean(file && file.extension === "md");
        if (checking) return canRun;
        if (file) void this.createMindmapFromMarkdownFile(file);
        return true;
      },
    });

    this.addCommand({
      id: "create-local-knowledge-map-from-current-file",
      name: "Create local knowledge map from current file",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const canRun = Boolean(file && file.extension === "md");
        if (checking) return canRun;
        if (file) void this.createLocalKnowledgeMapFromFile(file);
        return true;
      },
    });

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
      this.app.vault.on("modify", () => {
        globalPreviewCache.clear();
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

  private async createMindmapFile(): Promise<TFile> {
    const active = this.app.workspace.getActiveFile();
    const folder = active?.parent?.path ?? "";
    const path = folder ? `${folder}/Untitled-${Date.now()}.mindmap.json` : `Untitled-${Date.now()}.mindmap.json`;

    const content = JSON.stringify(
      {
        version: 1,
        title: "Untitled Mindmap",
        layoutMode: "radial",
        viewport: { x: 0, y: 0, zoom: 1 },
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

  private async openMindmapFile(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE_MINDMAP, active: true });

    const view = leaf.view;
    if (view instanceof MindmapView) await view.setFile(file);
    this.app.workspace.revealLeaf(leaf);
  }

  private async createMindmapFromMarkdownFile(file: TFile): Promise<void> {
    const markdown = await this.app.vault.read(file);
    const doc = createMindmapFromMarkdown({
      markdown,
      fileBasename: file.basename,
      filePath: file.path,
      headingsAsNotebookNodes: this.settings.importHeadingsAsNotebookNodes,
    });

    const path = file.parent?.path ? `${file.parent.path}/${file.basename}.mindmap.json` : `${file.basename}.mindmap.json`;
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

  private async createLocalKnowledgeMapFromFile(file: TFile): Promise<void> {
    const doc = createLocalKnowledgeMap({
      app: this.app,
      file,
      maxNodes: this.settings.maxBacklinkMapNodes,
    });

    const path = file.parent?.path
      ? `${file.parent.path}/${file.basename}.local-map.mindmap.json`
      : `${file.basename}.local-map.mindmap.json`;
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
}
