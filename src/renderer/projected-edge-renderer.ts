import * as d3 from "d3";
import { worldToScreen } from "../core/screen-transform";
import type { ViewTransform } from "../core/screen-transform";
import { routeEdge } from "../core/edge-routing";
import type { ProjectedEdge, ProjectedNode } from "../types/mindmap";

export function renderProjectedEdges(args: {
  edgeLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
  nodes: ProjectedNode[];
  edges: ProjectedEdge[];
  transform: ViewTransform;
  onEdgeContextMenu?: (id: string, x: number, y: number) => void;
}): void {
  const nodeMap = new Map(
    args.nodes.map((node) => {
      const screen = worldToScreen({ x: node.projectedX, y: node.projectedY }, args.transform);
      return [node.id, { ...node, projectedX: screen.x, projectedY: screen.y }];
    }),
  );

  const selection = args.edgeLayer
    .selectAll<SVGPathElement, ProjectedEdge>("path.mindmap-edge")
    .data(args.edges, (edge) => edge.id);

  selection.exit().remove();
  const entered = selection.enter().append("path").attr("class", "mindmap-edge");

  entered
    .merge(selection)
    .classed("mindmap-edge-mindmap", (edge) => edge.relation === "mindmap")
    .classed("mindmap-edge-reference", (edge) => edge.relation === "reference")
    .classed("mindmap-edge-from-root", (edge) => edge.isFromRoot === true)
    .attr("fill", "none")
    .attr("d", (edge) => {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) return "";
      return routeEdge({ edge, source, target }).d;
    })
    .each(function (edge) {
      const pathEl = d3.select(this);
      if (edge.branchColor) {
        pathEl.style("--branch-color", edge.branchColor);
      }
      if (edge.branchColorBorder) {
        pathEl.style("--branch-color-border", edge.branchColorBorder);
      }
    })
    .on("contextmenu", (event: MouseEvent, edge) => {
      event.preventDefault();
      event.stopPropagation();
      args.onEdgeContextMenu?.(edge.id, event.clientX, event.clientY);
    });
}
