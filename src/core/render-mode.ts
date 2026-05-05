export type RenderMode = "svg" | "hybrid";

export interface RenderModePolicy {
  svgMaxNodes: number;
  hybridMinNodes: number;
}

export const DEFAULT_RENDER_MODE_POLICY: RenderModePolicy = {
  svgMaxNodes: 1200,
  hybridMinNodes: 1201,
};

export function chooseRenderMode(args: {
  nodeCount: number;
  edgeCount: number;
  policy?: RenderModePolicy;
}): RenderMode {
  const policy = args.policy ?? DEFAULT_RENDER_MODE_POLICY;
  if (args.nodeCount >= policy.hybridMinNodes) return "hybrid";
  return "svg";
}
