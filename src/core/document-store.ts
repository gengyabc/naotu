import { App, normalizePath, TFile } from "obsidian";
import type { EdgeRelation, EdgeType, MindmapDocument, MindmapNode, TreeControl } from "../types/mindmap";
import { DEFAULT_MINDMAP_DOCUMENT } from "../constants";
import { migrateDocument } from "./document-migration";
import { createId } from "./id";

export class MindmapDocumentStore {
  private file: TFile | null = null;
  private doc: MindmapDocument = structuredClone(DEFAULT_MINDMAP_DOCUMENT);
  private loadError: Error | null = null;
  private listeners = new Set<() => void>();

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
    const normalized = normalizePath(path.endsWith(".mindmap.json") ? path : `${path}.mindmap.json`);
    const file = await this.app.vault.create(normalized, JSON.stringify(DEFAULT_MINDMAP_DOCUMENT, null, 2));
    await this.openFile(file);
    return file;
  }

  async save(): Promise<void> {
    if (!this.file) return;
    if (this.loadError) throw this.loadError;
    await this.app.vault.modify(this.file, JSON.stringify(this.doc, null, 2));
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

  toggleTreeControl(id: string): void {
    const node = this.doc.nodes.find((item) => item.id === id);
    if (!node) return;
    node.treeControl = node.treeControl === "manual-expanded" ? "manual-collapsed" : "manual-expanded";
    this.emit();
  }

  setTreeControl(id: string, treeControl: TreeControl): void {
    this.patchNode(id, { treeControl });
  }

  setTreeControlForSubtree(rootId: string, control: TreeControl): void {
    const childrenById = new Map<string, string[]>();
    for (const node of this.doc.nodes) {
      childrenById.set(node.id, []);
    }
    for (const edge of this.doc.edges) {
      if (edge.relation !== "mindmap") continue;
      childrenById.get(edge.source)?.push(edge.target);
    }

    const ids: string[] = [];
    const visited = new Set<string>();
    const collect = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);
      ids.push(id);
      for (const child of childrenById.get(id) ?? []) {
        collect(child);
      }
    };
    collect(rootId);

    const idSet = new Set(ids);
    for (const node of this.doc.nodes) {
      if (idSet.has(node.id)) node.treeControl = control;
    }

    this.emit();
  }

  setTreeControlForAll(control: TreeControl): void {
    for (const node of this.doc.nodes) {
      node.treeControl = control;
    }
    this.emit();
  }

  addNode(node: MindmapNode): void {
    this.doc.nodes.push(node);
    this.emit();
  }

  deleteNode(id: string): void {
    this.doc.nodes = this.doc.nodes.filter((node) => node.id !== id);
    this.doc.edges = this.doc.edges.filter((edge) => edge.source !== id && edge.target !== id);
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
