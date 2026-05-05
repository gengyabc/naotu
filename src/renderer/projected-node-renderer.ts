import * as d3 from "d3";
import { App } from "obsidian";
import type { ProjectedNode } from "../types/mindmap";
import type { ViewTransform } from "../core/screen-transform";
import { worldToScreen } from "../core/screen-transform";
import { getVisualSpec } from "../core/detail-level";
import { renderNotebookPreview } from "./notebook-preview-renderer";
import { renderDoubleDownIcon } from "./icons";

export function renderProjectedNodes(args: {
  app: App;
  nodeLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
  nodes: ProjectedNode[];
  transform: ViewTransform;
  sourcePath: string;
  getSelectedNodeIds: () => string[];
  onSelectNode: (id: string, mode: "replace" | "toggle" | "add") => void;
  onHoverNode: (id: string) => void;
  onLeaveNode: () => void;
  onToggleTree: (id: string) => void;
  onNotebookExpand: (id: string) => void;
  onStartInlineEdit: (node: ProjectedNode, rect: { x: number; y: number; width: number; height: number }) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  onBeforeNodeDragStart: () => void;
  onNodesMove: (moves: Array<{ id: string; x: number; y: number }>) => void;
  onNodeDragEnd: () => void;
  onDragStateChange?: (dragging: boolean) => void;
}): void {
  const selection = args.nodeLayer.selectAll<SVGGElement, ProjectedNode>("g.mindmap-node").data(args.nodes, (n) => n.id);
  selection.exit().remove();

  const entered = selection.enter().append("g").attr("class", "mindmap-node");
  entered.append("rect").attr("class", "mindmap-node-bg").attr("rx", 12).attr("ry", 12);
  entered.append("text").attr("class", "mindmap-node-title");
  entered.append("text").attr("class", "mindmap-node-kind-badge");
  entered.append("text").attr("class", "mindmap-node-tree-toggle");
  entered.append("g").attr("class", "mindmap-node-notebook-expand");
  entered.append("foreignObject").attr("class", "mindmap-node-preview").style("display", "none");

  const merged = entered.merge(selection);

  const dragBehavior = d3
    .drag<SVGGElement, ProjectedNode>()
    .on("start", (event, node) => {
      event.sourceEvent?.stopPropagation();
      args.onDragStateChange?.(true);
      args.onBeforeNodeDragStart();

      const selectedIds = args.getSelectedNodeIds();
      if (!selectedIds.includes(node.id)) {
        args.onSelectNode(node.id, "replace");
      }
    })
    .on("drag", (event, node) => {
      const selectedIds = args.getSelectedNodeIds();
      const movingIds = selectedIds.includes(node.id) ? selectedIds : [node.id];
      const projectedMap = new Map(args.nodes.map((item) => [item.id, item]));
      const dxWorld = event.dx / args.transform.k;
      const dyWorld = event.dy / args.transform.k;

      const moves = movingIds
        .map((id) => {
          const item = projectedMap.get(id);
          if (!item) return null;
          return { id, x: item.worldX + dxWorld, y: item.worldY + dyWorld };
        })
        .filter(Boolean) as Array<{ id: string; x: number; y: number }>;

      args.onNodesMove(moves);
    })
    .on("end", () => {
      args.onDragStateChange?.(false);
      args.onNodeDragEnd();
    });

  merged
    .on("click", (event, node) => {
      event.stopPropagation();
      if (event.metaKey || event.ctrlKey) args.onSelectNode(node.id, "toggle");
      else if (event.shiftKey) args.onSelectNode(node.id, "add");
      else args.onSelectNode(node.id, "replace");
    })
    .on("mouseover", (_event, node) => args.onHoverNode(node.id))
    .on("mouseleave", () => args.onLeaveNode())
    .on("contextmenu", (event, node) => {
      event.preventDefault();
      event.stopPropagation();
      args.onContextMenu(node.id, event.clientX, event.clientY);
    });

  merged.call(dragBehavior);

  merged.each(function (node) {
    const group = d3.select(this);
    const screen = worldToScreen({ x: node.projectedX, y: node.projectedY }, args.transform);
    const visual = getVisualSpec(node.kind, node.detailLevel);

    group.attr("transform", `translate(${screen.x}, ${screen.y})`);
    group.classed("is-text", node.kind === "text");
    group.classed("is-notebook", node.kind === "notebook");
    group.classed("is-focus", node.isFocus);
    group.classed("is-selected", node.isSelected);
    group.classed("is-ancestor-path", node.isAncestorPath);
    group.classed("is-search-match", Boolean(node.isSearchMatch));
    group.classed("is-connection-source", Boolean(node.isConnectionSource));
    group.classed("is-missing-notebook", Boolean(node.isMissingNotebook));

    group.select<SVGRectElement>("rect.mindmap-node-bg").attr("width", node.displayWidth).attr("height", node.displayHeight);

    group
      .select<SVGTextElement>("text.mindmap-node-title")
      .attr("x", 12)
      .attr("y", 26)
      .style("font-size", `${visual.titleFontSize}px`)
      .text(node.title)
      .on("dblclick", (event) => {
        event.stopPropagation();
        args.onStartInlineEdit(node, { x: screen.x + 10, y: screen.y + 8, width: node.displayWidth - 20, height: 28 });
      });

    group
      .select<SVGTextElement>("text.mindmap-node-kind-badge")
      .attr("x", 12)
      .attr("y", 48)
      .style("display", node.kind === "notebook" && node.detailLevel >= 2 ? "" : "none")
      .text("notebook");

    group
      .select<SVGTextElement>("text.mindmap-node-tree-toggle")
      .attr("x", node.displayWidth + 10)
      .attr("y", node.displayHeight / 2 + 6)
      .style("display", node.hasChildren ? "" : "none")
      .text(node.childrenExpanded ? "−" : "+")
      .on("click", (event) => {
        event.stopPropagation();
        args.onToggleTree(node.id);
      });

    const iconGroup = group
      .select<SVGGElement>("g.mindmap-node-notebook-expand")
      .attr("transform", `translate(${node.displayWidth / 2 - 8}, ${node.displayHeight + 8})`)
      .style("display", node.showNotebookExpandButton ? "" : "none")
      .style("cursor", "pointer")
      .on("click", (event) => {
        event.stopPropagation();
        args.onNotebookExpand(node.id);
      });
    renderDoubleDownIcon(iconGroup as d3.Selection<SVGGElement, unknown, null, undefined>);

    const preview = group.select<SVGForeignObjectElement>("foreignObject.mindmap-node-preview");
    if (node.kind === "notebook" && visual.showPreview && node.notebook?.link) {
      preview.style("display", "").attr("x", 8).attr("y", 72).attr("width", node.displayWidth - 16).attr("height", node.displayHeight - 80);
      void renderNotebookPreview({ app: args.app, foreignObject: preview.node(), link: node.notebook.link, sourcePath: args.sourcePath });
    } else {
      preview.style("display", "none");
    }
  });
}
