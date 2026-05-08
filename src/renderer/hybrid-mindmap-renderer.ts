import * as d3 from "d3";
import { partitionForHybridRender } from "../core/render-partition";
import { CanvasBackgroundRenderer } from "./canvas-background-renderer";
import { SharedMindmapRendererBase, type MindmapRendererOptions } from "./shared-mindmap-renderer-base";

export class HybridMindmapRenderer extends SharedMindmapRendererBase {
  private root!: HTMLDivElement;
  private canvas!: HTMLCanvasElement;
  private svgEdgeLayer!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private svgNodeLayer!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private canvasRenderer = new CanvasBackgroundRenderer();
  constructor(options: MindmapRendererOptions) {
    super(options);
  }

  protected createScene() {
    this.root = this.options.container.createDiv({ cls: "hybrid-renderer-root" });
    this.canvas = this.root.createEl("canvas", { cls: "hybrid-background-canvas" });
    const svg = d3.select(this.root).append("svg").attr("class", "hybrid-interaction-svg").attr("width", "100%").attr("height", "100%");
    this.svgEdgeLayer = svg.append("g").attr("class", "svg-edge-layer");
    this.svgNodeLayer = svg.append("g").attr("class", "svg-node-layer");
    const overlayScreenLayer = svg.append("g").attr("class", "overlay-screen-layer");
    overlayScreenLayer.append("rect").attr("class", "selection-box").style("display", "none");
    const inlineEditorLayer = this.root.createDiv({ cls: "inline-editor-layer" });
    return { svg, overlayScreenLayer, inlineEditorLayer };
  }

  protected getRenderMode(): "hybrid" {
    return "hybrid";
  }

  protected draw(data: {
    doc: import("../types/mindmap").MindmapDocument;
    renderNodes: import("../types/mindmap").ProjectedNode[];
    renderEdges: import("../types/mindmap").MindmapDocument["edges"];
    transform: { x: number; y: number; k: number };
  }): { renderedNodes: number; renderedEdges: number } {
    const partition = partitionForHybridRender(data.renderNodes, data.renderEdges);
    this.canvasRenderer.render({
      canvas: this.canvas,
      nodes: partition.canvasNodes,
      edges: partition.canvasEdges,
      transform: data.transform,
    });
    this.renderSvgEdges({
      edgeLayer: this.svgEdgeLayer,
      nodes: data.renderNodes,
      edges: partition.svgEdges,
      transform: data.transform,
    });
    this.renderSvgNodes({
      nodeLayer: this.svgNodeLayer,
      doc: data.doc,
      nodes: partition.svgNodes,
      transform: data.transform,
    });
    return {
      renderedNodes: partition.svgNodes.length + partition.canvasNodes.length,
      renderedEdges: partition.svgEdges.length + partition.canvasEdges.length,
    };
  }
}
