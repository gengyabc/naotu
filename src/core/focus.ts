import type { MindmapDocument, Rect } from "../types/mindmap";
import type { MindmapHierarchy } from "./hierarchy";

export function resolveFocusNodeId(args: {
  doc: MindmapDocument;
  hierarchy: MindmapHierarchy;
  selectedNodeIds: string[];
  lastFocusNodeId?: string;
  viewportWorldRect: Rect;
}): string | undefined {
  const selected = args.selectedNodeIds[0];
  if (selected && args.doc.nodes.some((node) => node.id === selected)) return selected;

  if (args.lastFocusNodeId && args.doc.nodes.some((node) => node.id === args.lastFocusNodeId)) {
    return args.lastFocusNodeId;
  }

  const cx = args.viewportWorldRect.x + args.viewportWorldRect.width / 2;
  const cy = args.viewportWorldRect.y + args.viewportWorldRect.height / 2;

  let bestId: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const node of args.doc.nodes) {
    const dx = node.x - cx;
    const dy = node.y - cy;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = node.id;
    }
  }

  return bestId ?? args.hierarchy.rootId;
}
