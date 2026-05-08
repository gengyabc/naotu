import { TFile } from "obsidian";
import type { MindmapDocument } from "../types/mindmap";

export function createSmallTestDocument(): MindmapDocument {
  return {
    version: 1,
    title: "Test",
    layoutMode: "free",
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "root",
        kind: "text",
        title: "Root",
        x: 0,
        y: 0,
        width: 180,
        height: 56,
        treeControl: "manual-expanded",
      },
      {
        id: "child",
        kind: "text",
        title: "Child",
        x: 200,
        y: 0,
        width: 180,
        height: 56,
        treeControl: "auto",
      },
    ],
    edges: [
      {
        id: "edge1",
        source: "root",
        target: "child",
        relation: "mindmap",
        type: "curve",
      },
    ],
  };
}

export function createSourceMindmapFile(path = "maps/source.naotu"): TFile {
  return Object.assign(Object.create(TFile.prototype), {
    path,
    basename: path.split("/").pop()?.replace(/\.naotu$/, "") ?? "source",
    extension: "naotu",
    parent: { path: path.split("/").slice(0, -1).join("/") || "" },
  }) as TFile;
}

export function createNotebookFile(path = "notes/topic.md"): TFile {
  return Object.assign(Object.create(TFile.prototype), {
    path,
    basename: path.split("/").pop()?.replace(/\.md$/, "") ?? "topic",
    extension: "md",
    parent: { path: path.split("/").slice(0, -1).join("/") || "" },
  }) as TFile;
}
