import type { SemanticMindmapSettings } from "../types/settings";

export type RenderMode = "svg" | "hybrid";

export function chooseRenderMode(args: {
  nodeCount: number;
  edgeCount: number;
  settings: SemanticMindmapSettings;
}): RenderMode {
  if (args.settings.defaultRenderMode === "svg") return "svg";

  if (args.settings.defaultRenderMode === "hybrid") {
    return args.settings.enableHybridRenderer ? "hybrid" : "svg";
  }

  if (!args.settings.enableHybridRenderer) return "svg";

  if (args.nodeCount >= args.settings.hybridNodeThreshold) {
    return "hybrid";
  }

  return "svg";
}
