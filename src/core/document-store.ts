import { App, normalizePath, TFile } from "obsidian";
import type { MindmapDocument, MindmapNode, TreeControl } from "../types/mindmap";
import { DEFAULT_MINDMAP_DOCUMENT } from "../constants";
import { migrateDocument } from "./document-migration";

export class MindmapDocumentStore {
  private file: TFile | null = null;
  private doc: MindmapDocument = structuredClone(DEFAULT_MINDMAP_DOCUMENT);
  private listeners = new Set<() => void>();

  constructor(private app: App) {}

  getDocument(): MindmapDocument {
    return this.doc;
  }

  getFile(): TFile | null {
    return this.file;
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
    } catch {
      this.doc = structuredClone(DEFAULT_MINDMAP_DOCUMENT);
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
    if (source === target) return;
    const exists = this.doc.edges.some(
      (edge) => edge.source === source && edge.target === target && edge.relation === "mindmap",
    );
    if (exists) return;

    this.doc.edges.push({
      id: `edge_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      source,
      target,
      relation: "mindmap",
      type: "curve",
    });
    this.emit();
  }

  setViewport(x: number, y: number, zoom: number): void {
    this.doc.viewport = { x, y, zoom };
    this.emit();
  }
}
