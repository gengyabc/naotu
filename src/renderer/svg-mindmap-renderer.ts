import * as d3 from "d3";
import { SharedMindmapRendererBase, type MindmapRendererOptions } from "./shared-mindmap-renderer-base";

export class SvgMindmapRenderer extends SharedMindmapRendererBase {
  private edgeWorldLayer!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private nodeScreenLayer!: d3.Selection<SVGGElement, unknown, null, undefined>;
  constructor(options: MindmapRendererOptions) {
    super(options);
  }

  protected createScene() {
    const svg = d3.select(this.options.container).append("svg").attr("class", "semantic-mindmap-svg").attr("width", "100%").attr("height", "100%");
    this.edgeWorldLayer = svg.append("g").attr("class", "edge-world-layer");
    this.nodeScreenLayer = svg.append("g").attr("class", "node-screen-layer");
    const overlayScreenLayer = svg.append("g").attr("class", "overlay-screen-layer");
    overlayScreenLayer.append("rect").attr("class", "selection-box").style("display", "none");
    const inlineEditorLayer = this.options.container.createDiv({ cls: "inline-editor-layer" });
    return { svg, overlayScreenLayer, inlineEditorLayer };
  }

  protected getRenderMode(): "svg" {
    return "svg";
  }

  protected draw(data: {
    doc: import("../types/mindmap").MindmapDocument;
    renderNodes: import("../types/mindmap").ProjectedNode[];
    renderEdges: import("../types/mindmap").MindmapDocument["edges"];
    transform: { x: number; y: number; k: number };
  }): { renderedNodes: number; renderedEdges: number } {
    this.renderSvgEdges({
      edgeLayer: this.edgeWorldLayer,
      nodes: data.renderNodes,
      edges: data.renderEdges,
      transform: data.transform,
    });
    this.renderSvgNodes({
      nodeLayer: this.nodeScreenLayer,
      doc: data.doc,
      nodes: data.renderNodes,
      transform: data.transform,
    });
    return { renderedNodes: data.renderNodes.length, renderedEdges: data.renderEdges.length };
  }
}
