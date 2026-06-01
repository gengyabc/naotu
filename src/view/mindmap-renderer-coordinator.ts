import { App, Component } from "obsidian";

import { chooseRenderMode } from "../core/render-mode";
import { HybridMindmapRenderer } from "../renderer/hybrid-mindmap-renderer";
import { MinimapRenderer } from "../renderer/minimap-renderer";
import type { RendererAdapter } from "../renderer/renderer-adapter";
import { SvgMindmapRenderer } from "../renderer/svg-mindmap-renderer";
import type { MindmapDocument, ProjectedNode, Rect } from "../types/mindmap";
import type { SemanticMindmapSettings } from "../types/settings";

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

const HYBRID_EXIT_AVERAGE_DURATION_MS = 16;
const HYBRID_EXIT_CONSECUTIVE_FAST_STATS = 3;

type MindmapRendererCoordinatorOptions = {
  app: App;
  component: Component;
  getSettings: () => SemanticMindmapSettings;
  getSourcePath: () => string;
  getDocument: () => MindmapDocument;
  getSelectedNodeIds: () => string[];
  getDragNodeIds: (nodeId: string, selectedIds: string[]) => string[];
  getDragRootNodeIds: (nodeId: string, selectedIds: string[]) => string[];
  onViewportChange: (x: number, y: number, zoom: number) => void;
  onZoomInput: (factor: number) => boolean;
  onSelectNode: (id: string) => void;
  onToggleTree: (id: string, expanded: boolean) => void;
  onOpenNotebook: (id: string) => void;
  onInlineTextCommit: (id: string, title: string) => Promise<void>;
  onContextMenu: (id: string, x: number, y: number) => void;
  onEdgeContextMenu: (id: string, x: number, y: number) => void;
  onBeforeNodeDragStart: (node: ProjectedNode) => void;
  onNodesMove: (args: {
    node: ProjectedNode;
    moves: Array<{ id: string; x: number; y: number }>;
    mode?: "move" | "reconnect";
    reconnectTargetNodeId?: string;
  }) => void;
  onNodeDragEnd: (args: { node: ProjectedNode; mode?: "move" | "reconnect"; dropPosition?: { x: number; y: number } }) => void;
  onNotebookResizeStart: (id: string) => void;
  onNotebookResize: (args: { id: string; width: number; height: number }) => void;
  onNotebookResizeEnd: (args: { id: string; width: number; height: number }) => void;
  onClearSelection: () => void;
};

export class MindmapRendererCoordinator {
  private container: HTMLDivElement | null = null;
  private renderer: RendererAdapter | null = null;
  private minimap: MinimapRenderer | null = null;
  private searchResultIds = new Set<string>();
  private missingNotebookNodeIds = new Set<string>();
  private averageRenderDurationMs = 0;
  private degradedForSession = false;
  private fastRenderRecoveryStreak = 0;
  private renderMode: "svg" | "hybrid" | null = null;

  constructor(private options: MindmapRendererCoordinatorOptions) {}

  mount(container: HTMLDivElement): void {
    this.container = container;
    this.averageRenderDurationMs = 0;
    this.degradedForSession = false;
    this.fastRenderRecoveryStreak = 0;
    this.dispose();

    this.mountRenderer(this.chooseMode(), true);

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
    this.renderMode = null;
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

  private handleRenderStats(_container: HTMLDivElement, stats: RenderStats): void {
    this.averageRenderDurationMs = stats.averageDurationMs;
    if (stats.isSlow) {
      this.degradedForSession = true;
      this.fastRenderRecoveryStreak = 0;
    } else if (this.degradedForSession && this.canRecoverFromHybrid(stats)) {
      this.fastRenderRecoveryStreak += 1;
      if (this.fastRenderRecoveryStreak >= HYBRID_EXIT_CONSECUTIVE_FAST_STATS) {
        this.degradedForSession = false;
        this.fastRenderRecoveryStreak = 0;
      }
    } else {
      this.fastRenderRecoveryStreak = 0;
    }
    const nextMode = this.chooseMode();
    if (this.container && this.renderMode !== nextMode) {
      this.mountRenderer(nextMode, false);
    }
    this.updateMinimap();
  }

  private chooseMode(): "svg" | "hybrid" {
    if (this.degradedForSession) {
      return "hybrid";
    }

    const doc = this.options.getDocument();
    return chooseRenderMode({
      nodeCount: doc.nodes.length,
      edgeCount: doc.edges.length,
      settings: this.options.getSettings(),
      averageRenderDurationMs: this.averageRenderDurationMs,
    });
  }

  private canRecoverFromHybrid(stats: RenderStats): boolean {
    if (this.renderMode !== "hybrid") return false;
    if (stats.averageDurationMs > HYBRID_EXIT_AVERAGE_DURATION_MS) return false;

    const doc = this.options.getDocument();
    return chooseRenderMode({
      nodeCount: doc.nodes.length,
      edgeCount: doc.edges.length,
      settings: this.options.getSettings(),
      averageRenderDurationMs: 0,
    }) === "svg";
  }

  private mountRenderer(mode: "svg" | "hybrid", isInitialMount: boolean): void {
    const container = this.container;
    if (!container) return;

    this.renderer?.unmount();

    const RendererClass = mode === "hybrid" ? HybridMindmapRenderer : SvgMindmapRenderer;
    this.renderer = new RendererClass({
      app: this.options.app,
      component: this.options.component,
      container,
      sourcePath: this.options.getSourcePath(),
      getDocument: this.options.getDocument,
      getSelectedNodeIds: this.options.getSelectedNodeIds,
      getDragNodeIds: this.options.getDragNodeIds,
      getDragRootNodeIds: this.options.getDragRootNodeIds,
      onViewportChange: this.options.onViewportChange,
      onZoomInput: this.options.onZoomInput,
      onSelectNode: this.options.onSelectNode,
      onToggleTree: this.options.onToggleTree,
      onOpenNotebook: this.options.onOpenNotebook,
      onInlineTextCommit: this.options.onInlineTextCommit,
      onContextMenu: this.options.onContextMenu,
      onEdgeContextMenu: this.options.onEdgeContextMenu,
      onBeforeNodeDragStart: this.options.onBeforeNodeDragStart,
      onNodesMove: this.options.onNodesMove,
      onNodeDragEnd: this.options.onNodeDragEnd,
      onNotebookResizeStart: this.options.onNotebookResizeStart,
      onNotebookResize: this.options.onNotebookResize,
      onNotebookResizeEnd: this.options.onNotebookResizeEnd,
      onClearSelection: this.options.onClearSelection,
      getSettings: this.options.getSettings,
      onRenderStats: (stats) => this.handleRenderStats(container, stats),
    });
    this.renderMode = mode;

    this.renderer.mount();
    this.renderer.setSearchResultIds(this.searchResultIds);
    this.renderer.setMissingNotebookNodeIds?.(this.missingNotebookNodeIds);
    if (isInitialMount) {
      this.renderer.render();
    }
  }

  private updateMinimap(): void {
    const viewportWorldRect = this.renderer?.getViewportWorldRect?.();
    if (!viewportWorldRect) return;
    this.minimap?.render({ doc: this.options.getDocument(), viewportWorldRect });
  }
}
