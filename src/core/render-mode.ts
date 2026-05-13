import type { SemanticMindmapSettings } from "../types/settings";

export type RenderMode = "svg" | "hybrid";

export interface RenderModeContext {
  nodeCount: number;
  edgeCount: number;
  settings: SemanticMindmapSettings;
  averageRenderDurationMs?: number;
}

export function chooseRenderMode(args: RenderModeContext): RenderMode {
  // 如果检测到卡顿（平均渲染耗时 > 32ms），自动切换到 hybrid 模式
  if (args.averageRenderDurationMs !== undefined && args.averageRenderDurationMs > 32) {
    return "hybrid";
  }

  // 基于节点数的启发式策略：节点数超过阈值时切换到 hybrid
  const HYBRID_NODE_THRESHOLD = 1200;
  if (args.nodeCount >= HYBRID_NODE_THRESHOLD) {
    return "hybrid";
  }

  return "svg";
}
