import * as d3 from "d3";

export function renderDoubleDownIcon(group: d3.Selection<SVGGElement, unknown, null, undefined>): void {
  const paths = group.selectAll<SVGPathElement, number>("path").data([0, 1]);
  paths.exit().remove();

  paths
    .enter()
    .append("path")
    .merge(paths)
    .attr("d", "M 0 0 L 8 8 L 16 0")
    .attr("transform", (d) => `translate(0, ${d * 7})`)
    .attr("fill", "none")
    .attr("stroke", "currentColor")
    .attr("stroke-width", 2)
    .attr("stroke-linecap", "round")
    .attr("stroke-linejoin", "round");
}
