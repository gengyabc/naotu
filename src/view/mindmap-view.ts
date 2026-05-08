import { ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import type SemanticZoomMindmapPlugin from "../main";
import {
  VIEW_TYPE_MINDMAP,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  DEFAULT_TEXT_NODE_TITLE,
} from "../constants";
import { MindmapDocumentStore } from "../core/document-store";
import { SelectionState } from "../core/selection";
import { NotebookService } from "../core/notebook-service";
import { SvgMindmapRenderer } from "../renderer/svg-mindmap-renderer";
import { HybridMindmapRenderer } from "../renderer/hybrid-mindmap-renderer";
import type { RendererAdapter } from "../renderer/renderer-adapter";
import { TreeLayoutEngine } from "../core/tree-layout";
import { createId } from "../core/id";
import type { MindmapDocument, MindmapNode } from "../types/mindmap";
import { searchNodes } from "../core/search";
import {
  createTextNodeNearParent,
  findParentId,
  findRootId,
  getMindmapChildIds,
  isDescendantNode,
  addChildMindmapNode,
  addSiblingMindmapNode,
  expandDraggedNodeMoves,
  moveMindmapNode,
  resolveDraggedNodeIds,
} from "../core/tree-editing";
import { buildHierarchy } from "../core/hierarchy";
import { nodeWorldRect, rectIntersects } from "../core/geometry";
import { PerformanceDebugOverlay } from "../ui/performance-debug-overlay";
import { chooseRenderMode } from "../core/render-mode";
import { findNearestNodeInDirection, findRootNodeId } from "../core/keyboard-navigation";
import { renderMindmapToSvgString, renderSvgStringToPngArrayBuffer } from "../renderer/export-renderer";
import { MinimapRenderer } from "../renderer/minimap-renderer";
import { showErrorNotice } from "../ui/error-notice";
import { setCanvasA11y } from "../core/accessibility";
import type { DirtyState } from "../core/dirty-state";
import { planSubtreeSemanticZoom } from "../core/subtree-semantic-zoom";
import { createMindmapToolbar, type MindmapToolbar } from "../ui/mindmap-toolbar";
import { createEdgeContextMenu, createNodeContextMenu } from "../ui/context-menu";
import { MindmapEditSession } from "./mindmap-edit-session";
import { MindmapNotebookActions } from "./mindmap-notebook-actions";

export class MindmapView extends ItemView {
  private store: MindmapDocumentStore;
  private editSession: MindmapEditSession;
  private selection = new SelectionState();
  private notebookService: NotebookService;
  private notebookActions: MindmapNotebookActions;
  private renderer: RendererAdapter | null = null;
  private sourceFile: TFile | null = null;
  private searchQuery = "";
  private searchResultIds = new Set<string>();
  private connectionMode = false;
  private connectionSourceId: string | undefined;
  private debugOverlay: PerformanceDebugOverlay | null = null;
  private canvasEl: HTMLDivElement | null = null;
  private toolbar: MindmapToolbar | null = null;
  private minimap: MinimapRenderer | null = null;
  private unsubscribeDirtyState: (() => void) | null = null;
  private treeDragStartPosition: { x: number; y: number } | null = null;
  private notebookResizeSession: { id: string } | null = null;
  private subtreeVirtualZoomState: { nodeId: string; zoom: number } | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: SemanticZoomMindmapPlugin,
  ) {
    super(leaf);
    this.store = new MindmapDocumentStore(this.app);
    this.editSession = new MindmapEditSession(this.store, {
      relayoutDocument: (doc) => this.relayoutDocument(doc),
      render: () => this.renderer?.render(),
      getAutosaveConfig: () => ({
        enabled: this.plugin.settings.autoSave,
        delayMs: this.plugin.settings.autoSaveDelayMs,
      }),
      onSaveError: (error) => showErrorNotice(error, "保存失败"),
    });
    this.notebookService = new NotebookService(
      this.app,
      () => this.plugin.settings.notebookFolder,
      () => this.plugin.settings.notebookTemplate,
    );
    this.notebookActions = new MindmapNotebookActions({
      app: this.app,
      notebookService: this.notebookService,
      store: this.store,
      getSourcePath: () => this.sourceFile?.path ?? "",
      applyDocumentChange: (mutator, options) => this.applyDocumentChange(mutator, options),
      commitHistory: () => this.editSession.commitHistory(),
      markDirty: () => this.markDirty(),
      scheduleAutosave: () => this.editSession.scheduleAutosave(),
      render: () => this.renderer?.render(),
      setSelectionOnly: (id) => this.setSelectionOnly(id),
      setLastFocusNodeId: (id) => this.renderer?.setLastFocusNodeId(id),
      forceDetailLevel: (id, level) => this.renderer?.forceDetailLevel(id, level),
      focusNode: (id) => this.renderer?.focusNode(id),
      setMissingNotebookNodeIds: (ids) => this.renderer?.setMissingNotebookNodeIds?.(ids),
      showMissingNotebookWarnings: () => this.plugin.settings.showMissingNotebookWarnings,
    });
  }

  getViewType(): string {
    return VIEW_TYPE_MINDMAP;
  }

  getDisplayText(): string {
    return this.sourceFile?.basename ?? "Semantic Mindmap";
  }

  getState(): { file?: string } {
    return this.sourceFile ? { file: this.sourceFile.path } : {};
  }

  async setState(state: { file?: string }, _result: unknown): Promise<void> {
    if (state.file) {
      const file = this.app.vault.getAbstractFileByPath(state.file);
      if (file instanceof TFile) {
        await this.setFile(file);
      } else {
        new Notice(`Mindmap file not found: ${state.file}`);
      }
    }
  }

  async setFile(file: TFile): Promise<void> {
    this.sourceFile = file;
    await this.store.openFile(file);
    this.store.replaceDocument(this.relayoutDocument(this.store.getDocument()));
    this.clearSelection();
    this.editSession.clearHistory();
    await this.notebookActions.syncNotebookPaths();
    this.notebookActions.refreshMissingNotebookLinks();
    const loadError = this.store.getLoadError();
    this.editSession.setDirtyState(loadError ? "error" : "saved");
    if (loadError) showErrorNotice(loadError, "无法打开脑图文件");
    this.renderView();
  }

  async onLoadFile(file: TFile): Promise<void> {
    await this.setFile(file);
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("semantic-mindmap-view");
    this.renderView();
  }

  async onClose(): Promise<void> {
    await this.editSession.flushAutosave();
    this.renderer?.unmount();
    this.debugOverlay?.remove();
    this.debugOverlay = null;
    this.minimap?.remove();
    this.minimap = null;
    this.unsubscribeDirtyState?.();
    this.unsubscribeDirtyState = null;
  }

  async refreshNotebookLinks(): Promise<void> {
    await this.notebookActions.refreshNotebookLinks();
  }

  async handleVaultModify(file: TFile): Promise<void> {
    if (!this.sourceFile) return;

    if (file.path === this.sourceFile.path) {
      if (this.editSession.getDirtyState() === "saving") return;
      if (this.editSession.getDirtyState() === "dirty") {
        this.editSession.setDirtyState("error");
        new Notice("脑图文件已在外部更新，当前视图有未保存更改。请重新打开文件以解决冲突。", 6000);
        return;
      }

      await this.store.openFile(file);
      this.store.replaceDocument(this.relayoutDocument(this.store.getDocument()));
      this.clearSelection();
      await this.notebookActions.syncNotebookPaths();
      this.notebookActions.refreshMissingNotebookLinks();
      const loadError = this.store.getLoadError();
      this.editSession.setDirtyState(loadError ? "error" : "saved");
      if (loadError) showErrorNotice(loadError, "无法重新加载脑图文件");
      this.renderer?.render();
      return;
    }

    const usesModifiedFile = this.notebookActions.usesNotebookFile(file);

    if (!usesModifiedFile) return;
    this.notebookActions.refreshMissingNotebookLinks();
    this.renderer?.render();
  }

  private renderView(): void {
    this.contentEl.empty();
    this.toolbar = createMindmapToolbar(this.contentEl, {
      layoutMode: this.store.getDocument().layoutMode,
      searchQuery: this.searchQuery,
      connectionMode: this.connectionMode,
      saveStatus: this.getDirtyStateLabel(this.editSession.getDirtyState()),
      onAddNode: () => this.addTextNode(),
      onChangeLayoutMode: (mode) => this.applyTreeLayoutMode(mode),
      onOpenMindmap: () => this.plugin.openMindmapFileSelector(),
      onSaveMindmap: () => {
        this.markDirty();
        void this.editSession.flushAutosave();
      },
      onExportSvg: () => void this.exportSvg(),
      onExportPng: () => void this.exportPng(),
      onSearchChange: (query) => this.updateSearch(query),
      onSearchSubmit: () => this.focusFirstSearchResult(),
      onToggleConnectionMode: () => {
        this.connectionMode = !this.connectionMode;
        this.connectionSourceId = undefined;
        this.toolbar?.setConnectionMode(this.connectionMode);
        this.renderer?.setConnectionState({ enabled: this.connectionMode, sourceId: this.connectionSourceId });
        this.renderer?.render();
      },
    });

    this.unsubscribeDirtyState?.();
    this.unsubscribeDirtyState = this.editSession.subscribeDirtyState((state) => {
      this.toolbar?.setSaveStatus(this.getDirtyStateLabel(state));
    });

    const canvas = this.contentEl.createDiv({ cls: "semantic-mindmap-canvas" });
    this.canvasEl = canvas;
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
      component: this,
      container: canvas,
      sourcePath: this.sourceFile?.path ?? "",
      getDocument: () => this.store.getDocument(),
      getSelectedNodeIds: () => this.selection.getIds(),
      getDragNodeIds: (nodeId, selectedIds) => resolveDraggedNodeIds(this.store.getDocument(), nodeId, selectedIds),
      onViewportChange: (x, y, zoom) => {
        this.store.setViewportAndSyncTreeControls(x, y, zoom);
        this.subtreeVirtualZoomState = null;
        this.markDirty();
        this.editSession.scheduleAutosave();
      },
      onZoomInput: (factor) => this.handleZoomInput(factor),
      onSelectNode: (id, mode) => {
        if (this.handleNodeSelectedForConnection(id)) return;
        if (mode === "replace") this.setSelectionOnly(id);
        if (mode === "toggle") this.toggleSelection(id);
        if (mode === "add") this.addSelection(id);
        this.renderer?.setLastFocusNodeId(id);
        requestAnimationFrame(() => this.canvasEl?.focus());
      },
      onToggleTree: (id, expanded) => {
        this.applyDocumentChange(() => {
          this.store.setTreeControl(id, expanded ? "manual-collapsed" : "manual-expanded");
        }, { relayout: false });
        this.subtreeVirtualZoomState = null;
      },
      onOpenNotebook: (id) => {
        void this.notebookActions.openNotebook(id);
      },
      onInlineTitleCommit: async (id, title) => {
        await this.handleInlineTitleCommit(id, title);
      },
      onContextMenu: (id, x, y) => {
        this.openContextMenu(id, x, y);
      },
      onEdgeContextMenu: (id, x, y) => {
        this.openEdgeContextMenu(id, x, y);
      },
      onBeforeNodeDragStart: (node) => {
        this.editSession.commitHistory();
        if (!this.selection.has(node.id)) {
          this.setSelectionOnly(node.id);
        }
        if (this.isTreeLayoutMode()) {
          this.treeDragStartPosition = { x: node.worldX, y: node.worldY };
          this.renderer?.render();
        }
      },
      onNodesMove: ({ node, moves }) => {
        if (this.isTreeLayoutMode()) {
          this.applyDocumentChange(() => {
            this.store.updateNodePositions(moves);
          }, { commitHistory: false, relayout: false, autosave: false });
          return;
        }
        const doc = this.store.getDocument();
        const expandedMoves = expandDraggedNodeMoves(doc, {
          draggedNodeId: node.id,
          selectedIds: this.selection.getIds(),
          moves,
        });
        this.store.updateNodePositions(expandedMoves);
        this.renderer?.render();
        this.markDirty();
        this.editSession.scheduleAutosave();
      },
      onNodeDragEnd: ({ node }) => {
        if (this.isTreeLayoutMode()) {
          const start = this.treeDragStartPosition;
          const moved = start !== null && (Math.abs(node.worldX - start.x) > 0.5 || Math.abs(node.worldY - start.y) > 0.5);
          if (!moved) {
            this.treeDragStartPosition = null;
            return;
          }
          const action = this.resolveTreeDrop(node.id);
          const doc = this.store.getDocument();
          let next = doc;
          if (action?.type === "reparent" || action?.type === "reorder") {
            next = moveMindmapNode(doc, { nodeId: node.id, newParentId: action.newParentId, targetIndex: action.targetIndex });
          }
          this.applyReplacedDocument(this.relayoutDocument(next), { commitHistory: false });
          this.treeDragStartPosition = null;
          return;
        }
        this.markDirty();
        this.editSession.scheduleAutosave();
      },
      onNotebookResizeStart: (id) => {
        this.handleNotebookResizeStart(id);
      },
      onNotebookResize: (args) => {
        this.handleNotebookResize(args);
      },
      onNotebookResizeEnd: (args) => {
        this.handleNotebookResizeEnd(args);
      },
      onBoxSelect: (rect) => {
        const ids = this.store
          .getDocument()
          .nodes
          .filter((node) => rectIntersects(rect, nodeWorldRect(node)))
          .map((node) => node.id);

        this.replaceSelection(ids);
        this.renderer?.render();
      },
      onClearSelection: () => {
        this.clearSelection();
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
    this.notebookActions.applyMissingNotebookNodeIds();
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

  private undo(): void {
    this.editSession.undo();
  }

  private redo(): void {
    this.editSession.redo();
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
      treeControl: "manual-expanded",
    };

    this.applyDocumentChange(() => {
      this.store.addNode(node);
    });
    this.setSelectionOnly(node.id);
    this.renderer?.setLastFocusNodeId(node.id);
    this.renderer?.render();
    this.renderer?.focusNode(node.id);
    requestAnimationFrame(() => this.canvasEl?.focus());
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
    this.setSelectionOnly(firstId);
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

    const child = createTextNodeNearParent(parent);
    this.applyReplacedDocument(this.relayoutDocument(addChildMindmapNode(doc, parent.id, child)));

    this.setSelectionOnly(child.id);
    this.renderer?.setLastFocusNodeId(child.id);
    this.renderer?.render();
    this.renderer?.focusNode(child.id);
    requestAnimationFrame(() => this.canvasEl?.focus());
  }

  private addSiblingNode(): void {
    const selectedId = this.selection.getIds()[0];
    if (!selectedId) return;

    const doc = this.store.getDocument();
    const selected = doc.nodes.find((node) => node.id === selectedId);
    if (!selected) return;

    const parentId = findParentId(doc, selectedId) ?? findRootId(doc);
    const parent = parentId ? doc.nodes.find((node) => node.id === parentId) : undefined;
    if (!parent) return;

    const sibling = {
      ...createTextNodeNearParent(parent),
      x: selected.x + 40,
      y: selected.y + 100,
    };

    this.applyReplacedDocument(this.relayoutDocument(addSiblingMindmapNode(doc, selectedId, sibling)));

    this.setSelectionOnly(sibling.id);
    this.renderer?.setLastFocusNodeId(sibling.id);
    this.renderer?.render();
    this.renderer?.focusNode(sibling.id);
    requestAnimationFrame(() => this.canvasEl?.focus());
  }

  private async createNotebookForTextNode(id: string): Promise<void> {
    await this.notebookActions.createNotebookForTextNode(id);
  }

  private focusNotebookPreview(id: string): void {
    this.notebookActions.focusNotebookPreview(id);
  }

  private async handleOpenNotebook(id: string): Promise<void> {
    await this.notebookActions.openNotebook(id);
  }

  private handleNotebookResizeStart(id: string): void {
    if (this.notebookResizeSession?.id === id) return;
    this.editSession.commitHistory();
    this.notebookResizeSession = { id };
  }

  private handleNotebookResize(args: { id: string; width: number; height: number }): void {
    this.store.updateNodeSize(args.id, args.width, args.height);
    this.renderer?.render();
    this.markDirty();
  }

  private handleNotebookResizeEnd(args: { id: string; width: number; height: number }): void {
    this.store.updateNodeSize(args.id, args.width, args.height);
    this.renderer?.render();
    this.markDirty();
    this.editSession.scheduleAutosave();
    this.notebookResizeSession = null;
  }

  private async handleInlineTitleCommit(id: string, title: string): Promise<void> {
    const node = this.store.getDocument().nodes.find((item) => item.id === id);
    if (!node) return;

    if (node.kind === "text") {
      this.applyDocumentChange(() => {
        this.store.updateNodeTitle(id, title);
      });
      return;
    }

    await this.notebookActions.renameNotebookNode(id, title);
  }

  private openContextMenu(id: string, x: number, y: number): void {
    const node = this.store.getDocument().nodes.find((item) => item.id === id);
    if (!node) return;

    createNodeContextMenu({
      nodeKind: node.kind,
      onConvertNotebookToText: () => this.convertNotebookToText(id),
      onCreateNotebook: () => {
        void this.createNotebookForTextNode(id);
      },
      onBindExistingNotebook: () => this.notebookActions.bindExistingNotebook(node.id),
      onPreviewNotebook: () => this.focusNotebookPreview(id),
      onRebindNotebook: () => this.notebookActions.rebindNotebook(node.id),
      onExpandSubtree: () => {
        this.applyDocumentChange(() => {
          this.store.setTreeControlForSubtree(id, "manual-expanded");
        }, { relayout: false });
        this.subtreeVirtualZoomState = null;
      },
      onCollapseSubtree: () => {
        this.applyDocumentChange(() => {
          this.store.setTreeControlForSubtree(id, "manual-collapsed");
        }, { relayout: false });
        this.subtreeVirtualZoomState = null;
      },
      onExpandAll: () => {
        this.applyDocumentChange(() => {
          this.store.setTreeControlForAll("manual-expanded");
        }, { relayout: false });
        this.subtreeVirtualZoomState = null;
      },
      onRestoreAutoExpand: () => {
        this.applyDocumentChange(() => {
          this.store.setTreeControlForAll("auto");
        }, { relayout: false });
        this.subtreeVirtualZoomState = null;
      },
      onDeleteNode: () => {
        this.applyDocumentChange(() => {
          this.store.deleteNode(id);
        });
      },
    }).showAtPosition({ x, y });
  }

  private convertNotebookToText(id: string): void {
    this.notebookActions.convertNotebookToText(id);
  }

  private applyTreeLayoutMode(mode: "tree-mirror" | "tree-right" | "free"): void {
    this.toolbar?.setLayoutMode(mode);
    this.subtreeVirtualZoomState = null;

    const next = structuredClone(this.store.getDocument());
    next.layoutMode = mode;
    this.applyReplacedDocument(this.relayoutDocument(next));
  }

  private isTreeLayoutMode(mode = this.store.getDocument().layoutMode): boolean {
    return mode === "tree-mirror" || mode === "tree-right";
  }

  private relayoutDocument(doc: MindmapDocument): MindmapDocument {
    if (!this.isTreeLayoutMode(doc.layoutMode)) return doc;
    const engine = new TreeLayoutEngine();
    return engine.layout(doc, {
      mode: doc.layoutMode === "tree-right" ? "tree-right" : "tree-mirror",
      horizontalSpacing: this.plugin.settings.layoutHorizontalSpacing,
      verticalSpacing: this.plugin.settings.layoutVerticalSpacing,
    });
  }

  private applyDocumentChange(
    mutator: () => void,
    options?: { commitHistory?: boolean; relayout?: boolean; render?: boolean; autosave?: boolean },
  ): void {
    this.editSession.applyDocumentChange(mutator, options);
  }

  private applyReplacedDocument(
    doc: MindmapDocument,
    options?: { commitHistory?: boolean; render?: boolean; autosave?: boolean },
  ): void {
    this.editSession.applyReplacedDocument(doc, options);
  }

  private deleteSelectedNodes(): void {
    const ids = this.selection.getIds();
    if (ids.length === 0) return;

    this.applyDocumentChange(() => {
      for (const id of ids) this.store.deleteNode(id);
    });

    this.clearSelection();
  }

  private moveSelectionByDirection(direction: "up" | "down" | "left" | "right"): void {
    const current = this.selection.getIds()[0];
    if (!current) return;

    const nodes = this.renderer?.getLastProjectedNodes?.() ?? [];
    const nextId = findNearestNodeInDirection({ fromNodeId: current, nodes, direction });
    if (!nextId) return;

    this.setSelectionOnly(nextId);
    this.renderer?.setLastFocusNodeId(nextId);
    this.renderer?.focusNode(nextId);
    this.renderer?.render();
  }

  private selectRootNode(): void {
    const rootId = findRootNodeId(this.store.getDocument());
    if (!rootId) return;
    this.setSelectionOnly(rootId);
    this.renderer?.setLastFocusNodeId(rootId);
    this.renderer?.focusNode(rootId);
    this.renderer?.render();
  }

  private toggleSelectedTree(): void {
    const id = this.selection.getIds()[0];
    if (!id) return;
    const projectedNode = this.renderer?.getLastProjectedNodes?.().find((node) => node.id === id);
    if (projectedNode && !projectedNode.hasChildren) return;
    this.applyDocumentChange(() => {
      if (!projectedNode) {
        this.store.toggleTreeControl(id, this.store.getDocument().viewport.zoom);
        return;
      }
      this.store.setTreeControl(id, projectedNode.childrenExpanded ? "manual-collapsed" : "manual-expanded");
    }, { relayout: false });
    this.subtreeVirtualZoomState = null;
  }

  private startEditingSelectedNode(): void {
    const id = this.selection.getIds()[0];
    if (!id) return;
    this.renderer?.startInlineEditByNodeId?.(id);
  }

  private focusSearchInput(): void {
    this.toolbar?.focusSearchInput();
  }

  private updateMinimap(): void {
    const viewport = this.renderer?.getViewportWorldRect?.();
    if (!viewport) return;
    this.minimap?.render({ doc: this.store.getDocument(), viewportWorldRect: viewport });
  }

  private markDirty(): void {
    this.editSession.markDirty();
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
      this.subtreeVirtualZoomState = null;
      this.renderer?.fitRoot?.();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && (event.key === "+" || event.key === "=" || event.code === "NumpadAdd")) {
      event.preventDefault();
      this.handleZoomInput(1.2);
      return;
    }

    if ((event.metaKey || event.ctrlKey) && (event.key === "-" || event.code === "NumpadSubtract")) {
      event.preventDefault();
      this.handleZoomInput(1 / 1.2);
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
      this.clearSelection();
      this.renderer?.render();
    }
  }

  private setSelectionOnly(id: string): void {
    this.selection.setOnly(id);
    this.subtreeVirtualZoomState = null;
  }

  private toggleSelection(id: string): void {
    this.selection.toggle(id);
    this.subtreeVirtualZoomState = null;
  }

  private addSelection(id: string): void {
    this.selection.add(id);
    this.subtreeVirtualZoomState = null;
  }

  private clearSelection(): void {
    this.selection.clear();
    this.subtreeVirtualZoomState = null;
  }

  private replaceSelection(ids: Iterable<string>): void {
    this.selection.clear();
    for (const id of ids) this.selection.add(id);
    this.subtreeVirtualZoomState = null;
  }

  private handleZoomInput(factor: number): boolean {
    const selectedIds = this.selection.getIds();
    if (selectedIds.length !== 1) {
      this.subtreeVirtualZoomState = null;
      this.renderer?.zoomBy?.(factor);
      return true;
    }

    const selectedId = selectedIds[0];
    const currentVirtualZoom = this.subtreeVirtualZoomState?.nodeId === selectedId
      ? this.subtreeVirtualZoomState.zoom
      : this.store.getDocument().viewport.zoom;

    const plan = planSubtreeSemanticZoom({
      doc: this.store.getDocument(),
      rootId: selectedId,
      currentVirtualZoom,
      projectionZoom: this.store.getDocument().viewport.zoom,
      factor,
      maxDepthStep: 3,
    });
    if (!plan) {
      this.subtreeVirtualZoomState = null;
      this.renderer?.zoomBy?.(factor);
      return true;
    }

    this.subtreeVirtualZoomState = { nodeId: selectedId, zoom: plan.nextVirtualZoom };
    if (plan.controls.size === 0) {
      this.renderer?.zoomBy?.(factor);
      return true;
    }

    this.applyDocumentChange(() => {
      this.store.applyTreeControls(plan.controls);
    }, { relayout: false });
    return true;
  }

  handleLayoutSettingsChanged(): void {
    if (!this.isTreeLayoutMode()) return;
    this.subtreeVirtualZoomState = null;
    this.applyReplacedDocument(this.relayoutDocument(structuredClone(this.store.getDocument())), {
      commitHistory: false,
      autosave: false,
    });
  }

  private resolveTreeDrop(nodeId: string):
    | { type: "reparent"; newParentId: string; targetIndex: number }
    | { type: "reorder"; newParentId: string; targetIndex: number }
    | null {
    const doc = this.store.getDocument();
    const dragging = doc.nodes.find((node) => node.id === nodeId);
    if (!dragging) return null;
    const dropX = dragging.x;
    const dropY = dragging.y;

    for (const target of doc.nodes) {
      if (target.id === nodeId) continue;
      if (isDescendantNode(doc, nodeId, target.id)) continue;
      const rect = nodeWorldRect(target);
      if (dropX < rect.x || dropX > rect.x + rect.width || dropY < rect.y || dropY > rect.y + rect.height) continue;
      return { type: "reparent", newParentId: target.id, targetIndex: getMindmapChildIds(doc, target.id).length };
    }

    const hierarchy = buildHierarchy(doc);
    const parentId = hierarchy.parentById.get(nodeId);
    if (!parentId) return null;

    const siblings = (hierarchy.childrenById.get(parentId) ?? []).filter((id) => id !== nodeId);
    const siblingNodes = siblings
      .map((id) => doc.nodes.find((node) => node.id === id))
      .filter(Boolean)
      .sort((a, b) => (a?.y ?? 0) - (b?.y ?? 0));

    const parent = doc.nodes.find((node) => node.id === parentId);
    if (!parent) return null;
    const standardX = parent.x + (dragging.x >= parent.x ? 1 : -1) * this.plugin.settings.layoutHorizontalSpacing;
    if (Math.abs(dropX - standardX) > this.plugin.settings.layoutHorizontalSpacing * 0.75) return null;

    for (let i = 0; i < siblingNodes.length; i++) {
      const sibling = siblingNodes[i];
      if (!sibling) continue;
      const centerY = sibling.y;
      if (dropY < centerY) return { type: "reorder", newParentId: parentId, targetIndex: i };
    }

    return { type: "reorder", newParentId: parentId, targetIndex: siblingNodes.length };
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

    this.editSession.commitHistory();
    this.applyDocumentChange(() => {
      this.store.addEdge({ source: this.connectionSourceId!, target: id, relation: "reference", type: "curve" });
    }, { commitHistory: false });

    this.connectionSourceId = undefined;
    this.renderer?.setConnectionState({ enabled: true, sourceId: undefined });
    this.renderer?.render();
    return true;
  }

  private openEdgeContextMenu(edgeId: string, x: number, y: number): void {
    createEdgeContextMenu({
      onDeleteEdge: () => {
        this.applyDocumentChange(() => {
          this.store.deleteEdge(edgeId);
        });
      },
    }).showAtPosition({ x, y });
  }
}
