import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";

import { findMissingNotebookLinks, isNotebookLinkMissing } from "../core/missing-link-detector";
import type { MindmapDocument, MindmapNode } from "../types/mindmap";

function createFile(path: string, basename: string): TFile {
  return Object.assign(Object.create(TFile.prototype), { path, basename }) as TFile;
}

describe("missing notebook detection", () => {
  it("marks heading links as missing when the heading does not exist", () => {
    const file = createFile("notes/topic.md", "topic");
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue(file),
      },
      metadataCache: {
        getFirstLinkpathDest: vi.fn().mockReturnValue(file),
        getFileCache: vi.fn().mockReturnValue({ headings: [{ heading: "Present" }] }),
      },
    } as never;

    const doc: MindmapDocument = {
      version: 1,
      title: "Test",
      layoutMode: "tree-mirror",
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "n1",
          kind: "notebook",
          title: "Missing",
          x: 0,
          y: 0,
          width: 180,
          height: 56,
          treeControl: "auto",
          notebook: {
            link: "[[topic#Missing]]",
            path: "notes/topic.md",
            targetType: "heading",
          },
          link: "[[topic#Missing]]",
        },
      ],
      edges: [],
    };

    const missing = findMissingNotebookLinks({ app, doc, sourcePath: "maps/source.mindmap" });
    expect(missing).toHaveLength(1);
    expect(missing[0]?.nodeId).toBe("n1");
  });

  it("treats existing block links as valid", () => {
    const file = createFile("notes/topic.md", "topic");
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue(file),
      },
      metadataCache: {
        getFirstLinkpathDest: vi.fn().mockReturnValue(file),
        getFileCache: vi.fn().mockReturnValue({ blocks: { block123: {} } }),
      },
    } as never;

    const node: MindmapNode = {
      id: "n1",
      kind: "notebook",
      title: "Block",
      x: 0,
      y: 0,
      width: 180,
      height: 56,
      treeControl: "auto",
      notebook: {
        link: "[[topic#^block123]]",
        path: "notes/topic.md",
        targetType: "block",
      },
      link: "[[topic#^block123]]",
    };

    expect(isNotebookLinkMissing({ app, node, sourcePath: "maps/source.mindmap" })).toBe(false);
  });
});
