export type MindmapVersion = 1;

export type NodeKind = "text" | "notebook";
export type EdgeRelation = "mindmap" | "reference";
export type EdgeType = "line" | "curve";
export type TreeControl = "auto" | "manual-expanded" | "manual-collapsed";
export type LayoutMode = "tree-mirror" | "tree-right" | "free";
export type NodeDetailLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type NotebookTargetKind = "markdown" | "image" | "excalidraw";

/** Depth>=2 text nodes render as underline-only (no border/background) to reduce visual weight. */
export function isUnderlineNode(node: Pick<ProjectedNode, "kind" | "depth">): boolean {
  return node.kind === "text" && node.depth >= 2;
}

export interface MindmapDocument {
  version: MindmapVersion;
  title: string;
  layoutMode: LayoutMode;
  viewport: MindmapViewport;
  nodes: MindmapNode[];
  edges: MindmapEdge[];
}

export interface MindmapViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface MindmapNode {
  id: string;
  kind: NodeKind;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  customWidth?: number;
  customHeight?: number;
  aspectRatio?: number;
  treeControl: TreeControl;
  notebook?: NotebookBinding;
  link?: string;
  tags?: string[];
  importance?: number;
  style?: {
    fill?: string;
    stroke?: string;
  };
}

export interface NotebookBinding {
  link: string;
  path?: string;
  targetType: "file" | "heading" | "block";
  targetKind?: NotebookTargetKind;
}

export interface MindmapEdge {
  id: string;
  source: string;
  target: string;
  relation: EdgeRelation;
  type: EdgeType;
  label?: string;
  style?: {
    stroke?: string;
    dashed?: boolean;
  };
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProjectionContext {
  zoom: number;
  viewportWorldRect: Rect;
  selectedNodeIds: string[];
  treeVerticalSpacing?: number;
  hoveredNodeId?: string;
  lastFocusNodeId?: string;
  ignoredOverlapNodeIds?: string[];
}

export interface ProjectedNode {
  id: string;
  sourceNodeId: string;
  kind: NodeKind;
  title: string;
  notebook?: NotebookBinding;
  isMissingNotebook?: boolean;
  notebookExists?: boolean;
  worldX: number;
  worldY: number;
  projectedX: number;
  projectedY: number;
  displayWidth: number;
  displayHeight: number;
  aspectRatio?: number;
  detailLevel: NodeDetailLevel;
  depth: number;
  isRoot: boolean;
  isFocus: boolean;
  isSelected: boolean;
  isHovered: boolean;
  isAncestorPath: boolean;
  isSearchMatch?: boolean;
  hasChildren: boolean;
  childrenExpanded: boolean;
  showOpenNotebookButton: boolean;
  showResizeHandle: boolean;
  usesCustomSize: boolean;
  branchColor?: string;
  branchColorSoft?: string;
  branchColorBorder?: string;
  treeSide?: -1 | 1;
}

export interface ProjectedEdge {
  id: string;
  source: string;
  target: string;
  relation: EdgeRelation;
  type: EdgeType;
  label?: string;
  branchColor?: string;
  branchColorBorder?: string;
  isFromRoot?: boolean;
}

export interface SemanticProjection {
  rootNodeId?: string;
  focusNodeId?: string;
  visibleNodeIds: Set<string>;
  nodes: ProjectedNode[];
  edges: ProjectedEdge[];
}
