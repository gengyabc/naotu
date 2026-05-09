import type { NodeDetailLevel, NodeKind } from "../types/mindmap";
import { clampDetailLevel, zoomToBaseDetailLevel } from "./detail-level";

export interface SemanticZoomPolicyInput {
  zoom: number;
  kind: NodeKind;
  isRoot: boolean;
  isFocus: boolean;
  isSelected: boolean;
  isHovered: boolean;
  isAncestorPath: boolean;
  hasNotebook: boolean;
  hasChildren: boolean;
  distanceToFocus: number;
}

export function computeSemanticDetailLevel(input: SemanticZoomPolicyInput): NodeDetailLevel {
  let level: NodeDetailLevel = zoomToBaseDetailLevel(input.zoom);

  if (input.kind === "text") {
    level = clampDetailLevel(Math.min(level, 2));
  }

  if (input.kind === "notebook") {
    level = zoomToBaseDetailLevel(input.zoom);
  }

  if (!input.isRoot && !input.isFocus && !input.isSelected && !input.isHovered && !input.isAncestorPath) {
    if (input.distanceToFocus > 900) {
      level = clampDetailLevel(level - 2);
    } else if (input.distanceToFocus > 450) {
      level = clampDetailLevel(level - 1);
    }
  }

  if (input.isAncestorPath) {
    level = clampDetailLevel(Math.max(level, 1));
  }

  if (input.isRoot) {
    level = clampDetailLevel(Math.max(level, 1));
  }

  if (input.isFocus || input.isSelected || input.isHovered) {
    level = clampDetailLevel(Math.max(level, 2));
  }

  if (input.kind === "text") {
    level = clampDetailLevel(Math.min(level, 2));
  }

  return level;
}

export interface NotebookFocusPolicyInput {
  nodeId: string;
  kind: NodeKind;
  isFocus: boolean;
  focusNodeId: string | undefined;
  focusOnRoot: boolean;
  computedLevel: NodeDetailLevel;
  prevFrozenLevels: ReadonlyMap<string, NodeDetailLevel>;
}

export function applyNotebookFocusPolicy(input: NotebookFocusPolicyInput): NodeDetailLevel {
  if (input.kind !== "notebook") return input.computedLevel;

  if (input.isFocus) {
    return input.computedLevel;
  }

  if (!input.focusNodeId || input.focusOnRoot) {
    return clampDetailLevel(Math.min(input.computedLevel, 3));
  }

  if (input.prevFrozenLevels.has(input.nodeId)) {
    return input.prevFrozenLevels.get(input.nodeId)!;
  }
  return clampDetailLevel(Math.min(input.computedLevel, 3));
}
