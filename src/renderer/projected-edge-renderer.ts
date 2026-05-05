import * as d3 from "d3";
import type { ProjectedEdge, ProjectedNode } from "../types/mindmap";

export function renderProjectedEdges(args: {
  edgeLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
  nodes: ProjectedNode[];
  edges: ProjectedEdge[];
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

      const sx = source.projectedX + source.displayWidth / 2;
      const sy = source.projectedY + source.displayHeight / 2;
      const tx = target.projectedX + target.displayWidth / 2;
      const ty = target.projectedY + target.displayHeight / 2;

      if (edge.type === "line") return `M ${sx} ${sy} L ${tx} ${ty}`;

      const mx = (sx + tx) / 2;
      return `M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`;
    });
}
