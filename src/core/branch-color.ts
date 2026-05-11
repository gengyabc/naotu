export interface BranchPaletteItem {
  color: string;
  soft: string;
  border: string;
}

const BRANCH_PALETTE: BranchPaletteItem[] = [
  { color: "var(--mindmap-branch-1)", soft: "var(--mindmap-branch-1-soft)", border: "var(--mindmap-branch-1-border)" },
  { color: "var(--mindmap-branch-2)", soft: "var(--mindmap-branch-2-soft)", border: "var(--mindmap-branch-2-border)" },
  { color: "var(--mindmap-branch-3)", soft: "var(--mindmap-branch-3-soft)", border: "var(--mindmap-branch-3-border)" },
  { color: "var(--mindmap-branch-4)", soft: "var(--mindmap-branch-4-soft)", border: "var(--mindmap-branch-4-border)" },
  { color: "var(--mindmap-branch-5)", soft: "var(--mindmap-branch-5-soft)", border: "var(--mindmap-branch-5-border)" },
  { color: "var(--mindmap-branch-6)", soft: "var(--mindmap-branch-6-soft)", border: "var(--mindmap-branch-6-border)" },
  { color: "var(--mindmap-branch-7)", soft: "var(--mindmap-branch-7-soft)", border: "var(--mindmap-branch-7-border)" },
  { color: "var(--mindmap-branch-8)", soft: "var(--mindmap-branch-8-soft)", border: "var(--mindmap-branch-8-border)" },
];

export function getBranchPaletteItem(index: number): BranchPaletteItem {
  return BRANCH_PALETTE[index % BRANCH_PALETTE.length];
}

export interface BranchMeta {
  branchColor: string;
  branchColorSoft: string;
  branchColorBorder: string;
}

export function computeBranchMeta(args: {
  rootId?: string;
  childrenById: Map<string, string[]>;
  visibleNodeIds: Set<string>;
}): Map<string, BranchMeta> {
  const result = new Map<string, BranchMeta>();
  
  if (!args.rootId) return result;
  
  const rootChildren = args.childrenById.get(args.rootId) ?? [];
  rootChildren.forEach((childId, index) => {
    if (!args.visibleNodeIds.has(childId)) return;
    const palette = getBranchPaletteItem(index);
      assignBranchToSubtree({
        nodeId: childId,
        palette,
        childrenById: args.childrenById,
        visibleNodeIds: args.visibleNodeIds,
        result,
        visited: new Set(),
      });
  });
  
  return result;
}

function assignBranchToSubtree(args: {
  nodeId: string;
  palette: BranchPaletteItem;
  childrenById: Map<string, string[]>;
  visibleNodeIds: Set<string>;
  result: Map<string, BranchMeta>;
  visited: Set<string>;
}): void {
  if (args.visited.has(args.nodeId)) return;
  args.visited.add(args.nodeId);

  args.result.set(args.nodeId, {
    branchColor: args.palette.color,
    branchColorSoft: args.palette.soft,
    branchColorBorder: args.palette.border,
  });
  
  const children = args.childrenById.get(args.nodeId) ?? [];
  for (const childId of children) {
    if (!args.visibleNodeIds.has(childId)) continue;
      assignBranchToSubtree({
        nodeId: childId,
        palette: args.palette,
        childrenById: args.childrenById,
        visibleNodeIds: args.visibleNodeIds,
        result: args.result,
        visited: args.visited,
      });
  }
}