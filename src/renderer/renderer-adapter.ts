import type { ProjectedNode, Rect } from "../types/mindmap";

export interface RendererAdapter {
  mount(): void;
  unmount(): void;
  render(): void;

  focusNode(nodeId: string): void;
  setLastFocusNodeId(nodeId: string): void;
  forceDetailLevel(nodeId: string, level: number): void;

  setSearchResultIds(ids: Set<string>): void;
  setConnectionState(state: { enabled: boolean; sourceId?: string }): void;

  setMissingNotebookNodeIds?(ids: Set<string>): void;
  getLastProjectedNodes?(): ProjectedNode[];
  startInlineEditByNodeId?(nodeId: string): void;
  zoomBy?(factor: number): void;
  handleZoomInput?(factor: number): boolean;
  fitRoot?(): void;
  jumpToWorldPoint?(x: number, y: number): void;
  getViewportWorldRect?(): Rect;
}
