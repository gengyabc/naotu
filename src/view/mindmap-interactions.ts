import { findNearestNodeInDirection, findRootNodeId, type Direction } from "../core/keyboard-navigation";
import { isEmbeddedFileNodeTargetKind } from "../core/file-node-support";
import { searchNodes } from "../core/search";
import { SelectionState } from "../core/selection";
import { planSubtreeSemanticZoom } from "../core/subtree-semantic-zoom";
import type { MindmapDocument, ProjectedNode } from "../types/mindmap";

type ApplyDocumentChangeOptions = {
  commitHistory?: boolean;
  relayout?: boolean;
  render?: boolean;
  autosave?: boolean;
};

type SelectionMode = "replace" | "toggle" | "add";

type MindmapInteractionOptions = {
  selection: SelectionState;
  getDocument(): MindmapDocument;
  getProjectedNodes(): ProjectedNode[] | undefined;
  render(): void;
  focusNode(nodeId: string): void;
  setLastFocusNodeId(nodeId: string): void;
  setSearchResultIds(ids: Set<string>): void;
  focusCanvas(): void;
  focusSearchInput(): void;
  startInlineEdit(nodeId: string): void;
  zoomBy(factor: number): void;
  fitRoot(): void;
  addChildNode(): void;
  addSiblingNode(): void;
  toggleSelectedTree(): void;
  deleteSelectedNodes(mode?: "promote" | "recursive"): void;
  undo(): void;
  redo(): void;
  applyTreeControls(controls: Map<string, MindmapDocument["nodes"][number]["treeControl"]>): void;
  applyDocumentChange(mutator: () => void, options?: ApplyDocumentChangeOptions): void;
  onSelectionChange?(): void;
};

export class MindmapInteractions {
  private searchQuery = "";
  private searchResultIds = new Set<string>();
  private subtreeVirtualZoomState: { nodeId: string; zoom: number } | null = null;

  constructor(private options: MindmapInteractionOptions) {}

  getSearchQuery(): string {
    return this.searchQuery;
  }

  getSearchResultIds(): Set<string> {
    return this.searchResultIds;
  }

  getSubtreeVirtualZoomState(): { nodeId: string; zoom: number } | null {
    return this.subtreeVirtualZoomState;
  }

  updateSearch(query: string): void {
    this.searchQuery = query;
    const results = searchNodes(this.options.getDocument().nodes, query);
    this.searchResultIds = new Set(results.map((node) => node.id));
    this.options.setSearchResultIds(this.searchResultIds);
    this.options.render();
  }

  focusFirstSearchResult(): void {
    const firstId = [...this.searchResultIds][0];
    if (!firstId) return;
    this.setSelectionOnly(firstId);
    this.options.setLastFocusNodeId(firstId);
    this.options.focusNode(firstId);
    this.options.render();
  }

  handleCanvasKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea")) return;

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) this.options.redo();
      else this.options.undo();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      this.options.focusSearchInput();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === "0") {
      event.preventDefault();
      this.clearSubtreeVirtualZoomState();
      this.options.fitRoot();
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
      this.options.addChildNode();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      this.options.addSiblingNode();
      return;
    }

    if (event.key === " ") {
      event.preventDefault();
      this.options.toggleSelectedTree();
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
      const mode = event.shiftKey ? "recursive" : "promote";
      this.options.deleteSelectedNodes(mode);
      return;
    }

    if (event.key === "Escape") {
      this.clearSelection();
      this.options.render();
    }
  }

  handleNodeSelection(id: string, mode: SelectionMode): void {
    if (mode === "replace") this.setSelectionOnly(id);
    if (mode === "toggle") this.toggleSelection(id);
    if (mode === "add") this.addSelection(id);
    this.options.setLastFocusNodeId(id);
    requestAnimationFrame(() => this.options.focusCanvas());
  }

  setSelectionOnly(id: string): void {
    this.options.selection.setOnly(id);
    this.clearSubtreeVirtualZoomState();
    this.options.onSelectionChange?.();
  }

  toggleSelection(id: string): void {
    this.options.selection.toggle(id);
    this.clearSubtreeVirtualZoomState();
    this.options.onSelectionChange?.();
  }

  addSelection(id: string): void {
    this.options.selection.add(id);
    this.clearSubtreeVirtualZoomState();
    this.options.onSelectionChange?.();
  }

  clearSelection(): void {
    this.options.selection.clear();
    const rootId = findRootNodeId(this.options.getDocument());
    if (rootId) this.options.setLastFocusNodeId(rootId);
    this.clearSubtreeVirtualZoomState();
    this.options.onSelectionChange?.();
  }

  replaceSelection(ids: Iterable<string>): void {
    this.options.selection.clear();
    for (const id of ids) this.options.selection.add(id);
    this.clearSubtreeVirtualZoomState();
    this.options.onSelectionChange?.();
  }

  clearSubtreeVirtualZoomState(): void {
    this.subtreeVirtualZoomState = null;
  }

  handleZoomInput(factor: number): boolean {
    const selectedIds = this.options.selection.getIds();
    let focusId: string | undefined;
    
    if (selectedIds.length === 1) {
      focusId = selectedIds[0];
    } else if (selectedIds.length === 0) {
      focusId = findRootNodeId(this.options.getDocument());
    }
    
    if (!focusId) {
      this.clearSubtreeVirtualZoomState();
      this.options.zoomBy(factor);
      return true;
    }

    const currentVirtualZoom = this.subtreeVirtualZoomState?.nodeId === focusId
      ? this.subtreeVirtualZoomState.zoom
      : this.options.getDocument().viewport.zoom;

    const plan = planSubtreeSemanticZoom({
      doc: this.options.getDocument(),
      rootId: focusId,
      currentVirtualZoom,
      projectionZoom: this.options.getDocument().viewport.zoom,
      factor,
      maxDepthStep: 3,
    });
    if (!plan) {
      this.clearSubtreeVirtualZoomState();
      this.options.zoomBy(factor);
      return true;
    }

    if (factor < 1 && plan.controls.size === 0 && plan.previousVisibleDepth === 0 && plan.nextVisibleDepth === 0) {
      return true;
    }

    this.subtreeVirtualZoomState = { nodeId: focusId, zoom: plan.nextVirtualZoom };
    if (plan.controls.size === 0) {
      this.options.zoomBy(factor);
      return true;
    }

    this.options.applyDocumentChange(() => {
      this.options.applyTreeControls(plan.controls);
    }, { relayout: false });
    return true;
  }

  private moveSelectionByDirection(direction: Direction): void {
    const current = this.options.selection.getIds()[0];
    if (!current) return;

    const nodes = this.options.getProjectedNodes() ?? [];
    const nextId = findNearestNodeInDirection({ fromNodeId: current, nodes, direction });
    if (!nextId) return;

    this.setSelectionOnly(nextId);
    this.options.setLastFocusNodeId(nextId);
    this.options.focusNode(nextId);
    this.options.render();
  }

  private selectRootNode(): void {
    const rootId = findRootNodeId(this.options.getDocument());
    if (!rootId) return;
    this.setSelectionOnly(rootId);
    this.options.setLastFocusNodeId(rootId);
    this.options.focusNode(rootId);
    this.options.render();
  }

  private startEditingSelectedNode(): void {
    const id = this.options.selection.getIds()[0];
    if (!id) return;
    const node = this.options.getDocument().nodes.find((item) => item.id === id);
    if (node?.kind === "notebook" && isEmbeddedFileNodeTargetKind(node.notebook?.targetKind)) return;
    this.options.startInlineEdit(id);
  }
}
