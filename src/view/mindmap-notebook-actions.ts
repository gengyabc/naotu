import { App, TFile } from "obsidian";

import { findMissingNotebookLinks } from "../core/missing-link-detector";
import { NotebookService } from "../core/notebook-service";
import type { MindmapDocument, MindmapNode } from "../types/mindmap";
import { showErrorNotice } from "../ui/error-notice";
import { MarkdownFileSuggestModal } from "../ui/file-suggest-modal";

type NotebookChangeOptions = {
  commitHistory?: boolean;
  relayout?: boolean;
  render?: boolean;
  autosave?: boolean;
};

type NotebookActionStore = {
  getDocument(): MindmapDocument;
  patchNode(id: string, patch: Partial<MindmapNode>): void;
};

type MindmapNotebookActionsOptions = {
  app: App;
  notebookService: NotebookService;
  store: NotebookActionStore;
  getSourcePath: () => string;
  applyDocumentChange: (mutator: () => void, options?: NotebookChangeOptions) => void;
  commitHistory: () => void;
  markDirty: () => void;
  scheduleAutosave: () => void;
  render: () => void;
  setSelectionOnly: (id: string) => void;
  setLastFocusNodeId: (id: string) => void;
  forceDetailLevel: (id: string, level: number) => void;
  focusNode: (id: string) => void;
  setMissingNotebookNodeIds: (ids: Set<string>) => void;
  showMissingNotebookWarnings: () => boolean;
};

export class MindmapNotebookActions {
  private missingNotebookNodeIds = new Set<string>();

  constructor(private options: MindmapNotebookActionsOptions) {}

  applyMissingNotebookNodeIds(): void {
    this.options.setMissingNotebookNodeIds(
      this.options.showMissingNotebookWarnings() ? this.missingNotebookNodeIds : new Set<string>(),
    );
  }

  refreshMissingNotebookLinks(): void {
    const missing = findMissingNotebookLinks({
      app: this.options.app,
      doc: this.options.store.getDocument(),
      sourcePath: this.options.getSourcePath(),
    });
    this.missingNotebookNodeIds = new Set(missing.map((item) => item.nodeId));
    this.applyMissingNotebookNodeIds();
  }

  async refreshNotebookLinks(): Promise<void> {
    await this.syncNotebookPaths();
    this.refreshMissingNotebookLinks();
    this.options.render();
  }

  usesNotebookFile(file: TFile): boolean {
    return this.options.store.getDocument().nodes.some((node) => {
      if (node.kind !== "notebook") return false;
      return this.options.notebookService.resolveNotebookFile(node, this.options.getSourcePath())?.path === file.path;
    });
  }

  async createNotebookForTextNode(id: string): Promise<void> {
    const node = this.findNode(id);
    if (!node || node.kind !== "text") return;

    try {
      this.options.commitHistory();
      const result = await this.options.notebookService.createOrBindNotebookForTextNode(node, this.options.getSourcePath());
      this.options.applyDocumentChange(() => {
        this.options.store.patchNode(id, result.patch);
      }, { commitHistory: false });
      this.refreshMissingNotebookLinks();
      this.focusNotebookNode(id);
    } catch (error) {
      showErrorNotice(error, "无法创建 notebook");
    }
  }

  focusNotebookPreview(id: string): void {
    const node = this.findNode(id);
    if (!node || node.kind !== "notebook") return;
    this.focusNotebookNode(id);
  }

  async openNotebook(id: string): Promise<void> {
    const node = this.findNode(id);
    if (!node || node.kind !== "notebook" || !node.notebook?.link) return;

    const file = this.options.notebookService.resolveNotebookFile(node, this.options.getSourcePath());
    if (!file) {
      showErrorNotice(new Error("找不到 notebook 文件"), "无法打开 notebook");
      return;
    }

    const leaf = this.options.app.workspace.getLeaf("split");
    await leaf.openFile(file, { active: true });
  }

  async renameNotebookNode(id: string, title: string): Promise<void> {
    const node = this.findNode(id);
    if (!node || node.kind !== "notebook") return;

    try {
      this.options.commitHistory();
      const patch = await this.options.notebookService.renameNotebookFileForNode(node, title, this.options.getSourcePath());
      this.options.applyDocumentChange(() => {
        this.options.store.patchNode(id, patch);
      }, { commitHistory: false });
    } catch (error) {
      showErrorNotice(error, "无法重命名 notebook");
    }
  }

  bindExistingNotebook(id: string): void {
    const node = this.findNode(id);
    if (!node || node.kind !== "text") return;

    new MarkdownFileSuggestModal(this.options.app, (file) => {
      this.options.applyDocumentChange(() => {
        this.options.store.patchNode(node.id, this.options.notebookService.bindExistingFileAsNotebook(file));
      });
      this.refreshMissingNotebookLinks();
      this.focusNotebookNode(node.id);
    }).open();
  }

  rebindNotebook(id: string): void {
    const node = this.findNode(id);
    if (!node || node.kind !== "notebook") return;

    new MarkdownFileSuggestModal(this.options.app, (file) => {
      const patch = this.options.notebookService.bindExistingFileAsNotebook(file);
      this.options.applyDocumentChange(() => {
        this.options.store.patchNode(node.id, patch);
      });
      this.refreshMissingNotebookLinks();
    }).open();
  }

  convertNotebookToText(id: string): void {
    const node = this.findNode(id);
    if (!node || node.kind !== "notebook") return;

    const confirmed = window.confirm("此操作会将该节点转为普通节点，并断开与 notebook 的连接。原 notebook 文件不会删除。是否继续？");
    if (!confirmed) return;

    this.options.applyDocumentChange(() => {
      this.options.store.patchNode(id, this.options.notebookService.disconnectNotebook(node));
    });
    this.refreshMissingNotebookLinks();
  }

  async syncNotebookPaths(): Promise<void> {
    let changed = false;
    for (const node of this.options.store.getDocument().nodes) {
      const patch = await this.options.notebookService.syncNotebookPathIfMoved(node, this.options.getSourcePath());
      if (patch) {
        this.options.store.patchNode(node.id, patch);
        changed = true;
      }
    }

    if (!changed) return;

    this.refreshMissingNotebookLinks();
    this.options.markDirty();
    this.options.scheduleAutosave();
  }

  private findNode(id: string): MindmapNode | undefined {
    return this.options.store.getDocument().nodes.find((item) => item.id === id);
  }

  private focusNotebookNode(id: string): void {
    this.options.setSelectionOnly(id);
    this.options.setLastFocusNodeId(id);
    this.options.forceDetailLevel(id, 5);
    this.options.focusNode(id);
    this.options.render();
  }
}
