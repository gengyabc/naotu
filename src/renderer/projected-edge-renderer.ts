import * as d3 from "d3";
import { routeEdge } from "../core/edge-routing";
import type { ProjectedEdge, ProjectedNode } from "../types/mindmap";

export function renderProjectedEdges(args: {
  edgeLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
  nodes: ProjectedNode[];
  edges: ProjectedEdge[];
  onEdgeContextMenu?: (id: string, x: number, y: number) => void;
}): void {
  const nodeMap = new Map(args.nodes.map((node) => [node.id, node]));

  const selection = args.edgeLayer
    .selectAll<SVGPathElement, ProjectedEdge>("path.mindmap-edge")
    .data(args.edges, (edge) => edge.id);

  selection.exit().remove();
  const entered = selection.enter().append("path").attr("class", "mindmap-edge");

  entered
    .merge(selection)
    .classed("mindmap-edge-mindmap", (edge) => edge.relation === "mindmap")
    .classed("mindmap-edge-reference", (edge) => edge.relation === "reference")
    .attr("fill", "none")
    .attr("d", (edge) => {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) return "";
      return routeEdge({ edge, source, target }).d;
    })
    .on("contextmenu", (event, edge) => {
      event.preventDefault();
      event.stopPropagation();
      args.onEdgeContextMenu?.(edge.id, event.clientX, event.clientY);
    });
}
