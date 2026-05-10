import { App, normalizePath, TFile } from "obsidian";
import type { EdgeRelation, EdgeType, MindmapDocument, MindmapNode, TreeControl } from "../types/mindmap";
import { DEFAULT_MINDMAP_DOCUMENT } from "../constants";
import { migrateDocument } from "./document-migration";
import { createId } from "./id";
import { buildHierarchy } from "./hierarchy";
import { toggleTreeControlFromCurrentState } from "./tree-control";
import { getSubtreeNodeIds, findParentId } from "./tree-editing";

export class MindmapDocumentStore {
  private file: TFile | null = null;
  private doc: MindmapDocument = structuredClone(DEFAULT_MINDMAP_DOCUMENT);
  private loadError: Error | null = null;
  private listeners = new Set<() => void>();
  private lastSyncedRaw: string | null = null;

  constructor(private app: App) {}

  getDocument(): MindmapDocument {
    return this.doc;
  }

  getFile(): TFile | null {
    return this.file;
  }

  getLoadError(): Error | null {
    return this.loadError;
  }

  canSave(): boolean {
    return this.file !== null && this.loadError === null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  async openFile(file: TFile): Promise<void> {
    this.file = file;
    const raw = await this.app.vault.read(file);
    this.lastSyncedRaw = raw;

    try {
      this.doc = migrateDocument(JSON.parse(raw));
      this.loadError = null;
    } catch (error) {
      this.doc = structuredClone(DEFAULT_MINDMAP_DOCUMENT);
      this.loadError = error instanceof Error ? error : new Error("Failed to load mindmap document.");
    }

    this.emit();
  }

  async createFile(path: string): Promise<TFile> {
    const normalized = normalizePath(path.endsWith(".naotu") ? path : `${path}.naotu`);
    const file = await this.app.vault.create(normalized, JSON.stringify(DEFAULT_MINDMAP_DOCUMENT, null, 2));
    await this.openFile(file);
    return file;
  }

  async save(): Promise<void> {
    if (!this.file) return;
    if (this.loadError) throw this.loadError;

    const currentRaw = await this.app.vault.read(this.file);
    if (this.lastSyncedRaw !== null && currentRaw !== this.lastSyncedRaw) {
      throw new Error("脑图文件已在外部修改，请重新打开后再保存。");
    }

    const nextRaw = JSON.stringify(this.doc, null, 2);
    await this.app.vault.modify(this.file, nextRaw);
    this.lastSyncedRaw = nextRaw;
  }

  replaceDocument(doc: MindmapDocument): void {
    this.doc = migrateDocument(doc);
    this.emit();
  }

  patchNode(id: string, patch: Partial<MindmapNode>): void {
    const node = this.doc.nodes.find((item) => item.id === id);
    if (!node) return;
    Object.assign(node, patch);
    this.emit();
  }

  updateNodeTitle(id: string, title: string): void {
    this.patchNode(id, { title });
  }

  updateNodePosition(id: string, x: number, y: number): void {
    this.patchNode(id, { x, y });
  }

  updateNodeSize(id: string, customWidth: number, customHeight: number): void {
    this.patchNode(id, { customWidth, customHeight });
  }

  toggleTreeControl(id: string, zoom: number): void {
    const node = this.doc.nodes.find((item) => item.id === id);
    if (!node) return;
    const hierarchy = buildHierarchy(this.doc);
    const depth = hierarchy.nodes.get(id)?.depth ?? 0;
    node.treeControl = toggleTreeControlFromCurrentState(node.treeControl, zoom, depth);
    this.emit();
  }

  setViewportAndSyncTreeControls(x: number, y: number, zoom: number): void {
    this.doc.viewport = { x, y, zoom };
    this.emit();
  }

  setTreeControl(id: string, treeControl: TreeControl): void {
    this.patchNode(id, { treeControl });
  }

  applyTreeControls(controls: ReadonlyMap<string, TreeControl>): void {
    if (controls.size === 0) return;

    let changed = false;
    for (const node of this.doc.nodes) {
      const next = controls.get(node.id);
      if (!next || node.treeControl === next) continue;
      node.treeControl = next;
      changed = true;
    }

    if (changed) this.emit();
  }

  addNode(node: MindmapNode): void {
    this.doc.nodes.push(node);
    this.emit();
  }

  deleteNode(id: string, mode: "promote" | "recursive" = "promote"): void {
    if (mode === "recursive") {
      this.deleteNodeRecursive(id);
      return;
    }

    const parentId = findParentId(this.doc, id);
    const childIds = this.doc.edges
      .filter((edge) => edge.relation === "mindmap" && edge.source === id)
      .map((edge) => edge.target);

    this.doc.nodes = this.doc.nodes.filter((node) => node.id !== id);
    this.doc.edges = this.doc.edges.filter((edge) => edge.source !== id && edge.target !== id);

    if (parentId) {
      for (const childId of childIds) {
        this.doc.edges.push({
          id: createId("edge"),
          source: parentId,
          target: childId,
          relation: "mindmap",
          type: "curve",
        });
      }
    }

    this.emit();
  }

  private deleteNodeRecursive(id: string): void {
    const subtreeIds = getSubtreeNodeIds(this.doc, id);
    const subtreeSet = new Set(subtreeIds);

    this.doc.nodes = this.doc.nodes.filter((node) => !subtreeSet.has(node.id));
    this.doc.edges = this.doc.edges.filter((edge) => !subtreeSet.has(edge.source) && !subtreeSet.has(edge.target));

    this.emit();
  }

  addMindmapEdge(source: string, target: string): void {
    this.addEdge({ source, target, relation: "mindmap", type: "curve" });
  }

  addEdge(args: { source: string; target: string; relation: EdgeRelation; type?: EdgeType }): void {
    if (args.source === args.target) return;

    const exists = this.doc.edges.some(
      (edge) => edge.source === args.source && edge.target === args.target && edge.relation === args.relation,
    );

    if (exists) return;

    if (args.relation === "mindmap") {
      const alreadyHasParent = this.doc.edges.some(
        (edge) => edge.relation === "mindmap" && edge.target === args.target,
      );
      if (alreadyHasParent) return;
    }

    this.doc.edges.push({
      id: createId("edge"),
      source: args.source,
      target: args.target,
      relation: args.relation,
      type: args.type ?? "curve",
    });

    this.emit();
  }

  deleteEdge(id: string): void {
    this.doc.edges = this.doc.edges.filter((edge) => edge.id !== id);
    this.emit();
  }

  updateNodePositions(moves: Array<{ id: string; x: number; y: number }>): void {
    const moveMap = new Map(moves.map((move) => [move.id, move]));

    for (const node of this.doc.nodes) {
      const move = moveMap.get(node.id);
      if (!move) continue;
      node.x = move.x;
      node.y = move.y;
    }

    this.emit();
  }

  setViewport(x: number, y: number, zoom: number): void {
    this.doc.viewport = { x, y, zoom };
    this.emit();
  }
}
