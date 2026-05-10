export type MindmapVersion = 1;

export type NodeKind = "text" | "notebook";
export type EdgeRelation = "mindmap" | "reference";
export type EdgeType = "line" | "curve";
export type TreeControl = "auto" | "manual-expanded" | "manual-collapsed";
export type LayoutMode = "tree-mirror" | "tree-right" | "free";
export type NodeDetailLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type NotebookTargetKind = "markdown" | "image" | "excalidraw";

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
  hoveredNodeId?: string;
  lastFocusNodeId?: string;
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
  detailLevel: NodeDetailLevel;
  isRoot: boolean;
  isFocus: boolean;
  isSelected: boolean;
  isHovered: boolean;
  isAncestorPath: boolean;
  isSearchMatch?: boolean;
  isConnectionSource?: boolean;
  hasChildren: boolean;
  childrenExpanded: boolean;
  showOpenNotebookButton: boolean;
  showResizeHandle: boolean;
  usesCustomSize: boolean;
}

export interface ProjectedEdge {
  id: string;
  source: string;
  target: string;
  relation: EdgeRelation;
  type: EdgeType;
  label?: string;
}

export interface SemanticProjection {
  rootNodeId?: string;
  focusNodeId?: string;
  visibleNodeIds: Set<string>;
  nodes: ProjectedNode[];
  edges: ProjectedEdge[];
}
