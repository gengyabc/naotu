import { App, TFile } from "obsidian";
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from "../constants";
import type { MindmapDocument, MindmapEdge, MindmapNode } from "../types/mindmap";
import { DEFAULT_LAYOUT_HORIZONTAL_SPACING, DEFAULT_LAYOUT_VERTICAL_SPACING } from "../types/settings";
import { createId } from "./id";
import { TreeLayoutEngine } from "./tree-layout";

export interface CreateLocalKnowledgeMapOptions {
  app: App;
  file: TFile;
}

const AUTO_RELATED_FILE_BUDGET_FLOOR = 24;
const AUTO_RELATED_FILE_BUDGET_SCALE = 8;
const AUTO_RELATED_FILE_BUDGET_CEILING = 120;

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
  const { relatedFiles, totalRelatedFiles } = chooseRelatedFiles(options.app, options.file, outlinks, backlinks);

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
      title: createLocalKnowledgeMapTitle(options.file.basename, relatedFiles.length, totalRelatedFiles),
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

function chooseRelatedFiles(
  app: App,
  file: TFile,
  outlinks: TFile[],
  backlinks: TFile[],
): { relatedFiles: TFile[]; totalRelatedFiles: number } {
  const outlinkPaths = new Set(outlinks.map((item) => item.path));
  const backlinkPaths = new Set(backlinks.map((item) => item.path));
  const relatedFiles = uniqueFiles([...outlinks, ...backlinks]);
  const budget = computeAutomaticRelatedFileBudget(relatedFiles.length);

  return {
    relatedFiles: relatedFiles
      .sort((left, right) => compareRelatedFiles(app, file, left, right, outlinkPaths, backlinkPaths))
      .slice(0, budget),
    totalRelatedFiles: relatedFiles.length,
  };
}

function createLocalKnowledgeMapTitle(fileBasename: string, visibleRelatedFiles: number, totalRelatedFiles: number): string {
  const baseTitle = `${fileBasename} Local Knowledge Map`;
  if (visibleRelatedFiles >= totalRelatedFiles) return baseTitle;
  return `${baseTitle} [truncated ${visibleRelatedFiles}/${totalRelatedFiles}]`;
}

function computeAutomaticRelatedFileBudget(totalRelatedFiles: number): number {
  if (totalRelatedFiles <= 0) return 0;
  const scaledBudget = Math.round(Math.sqrt(totalRelatedFiles) * AUTO_RELATED_FILE_BUDGET_SCALE);
  const boundedBudget = Math.max(
    AUTO_RELATED_FILE_BUDGET_FLOOR,
    Math.min(AUTO_RELATED_FILE_BUDGET_CEILING, scaledBudget),
  );
  return Math.min(totalRelatedFiles, boundedBudget);
}

function compareRelatedFiles(
  app: App,
  centerFile: TFile,
  left: TFile,
  right: TFile,
  outlinkPaths: Set<string>,
  backlinkPaths: Set<string>,
): number {
  const scoreDiff = scoreRelatedFile(app, centerFile, right, outlinkPaths, backlinkPaths)
    - scoreRelatedFile(app, centerFile, left, outlinkPaths, backlinkPaths);
  if (scoreDiff !== 0) return scoreDiff;

  const titleDiff = left.basename.localeCompare(right.basename, "en");
  if (titleDiff !== 0) return titleDiff;
  return left.path.localeCompare(right.path, "en");
}

function scoreRelatedFile(
  app: App,
  centerFile: TFile,
  relatedFile: TFile,
  outlinkPaths: Set<string>,
  backlinkPaths: Set<string>,
): number {
  let score = 0;

  if (outlinkPaths.has(relatedFile.path)) score += 100;
  if (backlinkPaths.has(relatedFile.path)) score += 50;

  score += getResolvedLinkWeight(app, centerFile.path, relatedFile.path) * 10;
  score += getResolvedLinkWeight(app, relatedFile.path, centerFile.path) * 5;

  return score;
}

function getResolvedLinkWeight(app: App, sourcePath: string, targetPath: string): number {
  const targets = app.metadataCache.resolvedLinks?.[sourcePath];
  const weight = targets?.[targetPath];
  return typeof weight === "number" && Number.isFinite(weight) ? weight : 0;
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
