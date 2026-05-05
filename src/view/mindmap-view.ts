import { ItemView, Menu, Notice, TFile, WorkspaceLeaf } from "obsidian";
import type SemanticZoomMindmapPlugin from "../main";
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
import { HybridMindmapRenderer } from "../renderer/hybrid-mindmap-renderer";
import type { RendererAdapter } from "../renderer/renderer-adapter";
import { RadialLayoutEngine } from "../core/radial-layout";
import { createId } from "../core/id";
import type { MindmapNode } from "../types/mindmap";
import { HistoryManager } from "../core/history";
import { searchNodes } from "../core/search";
import { createTextNodeNearParent, findParentId, findRootId } from "../core/tree-editing";
import { nodeWorldRect, rectIntersects } from "../core/geometry";
import { MarkdownFileSuggestModal } from "../ui/file-suggest-modal";
import { PerformanceDebugOverlay } from "../ui/performance-debug-overlay";
import { chooseRenderMode } from "../core/render-mode";
import { findNearestNodeInDirection, findRootNodeId } from "../core/keyboard-navigation";
import { renderMindmapToSvgString, renderSvgStringToPngArrayBuffer } from "../renderer/export-renderer";
import { MinimapRenderer } from "../renderer/minimap-renderer";
import { findMissingNotebookLinks } from "../core/missing-link-detector";
import { DirtyStateManager } from "../core/dirty-state";
import { showErrorNotice } from "../ui/error-notice";
import { setButtonA11y, setCanvasA11y } from "../core/accessibility";
import type { DirtyState } from "../core/dirty-state";

export class MindmapView extends ItemView {
  private store: MindmapDocumentStore;
  private autosave: DebouncedAutosave;
  private selection = new SelectionState();
  private notebookService: NotebookService;
  private renderer: RendererAdapter | null = null;
  private sourceFile: TFile | null = null;
  private history = new HistoryManager();
  private searchQuery = "";
  private searchResultIds = new Set<string>();
  private connectionMode = false;
  private connectionSourceId: string | undefined;
  private debugOverlay: PerformanceDebugOverlay | null = null;
  private searchInputEl: HTMLInputElement | null = null;
  private minimap: MinimapRenderer | null = null;
  private missingNotebookNodeIds = new Set<string>();
  private dirtyState = new DirtyStateManager();
  private saveStatusEl: HTMLElement | null = null;
  private unsubscribeDirtyState: (() => void) | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: SemanticZoomMindmapPlugin,
  ) {
    super(leaf);
    this.store = new MindmapDocumentStore(this.app);
    this.autosave = new DebouncedAutosave(async () => {
      try {
        this.dirtyState.setState("saving");
        await this.store.save();
        this.dirtyState.setState("saved");
      } catch (error) {
        this.dirtyState.setState("error");
        showErrorNotice(error, "保存失败");
      }
    }, () => ({
      enabled: this.plugin.settings.autoSave,
      delayMs: this.plugin.settings.autoSaveDelayMs,
    }));
    this.notebookService = new NotebookService(
      this.app,
      () => this.plugin.settings.notebookFolder,
      () => this.plugin.settings.notebookTemplate,
    );
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
    this.refreshMissingNotebookLinks();
    const loadError = this.store.getLoadError();
    this.dirtyState.setState(loadError ? "error" : "saved");
    if (loadError) showErrorNotice(loadError, "无法打开脑图文件");
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
    this.debugOverlay?.remove();
    this.debugOverlay = null;
    this.minimap?.remove();
    this.minimap = null;
    this.unsubscribeDirtyState?.();
    this.unsubscribeDirtyState = null;
  }

  async refreshNotebookLinks(): Promise<void> {
    await this.syncNotebookPaths();
    this.refreshMissingNotebookLinks();
    this.renderer?.render();
  }

  private renderView(): void {
    this.contentEl.empty();

    const toolbar = this.contentEl.createDiv({ cls: "semantic-mindmap-toolbar" });
    const addButton = toolbar.createEl("button", { text: "新增节点" });
    setButtonA11y(addButton, "新增节点");
    addButton.onclick = () => this.addTextNode();

    const layoutButton = toolbar.createEl("button", { text: "中心布局" });
    setButtonA11y(layoutButton, "中心布局");
    layoutButton.onclick = () => this.applyRadialLayout();

    const saveButton = toolbar.createEl("button", { text: "保存" });
    setButtonA11y(saveButton, "保存脑图");
    saveButton.onclick = () => {
      this.markDirty();
      void this.autosave.flush();
    };

    const exportSvgButton = toolbar.createEl("button", { text: "导出 SVG" });
    exportSvgButton.onclick = () => void this.exportSvg();

    const exportPngButton = toolbar.createEl("button", { text: "导出 PNG" });
    exportPngButton.onclick = () => void this.exportPng();

    const searchInput = toolbar.createEl("input", {
      type: "text",
      placeholder: "搜索节点...",
    });
    searchInput.value = this.searchQuery;
    this.searchInputEl = searchInput;
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
    setButtonA11y(connectButton, "连线模式", this.connectionMode);
    connectButton.toggleClass("is-active", this.connectionMode);
    connectButton.onclick = () => {
      this.connectionMode = !this.connectionMode;
      this.connectionSourceId = undefined;
      connectButton.toggleClass("is-active", this.connectionMode);
      setButtonA11y(connectButton, "连线模式", this.connectionMode);
      this.renderer?.setConnectionState({ enabled: this.connectionMode, sourceId: this.connectionSourceId });
      this.renderer?.render();
    };

    this.saveStatusEl = toolbar.createSpan({ cls: "mindmap-save-status", text: this.getDirtyStateLabel(this.dirtyState.getState()) });
    this.unsubscribeDirtyState?.();
    this.unsubscribeDirtyState = this.dirtyState.subscribe((state) => {
      if (!this.saveStatusEl) return;
      this.saveStatusEl.setText(this.getDirtyStateLabel(state));
    });

    const canvas = this.contentEl.createDiv({ cls: "semantic-mindmap-canvas" });
    canvas.tabIndex = 0;
    setCanvasA11y(canvas);
    canvas.addEventListener("keydown", (event) => this.handleCanvasKeydown(event));

    if (this.plugin.settings.showDebugOverlay) {
      this.debugOverlay = new PerformanceDebugOverlay(canvas);
    }

    const doc = this.store.getDocument();
    const renderMode = chooseRenderMode({
      nodeCount: doc.nodes.length,
      edgeCount: doc.edges.length,
      settings: this.plugin.settings,
    });
    const RendererClass = renderMode === "hybrid" ? HybridMindmapRenderer : SvgMindmapRenderer;

    this.renderer = new RendererClass({
      app: this.app,
      container: canvas,
      sourcePath: this.sourceFile?.path ?? "",
      getDocument: () => this.store.getDocument(),
      getSelectedNodeIds: () => this.selection.getIds(),
      onViewportChange: (x, y, zoom) => {
        this.store.setViewport(x, y, zoom);
        this.markDirty();
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
        this.markDirty();
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
        this.markDirty();
        this.autosave.schedule();
      },
      onNodeDragEnd: () => {
        this.markDirty();
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
      getSettings: () => this.plugin.settings,
      onRenderStats: (stats) => {
        this.debugOverlay?.update({
          sample: {
            timestamp: Date.now(),
            mode: stats.mode,
            durationMs: stats.durationMs,
            nodeCount: stats.totalNodes,
            edgeCount: stats.totalEdges,
            renderedNodeCount: stats.renderedNodes,
            renderedEdgeCount: stats.renderedEdges,
          },
          averageDuration: stats.averageDurationMs,
          isSlow: stats.isSlow,
        });
        this.updateMinimap();
      },
    });

    this.renderer.mount();
    this.renderer.setMissingNotebookNodeIds?.(
      this.plugin.settings.showMissingNotebookWarnings ? this.missingNotebookNodeIds : new Set<string>(),
    );
    this.renderer.setSearchResultIds(this.searchResultIds);
    this.renderer.setConnectionState({ enabled: this.connectionMode, sourceId: this.connectionSourceId });
    this.renderer.render();

    if (this.plugin.settings.showMinimap) {
      this.minimap = new MinimapRenderer(canvas, (x, y) => {
        this.renderer?.jumpToWorldPoint?.(x, y);
      });
      this.updateMinimap();
    }
  }

  private commitHistory(): void {
    this.history.push(this.store.getDocument());
  }

  private undo(): void {
    const previous = this.history.undo(this.store.getDocument());
    if (!previous) return;
    this.store.replaceDocument(previous);
    this.renderer?.render();
    this.markDirty();
    this.autosave.schedule();
  }

  private redo(): void {
    const next = this.history.redo(this.store.getDocument());
    if (!next) return;
    this.store.replaceDocument(next);
    this.renderer?.render();
    this.markDirty();
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
    this.markDirty();
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
    this.markDirty();
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
    this.markDirty();
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
        this.refreshMissingNotebookLinks();
        this.selection.setOnly(id);
        this.renderer?.setLastFocusNodeId(id);
        this.renderer?.forceDetailLevel(id, 5);
        this.renderer?.render();
        this.markDirty();
        this.autosave.schedule();
      } catch (error) {
        showErrorNotice(error, "无法创建 notebook");
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
      this.markDirty();
      this.autosave.schedule();
      return;
    }

    try {
      const patch = await this.notebookService.renameNotebookFileForNode(node, title, this.sourceFile?.path ?? "");
      this.store.patchNode(id, patch);
      this.renderer?.render();
      this.markDirty();
      this.autosave.schedule();
    } catch (error) {
      showErrorNotice(error, "无法重命名 notebook");
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

    if (node.kind === "text") {
      menu.addItem((item) => {
        item
          .setTitle("选择已有 notebook...")
          .setIcon("file-text")
          .onClick(() => {
            new MarkdownFileSuggestModal(this.app, (file) => {
              this.commitHistory();
              this.store.patchNode(node.id, this.notebookService.bindExistingFileAsNotebook(file));
              this.selection.setOnly(node.id);
              this.renderer?.setLastFocusNodeId(node.id);
              this.renderer?.forceDetailLevel(node.id, 5);
              this.renderer?.render();
              this.refreshMissingNotebookLinks();
              this.markDirty();
              this.autosave.schedule();
            }).open();
          });
      });
    }

    if (node.kind === "notebook") {
      menu.addItem((item) => {
        item
          .setTitle("重新选择 notebook...")
          .setIcon("file-search")
          .onClick(() => {
            new MarkdownFileSuggestModal(this.app, (file) => {
              this.commitHistory();
              const patch = this.notebookService.bindExistingFileAsNotebook(file);
              this.store.patchNode(node.id, patch);
              this.refreshMissingNotebookLinks();
              this.renderer?.render();
              this.markDirty();
              this.autosave.schedule();
            }).open();
          });
      });
    }

    menu.addSeparator();
    menu.addItem((item) => {
      item.setTitle("展开此子树").setIcon("chevrons-down").onClick(() => {
        this.commitHistory();
        this.store.setTreeControlForSubtree(id, "manual-expanded");
        this.renderer?.render();
        this.markDirty();
        this.autosave.schedule();
      });
    });
    menu.addItem((item) => {
      item.setTitle("收起此子树").setIcon("chevrons-up").onClick(() => {
        this.commitHistory();
        this.store.setTreeControlForSubtree(id, "manual-collapsed");
        this.renderer?.render();
        this.markDirty();
        this.autosave.schedule();
      });
    });
    menu.addSeparator();
    menu.addItem((item) => {
      item.setTitle("展开全部").setIcon("list-tree").onClick(() => {
        this.commitHistory();
        this.store.setTreeControlForAll("manual-expanded");
        this.renderer?.render();
        this.markDirty();
        this.autosave.schedule();
      });
    });
    menu.addItem((item) => {
      item.setTitle("恢复自动展开").setIcon("refresh-cw").onClick(() => {
        this.commitHistory();
        this.store.setTreeControlForAll("auto");
        this.renderer?.render();
        this.markDirty();
        this.autosave.schedule();
      });
    });

    menu.addItem((item) => {
      item.setTitle("删除节点").setIcon("trash").onClick(() => {
        this.commitHistory();
        this.store.deleteNode(id);
        this.renderer?.render();
        this.markDirty();
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
    this.refreshMissingNotebookLinks();
    this.renderer?.render();
    this.markDirty();
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
    this.markDirty();
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
    if (changed) {
      this.refreshMissingNotebookLinks();
      this.markDirty();
      this.autosave.schedule();
    }
  }

  private deleteSelectedNodes(): void {
    const ids = this.selection.getIds();
    if (ids.length === 0) return;

    this.commitHistory();
    for (const id of ids) this.store.deleteNode(id);

    this.selection.clear();
    this.renderer?.render();
    this.markDirty();
    this.autosave.schedule();
  }

  private moveSelectionByDirection(direction: "up" | "down" | "left" | "right"): void {
    const current = this.selection.getIds()[0];
    if (!current) return;

    const nodes = this.renderer?.getLastProjectedNodes?.() ?? [];
    const nextId = findNearestNodeInDirection({ fromNodeId: current, nodes, direction });
    if (!nextId) return;

    this.selection.setOnly(nextId);
    this.renderer?.setLastFocusNodeId(nextId);
    this.renderer?.focusNode(nextId);
    this.renderer?.render();
  }

  private selectRootNode(): void {
    const rootId = findRootNodeId(this.store.getDocument());
    if (!rootId) return;
    this.selection.setOnly(rootId);
    this.renderer?.setLastFocusNodeId(rootId);
    this.renderer?.focusNode(rootId);
    this.renderer?.render();
  }

  private toggleSelectedTree(): void {
    const id = this.selection.getIds()[0];
    if (!id) return;
    this.commitHistory();
    this.store.toggleTreeControl(id);
    this.renderer?.render();
    this.markDirty();
    this.autosave.schedule();
  }

  private startEditingSelectedNode(): void {
    const id = this.selection.getIds()[0];
    if (!id) return;
    this.renderer?.startInlineEditByNodeId?.(id);
  }

  private focusSearchInput(): void {
    this.searchInputEl?.focus();
    this.searchInputEl?.select();
  }

  private refreshMissingNotebookLinks(): void {
    const missing = findMissingNotebookLinks({
      app: this.app,
      doc: this.store.getDocument(),
      sourcePath: this.sourceFile?.path ?? "",
    });
    this.missingNotebookNodeIds = new Set(missing.map((item) => item.nodeId));
    this.renderer?.setMissingNotebookNodeIds?.(
      this.plugin.settings.showMissingNotebookWarnings ? this.missingNotebookNodeIds : new Set<string>(),
    );
  }

  private updateMinimap(): void {
    const viewport = this.renderer?.getViewportWorldRect?.();
    if (!viewport) return;
    this.minimap?.render({ doc: this.store.getDocument(), viewportWorldRect: viewport });
  }

  private markDirty(): void {
    this.dirtyState.setState("dirty");
  }

  private getDirtyStateLabel(state: DirtyState): string {
    return state === "saved"
      ? "Saved"
      : state === "dirty"
        ? "Unsaved"
        : state === "saving"
          ? "Saving..."
          : "Save error";
  }

  private async exportSvg(): Promise<void> {
    if (!this.sourceFile) return;
    const svg = renderMindmapToSvgString(this.store.getDocument());
    const path = this.sourceFile.parent?.path
      ? `${this.sourceFile.parent.path}/${this.sourceFile.basename}.export.svg`
      : `${this.sourceFile.basename}.export.svg`;
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) await this.app.vault.modify(existing, svg);
    else await this.app.vault.create(path, svg);
    new Notice(`已导出 SVG: ${path}`);
  }

  private async exportPng(): Promise<void> {
    if (!this.sourceFile) return;
    const svg = renderMindmapToSvgString(this.store.getDocument());
    const png = await renderSvgStringToPngArrayBuffer(svg);
    const path = this.sourceFile.parent?.path
      ? `${this.sourceFile.parent.path}/${this.sourceFile.basename}.export.png`
      : `${this.sourceFile.basename}.export.png`;
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) await this.app.vault.modifyBinary(existing, png);
    else await this.app.vault.createBinary(path, png);
    new Notice(`已导出 PNG: ${path}`);
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

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      this.focusSearchInput();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === "0") {
      event.preventDefault();
      this.renderer?.fitRoot?.();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && (event.key === "+" || event.key === "=")) {
      event.preventDefault();
      this.renderer?.zoomBy?.(1.2);
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === "-") {
      event.preventDefault();
      this.renderer?.zoomBy?.(1 / 1.2);
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

    if (event.key === " ") {
      event.preventDefault();
      this.toggleSelectedTree();
      return;
    }

    if (event.key === "F2") {
      event.preventDefault();
      this.startEditingSelectedNode();
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      this.selectRootNode();
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      this.moveSelectionByDirection("left");
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      this.moveSelectionByDirection("right");
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.moveSelectionByDirection("up");
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.moveSelectionByDirection("down");
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
    this.markDirty();
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
        this.markDirty();
        this.autosave.schedule();
      });
    });
    menu.showAtPosition({ x, y });
  }
}
