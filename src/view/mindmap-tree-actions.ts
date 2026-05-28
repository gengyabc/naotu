import type { MindmapDocument, MindmapNode, ProjectedNode } from "../types/mindmap";
import { TreeLayoutEngine } from "../core/tree-layout";
import {
  addChildMindmapNode,
  addSiblingMindmapNode,
  createTextNodeNearParent,
  findParentId,
  findRootId,
  getMindmapChildIds,
  isDescendantNode,
  moveMindmapNode,
  moveMindmapNodes,
  resolveDraggedRootIds,
} from "../core/tree-editing";
import { buildHierarchy } from "../core/hierarchy";
import { nodeWorldRect } from "../core/geometry";
import { toggleTreeControlFromCurrentState } from "../core/tree-control";

type TreeActionOptions = {
  getDocument(): MindmapDocument;
  applyReplacedDocument(doc: MindmapDocument, options?: { commitHistory?: boolean; render?: boolean; autosave?: boolean }): void;
  applyDocumentChange(mutator: () => void, options?: { commitHistory?: boolean; relayout?: boolean; render?: boolean; autosave?: boolean }): void;
  collapseTreeNode(nodeId: string): void;
  setTreeControl(nodeId: string, control: "manual-expanded" | "manual-collapsed"): void;
  getLayoutHorizontalSpacing(): number;
  getLayoutVerticalSpacing(): number;
  clearSubtreeVirtualZoomState(): void;
};

type TreeDropAction =
  | { type: "reparent"; newParentId: string; targetIndex: number }
  | { type: "reorder"; newParentId: string; targetIndex: number }
  | null;

export function isTreeLayoutMode(mode: "tree-mirror" | "tree-right" | "free"): boolean {
  return mode === "tree-mirror" || mode === "tree-right";
}

export class MindmapTreeActions {
  constructor(private options: TreeActionOptions) {}

  relayoutDocument(doc: MindmapDocument): MindmapDocument {
    if (!isTreeLayoutMode(doc.layoutMode)) return doc;
    const engine = new TreeLayoutEngine();
    return engine.layout(doc, {
      mode: doc.layoutMode === "tree-right" ? "tree-right" : "tree-mirror",
      horizontalSpacing: this.options.getLayoutHorizontalSpacing(),
      verticalSpacing: this.options.getLayoutVerticalSpacing(),
    });
  }

  applyTreeLayoutMode(mode: "tree-mirror" | "tree-right" | "free"): void {
    this.options.clearSubtreeVirtualZoomState();
    const next = structuredClone(this.options.getDocument());
    next.layoutMode = mode;
    this.options.applyReplacedDocument(this.relayoutDocument(next));
  }

  addChildNode(selectedId: string): MindmapNode | null {
    const doc = this.options.getDocument();
    const parent = doc.nodes.find((node) => node.id === selectedId);
    if (!parent) return null;

    const child = createTextNodeNearParent(parent);
    this.options.applyReplacedDocument(this.relayoutDocument(addChildMindmapNode(doc, parent.id, child)));
    return child;
  }

  addSiblingNode(selectedId: string): MindmapNode | null {
    const doc = this.options.getDocument();
    const selected = doc.nodes.find((node) => node.id === selectedId);
    if (!selected) return null;

    const parentId = findParentId(doc, selectedId) ?? findRootId(doc);
    const parent = parentId ? doc.nodes.find((node) => node.id === parentId) : undefined;
    if (!parent) return null;

    const sibling = {
      ...createTextNodeNearParent(parent),
      x: selected.x + 40,
      y: selected.y + 100,
    };

    this.options.applyReplacedDocument(this.relayoutDocument(addSiblingMindmapNode(doc, selectedId, sibling)));
    return sibling;
  }

  toggleSelectedTree(selectedId: string, projectedNodes: ProjectedNode[] | undefined): void {
    const projectedNode = projectedNodes?.find((node) => node.id === selectedId);
    if (projectedNode && !projectedNode.hasChildren) return;

    if (!projectedNode) {
      const doc = this.options.getDocument();
      const node = doc.nodes.find((item) => item.id === selectedId);
      if (!node) return;
      const depth = buildHierarchy(doc).nodes.get(selectedId)?.depth ?? 0;
      const nextControl = toggleTreeControlFromCurrentState(node.treeControl, doc.viewport.zoom, depth);
      if (nextControl === "manual-collapsed") this.options.collapseTreeNode(selectedId);
      else this.options.setTreeControl(selectedId, "manual-expanded");
      this.options.clearSubtreeVirtualZoomState();
      return;
    }

    if (projectedNode.childrenExpanded) this.options.collapseTreeNode(selectedId);
    else this.options.setTreeControl(selectedId, "manual-expanded");
    this.options.clearSubtreeVirtualZoomState();
  }

  resolveTreeDrop(nodeId: string): TreeDropAction {
    const doc = this.options.getDocument();
    const dragging = doc.nodes.find((node) => node.id === nodeId);
    if (!dragging) return null;
    const dropX = dragging.x;
    const dropY = dragging.y;

    for (const target of doc.nodes) {
      if (target.id === nodeId) continue;
      if (isDescendantNode(doc, nodeId, target.id)) continue;
      const rect = nodeWorldRect(target);
      if (dropX < rect.x || dropX > rect.x + rect.width || dropY < rect.y || dropY > rect.y + rect.height) continue;

      return { type: "reparent", newParentId: target.id, targetIndex: getMindmapChildIds(doc, target.id).length };
    }

    const hierarchy = buildHierarchy(doc);
    const parentId = hierarchy.parentById.get(nodeId);
    if (!parentId) return null;

    const siblings = (hierarchy.childrenById.get(parentId) ?? []).filter((id) => id !== nodeId);
    const siblingNodes = siblings
      .map((id) => doc.nodes.find((node) => node.id === id))
      .filter(Boolean)
      .sort((a, b) => (a?.y ?? 0) - (b?.y ?? 0));

    const parent = doc.nodes.find((node) => node.id === parentId);
    if (!parent) return null;
    const standardX = parent.x + (dragging.x >= parent.x ? 1 : -1) * this.options.getLayoutHorizontalSpacing();
    if (Math.abs(dropX - standardX) > this.options.getLayoutHorizontalSpacing() * 0.75) return null;

    for (let i = 0; i < siblingNodes.length; i++) {
      const sibling = siblingNodes[i];
      if (!sibling) continue;
      const centerY = sibling.y;
      if (dropY < centerY) return { type: "reorder", newParentId: parentId, targetIndex: i };
    }

    return { type: "reorder", newParentId: parentId, targetIndex: siblingNodes.length };
  }

  applyTreeDrop(nodeId: string, dragStartX: number, dragStartY: number, dropX: number, dropY: number): void {
    const moved = Math.abs(dropX - dragStartX) > 0.5 || Math.abs(dropY - dragStartY) > 0.5;
    if (!moved) return;

    const action = this.resolveTreeDrop(nodeId);
    const doc = this.options.getDocument();
    let next = doc;

    if (action?.type === "reparent" || action?.type === "reorder") {
      next = moveMindmapNode(doc, { nodeId, newParentId: action.newParentId, targetIndex: action.targetIndex });
    }

    this.options.applyReplacedDocument(this.relayoutDocument(next), { commitHistory: false });
  }

  applyBranchReconnect(args: { draggedNodeId: string; selectedIds: string[]; newParentId: string }): void {
    const doc = this.options.getDocument();
    const rootIds = resolveDraggedRootIds(doc, args.draggedNodeId, args.selectedIds);
    if (rootIds.length === 0) return;

    const next = moveMindmapNodes(doc, {
      nodeIds: rootIds,
      newParentId: args.newParentId,
      targetIndex: getMindmapChildIds(doc, args.newParentId).length,
    });

    this.options.applyReplacedDocument(isTreeLayoutMode(doc.layoutMode) ? this.relayoutDocument(next) : next, { commitHistory: false });
  }

  handleLayoutSettingsChanged(): void {
    const doc = this.options.getDocument();
    if (!isTreeLayoutMode(doc.layoutMode)) return;

    this.options.clearSubtreeVirtualZoomState();
    this.options.applyReplacedDocument(this.relayoutDocument(structuredClone(doc)), {
      commitHistory: false,
      autosave: false,
    });
  }
}
