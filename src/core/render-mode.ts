import type { SemanticMindmapSettings } from "../types/settings";

export type RenderMode = "svg" | "hybrid";

export interface RenderModeContext {
  nodeCount: number;
  edgeCount: number;
  settings: SemanticMindmapSettings;
  averageRenderDurationMs?: number;
}

export function chooseRenderMode(_args: RenderModeContext): RenderMode {
  return "svg";
}
