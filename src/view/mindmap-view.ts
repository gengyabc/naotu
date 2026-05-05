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
import { HistoryManager } from "../core/history";
import { searchNodes } from "../core/search";
import { createTextNodeNearParent, findParentId, findRootId } from "../core/tree-editing";
import { nodeWorldRect, rectIntersects } from "../core/geometry";

export class MindmapView extends ItemView {
  private store: MindmapDocumentStore;
  private autosave: DebouncedAutosave;
  private selection = new SelectionState();
  private notebookService: NotebookService;
  private renderer: SvgMindmapRenderer | null = null;
  private sourceFile: TFile | null = null;
  private history = new HistoryManager();
  private searchQuery = "";
  private searchResultIds = new Set<string>();
  private connectionMode = false;
  private connectionSourceId: string | undefined;

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
    this.history.clear();
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

    const searchInput = toolbar.createEl("input", {
      type: "text",
      placeholder: "搜索节点...",
    });
    searchInput.value = this.searchQuery;
    searchInput.oninput = () => {
      this.updateSearch(searchInput.value);
    };
    searchInput.onkeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.focusFirstSearchResult();
      }
    };

    const connectButton = toolbar.createEl("button", { text: "连线" });
    connectButton.toggleClass("is-active", this.connectionMode);
    connectButton.onclick = () => {
      this.connectionMode = !this.connectionMode;
      this.connectionSourceId = undefined;
      connectButton.toggleClass("is-active", this.connectionMode);
      this.renderer?.setConnectionState({ enabled: this.connectionMode, sourceId: this.connectionSourceId });
      this.renderer?.render();
    };

    const canvas = this.contentEl.createDiv({ cls: "semantic-mindmap-canvas" });
    canvas.tabIndex = 0;
    canvas.addEventListener("keydown", (event) => this.handleCanvasKeydown(event));

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
        if (this.handleNodeSelectedForConnection(id)) return;
        if (mode === "replace") this.selection.setOnly(id);
        if (mode === "toggle") this.selection.toggle(id);
        if (mode === "add") this.selection.add(id);
      },
      onToggleTree: (id) => {
        this.commitHistory();
        this.store.toggleTreeControl(id);
        this.renderer?.render();
        this.autosave.schedule();
      },
      onNotebookExpand: (id) => {
        void this.handleNotebookExpand(id);
      },
      onInlineTitleCommit: async (id, title) => {
        this.commitHistory();
        await this.handleInlineTitleCommit(id, title);
      },
      onContextMenu: (id, x, y) => {
        this.openContextMenu(id, x, y);
      },
      onEdgeContextMenu: (id, x, y) => {
        this.openEdgeContextMenu(id, x, y);
      },
      onBeforeNodeDragStart: () => {
        this.commitHistory();
      },
      onNodesMove: (moves) => {
        this.store.updateNodePositions(moves);
        this.renderer?.render();
        this.autosave.schedule();
      },
      onNodeDragEnd: () => {
        this.autosave.schedule();
      },
      onBoxSelect: (rect) => {
        const ids = this.store
          .getDocument()
          .nodes
          .filter((node) => rectIntersects(rect, nodeWorldRect(node)))
          .map((node) => node.id);

        this.selection.clear();
        for (const id of ids) this.selection.add(id);
        this.renderer?.render();
      },
    });

    this.renderer.mount();
    this.renderer.setSearchResultIds(this.searchResultIds);
    this.renderer.setConnectionState({ enabled: this.connectionMode, sourceId: this.connectionSourceId });
    this.renderer.render();
  }

  private commitHistory(): void {
    this.history.push(this.store.getDocument());
  }

  private undo(): void {
    const previous = this.history.undo(this.store.getDocument());
    if (!previous) return;
    this.store.replaceDocument(previous);
    this.renderer?.render();
    this.autosave.schedule();
  }

  private redo(): void {
    const next = this.history.redo(this.store.getDocument());
    if (!next) return;
    this.store.replaceDocument(next);
    this.renderer?.render();
    this.autosave.schedule();
  }

  private addTextNode(): void {
    this.commitHistory();
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

  private updateSearch(query: string): void {
    this.searchQuery = query;
    const results = searchNodes(this.store.getDocument().nodes, query);
    this.searchResultIds = new Set(results.map((node) => node.id));
    this.renderer?.setSearchResultIds(this.searchResultIds);
    this.renderer?.render();
  }

  private focusFirstSearchResult(): void {
    const firstId = [...this.searchResultIds][0];
    if (!firstId) return;
    this.selection.setOnly(firstId);
    this.renderer?.setLastFocusNodeId(firstId);
    this.renderer?.focusNode(firstId);
    this.renderer?.render();
  }

  private addChildNode(): void {
    const selectedId = this.selection.getIds()[0];
    if (!selectedId) return;

    const doc = this.store.getDocument();
    const parent = doc.nodes.find((node) => node.id === selectedId);
    if (!parent) return;

    this.commitHistory();
    const child = createTextNodeNearParent(parent);
    this.store.addNode(child);
    this.store.addEdge({ source: parent.id, target: child.id, relation: "mindmap", type: "curve" });

    this.selection.setOnly(child.id);
    this.renderer?.setLastFocusNodeId(child.id);
    this.renderer?.render();
    this.renderer?.focusNode(child.id);
    this.autosave.schedule();
  }

  private addSiblingNode(): void {
    const selectedId = this.selection.getIds()[0];
    if (!selectedId) return;

    const doc = this.store.getDocument();
    const selected = doc.nodes.find((node) => node.id === selectedId);
    if (!selected) return;

    const parentId = findParentId(doc, selectedId) ?? findRootId(doc);
    if (!parentId) return;

    const parent = doc.nodes.find((node) => node.id === parentId);
    if (!parent) return;

    this.commitHistory();
    const sibling = {
      ...createTextNodeNearParent(parent),
      x: selected.x + 40,
      y: selected.y + 100,
    };

    this.store.addNode(sibling);
    this.store.addEdge({ source: parent.id, target: sibling.id, relation: "mindmap", type: "curve" });

    this.selection.setOnly(sibling.id);
    this.renderer?.setLastFocusNodeId(sibling.id);
    this.renderer?.render();
    this.renderer?.focusNode(sibling.id);
    this.autosave.schedule();
  }

  private async handleNotebookExpand(id: string): Promise<void> {
    const node = this.store.getDocument().nodes.find((item) => item.id === id);
    if (!node) return;

    if (node.kind === "text") {
      try {
        this.commitHistory();
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
        this.commitHistory();
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

    this.commitHistory();
    this.store.patchNode(id, this.notebookService.disconnectNotebook(node));
    this.renderer?.render();
    this.autosave.schedule();
  }

  private applyRadialLayout(): void {
    const engine = new RadialLayoutEngine();
    const selected = this.selection.getIds();
    const rootId = selected[0] ?? this.store.getDocument().nodes[0]?.id;
    this.commitHistory();
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

  private deleteSelectedNodes(): void {
    const ids = this.selection.getIds();
    if (ids.length === 0) return;

    this.commitHistory();
    for (const id of ids) this.store.deleteNode(id);

    this.selection.clear();
    this.renderer?.render();
    this.autosave.schedule();
  }

  private handleCanvasKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea")) return;

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      this.addChildNode();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      this.addSiblingNode();
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      this.deleteSelectedNodes();
      return;
    }

    if (event.key === "Escape") {
      this.selection.clear();
      this.renderer?.render();
    }
  }

  private handleNodeSelectedForConnection(id: string): boolean {
    if (!this.connectionMode) return false;

    if (!this.connectionSourceId) {
      this.connectionSourceId = id;
      this.renderer?.setConnectionState({ enabled: true, sourceId: id });
      this.renderer?.render();
      return true;
    }

    if (this.connectionSourceId === id) {
      this.connectionSourceId = undefined;
      this.renderer?.setConnectionState({ enabled: true, sourceId: undefined });
      this.renderer?.render();
      return true;
    }

    this.commitHistory();
    this.store.addEdge({ source: this.connectionSourceId, target: id, relation: "reference", type: "curve" });

    this.connectionSourceId = undefined;
    this.renderer?.setConnectionState({ enabled: true, sourceId: undefined });
    this.renderer?.render();
    this.autosave.schedule();
    return true;
  }

  private openEdgeContextMenu(edgeId: string, x: number, y: number): void {
    const menu = new Menu();
    menu.addItem((item) => {
      item.setTitle("删除连线").setIcon("trash").onClick(() => {
        this.commitHistory();
        this.store.deleteEdge(edgeId);
        this.renderer?.render();
        this.autosave.schedule();
      });
    });
    menu.showAtPosition({ x, y });
  }
}
