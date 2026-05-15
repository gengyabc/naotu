import { FileView, Notice, TFile, ViewStateResult, WorkspaceLeaf } from "obsidian";
import type SemanticZoomMindmapPlugin from "../main";
import { getActiveWindow } from "../core/dom";
import {
  VIEW_TYPE_MINDMAP,
} from "../constants";
import { MindmapDocumentStore } from "../core/document-store";
import { SelectionState } from "../core/selection";
import { NotebookService } from "../core/notebook-service";
import { isEmbeddedFileNodeTargetKind } from "../core/file-node-support";
import { getNextEmbeddedNotebookWheelSize } from "../core/file-dimensions";
import {
  getDefaultMarkdownNotebookSize,
  getNextMarkdownNotebookWheelSize,
  getStoredNodeSize,
} from "../core/notebook-size";
import type { MindmapDocument } from "../types/mindmap";
import {
  expandDraggedNodeMoves,
  resolveDraggedNodeIds,
  getMindmapChildIds,
} from "../core/tree-editing";
import { findRootNodeId } from "../core/keyboard-navigation";
import { nodeWorldRect, rectIntersects } from "../core/geometry";
import { showErrorNotice } from "../ui/error-notice";
import { setCanvasA11y } from "../core/accessibility";
import type { DirtyState } from "../core/dirty-state";
import { createMindmapToolbar, type MindmapToolbar } from "../ui/mindmap-toolbar";
import { closeActiveContextMenu, createEdgeContextMenu, createNodeContextMenu } from "../ui/context-menu";
import { MindmapEditSession } from "./mindmap-edit-session";
import { MindmapInteractions } from "./mindmap-interactions";
import { MindmapNotebookActions } from "./mindmap-notebook-actions";
import { MindmapRendererCoordinator } from "./mindmap-renderer-coordinator";
import { MindmapTreeActions, isTreeLayoutMode } from "./mindmap-tree-actions";
import { subscribeLocale, t } from "../i18n";

export class MindmapView extends FileView {
  private store: MindmapDocumentStore;
  private editSession: MindmapEditSession;
  private selection = new SelectionState();
  private interactions: MindmapInteractions;
  private notebookService: NotebookService;
  private notebookActions: MindmapNotebookActions;
  private treeActions: MindmapTreeActions;
  private rendererCoordinator: MindmapRendererCoordinator;
  private sourceFile: TFile | null = null;
  private canvasEl: HTMLDivElement | null = null;
  private toolbar: MindmapToolbar | null = null;
  private unsubscribeDirtyState: (() => void) | null = null;
  private unsubscribeHistory: (() => void) | null = null;
  private treeDragStartPosition: { x: number; y: number } | null = null;
  private notebookResizeSession: { id: string } | null = null;
  private unsubscribeLocale: (() => void) | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: SemanticZoomMindmapPlugin,
  ) {
    super(leaf);
    this.store = new MindmapDocumentStore(this.app);
    this.editSession = new MindmapEditSession(this.store, {
      relayoutDocument: (doc) => this.relayoutDocument(doc),
      render: () => this.rendererCoordinator.render(),
      getAutosaveConfig: () => ({
        enabled: this.plugin.settings.autoSave,
        delayMs: this.plugin.settings.autoSaveDelayMs,
      }),
      onSaveError: (error) => showErrorNotice(error, "notices.saveFailed"),
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
      render: () => this.rendererCoordinator.render(),
      setSelectionOnly: (id) => this.setSelectionOnly(id),
      setLastFocusNodeId: (id) => this.rendererCoordinator.setLastFocusNodeId(id),
      forceDetailLevel: (id, level) => this.rendererCoordinator.forceDetailLevel(id, level),
      focusNode: (id) => this.rendererCoordinator.focusNode(id),
      setMissingNotebookNodeIds: (ids) => this.rendererCoordinator.setMissingNotebookNodeIds(ids),
      showMissingNotebookWarnings: () => this.plugin.settings.showMissingNotebookWarnings,
    });
    this.treeActions = new MindmapTreeActions({
      getDocument: () => this.store.getDocument(),
      applyReplacedDocument: (doc, options) => this.applyReplacedDocument(doc, options),
      applyDocumentChange: (mutator, options) => this.applyDocumentChange(mutator, options),
      collapseTreeNode: (id) => this.collapseTreeNodeWithNotebookResize(id),
      setTreeControl: (id, control) => this.store.setTreeControl(id, control),
      getLayoutHorizontalSpacing: () => this.plugin.settings.layoutHorizontalSpacing,
      getLayoutVerticalSpacing: () => this.plugin.settings.layoutVerticalSpacing,
      clearSubtreeVirtualZoomState: () => { this.clearSubtreeVirtualZoomState(); },
    });
    this.interactions = new MindmapInteractions({
      selection: this.selection,
      getDocument: () => this.store.getDocument(),
      getProjectedNodes: () => this.rendererCoordinator.getLastProjectedNodes(),
      render: () => this.rendererCoordinator.render(),
      focusNode: (id) => this.rendererCoordinator.focusNode(id),
      setLastFocusNodeId: (id) => this.rendererCoordinator.setLastFocusNodeId(id),
      setSearchResultIds: (ids) => this.rendererCoordinator.setSearchResultIds(ids),
      focusCanvas: () => this.focusCanvasUnlessInlineEditorActive(),
      focusSearchInput: () => this.toolbar?.focusSearchInput(),
      startInlineEdit: (id) => this.rendererCoordinator.startInlineEditByNodeId(id),
      zoomBy: (factor) => this.rendererCoordinator.zoomBy(factor),
      fitRoot: () => this.rendererCoordinator.fitRoot(),
      addChildNode: () => this.addChildNode(),
      addSiblingNode: () => this.addSiblingNode(),
      toggleSelectedTree: () => this.toggleSelectedTree(),
      deleteSelectedNodes: (mode) => this.deleteSelectedNodes(mode),
      undo: () => this.undo(),
      redo: () => this.redo(),
      applyTreeControlsWithPreCollapseResize: (controls) => this.applyTreeControlsWithPreCollapseResize(controls),
      applyDocumentChange: (mutator, options) => this.applyDocumentChange(mutator, options),
      onSelectionChange: () => this.updateToolbarButtonStates(),
    });
    this.rendererCoordinator = new MindmapRendererCoordinator({
      app: this.app,
      component: this,
      getSettings: () => this.plugin.settings,
      getSourcePath: () => this.sourceFile?.path ?? "",
      getDocument: () => this.store.getDocument(),
      getSelectedNodeIds: () => this.selection.getIds(),
      getDragNodeIds: (nodeId, selectedIds) => resolveDraggedNodeIds(this.store.getDocument(), nodeId, selectedIds),
      onViewportChange: (x, y, zoom) => {
        this.store.setViewportAndSyncTreeControls(x, y, zoom);
        this.clearSubtreeVirtualZoomState();
        this.markDirty();
        this.editSession.scheduleAutosave();
      },
      onZoomInput: (factor) => this.handleZoomInput(factor),
      onSelectNode: (id, mode) => this.interactions.handleNodeSelection(id, mode),
      onToggleTree: (id, expanded) => {
        if (expanded) this.collapseTreeNodeWithNotebookResize(id);
        else this.applyDocumentChange(() => {
          this.store.setTreeControl(id, "manual-expanded");
        }, { relayout: false });
        this.clearSubtreeVirtualZoomState();
      },
      onOpenNotebook: (id) => {
        void this.notebookActions.openNotebook(id);
      },
      onInlineTextCommit: async (id, title) => {
        await this.handleInlineTextCommit(id, title);
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
        if (isTreeLayoutMode(this.store.getDocument().layoutMode)) {
          this.treeDragStartPosition = { x: node.worldX, y: node.worldY };
          this.rendererCoordinator.render();
        }
      },
      onNodesMove: ({ node, moves }) => {
        if (isTreeLayoutMode(this.store.getDocument().layoutMode)) {
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
        this.rendererCoordinator.render();
        this.markDirty();
        this.editSession.scheduleAutosave();
      },
      onNodeDragEnd: ({ node }) => {
        if (isTreeLayoutMode(this.store.getDocument().layoutMode)) {
          const start = this.treeDragStartPosition;
          if (start) {
            this.treeActions.applyTreeDrop(node.id, start.x, start.y, node.worldX, node.worldY);
            this.treeDragStartPosition = null;
          }
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
        this.rendererCoordinator.render();
      },
      onClearSelection: () => {
        this.clearSelection();
        this.rendererCoordinator.render();
      },
    });
  }

  getViewType(): string {
    return VIEW_TYPE_MINDMAP;
  }

  getDisplayText(): string {
    return this.getOpenFile()?.basename ?? t("app.displayText");
  }

  getOpenFile(): TFile | null {
    return this.file ?? this.sourceFile ?? null;
  }

  getState(): Record<string, unknown> {
    const base = super.getState?.() ?? {};
    const f = this.getOpenFile();
    return { ...base, file: f?.path };
  }

  async setState(state: { file?: string }, result: ViewStateResult): Promise<void> {
    await super.setState?.(state, result);
    const filePath = state?.file;
    if (!filePath || typeof filePath !== "string") return;
    const f = this.app.vault.getAbstractFileByPath(filePath);
    if (!(f instanceof TFile)) {
      new Notice(t("notices.fileNotFound", { path: filePath }));
      return;
    }
    this.sourceFile = f;
    await this.loadDocument(f);
  }

  async setFile(file: TFile, content?: string): Promise<void> {
    this.sourceFile = file;
    await this.loadDocument(file, content);
  }

  async onLoadFile(file: TFile): Promise<void> {
    this.sourceFile = file;
    await this.loadDocument(file);
  }

  getViewData(): string {
    try {
      return JSON.stringify(this.store.getDocument(), null, 2);
    } catch {
      return "";
    }
  }

  setViewData(data: string, _clear: boolean): void {
    void this.loadViewData(data);
  }

  clear(): void {
    // No-op: mindmap doesn't support a "clear" state
  }

  private async loadViewData(data: string): Promise<void> {
    const f = this.getOpenFile();
    if (!f) return;
    try {
      await this.loadDocument(f, data);
    } catch {
      // Silent fail - load errors are handled downstream
    }
  }

  private async loadDocument(file: TFile, content?: string): Promise<void> {
    await this.store.openFile(file, content);
    this.store.replaceDocument(this.relayoutDocument(this.store.getDocument()));
    this.clearSelection();
    this.editSession.clearHistory();
    await this.notebookActions.syncNotebookPaths();
    this.notebookActions.refreshMissingNotebookLinks();
    const loadError = this.store.getLoadError();
    this.editSession.setDirtyState(loadError ? "error" : "saved");
    if (loadError) showErrorNotice(loadError, "notices.openFailed");
    this.renderView();
  }

  async onOpen(): Promise<void> {
    this.toolbar?.destroy();
    this.contentEl.empty();
    this.contentEl.addClass("semantic-mindmap-view");
    this.renderView();

    this.unsubscribeLocale?.();
    this.unsubscribeLocale = subscribeLocale(() => {
      this.renderView();
    });
  }

  async onClose(): Promise<void> {
    closeActiveContextMenu();
    this.toolbar?.destroy();
    await this.editSession.flushAutosave();
    this.rendererCoordinator.dispose();
    this.unsubscribeDirtyState?.();
    this.unsubscribeDirtyState = null;
    this.unsubscribeHistory?.();
    this.unsubscribeHistory = null;
    this.unsubscribeLocale?.();
    this.unsubscribeLocale = null;
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
        new Notice(t("notices.externalConflict"), 6000);
        return;
      }

      await this.store.openFile(file);
      this.store.replaceDocument(this.relayoutDocument(this.store.getDocument()));
      this.clearSelection();
      await this.notebookActions.syncNotebookPaths();
      this.notebookActions.refreshMissingNotebookLinks();
      const loadError = this.store.getLoadError();
      this.editSession.setDirtyState(loadError ? "error" : "saved");
      if (loadError) showErrorNotice(loadError, "notices.reloadFailed");
      this.rendererCoordinator.render();
      return;
    }

    const usesModifiedFile = this.notebookActions.usesNotebookFile(file);

    if (!usesModifiedFile) return;
    this.notebookActions.refreshMissingNotebookLinks();
    this.rendererCoordinator.render();
  }

  private renderView(): void {
    this.toolbar?.destroy();
    this.contentEl.empty();
    this.toolbar = createMindmapToolbar(this.contentEl, {
      layoutMode: this.store.getDocument().layoutMode,
      searchQuery: this.interactions.getSearchQuery(),
      saveStatus: this.getDirtyStateLabel(this.editSession.getDirtyState()),
      onChangeLayoutMode: (mode) => this.applyTreeLayoutMode(mode),
      onOpenMindmap: () => this.plugin.openMindmapFileSelector(),
      onSearchChange: (query) => this.updateSearch(query),
      onSearchSubmit: () => this.focusFirstSearchResult(),
      onUndo: () => this.undo(),
      onRedo: () => this.redo(),
      onSelectRoot: () => this.selectRootNode(),
      onFitRoot: () => this.fitRoot(),
      onZoomIn: () => this.zoomIn(),
      onZoomOut: () => this.zoomOut(),
      onAddChild: () => this.addChildNode(),
      onAddSibling: () => this.addSiblingNode(),
      onToggleExpand: () => this.toggleSelectedTree(),
      onEdit: () => this.editSelectedNode(),
    });
    this.toolbar.setCanUndo(this.editSession.canUndo());
    this.toolbar.setCanRedo(this.editSession.canRedo());
    this.updateToolbarButtonStates();

    this.unsubscribeDirtyState?.();
    this.unsubscribeDirtyState = this.editSession.subscribeDirtyState((state) => {
      this.toolbar?.setSaveStatus(this.getDirtyStateLabel(state));
    });

    this.unsubscribeHistory?.();
    this.unsubscribeHistory = this.editSession.subscribeHistory(() => {
      this.toolbar?.setCanUndo(this.editSession.canUndo());
      this.toolbar?.setCanRedo(this.editSession.canRedo());
    });

    const canvas = this.contentEl.createDiv({ cls: "semantic-mindmap-canvas" });
    this.canvasEl = canvas;
    canvas.tabIndex = 0;
    setCanvasA11y(canvas);
    canvas.addEventListener("keydown", (event) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      this.handleCanvasKeydown(event);
    }, true);
    canvas.addEventListener("keydown", (event) => this.handleCanvasKeydown(event));

    this.rendererCoordinator.mount(canvas);
    this.notebookActions.applyMissingNotebookNodeIds();
    this.rendererCoordinator.setSearchResultIds(this.interactions.getSearchResultIds());
    this.rendererCoordinator.render();
  }

  private undo(): void {
    this.editSession.undo();
  }

  private redo(): void {
    this.editSession.redo();
  }

  private updateSearch(query: string): void {
    this.interactions.updateSearch(query);
  }

  private focusFirstSearchResult(): void {
    this.interactions.focusFirstSearchResult();
  }

  private addChildNode(): void {
    const selectedId = this.selection.getIds()[0];
    if (!selectedId) return;

    const child = this.treeActions.addChildNode(selectedId);
    if (!child) return;

    this.setSelectionOnly(child.id);
    this.rendererCoordinator.setLastFocusNodeId(child.id);
    this.rendererCoordinator.render();
    this.rendererCoordinator.focusNode(child.id);
    this.contentEl.ownerDocument.defaultView?.requestAnimationFrame(() => this.focusCanvasUnlessInlineEditorActive());
  }

  private addSiblingNode(): void {
    const selectedId = this.selection.getIds()[0];
    if (!selectedId) return;

    const sibling = this.treeActions.addSiblingNode(selectedId);
    if (!sibling) return;

    this.setSelectionOnly(sibling.id);
    this.rendererCoordinator.setLastFocusNodeId(sibling.id);
    this.rendererCoordinator.render();
    this.rendererCoordinator.focusNode(sibling.id);
    this.contentEl.ownerDocument.defaultView?.requestAnimationFrame(() => this.focusCanvasUnlessInlineEditorActive());
  }

  private async createNotebookForTextNode(id: string): Promise<void> {
    await this.notebookActions.createNotebookForTextNode(id);
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
    this.rendererCoordinator.render();
    this.markDirty();
  }

  private handleNotebookResizeEnd(args: { id: string; width: number; height: number }): void {
    this.store.updateNodeSize(args.id, args.width, args.height);
    this.rendererCoordinator.render();
    this.markDirty();
    this.editSession.scheduleAutosave();
    this.notebookResizeSession = null;
  }

  private async handleInlineTextCommit(id: string, title: string): Promise<void> {
    const node = this.store.getDocument().nodes.find((item) => item.id === id);
    if (!node) return;

    if (node.kind === "text") {
      this.applyDocumentChange(() => {
        this.store.updateNodeTitle(id, title);
      });
      return;
    }

    if (isEmbeddedFileNodeTargetKind(node.notebook?.targetKind)) return;

    await this.notebookActions.renameNotebookNode(id, title);
  }

  async handleVaultDelete(file: TFile): Promise<void> {
    this.notebookActions.handleDeletedBoundFile(file);
  }

  private openContextMenu(id: string, x: number, y: number): void {
    const node = this.store.getDocument().nodes.find((item) => item.id === id);
    if (!node) return;

    if (!this.selection.has(id)) {
      this.setSelectionOnly(id);
      this.rendererCoordinator.render();
    }

    createNodeContextMenu({
      nodeKind: node.kind,
      ownerDocument: this.contentEl.ownerDocument,
      onConvertNotebookToText: () => this.convertNotebookToText(id),
      onCreateNotebook: () => {
        void this.createNotebookForTextNode(id);
      },
      onBindExistingNotebook: () => this.notebookActions.bindExistingNotebook(node.id),
      onRebindNotebook: () => this.notebookActions.rebindNotebook(node.id),
      onDeleteNode: (mode) => this.deleteSelectedNodes(mode),
    }).showAtPosition({ x, y });
  }

  private convertNotebookToText(id: string): void {
    this.notebookActions.convertNotebookToText(id);
  }

  private applyTreeLayoutMode(mode: "tree-mirror" | "tree-right" | "free"): void {
    this.toolbar?.setLayoutMode(mode);
    this.treeActions.applyTreeLayoutMode(mode);
  }

  private relayoutDocument(doc: MindmapDocument): MindmapDocument {
    return this.treeActions.relayoutDocument(doc);
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

  private deleteSelectedNodes(mode: "promote" | "recursive" = "promote"): void {
    const ids = this.selection.getIds();
    if (ids.length === 0) return;

    this.applyDocumentChange(() => {
      for (const id of ids) this.store.deleteNode(id, mode);
    });

    this.clearSelection();
  }

  private selectRootNode(): void {
    const doc = this.store.getDocument();
    const rootId = findRootNodeId(doc);
    if (!rootId) return;
    
    this.setSelectionOnly(rootId);
    this.rendererCoordinator.setLastFocusNodeId(rootId);
    this.rendererCoordinator.focusNode(rootId);
    this.rendererCoordinator.render();
  }

  private fitRoot(): void {
    this.interactions.clearSubtreeVirtualZoomState();
    this.rendererCoordinator.fitRoot();
  }

  private zoomIn(): void {
    this.interactions.handleZoomInput(1.2);
  }

  private zoomOut(): void {
    this.interactions.handleZoomInput(1 / 1.2);
  }

  private focusCanvasUnlessInlineEditorActive(): void {
    const ownerDocument = this.contentEl.ownerDocument as {
      activeElement?: unknown;
    };
    const activeElement = ownerDocument.activeElement as
      | { classList?: { contains(name: string): boolean } }
      | null
      | undefined;
    if (activeElement?.classList?.contains("mindmap-inline-title-input")) {
      return;
    }
    this.canvasEl?.focus();
  }

  private editSelectedNode(): void {
    const id = this.selection.getIds()[0];
    if (!id) return;
    this.rendererCoordinator.startInlineEditByNodeId(id);
  }

  private updateToolbarButtonStates(): void {
    const selectedIds = this.selection.getIds();
    const hasSingleSelection = selectedIds.length === 1;
    const selectedId = selectedIds[0];
    
    const doc = this.store.getDocument();
    const selectedNode = selectedId ? doc.nodes.find(n => n.id === selectedId) : undefined;
    const hasChildren = selectedNode ? this.hasNodeChildren(selectedNode.id) : false;

    this.toolbar?.setCanSelectRoot(true);
    this.toolbar?.setCanFitRoot(true);
    this.toolbar?.setCanZoomIn(true);
    this.toolbar?.setCanZoomOut(true);
    this.toolbar?.setCanAddChild(hasSingleSelection);
    this.toolbar?.setCanAddSibling(hasSingleSelection);
    this.toolbar?.setCanToggleExpand(hasSingleSelection && hasChildren);
    this.toolbar?.setCanEdit(hasSingleSelection);
  }

  private hasNodeChildren(nodeId: string): boolean {
    const doc = this.store.getDocument();
    return getMindmapChildIds(doc, nodeId).length > 0;
  }

  private toggleSelectedTree(): void {
    const id = this.selection.getIds()[0];
    if (!id) return;
    if (!this.hasNodeChildren(id)) return;
    this.treeActions.toggleSelectedTree(id, this.rendererCoordinator.getLastProjectedNodes());
  }

  private applyTreeControlsWithPreCollapseResize(
    controls: ReadonlyMap<MindmapDocument["nodes"][number]["id"], MindmapDocument["nodes"][number]["treeControl"]>,
  ): void {
    const collapseIds = [...controls.entries()]
      .filter(([, control]) => control === "manual-collapsed")
      .map(([id]) => id);

    if (collapseIds.length === 0) {
      this.applyDocumentChange(() => {
        this.store.applyTreeControls(controls);
      }, { relayout: false });
      return;
    }

    this.applyDocumentChange(() => {
      for (const id of collapseIds) this.store.resetNotebookSubtreeSizes(id);
    }, { relayout: false, autosave: false });

    this.scheduleDeferredTreeMutation(() => {
      this.applyDocumentChange(() => {
        this.store.applyTreeControls(controls);
      }, { commitHistory: false, relayout: false });
    });
  }

  private collapseTreeNodeWithNotebookResize(id: string): void {
    this.applyDocumentChange(() => {
      this.store.resetNotebookSubtreeSizes(id);
    }, { relayout: false, autosave: false });

    this.scheduleDeferredTreeMutation(() => {
      this.applyDocumentChange(() => {
        this.store.setTreeControl(id, "manual-collapsed");
      }, { commitHistory: false, relayout: false });
      this.clearSubtreeVirtualZoomState();
    });
  }

  private scheduleDeferredTreeMutation(callback: () => void): void {
    const ownerWindow = this.contentEl.ownerDocument.defaultView ?? getActiveWindow();
    ownerWindow.setTimeout(callback, 0);
  }

  private markDirty(): void {
    this.editSession.markDirty();
  }

  private getDirtyStateLabel(state: DirtyState): string {
    return state === "saved"
      ? t("status.saved")
      : state === "dirty"
        ? t("status.unsaved")
        : state === "saving"
          ? t("status.saving")
          : t("status.saveError");
  }

  private handleCanvasKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;

    if ((event.metaKey || event.ctrlKey) && (event.key === "+" || event.key === "=" || event.code === "NumpadAdd")) {
      if (this.handleSelectedNotebookShortcutResize("grow")) {
        event.preventDefault();
        return;
      }
    }

    if ((event.metaKey || event.ctrlKey) && (event.key === "-" || event.code === "NumpadSubtract")) {
      if (this.handleSelectedNotebookShortcutResize("shrink")) {
        event.preventDefault();
        return;
      }
    }

    this.interactions.handleCanvasKeydown(event);
  }

  private handleSelectedNotebookShortcutResize(direction: "grow" | "shrink"): boolean {
    const selectedIds = this.selection.getIds();
    if (selectedIds.length !== 1) return false;

    const selectedId = selectedIds[0];
    const node = this.store.getDocument().nodes.find((item) => item.id === selectedId);
    if (!node || node.kind !== "notebook") return false;

    const projectedNode = this.rendererCoordinator.getLastProjectedNodes()?.find((item) => item.id === selectedId);
    const storedSize = typeof node.customWidth === "number" && typeof node.customHeight === "number"
      ? getStoredNodeSize(node)
      : isEmbeddedFileNodeTargetKind(node.notebook?.targetKind)
        ? { width: node.width, height: node.height }
        : getDefaultMarkdownNotebookSize();
    const currentWidth = projectedNode?.displayWidth ?? storedSize.width;
    const currentHeight = projectedNode?.displayHeight ?? storedSize.height;

    const nextSize = isEmbeddedFileNodeTargetKind(node.notebook?.targetKind)
      ? getNextEmbeddedNotebookWheelSize({
          width: currentWidth,
          height: currentHeight,
          direction,
          aspectRatio: node.aspectRatio,
        })
      : getNextMarkdownNotebookWheelSize({
          width: currentWidth,
          height: currentHeight,
          direction,
        });
    if (!nextSize) return true;

    this.handleNotebookResizeStart(selectedId);
    this.handleNotebookResizeEnd({ id: selectedId, width: nextSize.width, height: nextSize.height });
    return true;
  }

  private setSelectionOnly(id: string): void {
    this.interactions.setSelectionOnly(id);
  }

  private toggleSelection(id: string): void {
    this.interactions.toggleSelection(id);
  }

  private addSelection(id: string): void {
    this.interactions.addSelection(id);
  }

  private clearSelection(): void {
    this.interactions.clearSelection();
  }

  private replaceSelection(ids: Iterable<string>): void {
    this.interactions.replaceSelection(ids);
  }

  private clearSubtreeVirtualZoomState(): void {
    this.interactions.clearSubtreeVirtualZoomState();
  }

  private handleZoomInput(factor: number): boolean {
    return this.interactions.handleZoomInput(factor);
  }

  handleLayoutSettingsChanged(): void {
    this.treeActions.handleLayoutSettingsChanged();
  }

  refreshUI(): void {
    this.toolbar?.destroy();
    this.toolbar = createMindmapToolbar(this.contentEl, {
      layoutMode: this.store.getDocument().layoutMode,
      searchQuery: this.interactions.getSearchQuery(),
      saveStatus: this.getDirtyStateLabel(this.editSession.getDirtyState()),
      onChangeLayoutMode: (mode) => this.applyTreeLayoutMode(mode),
      onOpenMindmap: () => this.plugin.openMindmapFileSelector(),
      onSearchChange: (query) => this.updateSearch(query),
      onSearchSubmit: () => this.focusFirstSearchResult(),
      onUndo: () => this.undo(),
      onRedo: () => this.redo(),
      onSelectRoot: () => this.selectRootNode(),
      onFitRoot: () => this.fitRoot(),
      onZoomIn: () => this.zoomIn(),
      onZoomOut: () => this.zoomOut(),
      onAddChild: () => this.addChildNode(),
      onAddSibling: () => this.addSiblingNode(),
      onToggleExpand: () => this.toggleSelectedTree(),
      onEdit: () => this.editSelectedNode(),
    }, this.canvasEl ?? undefined);
    this.toolbar.setCanUndo(this.editSession.canUndo());
    this.toolbar.setCanRedo(this.editSession.canRedo());
    this.updateToolbarButtonStates();
    this.toolbar.setSaveStatus(this.getDirtyStateLabel(this.editSession.getDirtyState()));
  }

  private openEdgeContextMenu(edgeId: string, x: number, y: number): void {
    createEdgeContextMenu({
      ownerDocument: this.contentEl.ownerDocument,
      onDeleteEdge: () => {
        this.applyDocumentChange(() => {
          this.store.deleteEdge(edgeId);
        });
      },
    }).showAtPosition({ x, y });
  }
}
