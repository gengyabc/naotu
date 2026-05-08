import { App, Component } from "obsidian";

import { chooseRenderMode } from "../core/render-mode";
import { HybridMindmapRenderer } from "../renderer/hybrid-mindmap-renderer";
import { MinimapRenderer } from "../renderer/minimap-renderer";
import type { RendererAdapter } from "../renderer/renderer-adapter";
import { SvgMindmapRenderer } from "../renderer/svg-mindmap-renderer";
import type { MindmapDocument, ProjectedNode, Rect } from "../types/mindmap";
import type { SemanticMindmapSettings } from "../types/settings";
import { PerformanceDebugOverlay } from "../ui/performance-debug-overlay";

type RenderStats = {
  mode: "svg" | "hybrid";
  zoom: number;
  totalNodes: number;
  renderedNodes: number;
  totalEdges: number;
  renderedEdges: number;
  durationMs: number;
  averageDurationMs: number;
  isSlow: boolean;
};

type MindmapRendererCoordinatorOptions = {
  app: App;
  component: Component;
  getSettings: () => SemanticMindmapSettings;
  getSourcePath: () => string;
  getDocument: () => MindmapDocument;
  getSelectedNodeIds: () => string[];
  getDragNodeIds: (nodeId: string, selectedIds: string[]) => string[];
  onViewportChange: (x: number, y: number, zoom: number) => void;
  onZoomInput: (factor: number) => boolean;
  onSelectNode: (id: string, mode: "replace" | "toggle" | "add") => void;
  onToggleTree: (id: string, expanded: boolean) => void;
  onOpenNotebook: (id: string) => void;
  onInlineTitleCommit: (id: string, title: string) => Promise<void>;
  onContextMenu: (id: string, x: number, y: number) => void;
  onEdgeContextMenu: (id: string, x: number, y: number) => void;
  onBeforeNodeDragStart: (node: ProjectedNode) => void;
  onNodesMove: (args: { node: ProjectedNode; moves: Array<{ id: string; x: number; y: number }> }) => void;
  onNodeDragEnd: (args: { node: ProjectedNode }) => void;
  onNotebookResizeStart: (id: string) => void;
  onNotebookResize: (args: { id: string; width: number; height: number }) => void;
  onNotebookResizeEnd: (args: { id: string; width: number; height: number }) => void;
  onBoxSelect: (rect: Rect) => void;
  onClearSelection: () => void;
};

export class MindmapRendererCoordinator {
  private renderer: RendererAdapter | null = null;
  private debugOverlay: PerformanceDebugOverlay | null = null;
  private minimap: MinimapRenderer | null = null;
  private searchResultIds = new Set<string>();
  private missingNotebookNodeIds = new Set<string>();
  private connectionState: { enabled: boolean; sourceId?: string } = { enabled: false };

  constructor(private options: MindmapRendererCoordinatorOptions) {}

  mount(container: HTMLDivElement): void {
    this.dispose();

    if (this.options.getSettings().showDebugOverlay) {
      this.debugOverlay = new PerformanceDebugOverlay(container);
    }

    const doc = this.options.getDocument();
    const renderMode = chooseRenderMode({
      nodeCount: doc.nodes.length,
      edgeCount: doc.edges.length,
      settings: this.options.getSettings(),
    });
    const RendererClass = renderMode === "hybrid" ? HybridMindmapRenderer : SvgMindmapRenderer;

    this.renderer = new RendererClass({
      app: this.options.app,
      component: this.options.component,
      container,
      sourcePath: this.options.getSourcePath(),
      getDocument: this.options.getDocument,
      getSelectedNodeIds: this.options.getSelectedNodeIds,
      getDragNodeIds: this.options.getDragNodeIds,
      onViewportChange: this.options.onViewportChange,
      onZoomInput: this.options.onZoomInput,
      onSelectNode: this.options.onSelectNode,
      onToggleTree: this.options.onToggleTree,
      onOpenNotebook: this.options.onOpenNotebook,
      onInlineTitleCommit: this.options.onInlineTitleCommit,
      onContextMenu: this.options.onContextMenu,
      onEdgeContextMenu: this.options.onEdgeContextMenu,
      onBeforeNodeDragStart: this.options.onBeforeNodeDragStart,
      onNodesMove: this.options.onNodesMove,
      onNodeDragEnd: this.options.onNodeDragEnd,
      onNotebookResizeStart: this.options.onNotebookResizeStart,
      onNotebookResize: this.options.onNotebookResize,
      onNotebookResizeEnd: this.options.onNotebookResizeEnd,
      onBoxSelect: this.options.onBoxSelect,
      onClearSelection: this.options.onClearSelection,
      getSettings: this.options.getSettings,
      onRenderStats: (stats) => this.handleRenderStats(container, stats),
    });

    this.renderer.mount();
    this.renderer.setSearchResultIds(this.searchResultIds);
    this.renderer.setConnectionState(this.connectionState);
    this.renderer.setMissingNotebookNodeIds?.(this.missingNotebookNodeIds);
    this.renderer.render();

    if (this.options.getSettings().showMinimap) {
      this.minimap = new MinimapRenderer(container, (x, y) => {
        this.renderer?.jumpToWorldPoint?.(x, y);
      });
      this.updateMinimap();
    }
  }

  dispose(): void {
    this.renderer?.unmount();
    this.renderer = null;
    this.debugOverlay?.remove();
    this.debugOverlay = null;
    this.minimap?.remove();
    this.minimap = null;
  }

  render(): void {
    this.renderer?.render();
  }

  focusNode(nodeId: string): void {
    this.renderer?.focusNode(nodeId);
  }

  setLastFocusNodeId(nodeId: string): void {
    this.renderer?.setLastFocusNodeId(nodeId);
  }

  forceDetailLevel(nodeId: string, level: number): void {
    this.renderer?.forceDetailLevel(nodeId, level);
  }

  setSearchResultIds(ids: Set<string>): void {
    this.searchResultIds = new Set(ids);
    this.renderer?.setSearchResultIds(this.searchResultIds);
  }

  setConnectionState(state: { enabled: boolean; sourceId?: string }): void {
    this.connectionState = { ...state };
    this.renderer?.setConnectionState(this.connectionState);
  }

  setMissingNotebookNodeIds(ids: Set<string>): void {
    this.missingNotebookNodeIds = new Set(ids);
    this.renderer?.setMissingNotebookNodeIds?.(this.missingNotebookNodeIds);
  }

  getLastProjectedNodes(): ProjectedNode[] | undefined {
    return this.renderer?.getLastProjectedNodes?.();
  }

  startInlineEditByNodeId(nodeId: string): void {
    this.renderer?.startInlineEditByNodeId?.(nodeId);
  }

  zoomBy(factor: number): void {
    this.renderer?.zoomBy?.(factor);
  }

  fitRoot(): void {
    this.renderer?.fitRoot?.();
  }

  getViewportWorldRect(): Rect | undefined {
    return this.renderer?.getViewportWorldRect?.();
  }

  private handleRenderStats(container: HTMLDivElement, stats: RenderStats): void {
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
  }

  private updateMinimap(): void {
    const viewportWorldRect = this.renderer?.getViewportWorldRect?.();
    if (!viewportWorldRect) return;
    this.minimap?.render({ doc: this.options.getDocument(), viewportWorldRect });
  }
}
