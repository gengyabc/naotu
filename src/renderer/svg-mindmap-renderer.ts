import * as d3 from "d3";
import { App } from "obsidian";
import type { MindmapDocument, NodeDetailLevel } from "../types/mindmap";
import { createSemanticProjection } from "../core/semantic-projection";
import { renderProjectedEdges } from "./projected-edge-renderer";
import { renderProjectedNodes } from "./projected-node-renderer";
import { InlineTitleEditor } from "./inline-title-editor";

export class SvgMindmapRenderer {
  private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private edgeWorldLayer!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private nodeScreenLayer!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private inlineEditorLayer!: HTMLDivElement;
  private zoomBehavior!: d3.ZoomBehavior<SVGSVGElement, unknown>;
  private hoveredNodeId: string | undefined;
  private lastFocusNodeId: string | undefined;
  private forcedDetailLevel = new Map<string, NodeDetailLevel>();

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
      onNodeMove: (id: string, x: number, y: number) => void;
    },
  ) {}

  mount(): void {
    this.options.container.empty();
    this.options.container.addClass("semantic-mindmap-container");

    this.svg = d3.select(this.options.container).append("svg").attr("class", "semantic-mindmap-svg").attr("width", "100%").attr("height", "100%");
    this.edgeWorldLayer = this.svg.append("g").attr("class", "edge-world-layer");
    this.nodeScreenLayer = this.svg.append("g").attr("class", "node-screen-layer");
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
    const projection = createSemanticProjection(doc, {
      zoom: transform.k,
      viewportWorldRect: this.getViewportWorldRect(),
      selectedNodeIds: this.options.getSelectedNodeIds(),
      hoveredNodeId: this.hoveredNodeId,
      lastFocusNodeId: this.lastFocusNodeId,
    });

    for (const node of projection.nodes) {
      const forced = this.forcedDetailLevel.get(node.id);
      if (forced !== undefined && forced > node.detailLevel) node.detailLevel = forced;
    }

    this.edgeWorldLayer.attr("transform", transform.toString());
    renderProjectedEdges({ edgeLayer: this.edgeWorldLayer, nodes: projection.nodes, edges: projection.edges });

    renderProjectedNodes({
      app: this.options.app,
      nodeLayer: this.nodeScreenLayer,
      nodes: projection.nodes,
      transform: { x: transform.x, y: transform.y, k: transform.k },
      sourcePath: this.options.sourcePath,
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
    });
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
}
