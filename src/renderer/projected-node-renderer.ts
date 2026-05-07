import * as d3 from "d3";
import { App } from "obsidian";
import type { ProjectedNode } from "../types/mindmap";
import type { LayoutMode } from "../types/mindmap";
import type { ViewTransform } from "../core/screen-transform";
import { worldToScreen } from "../core/screen-transform";
import { getVisualSpec } from "../core/detail-level";
import { renderNotebookPreview } from "./notebook-preview-renderer";
import { NOTEBOOK_MIN_CUSTOM_HEIGHT, NOTEBOOK_MIN_CUSTOM_WIDTH } from "../core/notebook-size";
import { resolveObsidianLinkFile } from "../core/obsidian-link";
import { globalPreviewCache } from "../core/preview-cache";
import { layoutText } from "../core/text-layout";

const NOTEBOOK_OPEN_BUTTON_X = 12;
const NOTEBOOK_OPEN_BUTTON_Y = 34;
const NOTEBOOK_OPEN_BUTTON_WIDTH = 78;
const NOTEBOOK_OPEN_BUTTON_HEIGHT = 20;
const NOTEBOOK_PREVIEW_X = 8;
const NOTEBOOK_PREVIEW_Y = 62;
const NOTEBOOK_PREVIEW_RIGHT_PADDING = 8;
const NOTEBOOK_PREVIEW_BOTTOM_PADDING = 20;
const NOTEBOOK_RESIZE_HANDLE_SIZE = 12;
const NOTEBOOK_RESIZE_HANDLE_INSET = 8;

const descriptionCache = new Map<string, string | null>();
let descriptionCacheVersion = -1;

function getNotebookDescription(args: {
  app: App;
  link: string;
  sourcePath: string;
  storedPath?: string;
}): string | null {
  const version = globalPreviewCache.getVersion();
  if (descriptionCacheVersion !== version) {
    descriptionCache.clear();
    descriptionCacheVersion = version;
  }

  const file = resolveObsidianLinkFile({
    app: args.app,
    link: args.link,
    sourcePath: args.sourcePath,
    storedPath: args.storedPath,
  });
  if (!file) return null;

  const cacheKey = file.path;
  const cached = descriptionCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const fileCache = args.app.metadataCache.getFileCache(file);
  const description = fileCache?.frontmatter?.description;
  const result = typeof description === "string" ? description : null;
  descriptionCache.set(cacheKey, result);
  return result;
}

function truncateDescription(text: string, maxWidth: number): string {
  const avgCharWidth = 8;
  const maxChars = Math.floor((maxWidth - 12) / avgCharWidth);
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars - 1) + "...";
}

export function screenDragDeltaToWorldDelta(args: { dx: number; dy: number }): { dx: number; dy: number } {
  return { dx: args.dx, dy: args.dy };
}

export function clampNotebookResizeSize(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.max(NOTEBOOK_MIN_CUSTOM_WIDTH, Math.round(width)),
    height: Math.max(NOTEBOOK_MIN_CUSTOM_HEIGHT, Math.round(height)),
  };
}

export function shouldStartNodeDrag(target: EventTarget | null): boolean {
  const elementTarget = target as unknown as { closest?: (selector: string) => unknown } | null;
  return !(typeof elementTarget?.closest === "function" &&
    elementTarget.closest(".mindmap-node-open-notebook, .mindmap-node-resize-handle, .mindmap-node-tree-toggle"));
}

export function shouldStartInlineTitleEdit(target: EventTarget | null): boolean {
  const elementTarget = target as unknown as { closest?: (selector: string) => unknown } | null;
  if (typeof elementTarget?.closest !== "function") return false;
  if (elementTarget.closest(".mindmap-node-open-notebook, .mindmap-node-resize-handle, .mindmap-node-tree-toggle")) return false;
  return Boolean(elementTarget.closest(".mindmap-node"));
}

export function canDragNodes(layoutMode: LayoutMode): boolean {
  return layoutMode === "free";
}

export function renderProjectedNodes(args: {
  app: App;
  layoutMode: LayoutMode;
  nodeLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
  nodes: ProjectedNode[];
  transform: ViewTransform;
  sourcePath: string;
  getSelectedNodeIds: () => string[];
  getDragNodeIds: (nodeId: string, selectedIds: string[]) => string[];
  onSelectNode: (id: string, mode: "replace" | "toggle" | "add") => void;
  onHoverNode: (id: string) => void;
  onLeaveNode: () => void;
  onToggleTree: (id: string, expanded: boolean) => void;
  onOpenNotebook: (id: string) => void;
  onStartInlineEdit: (node: ProjectedNode, rect: { x: number; y: number; width: number; height: number }) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  onBeforeNodeDragStart: (node: ProjectedNode) => void;
  onNodesMove: (args: { node: ProjectedNode; moves: Array<{ id: string; x: number; y: number }> }) => void;
  onNodeDragEnd: (args: { node: ProjectedNode }) => void;
  onNotebookResizeStart: (id: string) => void;
  onNotebookResize: (args: { id: string; width: number; height: number }) => void;
  onNotebookResizeEnd: (args: { id: string; width: number; height: number }) => void;
  onDragStateChange?: (dragging: boolean) => void;
}): void {
  const resizeDrafts = new Map<string, { width: number; height: number }>();
  const dragDrafts = new Map<string, { x: number; y: number }>();
  let activeDragNodeIds: string[] = [];
  const selection = args.nodeLayer.selectAll<SVGGElement, ProjectedNode>("g.mindmap-node").data(args.nodes, (n) => n.id);
  selection.exit().remove();

  const entered = selection.enter().append("g").attr("class", "mindmap-node");
  entered.append("rect").attr("class", "mindmap-node-bg").attr("rx", 12).attr("ry", 12);
  entered.append("text").attr("class", "mindmap-node-title");
  entered.append("text").attr("class", "mindmap-node-kind-badge");
  const openNotebook = entered.append("g").attr("class", "mindmap-node-open-notebook");
  openNotebook.append("rect").attr("class", "mindmap-node-open-notebook-bg").attr("rx", 10).attr("ry", 10);
  openNotebook.append("text").attr("class", "mindmap-node-open-notebook-text");
  const treeToggle = entered.append("g").attr("class", "mindmap-node-tree-toggle");
  treeToggle.append("rect").attr("class", "mindmap-node-tree-toggle-hitbox");
  treeToggle.append("text").attr("class", "mindmap-node-tree-toggle-text");
  const resizeHandle = entered.append("g").attr("class", "mindmap-node-resize-handle");
  resizeHandle.append("rect").attr("class", "mindmap-node-resize-hitbox");
  resizeHandle.append("path").attr("class", "mindmap-node-resize-icon");
  entered.append("foreignObject").attr("class", "mindmap-node-preview").style("display", "none");

  const merged = entered.merge(selection);

  const dragBehavior = d3
    .drag<SVGGElement, ProjectedNode>()
    .filter((event) => canDragNodes(args.layoutMode) && shouldStartNodeDrag(event.target))
    .on("start", (event, node) => {
      event.sourceEvent?.stopPropagation();
      args.onDragStateChange?.(true);
      args.onBeforeNodeDragStart(node);

      const selectedIds = args.getSelectedNodeIds();
      activeDragNodeIds = args.getDragNodeIds(node.id, selectedIds);
      if (!selectedIds.includes(node.id)) {
        args.onSelectNode(node.id, "replace");
      }
    })
    .on("drag", (event, node) => {
      const movingIds = activeDragNodeIds.length > 0 ? activeDragNodeIds : [node.id];
      const projectedMap = new Map(args.nodes.map((item) => [item.id, item]));
      const delta = screenDragDeltaToWorldDelta({ dx: event.dx, dy: event.dy });

      const moves = movingIds
        .map((id) => {
          const item = projectedMap.get(id);
          if (!item) return null;
          const base = dragDrafts.get(id) ?? { x: item.worldX, y: item.worldY };
          const next = { id, x: base.x + delta.dx, y: base.y + delta.dy };
          dragDrafts.set(id, { x: next.x, y: next.y });
          return next;
        })
        .filter(Boolean) as Array<{ id: string; x: number; y: number }>;

      args.onNodesMove({ node, moves });
    })
    .on("end", (_event, node) => {
      dragDrafts.clear();
      activeDragNodeIds = [];
      args.onDragStateChange?.(false);
      args.onNodeDragEnd({ node });
    });

  const resizeBehavior = d3.drag<SVGGElement, ProjectedNode>().on("start", (event, node) => {
    event.sourceEvent?.stopPropagation();
    resizeDrafts.set(node.id, { width: node.displayWidth, height: node.displayHeight });
    args.onNotebookResizeStart(node.id);
  }).on("drag", (event, node) => {
    const currentDraft = resizeDrafts.get(node.id) ?? { width: node.displayWidth, height: node.displayHeight };
    const next = clampNotebookResizeSize(currentDraft.width + event.dx, currentDraft.height + event.dy);
    resizeDrafts.set(node.id, next);
    args.onNotebookResize({ id: node.id, width: next.width, height: next.height });
  }).on("end", (event, node) => {
    const currentDraft = resizeDrafts.get(node.id) ?? { width: node.displayWidth, height: node.displayHeight };
    const next = clampNotebookResizeSize(currentDraft.width, currentDraft.height);
    resizeDrafts.delete(node.id);
    args.onNotebookResizeEnd({ id: node.id, width: next.width, height: next.height });
  });

  merged
    .on("click", (event, node) => {
      event.stopPropagation();
      if (event.detail >= 2 && shouldStartInlineTitleEdit(event.target)) {
        event.preventDefault();
        const screen = worldToScreen({ x: node.projectedX, y: node.projectedY }, args.transform);
        args.onStartInlineEdit(node, { x: screen.x + 10, y: screen.y + 8, width: node.displayWidth - 20, height: 28 });
        return;
      }

      if (event.metaKey || event.ctrlKey) args.onSelectNode(node.id, "toggle");
      else if (event.shiftKey) args.onSelectNode(node.id, "add");
      else args.onSelectNode(node.id, "replace");
    })
    .on("dblclick", (event) => {
      if (!shouldStartInlineTitleEdit(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
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

    const titleText = group.select<SVGTextElement>("text.mindmap-node-title");
    titleText.selectAll("*").remove();
    titleText.text("");
    
    if (node.kind === "text") {
      const textLayout = layoutText({
        text: node.title,
        fontSize: visual.titleFontSize,
      });
      
      const lineHeight = visual.titleFontSize * 1.4;
      const startY = textLayout.lines.length === 1 ? 26 : 18;
      
      titleText
        .attr("x", 12)
        .attr("y", startY)
        .style("font-size", `${visual.titleFontSize}px`);
      
      textLayout.lines.forEach((line, index) => {
        titleText.append("tspan")
          .attr("x", 12)
          .attr("y", startY + index * lineHeight)
          .style("pointer-events", "auto")
          .text(line);
      });
    } else {
      titleText
        .attr("x", 12)
        .attr("y", 26)
        .style("font-size", `${visual.titleFontSize}px`)
        .text(node.title);
    }

    const badgeText = group.select<SVGTextElement>("text.mindmap-node-kind-badge");
    badgeText.attr("x", 12).attr("y", 48);

    if (node.kind === "notebook" && node.detailLevel >= 2 && node.detailLevel < 4) {
      badgeText.style("display", "");
      const description = node.notebook?.link
        ? getNotebookDescription({
            app: args.app,
            link: node.notebook.link,
            sourcePath: args.sourcePath,
            storedPath: node.notebook.path,
          })
        : null;
      if (description) {
        badgeText.text(truncateDescription(description, node.displayWidth));
      } else {
        badgeText.style("display", "none");
      }
    } else {
      badgeText.style("display", "none");
    }

    group
      .select<SVGGElement>("g.mindmap-node-open-notebook")
      .style("display", node.showOpenNotebookButton ? "" : "none")
      .style("cursor", "pointer")
      .on("pointerdown", (event) => {
        event.stopPropagation();
      })
      .on("click", (event) => {
        event.stopPropagation();
        args.onOpenNotebook(node.id);
      })
      .call((openGroup) => {
        openGroup
          .select<SVGRectElement>("rect.mindmap-node-open-notebook-bg")
          .attr("x", NOTEBOOK_OPEN_BUTTON_X)
          .attr("y", NOTEBOOK_OPEN_BUTTON_Y)
          .attr("width", NOTEBOOK_OPEN_BUTTON_WIDTH)
          .attr("height", NOTEBOOK_OPEN_BUTTON_HEIGHT);

        openGroup
          .select<SVGTextElement>("text.mindmap-node-open-notebook-text")
          .attr("x", 24)
          .attr("y", 48)
          .text("Open md");
      });

    const treeToggleGroup = group
      .select<SVGGElement>("g.mindmap-node-tree-toggle")
      .style("display", node.hasChildren ? "" : "none")
      .style("cursor", "pointer")
      .on("pointerdown", (event) => {
        event.stopPropagation();
      })
      .on("click", (event) => {
        event.stopPropagation();
        args.onToggleTree(node.id, node.childrenExpanded);
      });

    treeToggleGroup
      .select<SVGRectElement>("rect.mindmap-node-tree-toggle-hitbox")
      .attr("x", node.displayWidth + 2)
      .attr("y", node.displayHeight / 2 - 10)
      .attr("width", 24)
      .attr("height", 24)
      .attr("rx", 6)
      .attr("ry", 6)
      .attr("fill", "transparent");

    treeToggleGroup
      .select<SVGTextElement>("text.mindmap-node-tree-toggle-text")
      .attr("x", node.displayWidth + 10)
      .attr("y", node.displayHeight / 2 + 6)
      .text(node.childrenExpanded ? "−" : "+");

    const resizeHandleGroup = group.select<SVGGElement>("g.mindmap-node-resize-handle") as d3.Selection<
      SVGGElement,
      ProjectedNode,
      null,
      undefined
    >;
    resizeHandleGroup
      .attr(
        "transform",
        `translate(${node.displayWidth - NOTEBOOK_RESIZE_HANDLE_SIZE - NOTEBOOK_RESIZE_HANDLE_INSET}, ${node.displayHeight - NOTEBOOK_RESIZE_HANDLE_SIZE - NOTEBOOK_RESIZE_HANDLE_INSET})`,
      )
      .style("display", node.showResizeHandle ? "" : "none")
      .on("pointerdown", (event) => {
        event.stopPropagation();
      })
      .on("click", (event) => {
        event.stopPropagation();
      })
      .call(resizeBehavior)
      .call((handleGroup) => {
        handleGroup
          .select<SVGRectElement>("rect.mindmap-node-resize-hitbox")
          .attr("x", -4)
          .attr("y", -4)
          .attr("width", 20)
          .attr("height", 20)
          .attr("fill", "transparent");

        handleGroup
          .select<SVGPathElement>("path.mindmap-node-resize-icon")
          .attr("d", "M2 10 L10 2 M5 12 L12 5 M8 12 L12 8");
      });

    const preview = group.select<SVGForeignObjectElement>("foreignObject.mindmap-node-preview");
    if (node.kind === "notebook" && visual.showPreview && node.notebook?.link) {
      preview
        .style("display", "")
        .attr("x", NOTEBOOK_PREVIEW_X)
        .attr("y", NOTEBOOK_PREVIEW_Y)
        .attr("width", node.displayWidth - NOTEBOOK_PREVIEW_X - NOTEBOOK_PREVIEW_RIGHT_PADDING)
        .attr("height", node.displayHeight - NOTEBOOK_PREVIEW_Y - NOTEBOOK_PREVIEW_BOTTOM_PADDING);
      void renderNotebookPreview({
        app: args.app,
        foreignObject: preview.node(),
        link: node.notebook.link,
        sourcePath: args.sourcePath,
        storedPath: node.notebook.path,
      });
    } else {
      preview.style("display", "none");
    }
  });
}
