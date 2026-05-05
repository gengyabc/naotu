export class DebugOverlay {
  private el: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.el = container.createDiv({ cls: "mindmap-debug-overlay" });
  }

  update(info: {
    zoom: number;
    totalNodes: number;
    renderedNodes: number;
    totalEdges: number;
    renderedEdges: number;
  }): void {
    this.el.setText(
      `zoom ${info.zoom.toFixed(2)} | nodes ${info.renderedNodes}/${info.totalNodes} | edges ${info.renderedEdges}/${info.totalEdges}`,
    );
  }

  remove(): void {
    this.el.remove();
  }
}
