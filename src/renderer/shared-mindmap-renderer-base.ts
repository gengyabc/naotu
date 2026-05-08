import * as d3 from "d3";
import { App, Component } from "obsidian";

import { normalizeRect } from "../core/geometry";
import { PerformanceMonitor } from "../core/performance-monitor";
import { createSemanticProjection } from "../core/semantic-projection";
import { cullProjectionToViewport, shouldCullProjection } from "../core/viewport-culling";
import type { MindmapDocument, NodeDetailLevel, ProjectedNode, Rect } from "../types/mindmap";
import type { SemanticMindmapSettings } from "../types/settings";
import { renderProjectedEdges } from "./projected-edge-renderer";
import { renderProjectedNodes } from "./projected-node-renderer";
import type { RendererAdapter } from "./renderer-adapter";
import { InlineTitleEditor } from "./inline-title-editor";

export type MindmapRendererOptions = {
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
  onRenderStats?: (stats: RenderStats) => void;
};

export type RenderStats = {
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

type RenderTransform = { x: number; y: number; k: number };

type PreparedRenderData = {
  doc: MindmapDocument;
  projection: { nodes: ProjectedNode[]; edges: MindmapDocument["edges"] };
  renderNodes: ProjectedNode[];
  renderEdges: MindmapDocument["edges"];
  transform: RenderTransform;
};

type DrawResult = {
  renderedNodes: number;
  renderedEdges: number;
};

type SharedScene = {
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  overlayScreenLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
  inlineEditorLayer: HTMLDivElement;
};

export abstract class SharedMindmapRendererBase implements RendererAdapter {
  protected svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  protected overlayScreenLayer!: d3.Selection<SVGGElement, unknown, null, undefined>;
  protected inlineEditorLayer!: HTMLDivElement;
  protected zoomBehavior!: d3.ZoomBehavior<SVGSVGElement, unknown>;
  protected readonly performanceMonitor = new PerformanceMonitor();
  protected hoveredNodeId: string | undefined;
  protected lastFocusNodeId: string | undefined;
  protected readonly forcedDetailLevel = new Map<string, NodeDetailLevel>();
  protected searchResultIds = new Set<string>();
  protected connectionEnabled = false;
  protected connectionSourceId: string | undefined;
  protected selecting = false;
  protected selectionStartWorld: { x: number; y: number } | null = null;
  protected dragging = false;
  protected renderScheduled = false;
  protected lastProjectedNodes: ProjectedNode[] = [];
  protected missingNotebookNodeIds = new Set<string>();

  constructor(protected options: MindmapRendererOptions) {}

  mount(): void {
    this.options.container.empty();
    this.options.container.addClass("semantic-mindmap-container");

    const scene = this.createScene();
    this.svg = scene.svg;
    this.overlayScreenLayer = scene.overlayScreenLayer;
    this.inlineEditorLayer = scene.inlineEditorLayer;

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
    const prepared = this.prepareRenderData();

    const drawResult = this.performanceMonitor.measure(
      {
        mode: this.getRenderMode(),
        nodeCount: prepared.projection.nodes.length,
        edgeCount: prepared.projection.edges.length,
        renderedNodeCount: prepared.renderNodes.length,
        renderedEdgeCount: prepared.renderEdges.length,
      },
      () => this.draw(prepared),
    );

    if (prepared.transform.k < 0.45) this.clearForcedDetailExcept();

    const sample = this.performanceMonitor.getLastSample();
    this.options.onRenderStats?.({
      mode: this.getRenderMode(),
      zoom: prepared.transform.k,
      totalNodes: prepared.projection.nodes.length,
      renderedNodes: drawResult.renderedNodes,
      totalEdges: prepared.projection.edges.length,
      renderedEdges: drawResult.renderedEdges,
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

  setMissingNotebookNodeIds(ids: Set<string>): void {
    this.missingNotebookNodeIds = new Set(ids);
  }

  getLastProjectedNodes(): ProjectedNode[] {
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

    this.openInlineTitleEditor(node, {
      x: screenX + 10,
      y: screenY + 8,
      width: node.displayWidth - 20,
    });
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

  getViewportWorldRect(): Rect {
    const transform = d3.zoomTransform(this.svg.node()!);
    const rect = this.options.container.getBoundingClientRect();
    const topLeft = transform.invert([0, 0]);
    const bottomRight = transform.invert([rect.width, rect.height]);
    return { x: topLeft[0], y: topLeft[1], width: bottomRight[0] - topLeft[0], height: bottomRight[1] - topLeft[1] };
  }

  protected renderSvgEdges(args: {
    edgeLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
    nodes: ProjectedNode[];
    edges: MindmapDocument["edges"];
    transform: RenderTransform;
  }): void {
    renderProjectedEdges({
      edgeLayer: args.edgeLayer,
      nodes: args.nodes,
      edges: args.edges,
      transform: args.transform,
      onEdgeContextMenu: this.options.onEdgeContextMenu,
    });
  }

  protected renderSvgNodes(args: {
    nodeLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
    doc: MindmapDocument;
    nodes: ProjectedNode[];
    transform: RenderTransform;
  }): void {
    renderProjectedNodes({
      app: this.options.app,
      component: this.options.component,
      layoutMode: args.doc.layoutMode,
      nodeLayer: args.nodeLayer,
      nodes: args.nodes,
      transform: args.transform,
      sourcePath: this.options.sourcePath,
      getSelectedNodeIds: this.options.getSelectedNodeIds,
      getDragNodeIds: this.options.getDragNodeIds,
      onSelectNode: (id, mode) => {
        this.lastFocusNodeId = id;
        const selectedNode = args.doc.nodes.find((node) => node.id === id);
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
        this.openInlineTitleEditor(node, rect);
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
  }

  protected scheduleRender(): void {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    requestAnimationFrame(() => {
      this.renderScheduled = false;
      this.render();
    });
  }

  protected clearForcedDetailExcept(nodeId?: string): void {
    for (const key of [...this.forcedDetailLevel.keys()]) {
      if (key !== nodeId) this.forcedDetailLevel.delete(key);
    }
  }

  protected abstract createScene(): SharedScene;
  protected abstract getRenderMode(): "svg" | "hybrid";
  protected abstract draw(data: PreparedRenderData): DrawResult;

  private prepareRenderData(): PreparedRenderData {
    const doc = this.options.getDocument();
    const transformState = d3.zoomTransform(this.svg.node()!);
    const transform = { x: transformState.x, y: transformState.y, k: transformState.k };
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
        transform,
      );
      renderNodes = culled.nodes;
      renderEdges = culled.edges;
    }

    return { doc, projection, renderNodes, renderEdges, transform };
  }

  private openInlineTitleEditor(node: ProjectedNode, rect: { x: number; y: number; width: number }): void {
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
  }

  private handleWheelZoom = (event: WheelEvent): void => {
    event.preventDefault();
    const zoomSpeed = this.options.getSettings().zoomSpeed;
    const factor = Math.exp(-event.deltaY * zoomSpeed);
    if (!Number.isFinite(factor) || factor === 1) return;
    this.handleZoomInput(factor);
  };

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
