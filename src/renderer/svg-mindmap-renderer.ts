import * as d3 from "d3";
import { App, Component } from "obsidian";
import type { MindmapDocument, NodeDetailLevel, Rect } from "../types/mindmap";
import type { ProjectedNode } from "../types/mindmap";
import { normalizeRect } from "../core/geometry";
import { createSemanticProjection } from "../core/semantic-projection";
import { cullProjectionToViewport, shouldCullProjection } from "../core/viewport-culling";
import type { SemanticMindmapSettings } from "../types/settings";
import { renderProjectedEdges } from "./projected-edge-renderer";
import { renderProjectedNodes } from "./projected-node-renderer";
import { InlineTitleEditor } from "./inline-title-editor";
import type { RendererAdapter } from "./renderer-adapter";
import { PerformanceMonitor } from "../core/performance-monitor";

export class SvgMindmapRenderer implements RendererAdapter {
  private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private edgeWorldLayer!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private nodeScreenLayer!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private inlineEditorLayer!: HTMLDivElement;
  private overlayScreenLayer!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private zoomBehavior!: d3.ZoomBehavior<SVGSVGElement, unknown>;
  private hoveredNodeId: string | undefined;
  private lastFocusNodeId: string | undefined;
  private forcedDetailLevel = new Map<string, NodeDetailLevel>();
  private searchResultIds = new Set<string>();
  private connectionEnabled = false;
  private connectionSourceId: string | undefined;
  private selecting = false;
  private selectionStartWorld: { x: number; y: number } | null = null;
  private dragging = false;
  private renderScheduled = false;
  private performanceMonitor = new PerformanceMonitor();
  private lastProjectedNodes: import("../types/mindmap").ProjectedNode[] = [];
  private missingNotebookNodeIds = new Set<string>();

  constructor(
    private options: {
      app: App;
      component: Component;
      container: HTMLElement;
      sourcePath: string;
      getDocument: () => MindmapDocument;
      getSelectedNodeIds: () => string[];
      getDragNodeIds: (nodeId: string, selectedIds: string[]) => string[];
      onViewportChange: (x: number, y: number, zoom: number) => void;
      onZoomInput?: (factor: number) => boolean;
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
      getSettings: () => SemanticMindmapSettings;
      onRenderStats?: (stats: {
        mode: "svg" | "hybrid";
        zoom: number;
        totalNodes: number;
        renderedNodes: number;
        totalEdges: number;
        renderedEdges: number;
        durationMs: number;
        averageDurationMs: number;
        isSlow: boolean;
      }) => void;
    },
  ) {}

  mount(): void {
    this.options.container.empty();
    this.options.container.addClass("semantic-mindmap-container");

    this.svg = d3.select(this.options.container).append("svg").attr("class", "semantic-mindmap-svg").attr("width", "100%").attr("height", "100%");
    this.edgeWorldLayer = this.svg.append("g").attr("class", "edge-world-layer");
    this.nodeScreenLayer = this.svg.append("g").attr("class", "node-screen-layer");
    this.overlayScreenLayer = this.svg.append("g").attr("class", "overlay-screen-layer");
    this.overlayScreenLayer.append("rect").attr("class", "selection-box").style("display", "none");
    this.inlineEditorLayer = this.options.container.createDiv({ cls: "inline-editor-layer" });

    this.zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.12, 4])
      .filter((event) => event.type !== "wheel" && !event.button)
      .on("zoom", (event) => {
        const t = event.transform;
        this.options.onViewportChange(t.x, t.y, t.k);
        this.scheduleRender();
      });

    this.svg.call(this.zoomBehavior);
    this.svg.node()?.addEventListener("wheel", this.handleWheelZoom, { passive: false });
    this.bindBoxSelect();
    this.bindFocusRestore();
    const viewport = this.options.getDocument().viewport;
    this.svg.call(this.zoomBehavior.transform, d3.zoomIdentity.translate(viewport.x, viewport.y).scale(viewport.zoom));
    this.render();
  }

  unmount(): void {
    this.svg.node()?.removeEventListener("wheel", this.handleWheelZoom);
    this.options.container.empty();
  }

  render(): void {
    const doc = this.options.getDocument();
    const transform = d3.zoomTransform(this.svg.node()!);
    const projection = createSemanticProjection(
      doc,
      {
        zoom: transform.k,
        viewportWorldRect: this.getViewportWorldRect(),
        selectedNodeIds: this.options.getSelectedNodeIds(),
        hoveredNodeId: this.hoveredNodeId,
        lastFocusNodeId: this.lastFocusNodeId,
      },
      {
        searchResultIds: this.searchResultIds,
        connectionSourceId: this.connectionEnabled ? this.connectionSourceId : undefined,
        forcedDetailLevels: this.forcedDetailLevel,
      },
    );

    for (const node of projection.nodes) {
      node.isMissingNotebook = this.missingNotebookNodeIds.has(node.id);
    }

    this.lastProjectedNodes = projection.nodes;

    let renderNodes = projection.nodes;
    let renderEdges = projection.edges;
    if (shouldCullProjection(doc.nodes.length, this.options.getSettings())) {
      const rect = this.options.container.getBoundingClientRect();
      const culled = cullProjectionToViewport(
        projection.nodes,
        projection.edges,
        { x: 0, y: 0, width: rect.width, height: rect.height },
        { x: transform.x, y: transform.y, k: transform.k },
      );
      renderNodes = culled.nodes;
      renderEdges = culled.edges;
    }

    this.performanceMonitor.measure(
      {
        mode: "svg",
        nodeCount: projection.nodes.length,
        edgeCount: projection.edges.length,
        renderedNodeCount: renderNodes.length,
        renderedEdgeCount: renderEdges.length,
      },
      () => {
        renderProjectedEdges({
          edgeLayer: this.edgeWorldLayer,
          nodes: renderNodes,
          edges: renderEdges,
          transform: { x: transform.x, y: transform.y, k: transform.k },
          onEdgeContextMenu: this.options.onEdgeContextMenu,
        });

        renderProjectedNodes({
          app: this.options.app,
          component: this.options.component,
          layoutMode: doc.layoutMode,
          nodeLayer: this.nodeScreenLayer,
          nodes: renderNodes,
          transform: { x: transform.x, y: transform.y, k: transform.k },
          sourcePath: this.options.sourcePath,
          getSelectedNodeIds: this.options.getSelectedNodeIds,
          getDragNodeIds: this.options.getDragNodeIds,
          onSelectNode: (id, mode) => {
            this.lastFocusNodeId = id;
            const selectedNode = doc.nodes.find((node) => node.id === id);
            if (mode === "replace" && selectedNode?.kind === "notebook") {
              this.clearForcedDetailExcept(id);
            }
            this.options.onSelectNode(id, mode);
            this.render();
          },
          onHoverNode: (id) => {
            if (this.dragging) return;
            this.hoveredNodeId = id;
            this.render();
          },
          onLeaveNode: () => {
            if (this.dragging) return;
            this.hoveredNodeId = undefined;
            this.render();
          },
          onToggleTree: this.options.onToggleTree,
          onOpenNotebook: this.options.onOpenNotebook,
          onStartInlineEdit: (node, rect) => {
            new InlineTitleEditor({
              layer: this.inlineEditorLayer,
              x: rect.x,
              y: rect.y,
              width: rect.width,
              value: node.title,
              onCommit: async (value) => {
                await this.options.onInlineTitleCommit(node.id, value);
              },
              onCancel: () => {},
            }).open();
          },
          onContextMenu: this.options.onContextMenu,
          onBeforeNodeDragStart: this.options.onBeforeNodeDragStart,
          onNodesMove: this.options.onNodesMove,
          onNodeDragEnd: this.options.onNodeDragEnd,
          onNotebookResizeStart: this.options.onNotebookResizeStart,
          onNotebookResize: this.options.onNotebookResize,
          onNotebookResizeEnd: this.options.onNotebookResizeEnd,
          onDragStateChange: (dragging) => {
            this.dragging = dragging;
          },
        });
      },
    );

    if (transform.k < 0.45) this.clearForcedDetailExcept();

    const sample = this.performanceMonitor.getLastSample();
    this.options.onRenderStats?.({
      mode: "svg",
      zoom: transform.k,
      totalNodes: projection.nodes.length,
      renderedNodes: renderNodes.length,
      totalEdges: projection.edges.length,
      renderedEdges: renderEdges.length,
      durationMs: sample?.durationMs ?? 0,
      averageDurationMs: this.performanceMonitor.getAverageDuration(),
      isSlow: this.performanceMonitor.isSlow(),
    });
  }

  private scheduleRender(): void {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    requestAnimationFrame(() => {
      this.renderScheduled = false;
      this.render();
    });
  }

  private clearForcedDetailExcept(nodeId?: string): void {
    for (const key of [...this.forcedDetailLevel.keys()]) {
      if (key !== nodeId) this.forcedDetailLevel.delete(key);
    }
  }

  setSearchResultIds(ids: Set<string>): void {
    this.searchResultIds = new Set(ids);
  }

  setConnectionState(state: { enabled: boolean; sourceId?: string }): void {
    this.connectionEnabled = state.enabled;
    this.connectionSourceId = state.sourceId;
  }

  setMissingNotebookNodeIds(ids: Set<string>): void {
    this.missingNotebookNodeIds = new Set(ids);
  }

  getLastProjectedNodes(): import("../types/mindmap").ProjectedNode[] {
    return this.lastProjectedNodes;
  }

  setLastFocusNodeId(id: string): void {
    this.lastFocusNodeId = id;
  }

  forceDetailLevel(id: string, level: NodeDetailLevel): void {
    this.forcedDetailLevel.set(id, level);
  }

  focusNode(id: string): void {
    const node = this.options.getDocument().nodes.find((item) => item.id === id);
    if (!node) return;

    const rect = this.options.container.getBoundingClientRect();
    const current = d3.zoomTransform(this.svg.node()!);
    const k = Math.max(current.k, 1.2);
    const x = rect.width / 2 - node.x * k;
    const y = rect.height / 2 - node.y * k;

    this.svg.transition().duration(250).call(this.zoomBehavior.transform, d3.zoomIdentity.translate(x, y).scale(k));
  }

  startInlineEditByNodeId(nodeId: string): void {
    const node = this.lastProjectedNodes.find((item) => item.id === nodeId);
    if (!node) return;

    const transform = d3.zoomTransform(this.svg.node()!);
    const screenX = node.projectedX * transform.k + transform.x;
    const screenY = node.projectedY * transform.k + transform.y;

    new InlineTitleEditor({
      layer: this.inlineEditorLayer,
      x: screenX + 10,
      y: screenY + 8,
      width: node.displayWidth - 20,
      value: node.title,
      onCommit: async (value) => {
        await this.options.onInlineTitleCommit(node.id, value);
      },
      onCancel: () => {},
    }).open();
  }

  zoomBy(factor: number): void {
    const svgNode = this.svg.node();
    if (!svgNode) return;
    const current = d3.zoomTransform(svgNode);
    const rect = this.options.container.getBoundingClientRect();
    const nextK = Math.max(0.12, Math.min(4, current.k * factor));
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const worldCenter = current.invert([cx, cy]);
    const nextX = cx - worldCenter[0] * nextK;
    const nextY = cy - worldCenter[1] * nextK;

    this.svg.transition().duration(160).call(this.zoomBehavior.transform, d3.zoomIdentity.translate(nextX, nextY).scale(nextK));
  }

  handleZoomInput(factor: number): boolean {
    if (this.options.onZoomInput?.(factor)) return true;
    this.zoomBy(factor);
    return true;
  }

  fitRoot(): void {
    const root = this.options.getDocument().nodes[0];
    if (!root) return;
    this.focusNode(root.id);
  }

  jumpToWorldPoint(x: number, y: number): void {
    const rect = this.options.container.getBoundingClientRect();
    const current = d3.zoomTransform(this.svg.node()!);
    const nextX = rect.width / 2 - x * current.k;
    const nextY = rect.height / 2 - y * current.k;
    this.svg.transition().duration(180).call(this.zoomBehavior.transform, d3.zoomIdentity.translate(nextX, nextY).scale(current.k));
  }

  private handleWheelZoom = (event: WheelEvent): void => {
    event.preventDefault();
    const zoomSpeed = this.options.getSettings().zoomSpeed;
    const factor = Math.exp(-event.deltaY * zoomSpeed);
    if (!Number.isFinite(factor) || factor === 1) return;
    this.handleZoomInput(factor);
  };

  getViewportWorldRect(): { x: number; y: number; width: number; height: number } {
    const transform = d3.zoomTransform(this.svg.node()!);
    const rect = this.options.container.getBoundingClientRect();
    const topLeft = transform.invert([0, 0]);
    const bottomRight = transform.invert([rect.width, rect.height]);
    return { x: topLeft[0], y: topLeft[1], width: bottomRight[0] - topLeft[0], height: bottomRight[1] - topLeft[1] };
  }

  private bindBoxSelect(): void {
    this.svg.on("mousedown.boxselect", (event) => {
      if (!event.shiftKey) return;
      if ((event.target as Element).closest(".mindmap-node")) return;

      event.preventDefault();

      const transform = d3.zoomTransform(this.svg.node()!);
      const [x, y] = transform.invert(d3.pointer(event, this.svg.node()));
      this.selecting = true;
      this.selectionStartWorld = { x, y };
    });

    this.svg.on("mousemove.boxselect", (event) => {
      if (!this.selecting || !this.selectionStartWorld) return;

      const transform = d3.zoomTransform(this.svg.node()!);
      const startScreen = [
        this.selectionStartWorld.x * transform.k + transform.x,
        this.selectionStartWorld.y * transform.k + transform.y,
      ];
      const currentScreen = d3.pointer(event, this.svg.node());

      const x = Math.min(startScreen[0], currentScreen[0]);
      const y = Math.min(startScreen[1], currentScreen[1]);
      const width = Math.abs(currentScreen[0] - startScreen[0]);
      const height = Math.abs(currentScreen[1] - startScreen[1]);

      this.overlayScreenLayer
        .select<SVGRectElement>("rect.selection-box")
        .style("display", null)
        .attr("x", x)
        .attr("y", y)
        .attr("width", width)
        .attr("height", height);
    });

    this.svg.on("mouseup.boxselect", (event) => {
      if (!this.selecting || !this.selectionStartWorld) return;

      const transform = d3.zoomTransform(this.svg.node()!);
      const [x2, y2] = transform.invert(d3.pointer(event, this.svg.node()));
      const rect = normalizeRect(this.selectionStartWorld.x, this.selectionStartWorld.y, x2, y2);
      this.options.onBoxSelect(rect);

      this.selecting = false;
      this.selectionStartWorld = null;
      this.overlayScreenLayer.select<SVGRectElement>("rect.selection-box").style("display", "none");
    });
  }

  private bindFocusRestore(): void {
    this.svg.on("click.focus", (event) => {
      requestAnimationFrame(() => this.options.container.focus());
      if (!(event.target as Element).closest(".mindmap-node")) {
        this.options.onClearSelection();
      }
    });
  }
}
