import * as d3 from "d3";
import { App } from "obsidian";
import type { MindmapDocument, NodeDetailLevel, Rect } from "../types/mindmap";
import { normalizeRect } from "../core/geometry";
import { createSemanticProjection } from "../core/semantic-projection";
import { partitionForHybridRender } from "../core/render-partition";
import { CanvasBackgroundRenderer } from "./canvas-background-renderer";
import { renderProjectedEdges } from "./projected-edge-renderer";
import { renderProjectedNodes } from "./projected-node-renderer";
import { InlineTitleEditor } from "./inline-title-editor";
import type { RendererAdapter } from "./renderer-adapter";
import { PerformanceMonitor } from "../core/performance-monitor";

export class HybridMindmapRenderer implements RendererAdapter {
  private root!: HTMLDivElement;
  private canvas!: HTMLCanvasElement;
  private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private svgEdgeLayer!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private svgNodeLayer!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private overlayScreenLayer!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private inlineEditorLayer!: HTMLDivElement;
  private zoomBehavior!: d3.ZoomBehavior<SVGSVGElement, unknown>;
  private canvasRenderer = new CanvasBackgroundRenderer();
  private performanceMonitor = new PerformanceMonitor();
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

  constructor(
    private options: {
      app: App;
      container: HTMLElement;
      sourcePath: string;
      getDocument: () => MindmapDocument;
      getSelectedNodeIds: () => string[];
      onViewportChange: (x: number, y: number, zoom: number) => void;
      onSelectNode: (id: string, mode: "replace" | "toggle" | "add") => void;
      onToggleTree: (id: string) => void;
      onNotebookExpand: (id: string) => void;
      onInlineTitleCommit: (id: string, title: string) => Promise<void>;
      onContextMenu: (id: string, x: number, y: number) => void;
      onEdgeContextMenu: (id: string, x: number, y: number) => void;
      onBeforeNodeDragStart: () => void;
      onNodesMove: (moves: Array<{ id: string; x: number; y: number }>) => void;
      onNodeDragEnd: () => void;
      onBoxSelect: (rect: Rect) => void;
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
    this.root = this.options.container.createDiv({ cls: "hybrid-renderer-root" });
    this.canvas = this.root.createEl("canvas", { cls: "hybrid-background-canvas" });
    this.svg = d3.select(this.root).append("svg").attr("class", "hybrid-interaction-svg").attr("width", "100%").attr("height", "100%");
    this.svgEdgeLayer = this.svg.append("g").attr("class", "svg-edge-layer");
    this.svgNodeLayer = this.svg.append("g").attr("class", "svg-node-layer");
    this.overlayScreenLayer = this.svg.append("g").attr("class", "overlay-screen-layer");
    this.overlayScreenLayer.append("rect").attr("class", "selection-box").style("display", "none");
    this.inlineEditorLayer = this.root.createDiv({ cls: "inline-editor-layer" });

    this.zoomBehavior = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.12, 4]).on("zoom", (event) => {
      const t = event.transform;
      this.options.onViewportChange(t.x, t.y, t.k);
      this.scheduleRender();
    });
    this.svg.call(this.zoomBehavior);
    this.bindBoxSelect();
    const viewport = this.options.getDocument().viewport;
    this.svg.call(this.zoomBehavior.transform, d3.zoomIdentity.translate(viewport.x, viewport.y).scale(viewport.zoom));
    this.render();
  }

  unmount(): void {
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
      },
    );

    for (const node of projection.nodes) {
      const forced = this.forcedDetailLevel.get(node.id);
      if (forced !== undefined && forced > node.detailLevel) node.detailLevel = forced;
    }

    const partition = partitionForHybridRender(projection.nodes, projection.edges);
    this.performanceMonitor.measure(
      {
        mode: "hybrid",
        nodeCount: projection.nodes.length,
        edgeCount: projection.edges.length,
        renderedNodeCount: partition.svgNodes.length + partition.canvasNodes.length,
        renderedEdgeCount: partition.svgEdges.length + partition.canvasEdges.length,
      },
      () => {
        this.canvasRenderer.render({
          canvas: this.canvas,
          nodes: partition.canvasNodes,
          edges: partition.canvasEdges,
          transform: { x: transform.x, y: transform.y, k: transform.k },
        });
        this.svgEdgeLayer.attr("transform", transform.toString());
        renderProjectedEdges({ edgeLayer: this.svgEdgeLayer, nodes: projection.nodes, edges: partition.svgEdges, onEdgeContextMenu: this.options.onEdgeContextMenu });
        renderProjectedNodes({
          app: this.options.app,
          nodeLayer: this.svgNodeLayer,
          nodes: partition.svgNodes,
          transform: { x: transform.x, y: transform.y, k: transform.k },
          sourcePath: this.options.sourcePath,
          getSelectedNodeIds: this.options.getSelectedNodeIds,
          onSelectNode: (id, mode) => {
            this.lastFocusNodeId = id;
            this.clearForcedDetailExcept(id);
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
          onNotebookExpand: (id) => {
            this.lastFocusNodeId = id;
            this.options.onNotebookExpand(id);
          },
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
          onDragStateChange: (dragging) => {
            this.dragging = dragging;
          },
        });
      },
    );

    if (transform.k < 0.45) this.clearForcedDetailExcept();
    const sample = this.performanceMonitor.getLastSample();
    this.options.onRenderStats?.({
      mode: "hybrid",
      zoom: transform.k,
      totalNodes: projection.nodes.length,
      renderedNodes: partition.svgNodes.length + partition.canvasNodes.length,
      totalEdges: projection.edges.length,
      renderedEdges: partition.svgEdges.length + partition.canvasEdges.length,
      durationMs: sample?.durationMs ?? 0,
      averageDurationMs: this.performanceMonitor.getAverageDuration(),
      isSlow: this.performanceMonitor.isSlow(),
    });
  }

  setSearchResultIds(ids: Set<string>): void {
    this.searchResultIds = new Set(ids);
  }

  setConnectionState(state: { enabled: boolean; sourceId?: string }): void {
    this.connectionEnabled = state.enabled;
    this.connectionSourceId = state.sourceId;
  }

  setLastFocusNodeId(id: string): void {
    this.lastFocusNodeId = id;
  }

  forceDetailLevel(id: string, level: number): void {
    this.forcedDetailLevel.set(id, level as NodeDetailLevel);
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

  private getViewportWorldRect(): { x: number; y: number; width: number; height: number } {
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
      const startScreen = [this.selectionStartWorld.x * transform.k + transform.x, this.selectionStartWorld.y * transform.k + transform.y];
      const currentScreen = d3.pointer(event, this.svg.node());
      const x = Math.min(startScreen[0], currentScreen[0]);
      const y = Math.min(startScreen[1], currentScreen[1]);
      const width = Math.abs(currentScreen[0] - startScreen[0]);
      const height = Math.abs(currentScreen[1] - startScreen[1]);
      this.overlayScreenLayer.select<SVGRectElement>("rect.selection-box").style("display", null).attr("x", x).attr("y", y).attr("width", width).attr("height", height);
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
}
