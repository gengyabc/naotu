import { App, TFile } from "obsidian";
import { t } from "../i18n";

import { findMissingNotebookLinks } from "../core/missing-link-detector";
import { NotebookService } from "../core/notebook-service";
import type { MindmapDocument, MindmapNode, NotebookTargetKind } from "../types/mindmap";
import { showErrorNotice } from "../ui/error-notice";
import { FileBindingSuggestModal } from "../ui/file-suggest-modal";
import { getFileNodeTitle } from "../core/file-node-support";
import {
  getFileDimensions,
  calculateInitialEmbeddedSize,
  getDefaultEmbeddedSize,
  isLegacyDefaultEmbeddedSize,
} from "../core/file-dimensions";

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
    await this.syncEmbeddedFileSizing();
    this.refreshMissingNotebookLinks();
    this.options.render();
  }

  async syncEmbeddedFileSizing(): Promise<void> {
    const defaultSize = getDefaultEmbeddedSize();
    let changed = false;

    for (const node of this.options.store.getDocument().nodes) {
      if (node.kind !== "notebook") continue;
      const targetKind = node.notebook?.targetKind;
      if (targetKind !== "image" && targetKind !== "excalidraw") continue;

      const file = this.options.notebookService.resolveNotebookFile(node, this.options.getSourcePath());
      if (!(file instanceof TFile)) continue;

      const dimensions = await getFileDimensions(this.options.app, file, targetKind);
      if (!dimensions) continue;

      const sized = calculateInitialEmbeddedSize(dimensions.width, dimensions.height);
      const usesLegacyDefaultSize =
        (node.customWidth === defaultSize.width && node.customHeight === defaultSize.height)
        || isLegacyDefaultEmbeddedSize(node.customWidth, node.customHeight);
      const needsAspectRatio = typeof node.aspectRatio !== "number" || node.aspectRatio <= 0;
      const needsSizeUpgrade = usesLegacyDefaultSize || (typeof node.customWidth !== "number" && typeof node.customHeight !== "number");

      if (!needsAspectRatio && !needsSizeUpgrade) continue;

      this.options.store.patchNode(node.id, {
        aspectRatio: sized.aspectRatio,
        ...(needsSizeUpgrade ? { customWidth: sized.width, customHeight: sized.height } : {}),
      });
      changed = true;
    }

    if (!changed) return;

    this.options.markDirty();
    this.options.scheduleAutosave();
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
      showErrorNotice(error, "notices.createNotebookFailed");
    }
  }

  async openNotebook(id: string): Promise<void> {
    const node = this.findNode(id);
    if (!node || node.kind !== "notebook" || !node.notebook?.link) return;

    const file = this.options.notebookService.resolveNotebookFile(node, this.options.getSourcePath());
    if (!file) {
      showErrorNotice(new Error(t("notices.openNotebookFailed")), "notices.openNotebookFailed");
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
      showErrorNotice(error, "notices.renameNotebookFailed");
    }
  }

  bindExistingNotebook(id: string): void {
    const node = this.findNode(id);
    if (!node || node.kind !== "text") return;

    new FileBindingSuggestModal(this.options.app, async (file, targetKind) => {
      const patch = await this.buildBindExistingFilePatch(file, targetKind);
      this.options.applyDocumentChange(() => {
        this.options.store.patchNode(node.id, patch);
      });
      this.refreshMissingNotebookLinks();
      this.focusNotebookNode(node.id);
    }).open();
  }

  rebindNotebook(id: string): void {
    const node = this.findNode(id);
    if (!node || node.kind !== "notebook") return;

    new FileBindingSuggestModal(this.options.app, async (file, targetKind) => {
      const patch = await this.buildBindExistingFilePatch(file, targetKind);
      this.options.applyDocumentChange(() => {
        this.options.store.patchNode(node.id, patch);
      });
      this.refreshMissingNotebookLinks();
    }).open();
  }

  convertNotebookToText(id: string): void {
    const node = this.findNode(id);
    if (!node || node.kind !== "notebook") return;

    this.options.applyDocumentChange(() => {
      this.options.store.patchNode(id, this.options.notebookService.disconnectFileNode(node));
    });
    this.refreshMissingNotebookLinks();
  }

  async bindExistingFileNode(id: string, file: TFile, targetKind: NotebookTargetKind): Promise<void> {
    const node = this.findNode(id);
    if (!node || node.kind !== "text") return;

    this.options.commitHistory();
    const freshFile = this.options.app.vault.getAbstractFileByPath(file.path);
    if (!(freshFile instanceof TFile)) throw new Error(t("notices.fileNotFoundForBinding"));

    const basePatch = this.options.notebookService.bindExistingFileNode(freshFile, targetKind);
    const patch = await this.applyFileNodeSizing(basePatch, freshFile, targetKind);
    this.options.applyDocumentChange(() => {
      this.options.store.patchNode(id, patch);
    }, { commitHistory: false });
    this.refreshMissingNotebookLinks();
    this.focusNotebookNode(id);
  }

  handleDeletedBoundFile(file: TFile): boolean {
    const affectedNodes = this.options.store.getDocument().nodes.filter((node) => {
      if (node.kind !== "notebook" || !node.notebook) return false;
      const resolved = this.options.notebookService.resolveNotebookFile(node, this.options.getSourcePath());
      return resolved?.path === file.path || node.notebook.path === file.path;
    });
    if (affectedNodes.length === 0) return false;

    const embeddedTargets = affectedNodes.filter((node) => (node.notebook?.targetKind ?? "markdown") !== "markdown");
    if (embeddedTargets.length > 0) {
      this.options.commitHistory();
      this.options.applyDocumentChange(() => {
        for (const node of embeddedTargets) {
          this.options.store.patchNode(node.id, {
            kind: "text",
            title: node.title || getFileNodeTitle(file.path),
            notebook: undefined,
            link: undefined,
            customWidth: undefined,
            customHeight: undefined,
            aspectRatio: undefined,
          });
        }
      }, { commitHistory: false });
    }

    this.refreshMissingNotebookLinks();
    this.options.render();
    return true;
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
    this.options.focusNode(id);
    this.options.render();
  }

  private async buildBindExistingFilePatch(file: TFile, targetKind: NotebookTargetKind): Promise<Partial<MindmapNode>> {
    const basePatch = this.options.notebookService.bindExistingFileNode(file, targetKind);
    return await this.applyFileNodeSizing(basePatch, file, targetKind);
  }

  private async applyFileNodeSizing(
    patch: Partial<MindmapNode>,
    file: TFile,
    targetKind: NotebookTargetKind,
  ): Promise<Partial<MindmapNode>> {
    if (targetKind === "markdown") {
      return { ...patch, customWidth: undefined, customHeight: undefined, aspectRatio: undefined };
    }

    const dimensions = await getFileDimensions(this.options.app, file, targetKind);
    if (!dimensions) {
      const defaultSize = getDefaultEmbeddedSize();
      return { ...patch, customWidth: defaultSize.width, customHeight: defaultSize.height, aspectRatio: undefined };
    }

    const sized = calculateInitialEmbeddedSize(dimensions.width, dimensions.height);
    return { ...patch, customWidth: sized.width, customHeight: sized.height, aspectRatio: sized.aspectRatio };
  }
}
