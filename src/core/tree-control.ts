import type { TreeControl } from "../types/mindmap";

export function shouldAutoExpandChildren(zoom: number, depth: number): boolean {
  return zoom >= 0.45 + depth * 0.15;
}

export function areChildrenExpanded(treeControl: TreeControl | undefined, zoom: number, depth: number): boolean {
  if (treeControl === "manual-expanded") return true;
  if (treeControl === "manual-collapsed") return false;
  return shouldAutoExpandChildren(zoom, depth);
}

export function toggleTreeControlFromCurrentState(treeControl: TreeControl | undefined, zoom: number, depth: number): TreeControl {
  return areChildrenExpanded(treeControl, zoom, depth) ? "manual-collapsed" : "manual-expanded";
}
