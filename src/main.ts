import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_MINDMAP } from "./constants";
import { MindmapView } from "./view/mindmap-view";

export default class SemanticZoomMindmapPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(VIEW_TYPE_MINDMAP, (leaf: WorkspaceLeaf) => new MindmapView(leaf));
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

    this.registerEvent(
      this.app.vault.on("rename", async () => {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP);
        for (const leaf of leaves) {
          const view = leaf.view;
          if (view instanceof MindmapView) await view.refreshNotebookLinks();
        }
      }),
    );
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_MINDMAP);
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
}
