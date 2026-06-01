import * as d3 from "d3";
import { App, Component } from "obsidian";
import type { ProjectedNode } from "../types/mindmap";
import { isUnderlineNode } from "../types/mindmap";
import type { LayoutMode } from "../types/mindmap";
import type { NotebookTargetKind } from "../types/mindmap";
import type { ViewTransform } from "../core/screen-transform";
import { screenToWorld, worldToScreen } from "../core/screen-transform";
import { getVisualSpec, type DetailVisualSpec } from "../core/detail-level";
import { getFontSizeForDepth, getObsidianBaseFontSize } from "../core/font-size";
import { cleanupNotebookPreview, renderNotebookPreview } from "./notebook-preview-renderer";
import { cleanupRenderedTextMarkdown, renderTextAsMarkdown } from "./text-markdown-renderer";
import { t } from "../i18n";
import { clampEmbeddedNotebookSize } from "../core/file-dimensions";
import {
  clampMarkdownNotebookSize,
  clampNotebookAspectRatioSize,
} from "../core/notebook-size";
import { isElementLike } from "../core/dom";
import { isEmbeddedFileNodeTargetKind } from "../core/file-node-support";
import { resolveObsidianLinkFile } from "../core/obsidian-link";
import { globalPreviewCache } from "../core/preview-cache";
import { truncateTextForNotebook, layoutDescription } from "../core/text-layout";
import { projectedNodeWorldRect } from "../core/geometry";
import { getActiveWindow } from "../core/dom";

function getEventTarget(event: unknown): EventTarget | null {
  return event instanceof Event ? event.target : null;
}

function stopEventPropagation(event: unknown): void {
  if (event instanceof Event) {
    event.stopPropagation();
  }
}

const NOTEBOOK_OPEN_BUTTON_X = 12;
const NOTEBOOK_OPEN_BUTTON_Y = 34;
const NOTEBOOK_OPEN_BUTTON_WIDTH = 52;
const NOTEBOOK_OPEN_BUTTON_HEIGHT = 20;
const NOTEBOOK_PREVIEW_X = 8;
const NOTEBOOK_PREVIEW_Y = 62;
const NOTEBOOK_PREVIEW_RIGHT_PADDING = 8;
const NOTEBOOK_PREVIEW_BOTTOM_PADDING = 20;
const EMBEDDED_FILE_PREVIEW_Y = 8;
const EMBEDDED_FILE_PREVIEW_BOTTOM_PADDING = 8;
const NOTEBOOK_RESIZE_HANDLE_SIZE = 12;
const NOTEBOOK_RESIZE_HANDLE_INSET = 8;
const BADGE_FONT_SIZE = 11;
const BADGE_LINE_HEIGHT_FACTOR = 1.27;
const NOTEBOOK_SUMMARY_TEXT_Y = 68;
const NOTEBOOK_SUMMARY_MAX_LINES = 3;
const SECONDARY_FONT_SIZE_OFFSET = -1;
const LONG_PRESS_RECONNECT_MS = 750;
const DRAG_START_DISTANCE_PX = 4;
const TEXT_NODE_CONTENT_PADDING = 10;

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
  const description: unknown = fileCache?.frontmatter?.description ?? fileCache?.frontmatter?.Description;
  const result = typeof description === "string" ? description : null;
  descriptionCache.set(cacheKey, result);
  return result;
}

export function screenDragDeltaToWorldDelta(args: { dx: number; dy: number }): { dx: number; dy: number } {
  return { dx: args.dx, dy: args.dy };
}

export function clampNotebookResizeSize(
  width: number,
  height: number,
  aspectRatio?: number,
  targetKind?: string,
  axis: "width" | "height" = "width",
): { width: number; height: number } {
  if (isEmbeddedFileNodeTargetKind(targetKind)) {
    return clampEmbeddedNotebookSize({ width, height, aspectRatio, axis });
  }

  if (aspectRatio && aspectRatio > 0) {
    return clampNotebookAspectRatioSize(width, height, aspectRatio, axis);
  }
  return clampMarkdownNotebookSize(width, height);
}

export function shouldStartNodeDrag(target: EventTarget | null): boolean {
  return !(isElementLike(target) && target.closest(".mindmap-node-open-notebook, .mindmap-node-resize-handle, .mindmap-node-tree-toggle"));
}

const TITLE_HITBOX_INSET_X = 8;
const TITLE_HITBOX_INSET_Y = 6;
const TITLE_HITBOX_MIN_HEIGHT = 32;

export function shouldStartInlineEditForDblClick(target: EventTarget | null, nodeKind: ProjectedNode["kind"]): boolean {
  if (!isElementLike(target)) return false;
  if (target.closest(".mindmap-node-open-notebook, .mindmap-node-resize-handle, .mindmap-node-tree-toggle")) return false;
  if (nodeKind === "text") return true;
  return Boolean(target.closest(".mindmap-node-title, .mindmap-node-title-hitbox"));
}

export function canInlineEditNodeTitle(node: Pick<ProjectedNode, "kind" | "notebook">): boolean {
  return node.kind !== "notebook" || !isEmbeddedFileNodeTargetKind(node.notebook?.targetKind);
}

export function canDragNodes(layoutMode: LayoutMode): boolean {
  return layoutMode === "free";
}

export function isMeaningfulNodeDrag(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= DRAG_START_DISTANCE_PX;
}

export function resolveReconnectTargetNodeId(args: {
  nodes: ProjectedNode[];
  zoom: number;
  excludedIds: Set<string>;
  point: { x: number; y: number };
}): string | undefined {
  for (const node of args.nodes) {
    if (args.excludedIds.has(node.id)) continue;
    const rect = projectedNodeWorldRect(node, args.zoom);
    if (
      args.point.x >= rect.x
      && args.point.x <= rect.x + rect.width
      && args.point.y >= rect.y
      && args.point.y <= rect.y + rect.height
    ) {
      return node.id;
    }
  }
  return undefined;
}

export function shouldRenderEmbeddedFilePreview(args: {
  kind: ProjectedNode["kind"];
  targetKind?: NotebookTargetKind;
  showPreview: boolean;
}): boolean {
  return args.kind === "notebook" && isEmbeddedFileNodeTargetKind(args.targetKind);
}

export function shouldOpenEmbeddedFileOnDoubleClick(node: Pick<ProjectedNode, "kind" | "notebook">): boolean {
  return node.kind === "notebook" && Boolean(node.notebook?.link) && isEmbeddedFileNodeTargetKind(node.notebook?.targetKind);
}

export function getNotebookPreviewFrame(args: {
  displayWidth: number;
  displayHeight: number;
  embeddedFilePreview: boolean;
}): { x: number; y: number; width: number; height: number } {
  const y = args.embeddedFilePreview ? EMBEDDED_FILE_PREVIEW_Y : NOTEBOOK_PREVIEW_Y;
  const bottomPadding = args.embeddedFilePreview
    ? EMBEDDED_FILE_PREVIEW_BOTTOM_PADDING
    : NOTEBOOK_PREVIEW_BOTTOM_PADDING;
  return {
    x: NOTEBOOK_PREVIEW_X,
    y,
    width: args.displayWidth - NOTEBOOK_PREVIEW_X - NOTEBOOK_PREVIEW_RIGHT_PADDING,
    height: args.displayHeight - y - bottomPadding,
  };
}

export function getTextNodeContentFrame(args: {
  displayWidth: number;
  displayHeight: number;
}): { x: number; y: number; width: number; height: number } {
  return {
    x: TEXT_NODE_CONTENT_PADDING,
    y: TEXT_NODE_CONTENT_PADDING,
    width: Math.max(0, args.displayWidth - TEXT_NODE_CONTENT_PADDING * 2),
    height: Math.max(0, args.displayHeight - TEXT_NODE_CONTENT_PADDING * 2),
  };
}

export function renderProjectedNodes(args: {
  app: App;
  component: Component;
  layoutMode: LayoutMode;
  nodeLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
  nodes: ProjectedNode[];
  fullProjectionNodes?: ProjectedNode[];
  transform: ViewTransform;
  sourcePath: string;
  getSelectedNodeIds: () => string[];
  getDragNodeIds: (nodeId: string, selectedIds: string[]) => string[];
  getDragRootNodeIds: (nodeId: string, selectedIds: string[]) => string[];
  onSelectNode: (id: string) => void;
  onHoverNode: (id: string) => void;
  onLeaveNode: () => void;
  onToggleTree: (id: string, expanded: boolean) => void;
  onOpenNotebook: (id: string) => void;
  onStartInlineEdit: (node: ProjectedNode, rect: { x: number; y: number; width: number; height: number; fontSize: number; isBold: boolean }) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  onBeforeNodeDragStart: (node: ProjectedNode) => void;
  onNodesMove: (args: {
    node: ProjectedNode;
    moves: Array<{ id: string; x: number; y: number }>;
    mode?: "move" | "reconnect";
    reconnectTargetNodeId?: string;
  }) => void;
  onNodeDragEnd: (args: { node: ProjectedNode; mode?: "move" | "reconnect"; dropPosition?: { x: number; y: number } }) => void;
  onReconnectPreviewChange?: (preview: {
    draggedNodeId: string;
    disconnectedRootIds: string[];
    draggedNodeIds: string[];
    pointerWorld: { x: number; y: number };
    targetNodeId?: string;
  } | null) => void;
  onNotebookResizeStart: (id: string) => void;
  onNotebookResize: (args: { id: string; width: number; height: number }) => void;
  onNotebookResizeEnd: (args: { id: string; width: number; height: number }) => void;
  onDragStateChange?: (dragging: boolean) => void;
  reconnectTargetNodeId?: string;
}): void {
  const resizeDrafts = new Map<string, { width: number; height: number; axis: "width" | "height" }>();
  const dragDrafts = new Map<string, { x: number; y: number }>();
  let activeDragNodeIds: string[] = [];
  let suppressClickForNodeId: string | null = null;
  const selection = args.nodeLayer.selectAll<SVGGElement, ProjectedNode>("g.mindmap-node").data(args.nodes, (n) => n.id);
  selection.exit().each(function () {
    const group = d3.select(this);
    cleanupRenderedTextMarkdown(group.select<SVGForeignObjectElement>("foreignObject.mindmap-node-text-foreign").node(), args.component);
    cleanupNotebookPreview(group.select<SVGForeignObjectElement>("foreignObject.mindmap-node-preview").node());
  }).remove();

  const entered = selection.enter().append("g").attr("class", "mindmap-node");
  entered.append("rect").attr("class", "mindmap-node-bg").attr("rx", 12).attr("ry", 12);
  entered.append("line").attr("class", "mindmap-node-underline").attr("stroke-linecap", "round").style("display", "none");
  entered.append("rect").attr("class", "mindmap-node-title-hitbox");
  entered.append("text").attr("class", "mindmap-node-title");
  entered.append("text").attr("class", "mindmap-node-kind-badge");
  entered.append("foreignObject").attr("class", "mindmap-node-text-foreign");
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
    .filter((event: Event) => canDragNodes(args.layoutMode) && shouldStartNodeDrag(getEventTarget(event)))
    .on("start", (event: d3.D3DragEvent<SVGGElement, ProjectedNode, ProjectedNode>, node) => {
      stopEventPropagation(event.sourceEvent);
      args.onDragStateChange?.(true);
      args.onBeforeNodeDragStart(node);

      const selectedIds = args.getSelectedNodeIds();
      activeDragNodeIds = args.getDragNodeIds(node.id, selectedIds);
      if (!selectedIds.includes(node.id)) {
        args.onSelectNode(node.id);
      }
    })
    .on("drag", (event: d3.D3DragEvent<SVGGElement, ProjectedNode, ProjectedNode>, node) => {
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
    .on("end", (_event: d3.D3DragEvent<SVGGElement, ProjectedNode, ProjectedNode>, node) => {
      dragDrafts.clear();
      activeDragNodeIds = [];
      args.onDragStateChange?.(false);
      args.onNodeDragEnd({ node, mode: "move" });
    });

  const moveDraggedNodes = (
    node: ProjectedNode,
    deltaX: number,
    deltaY: number,
    options?: { mode?: "move" | "reconnect"; reconnectTargetNodeId?: string },
  ) => {
    const movingIds = activeDragNodeIds.length > 0 ? activeDragNodeIds : [node.id];
    const projectedMap = new Map(args.nodes.map((item) => [item.id, item]));
    const delta = screenDragDeltaToWorldDelta({ dx: deltaX, dy: deltaY });

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

    args.onNodesMove({ node, moves, mode: options?.mode, reconnectTargetNodeId: options?.reconnectTargetNodeId });
  };

  const startNodeDrag = (node: ProjectedNode) => {
    args.onDragStateChange?.(true);

    let selectedIds = args.getSelectedNodeIds();
    if (!selectedIds.includes(node.id)) {
      args.onSelectNode(node.id);
      selectedIds = args.getSelectedNodeIds();
    }

    args.onBeforeNodeDragStart(node);
    activeDragNodeIds = args.getDragNodeIds(node.id, selectedIds);
  };

  const updateReconnectPreview = (node: ProjectedNode, clientX: number, clientY: number, svgRect: DOMRect) => {
    const pointerWorld = screenToWorld({ x: clientX - svgRect.left, y: clientY - svgRect.top }, args.transform);
    const selectedIds = args.getSelectedNodeIds();
    const disconnectedRootIds = args.getDragRootNodeIds(node.id, selectedIds);
    const draggedNodeIds = activeDragNodeIds.length > 0 ? activeDragNodeIds : [node.id];
    const excludedIds = new Set(draggedNodeIds);
    const targetNodeId = resolveReconnectTargetNodeId({
      nodes: args.fullProjectionNodes ?? args.nodes,
      zoom: args.transform.k,
      excludedIds,
      point: pointerWorld,
    });

    args.onReconnectPreviewChange?.({
      draggedNodeId: node.id,
      disconnectedRootIds,
      draggedNodeIds,
      pointerWorld,
      targetNodeId,
    });
  };

  const resizeBehavior = d3.drag<SVGGElement, ProjectedNode>().on("start", (event: d3.D3DragEvent<SVGGElement, ProjectedNode, ProjectedNode>, node) => {
    stopEventPropagation(event.sourceEvent);
    resizeDrafts.set(node.id, { width: node.displayWidth, height: node.displayHeight, axis: "width" });
    args.onNotebookResizeStart(node.id);
  }).on("drag", (event: d3.D3DragEvent<SVGGElement, ProjectedNode, ProjectedNode>, node) => {
    const currentDraft = resizeDrafts.get(node.id) ?? { width: node.displayWidth, height: node.displayHeight, axis: "width" as const };
    const next = clampNotebookResizeSize(
      currentDraft.width + event.dx,
      currentDraft.height + event.dy,
      node.aspectRatio,
      node.notebook?.targetKind,
      currentDraft.axis,
    );
    resizeDrafts.set(node.id, { ...next, axis: currentDraft.axis });
    args.onNotebookResize({ id: node.id, width: next.width, height: next.height });
  }).on("end", (_event: d3.D3DragEvent<SVGGElement, ProjectedNode, ProjectedNode>, node) => {
    const currentDraft = resizeDrafts.get(node.id) ?? { width: node.displayWidth, height: node.displayHeight, axis: "width" as const };
    const next = clampNotebookResizeSize(currentDraft.width, currentDraft.height, node.aspectRatio, node.notebook?.targetKind);
    resizeDrafts.delete(node.id);
    args.onNotebookResizeEnd({ id: node.id, width: next.width, height: next.height });
  });

  merged
    .on("click", (event: MouseEvent, node) => {
      if (suppressClickForNodeId === node.id) {
        suppressClickForNodeId = null;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      event.stopPropagation();

      args.onSelectNode(node.id);
    })
    .on("dblclick", (event: MouseEvent, node) => {
      if (shouldOpenEmbeddedFileOnDoubleClick(node)) {
        event.preventDefault();
        event.stopPropagation();
        args.onOpenNotebook(node.id);
        return;
      }
      if (!canInlineEditNodeTitle(node)) return;
      if (!shouldStartInlineEditForDblClick(event.target, node.kind)) return;
      event.preventDefault();
      event.stopPropagation();
      const screen = worldToScreen({ x: node.projectedX, y: node.projectedY }, args.transform);
      const fontSize = getFontSizeForDepth(node.depth, getObsidianBaseFontSize(args.nodeLayer.node()?.ownerDocument.documentElement));
      const editorHeight = node.displayHeight - 16;
      const editorY = screen.y + (node.displayHeight - editorHeight) / 2;
      args.onStartInlineEdit(node, { x: screen.x + 10, y: editorY, width: node.displayWidth - 20, height: editorHeight, fontSize, isBold: node.depth <= 1 });
    })
    .on("mouseover", (_event, node) => args.onHoverNode(node.id))
    .on("mouseleave", () => args.onLeaveNode())
    .on("contextmenu", (event: MouseEvent, node) => {
      event.preventDefault();
      event.stopPropagation();
      args.onContextMenu(node.id, event.clientX, event.clientY);
    });

  merged.on("mousedown.reconnect", function (event: MouseEvent, node) {
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    if (!shouldStartNodeDrag(event.target)) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const ownerDocument = this.ownerDocument;
    const svgRect = args.nodeLayer.node()?.ownerSVGElement?.getBoundingClientRect();
    if (!svgRect) return;

    const startClient = { x: event.clientX, y: event.clientY };
    let lastClient = startClient;
    let dragMode: "move" | "reconnect" | null = null;
    const activeWin = getActiveWindow();
    let longPressTimer: number | null = activeWin.setTimeout(() => {
      longPressTimer = null;
      dragMode = "reconnect";
      startNodeDrag(node);
      updateReconnectPreview(node, startClient.x, startClient.y, svgRect);
    }, LONG_PRESS_RECONNECT_MS);

    const stopTracking = () => {
      if (longPressTimer !== null) activeWin.clearTimeout(longPressTimer);
      ownerDocument.removeEventListener("mousemove", handleMouseMove);
      ownerDocument.removeEventListener("mouseup", handleMouseUp);
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startClient.x;
      const dy = moveEvent.clientY - startClient.y;

      if (!dragMode && isMeaningfulNodeDrag(dx, dy)) {
        if (longPressTimer !== null) {
          ownerDocument.defaultView?.clearTimeout(longPressTimer);
          longPressTimer = null;
        }
        if (canDragNodes(args.layoutMode)) {
          dragMode = "move";
          startNodeDrag(node);
        }
      }

      if (!dragMode) return;

      moveEvent.preventDefault();
      const pointerWorld = screenToWorld({ x: moveEvent.clientX - svgRect.left, y: moveEvent.clientY - svgRect.top }, args.transform);
      const reconnectTargetNodeId = dragMode === "reconnect"
        ? resolveReconnectTargetNodeId({
            nodes: args.fullProjectionNodes ?? args.nodes,
            zoom: args.transform.k,
            excludedIds: new Set(activeDragNodeIds.length > 0 ? activeDragNodeIds : [node.id]),
            point: pointerWorld,
          })
        : undefined;
      const deltaX = moveEvent.clientX - lastClient.x;
      const deltaY = moveEvent.clientY - lastClient.y;
      lastClient = { x: moveEvent.clientX, y: moveEvent.clientY };
      moveDraggedNodes(node, deltaX, deltaY, { mode: dragMode ?? undefined, reconnectTargetNodeId });
      if (dragMode === "reconnect") {
        updateReconnectPreview(node, moveEvent.clientX, moveEvent.clientY, svgRect);
      }
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      stopTracking();

      if (!dragMode) return;

      suppressClickForNodeId = node.id;
      dragDrafts.clear();
      activeDragNodeIds = [];
      args.onDragStateChange?.(false);
      args.onReconnectPreviewChange?.(null);

      const dropPosition = dragMode === "reconnect"
        ? screenToWorld({ x: upEvent.clientX - svgRect.left, y: upEvent.clientY - svgRect.top }, args.transform)
        : undefined;
      args.onNodeDragEnd({ node, mode: dragMode, dropPosition });
    };

    ownerDocument.addEventListener("mousemove", handleMouseMove);
    ownerDocument.addEventListener("mouseup", handleMouseUp);
  });

  merged.call(dragBehavior);

  merged.each(function (node) {
    const group = d3.select(this);
    const screen = worldToScreen({ x: node.projectedX, y: node.projectedY }, args.transform);
    const baseVisual = getVisualSpec(node.kind, node.detailLevel);
    const targetKind = node.notebook?.targetKind ?? "markdown";
    const nodeFontSize = getFontSizeForDepth(node.depth, getObsidianBaseFontSize(args.nodeLayer.node()?.ownerDocument.documentElement));

    if (node.branchColor) {
      group.style("--branch-color", node.branchColor);
    }
    if (node.branchColorSoft) {
      group.style("--branch-color-soft", node.branchColorSoft);
    }
    if (node.branchColorBorder) {
      group.style("--branch-color-border", node.branchColorBorder);
    }
    
    let visual: DetailVisualSpec;
    if (node.usesCustomSize && node.kind === "notebook") {
      const showPreview = node.displayHeight > 150;
      const showSummary = node.displayHeight > 66 && !showPreview;
      const showLink = node.displayHeight > 200;
      visual = {
        width: node.displayWidth,
        height: node.displayHeight,
        titleFontSize: nodeFontSize,
        fontSize: nodeFontSize + SECONDARY_FONT_SIZE_OFFSET,
        showSummary,
        showLink,
        showPreview,
      };
    } else {
      visual = { ...baseVisual, titleFontSize: nodeFontSize, fontSize: nodeFontSize + SECONDARY_FONT_SIZE_OFFSET };
    }
    
    const showEmbeddedFilePreview = shouldRenderEmbeddedFilePreview({
      kind: node.kind,
      targetKind,
      showPreview: visual.showPreview,
    });
    const showOpenNotebookButton = node.showOpenNotebookButton && !showEmbeddedFilePreview;
    const hideNotebookTextForPreview = showEmbeddedFilePreview;
    const titleHitbox = group.select<SVGRectElement>("rect.mindmap-node-title-hitbox");
    let titleHitboxHeight = TITLE_HITBOX_MIN_HEIGHT;

    group.attr("transform", `translate(${screen.x}, ${screen.y})`);
    group.attr("data-node-id", node.id);
    group.classed("is-text", node.kind === "text");
    group.classed("is-notebook", node.kind === "notebook");
    group.classed("is-root", node.isRoot);
    group.classed("is-root-or-child", node.depth <= 1);
    group.classed("is-focus", node.isFocus);
    group.classed("is-selected", node.isSelected);
    group.classed("is-reconnect-target", node.id === args.reconnectTargetNodeId);
    group.classed("is-ancestor-path", node.isAncestorPath);
    group.classed("is-search-match", Boolean(node.isSearchMatch));
    group.classed("is-missing-notebook", Boolean(node.isMissingNotebook));
    const isUnderline = isUnderlineNode(node);

    group.classed("is-underline", isUnderline);

    group.select<SVGRectElement>("rect.mindmap-node-bg")
      .attr("width", node.displayWidth)
      .attr("height", node.displayHeight)
      .style("display", isUnderline ? "none" : "");

    group.select<SVGLineElement>("line.mindmap-node-underline")
      .attr("x1", 0)
      .attr("y1", node.displayHeight - 1)
      .attr("x2", node.displayWidth)
      .attr("y2", node.displayHeight - 1)
      .style("display", isUnderline ? "" : "none");

    const titleText = group.select<SVGTextElement>("text.mindmap-node-title");
    titleText.selectAll("*").remove();
    titleText.text("");
    
    const textForeignObject = group.select<SVGForeignObjectElement>("foreignObject.mindmap-node-text-foreign");
    
    if (node.kind === "text") {
      titleText.style("display", "none");
      const textContentFrame = getTextNodeContentFrame({
        displayWidth: node.displayWidth,
        displayHeight: node.displayHeight,
      });

      textForeignObject
        .style("display", "")
        .attr("x", textContentFrame.x)
        .attr("y", textContentFrame.y)
        .attr("width", textContentFrame.width)
        .attr("height", textContentFrame.height);
      
      void renderTextAsMarkdown({
        app: args.app,
        foreignObject: textForeignObject.node(),
        markdown: node.title,
        fontSize: visual.titleFontSize,
        sourcePath: args.sourcePath,
        component: args.component,
      });
    } else if (!hideNotebookTextForPreview) {
      const truncatedTitle = truncateTextForNotebook(node.title, node.displayWidth - 24, visual.titleFontSize);
      titleText
        .style("display", "")
        .attr("x", 12)
        .attr("y", 26)
        .style("font-size", `${visual.titleFontSize}px`)
        .text(truncatedTitle);
      
      textForeignObject.style("display", "none");
      cleanupRenderedTextMarkdown(textForeignObject.node(), args.component);
      textForeignObject.selectAll("*").remove();
    } else {
      titleText.style("display", "none");
      textForeignObject.style("display", "none");
      cleanupRenderedTextMarkdown(textForeignObject.node(), args.component);
      textForeignObject.selectAll("*").remove();
    }

    titleHitbox
      .attr("x", TITLE_HITBOX_INSET_X)
      .attr("y", TITLE_HITBOX_INSET_Y)
      .attr("width", Math.max(0, node.displayWidth - TITLE_HITBOX_INSET_X * 2))
      .attr("height", titleHitboxHeight)
      .attr("rx", 8)
      .attr("ry", 8)
      .attr("fill", "currentColor")
      .attr("fill-opacity", 0.001)
      .style("pointer-events", "all")
      .style("cursor", "pointer")
      .on("click.title-hitbox", (event: MouseEvent) => {
        event.stopPropagation();
        args.onSelectNode(node.id);
      });

    const badgeText = group.select<SVGTextElement>("text.mindmap-node-kind-badge");
    badgeText.attr("x", 12).attr("y", NOTEBOOK_SUMMARY_TEXT_Y);

    if (node.kind === "notebook" && visual.showSummary && !visual.showPreview && !isEmbeddedFileNodeTargetKind(targetKind)) {
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
        badgeText.selectAll("*").remove();
        const badgeLineHeightPx = Math.round(BADGE_FONT_SIZE * BADGE_LINE_HEIGHT_FACTOR);
        const availableLines = Math.max(1, Math.floor((node.displayHeight - NOTEBOOK_SUMMARY_TEXT_Y) / badgeLineHeightPx));
        const descLines = layoutDescription({
          text: description,
          maxWidth: node.displayWidth - 24,
          fontSize: BADGE_FONT_SIZE,
          maxLines: Math.min(NOTEBOOK_SUMMARY_MAX_LINES, availableLines),
        });
        descLines.forEach((line, index) => {
          badgeText.append("tspan")
            .attr("x", 12)
            .attr("y", NOTEBOOK_SUMMARY_TEXT_Y + index * badgeLineHeightPx)
            .text(line);
        });
      } else {
        badgeText.style("display", "none");
      }
    } else {
      badgeText.style("display", "none");
    }

    group
      .select<SVGGElement>("g.mindmap-node-open-notebook")
      .style("display", showOpenNotebookButton ? "" : "none")
      .style("cursor", "pointer")
      .on("pointerdown", (event: PointerEvent) => {
        event.stopPropagation();
      })
      .on("click", (event: MouseEvent) => {
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
          .attr("x", NOTEBOOK_OPEN_BUTTON_X + NOTEBOOK_OPEN_BUTTON_WIDTH / 2)
          .attr("y", 48)
          .attr("text-anchor", "middle")
          .text(t("renderer.openMd"));
      });

    const treeToggleGroup = group
      .select<SVGGElement>("g.mindmap-node-tree-toggle")
      .style("display", node.hasChildren ? "" : "none")
      .style("cursor", "pointer")
      .on("pointerdown", (event: PointerEvent) => {
        event.stopPropagation();
      })
      .on("click", (event: MouseEvent) => {
        event.stopPropagation();
        args.onToggleTree(node.id, node.childrenExpanded);
      });

    const isLeftSide = node.treeSide === -1;
    const toggleX = isLeftSide ? -26 : node.displayWidth + 2;
    const toggleTextX = isLeftSide ? -16 : node.displayWidth + 10;

    treeToggleGroup
      .select<SVGRectElement>("rect.mindmap-node-tree-toggle-hitbox")
      .attr("x", toggleX)
      .attr("y", node.displayHeight / 2 - 10)
      .attr("width", 24)
      .attr("height", 24)
      .attr("rx", 6)
      .attr("ry", 6)
      .attr("fill", "transparent");

    treeToggleGroup
      .select<SVGTextElement>("text.mindmap-node-tree-toggle-text")
      .attr("x", toggleTextX)
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
      .on("pointerdown", (event: PointerEvent) => {
        event.stopPropagation();
      })
      .on("click", (event: MouseEvent) => {
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
    if (node.kind === "notebook" && node.notebook?.link && (visual.showPreview || showEmbeddedFilePreview)) {
      const previewFrame = getNotebookPreviewFrame({
        displayWidth: node.displayWidth,
        displayHeight: node.displayHeight,
        embeddedFilePreview: showEmbeddedFilePreview,
      });
      preview
        .style("display", "")
        .style("pointer-events", showEmbeddedFilePreview ? "none" : "auto")
        .attr("x", previewFrame.x)
        .attr("y", previewFrame.y)
        .attr("width", previewFrame.width)
        .attr("height", previewFrame.height);
      void renderNotebookPreview({
        app: args.app,
        foreignObject: preview.node(),
        link: node.notebook.link,
        sourcePath: args.sourcePath,
        storedPath: node.notebook.path,
        targetKind,
        previewWidth: previewFrame.width,
        previewHeight: previewFrame.height,
        component: args.component,
      });
    } else {
      preview.style("display", "none");
      cleanupNotebookPreview(preview.node());
    }

    // Keep controls above foreignObject previews so embedded files do not block clicks/drags.
    treeToggleGroup.raise();
    resizeHandleGroup.raise();
    group.select<SVGGElement>("g.mindmap-node-open-notebook").raise();
  });
}
