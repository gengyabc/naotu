import * as d3 from "d3";
import { App } from "obsidian";
import type { MindmapDocument, NodeDetailLevel, Rect } from "../types/mindmap";
import { normalizeRect } from "../core/geometry";
import { createSemanticProjection } from "../core/semantic-projection";
import { cullProjectionToViewport } from "../core/viewport-culling";
import { renderProjectedEdges } from "./projected-edge-renderer";
import { renderProjectedNodes } from "./projected-node-renderer";
import { InlineTitleEditor } from "./inline-title-editor";

export class SvgMindmapRenderer {
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
        zoom: number;
        totalNodes: number;
        renderedNodes: number;
        totalEdges: number;
        renderedEdges: number;
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
      .on("zoom", (event) => {
        const t = event.transform;
        this.options.onViewportChange(t.x, t.y, t.k);
        this.render();
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

    let renderNodes = projection.nodes;
    let renderEdges = projection.edges;
    if (doc.nodes.length > 500) {
      const culled = cullProjectionToViewport(projection.nodes, projection.edges, this.getViewportWorldRect());
      renderNodes = culled.nodes;
      renderEdges = culled.edges;
    }

    this.edgeWorldLayer.attr("transform", transform.toString());
    renderProjectedEdges({
      edgeLayer: this.edgeWorldLayer,
      nodes: renderNodes,
      edges: renderEdges,
      onEdgeContextMenu: this.options.onEdgeContextMenu,
    });

    renderProjectedNodes({
      app: this.options.app,
      nodeLayer: this.nodeScreenLayer,
      nodes: renderNodes,
      transform: { x: transform.x, y: transform.y, k: transform.k },
      sourcePath: this.options.sourcePath,
      getSelectedNodeIds: this.options.getSelectedNodeIds,
      onSelectNode: (id, mode) => {
        this.lastFocusNodeId = id;
        this.options.onSelectNode(id, mode);
        this.render();
      },
      onHoverNode: (id) => {
        this.hoveredNodeId = id;
        this.render();
      },
      onLeaveNode: () => {
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
    });

    this.options.onRenderStats?.({
      zoom: transform.k,
      totalNodes: projection.nodes.length,
      renderedNodes: renderNodes.length,
      totalEdges: projection.edges.length,
      renderedEdges: renderEdges.length,
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
}
