import { ItemView, Menu, Notice, TFile, WorkspaceLeaf } from "obsidian";
import {
  VIEW_TYPE_MINDMAP,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  DEFAULT_TEXT_NODE_TITLE,
} from "../constants";
import { MindmapDocumentStore } from "../core/document-store";
import { DebouncedAutosave } from "../core/autosave";
import { SelectionState } from "../core/selection";
import { NotebookService } from "../core/notebook-service";
import { SvgMindmapRenderer } from "../renderer/svg-mindmap-renderer";
import { RadialLayoutEngine } from "../core/radial-layout";
import { createId } from "../core/id";
import type { MindmapNode } from "../types/mindmap";

export class MindmapView extends ItemView {
  private store: MindmapDocumentStore;
  private autosave: DebouncedAutosave;
  private selection = new SelectionState();
  private notebookService: NotebookService;
  private renderer: SvgMindmapRenderer | null = null;
  private sourceFile: TFile | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.store = new MindmapDocumentStore(this.app);
    this.autosave = new DebouncedAutosave(() => this.store.save());
    this.notebookService = new NotebookService(this.app);
  }

  getViewType(): string {
    return VIEW_TYPE_MINDMAP;
  }

  getDisplayText(): string {
    return this.sourceFile?.basename ?? "Semantic Mindmap";
  }

  async setFile(file: TFile): Promise<void> {
    this.sourceFile = file;
    await this.store.openFile(file);
    await this.syncNotebookPaths();
    this.renderView();
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("semantic-mindmap-view");
    this.renderView();
  }

  async onClose(): Promise<void> {
    await this.autosave.flush();
    this.renderer?.unmount();
  }

  async refreshNotebookLinks(): Promise<void> {
    await this.syncNotebookPaths();
    this.renderer?.render();
  }

  private renderView(): void {
    this.contentEl.empty();

    const toolbar = this.contentEl.createDiv({ cls: "semantic-mindmap-toolbar" });
    const addButton = toolbar.createEl("button", { text: "新增节点" });
    addButton.onclick = () => this.addTextNode();

    const layoutButton = toolbar.createEl("button", { text: "中心布局" });
    layoutButton.onclick = () => this.applyRadialLayout();

    const saveButton = toolbar.createEl("button", { text: "保存" });
    saveButton.onclick = () => void this.store.save();

    const canvas = this.contentEl.createDiv({ cls: "semantic-mindmap-canvas" });

    this.renderer = new SvgMindmapRenderer({
      app: this.app,
      container: canvas,
      sourcePath: this.sourceFile?.path ?? "",
      getDocument: () => this.store.getDocument(),
      getSelectedNodeIds: () => this.selection.getIds(),
      onViewportChange: (x, y, zoom) => {
        this.store.setViewport(x, y, zoom);
        this.autosave.schedule();
      },
      onSelectNode: (id, mode) => {
        if (mode === "replace") this.selection.setOnly(id);
        if (mode === "toggle") this.selection.toggle(id);
        if (mode === "add") this.selection.add(id);
      },
      onToggleTree: (id) => {
        this.store.toggleTreeControl(id);
        this.renderer?.render();
        this.autosave.schedule();
      },
      onNotebookExpand: (id) => {
        void this.handleNotebookExpand(id);
      },
      onInlineTitleCommit: async (id, title) => {
        await this.handleInlineTitleCommit(id, title);
      },
      onContextMenu: (id, x, y) => {
        this.openContextMenu(id, x, y);
      },
      onNodeMove: (id, x, y) => {
        this.store.updateNodePosition(id, x, y);
        this.autosave.schedule();
      },
    });

    this.renderer.mount();
  }

  private addTextNode(): void {
    const node: MindmapNode = {
      id: createId("node"),
      kind: "text",
      title: DEFAULT_TEXT_NODE_TITLE,
      x: 120,
      y: 120,
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
      treeControl: "auto",
    };

    this.store.addNode(node);
    this.selection.setOnly(node.id);
    this.renderer?.render();
    this.autosave.schedule();
  }

  private async handleNotebookExpand(id: string): Promise<void> {
    const node = this.store.getDocument().nodes.find((item) => item.id === id);
    if (!node) return;

    if (node.kind === "text") {
      try {
        const result = await this.notebookService.createOrBindNotebookForTextNode(node, this.sourceFile?.path ?? "");
        this.store.patchNode(id, result.patch);
        this.selection.setOnly(id);
        this.renderer?.setLastFocusNodeId(id);
        this.renderer?.forceDetailLevel(id, 5);
        this.renderer?.render();
        this.autosave.schedule();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : "无法创建 notebook");
      }
      return;
    }

    this.selection.setOnly(id);
    this.renderer?.setLastFocusNodeId(id);
    this.renderer?.forceDetailLevel(id, 5);
    this.renderer?.focusNode(id);
    this.renderer?.render();
  }

  private async handleInlineTitleCommit(id: string, title: string): Promise<void> {
    const node = this.store.getDocument().nodes.find((item) => item.id === id);
    if (!node) return;

    if (node.kind === "text") {
      this.store.updateNodeTitle(id, title);
      this.renderer?.render();
      this.autosave.schedule();
      return;
    }

    try {
      const patch = await this.notebookService.renameNotebookFileForNode(node, title, this.sourceFile?.path ?? "");
      this.store.patchNode(id, patch);
      this.renderer?.render();
      this.autosave.schedule();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "无法重命名 notebook");
    }
  }

  private openContextMenu(id: string, x: number, y: number): void {
    const node = this.store.getDocument().nodes.find((item) => item.id === id);
    if (!node) return;

    const menu = new Menu();
    if (node.kind === "notebook") {
      menu.addItem((item) => {
        item.setTitle("转为普通节点").setIcon("unlink").onClick(() => this.convertNotebookToText(id));
      });
    }

    menu.addItem((item) => {
      item.setTitle("删除节点").setIcon("trash").onClick(() => {
        this.store.deleteNode(id);
        this.renderer?.render();
        this.autosave.schedule();
      });
    });
    menu.showAtPosition({ x, y });
  }

  private convertNotebookToText(id: string): void {
    const node = this.store.getDocument().nodes.find((item) => item.id === id);
    if (!node || node.kind !== "notebook") return;

    const confirmed = window.confirm("此操作会将该节点转为普通节点，并断开与 notebook 的连接。原 notebook 文件不会删除。是否继续？");
    if (!confirmed) return;

    this.store.patchNode(id, this.notebookService.disconnectNotebook(node));
    this.renderer?.render();
    this.autosave.schedule();
  }

  private applyRadialLayout(): void {
    const engine = new RadialLayoutEngine();
    const selected = this.selection.getIds();
    const rootId = selected[0] ?? this.store.getDocument().nodes[0]?.id;
    const next = engine.layout(this.store.getDocument(), rootId);
    this.store.replaceDocument(next);
    this.renderer?.render();
    this.autosave.schedule();
  }

  private async syncNotebookPaths(): Promise<void> {
    let changed = false;
    for (const node of this.store.getDocument().nodes) {
      const patch = await this.notebookService.syncNotebookPathIfMoved(node, this.sourceFile?.path ?? "");
      if (patch) {
        this.store.patchNode(node.id, patch);
        changed = true;
      }
    }
    if (changed) this.autosave.schedule();
  }
}
