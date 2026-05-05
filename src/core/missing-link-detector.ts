import { App, TFile } from "obsidian";
import type { MindmapDocument, MindmapNode } from "../types/mindmap";
import { doesSubpathExist, parseObsidianLink, resolveObsidianLinkFile } from "./obsidian-link";

export interface MissingNotebookLink {
  nodeId: string;
  title: string;
  link: string;
}

export function findMissingNotebookLinks(args: {
  app: App;
  doc: MindmapDocument;
  sourcePath: string;
}): MissingNotebookLink[] {
  const result: MissingNotebookLink[] = [];

  for (const node of args.doc.nodes) {
    if (node.kind !== "notebook") continue;

    const link = node.notebook?.link ?? node.link;
    if (!link) continue;

    const parsed = parseObsidianLink(link);
    if (!parsed) continue;

    const file = resolveObsidianLinkFile({
      app: args.app,
      link,
      sourcePath: args.sourcePath,
      storedPath: node.notebook?.path,
    });
    if (!file || !doesSubpathExist({ app: args.app, file, targetType: parsed.targetType, subpath: parsed.subpath })) {
      result.push({ nodeId: node.id, title: node.title, link });
    }
  }

  return result;
}

export function isNotebookLinkMissing(args: {
  app: App;
  node: MindmapNode;
  sourcePath: string;
}): boolean {
  if (args.node.kind !== "notebook") return false;

  const link = args.node.notebook?.link ?? args.node.link;
  if (!link) return true;

  const parsed = parseObsidianLink(link);
  if (!parsed) return true;

  const file = resolveObsidianLinkFile({
    app: args.app,
    link,
    sourcePath: args.sourcePath,
    storedPath: args.node.notebook?.path,
  });
  return !(file instanceof TFile) || !doesSubpathExist({ app: args.app, file, targetType: parsed.targetType, subpath: parsed.subpath });
}
