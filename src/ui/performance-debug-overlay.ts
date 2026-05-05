import type { RenderPerformanceSample } from "../core/performance-monitor";

export class PerformanceDebugOverlay {
  private el: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.el = container.createDiv({ cls: "mindmap-performance-debug-overlay" });
  }

  update(args: {
    sample: RenderPerformanceSample | null;
    averageDuration: number;
    isSlow: boolean;
  }): void {
    const sample = args.sample;
    if (!sample) {
      this.el.setText("No render stats");
      return;
    }

    this.el.setText(
      [
        `mode: ${sample.mode}`,
        `render: ${sample.durationMs.toFixed(1)}ms`,
        `avg: ${args.averageDuration.toFixed(1)}ms`,
        `nodes: ${sample.renderedNodeCount}/${sample.nodeCount}`,
        `edges: ${sample.renderedEdgeCount}/${sample.edgeCount}`,
        args.isSlow ? "slow" : "ok",
      ].join(" | "),
    );
  }

  remove(): void {
    this.el.remove();
  }
}
