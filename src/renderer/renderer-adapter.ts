export interface RendererAdapter {
  mount(): void;
  unmount(): void;
  render(): void;

  focusNode(nodeId: string): void;
  setLastFocusNodeId(nodeId: string): void;
  forceDetailLevel(nodeId: string, level: number): void;

  setSearchResultIds(ids: Set<string>): void;
  setConnectionState(state: { enabled: boolean; sourceId?: string }): void;
}
