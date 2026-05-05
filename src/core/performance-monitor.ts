export interface RenderPerformanceSample {
  timestamp: number;
  durationMs: number;
  nodeCount: number;
  edgeCount: number;
  renderedNodeCount: number;
  renderedEdgeCount: number;
  mode: "svg" | "hybrid";
}

export class PerformanceMonitor {
  private samples: RenderPerformanceSample[] = [];

  constructor(private maxSamples = 120) {}

  measure<T>(
    sampleBase: Omit<RenderPerformanceSample, "timestamp" | "durationMs">,
    fn: () => T,
  ): T {
    const start = performance.now();
    const result = fn();
    const durationMs = performance.now() - start;
    this.push({ ...sampleBase, timestamp: Date.now(), durationMs });
    return result;
  }

  push(sample: RenderPerformanceSample): void {
    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) this.samples.shift();
  }

  getLastSample(): RenderPerformanceSample | null {
    return this.samples[this.samples.length - 1] ?? null;
  }

  getAverageDuration(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((sum, sample) => sum + sample.durationMs, 0) / this.samples.length;
  }

  isSlow(): boolean {
    return this.getAverageDuration() > 32;
  }
}
