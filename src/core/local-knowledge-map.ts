import { App, TFile } from "obsidian";
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from "../constants";
import type { MindmapDocument, MindmapEdge, MindmapNode } from "../types/mindmap";
import { DEFAULT_LAYOUT_HORIZONTAL_SPACING, DEFAULT_LAYOUT_VERTICAL_SPACING } from "../types/settings";
import { createId } from "./id";
import { TreeLayoutEngine } from "./tree-layout";

export interface CreateLocalKnowledgeMapOptions {
  app: App;
  file: TFile;
  maxNodes: number;
}

export function createLocalKnowledgeMap(options: CreateLocalKnowledgeMapOptions): MindmapDocument {
  const nodes: MindmapNode[] = [];
  const edges: MindmapEdge[] = [];
  const centerId = createId("node");

  nodes.push({
    id: centerId,
    kind: "notebook",
    title: options.file.basename,
    x: 0,
    y: 0,
    width: DEFAULT_NODE_WIDTH,
    height: DEFAULT_NODE_HEIGHT,
    treeControl: "manual-expanded",
    notebook: {
      link: `[[${options.file.basename}]]`,
      path: options.file.path,
      targetType: "file",
    },
    link: `[[${options.file.basename}]]`,
  });

  const outlinks = getOutgoingLinks(options.app, options.file);
  const backlinks = getBacklinks(options.app, options.file);
  const relatedFiles = uniqueFiles([...outlinks, ...backlinks]).slice(0, Math.max(1, options.maxNodes - 1));

  const nodeIdByPath = new Map<string, string>();
  for (const file of relatedFiles) {
    const id = createId("node");
    nodeIdByPath.set(file.path, id);
    nodes.push({
      id,
      kind: "notebook",
      title: file.basename,
      x: 0,
      y: 0,
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
      treeControl: "auto",
      notebook: {
        link: `[[${file.basename}]]`,
        path: file.path,
        targetType: "file",
      },
      link: `[[${file.basename}]]`,
    });

    edges.push({
      id: createId("edge"),
      source: centerId,
      target: id,
      relation: "mindmap",
      type: "curve",
    });
  }

  for (const file of outlinks) {
    const targetId = nodeIdByPath.get(file.path);
    if (!targetId) continue;
    edges.push({ id: createId("edge"), source: centerId, target: targetId, relation: "reference", type: "curve" });
  }

  for (const file of backlinks) {
    const sourceId = nodeIdByPath.get(file.path);
    if (!sourceId) continue;
    edges.push({ id: createId("edge"), source: sourceId, target: centerId, relation: "reference", type: "curve" });
  }

  return new TreeLayoutEngine().layout(
    {
      version: 1,
      title: `${options.file.basename} Local Knowledge Map`,
      layoutMode: "tree-mirror",
      viewport: { x: 400, y: 300, zoom: 1 },
      nodes,
      edges,
    },
    {
      mode: "tree-mirror",
      horizontalSpacing: DEFAULT_LAYOUT_HORIZONTAL_SPACING,
      verticalSpacing: DEFAULT_LAYOUT_VERTICAL_SPACING,
    },
    centerId,
  );
}

function getOutgoingLinks(app: App, file: TFile): TFile[] {
  const links = app.metadataCache.getFileCache(file)?.links ?? [];
  const result: TFile[] = [];
  for (const link of links) {
    const target = app.metadataCache.getFirstLinkpathDest(link.link, file.path);
    if (target) result.push(target);
  }
  return uniqueFiles(result);
}

function getBacklinks(app: App, file: TFile): TFile[] {
  const result: TFile[] = [];
  const resolvedLinks = app.metadataCache.resolvedLinks;
  for (const sourcePath in resolvedLinks) {
    const targets = resolvedLinks[sourcePath];
    if (!targets[file.path]) continue;
    const source = app.vault.getAbstractFileByPath(sourcePath);
    if (source instanceof TFile) result.push(source);
  }
  return uniqueFiles(result);
}

function uniqueFiles(files: TFile[]): TFile[] {
  const seen = new Set<string>();
  const result: TFile[] = [];
  for (const file of files) {
    if (seen.has(file.path)) continue;
    seen.add(file.path);
    result.push(file);
  }
  return result;
}
