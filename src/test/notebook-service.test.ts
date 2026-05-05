import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";

import { NotebookService } from "../core/notebook-service";
import type { MindmapNode } from "../types/mindmap";

function createFile(path: string, basename: string): TFile {
  return Object.assign(Object.create(TFile.prototype), { path, basename }) as TFile;
}

describe("NotebookService", () => {
  it("resolves notebook files by stored path before basename lookup", () => {
    const storedFile = createFile("notes/right.md", "right");
    const lookup = vi.fn().mockReturnValue(createFile("notes/wrong.md", "wrong"));
    const service = new NotebookService({
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue(storedFile),
      },
      metadataCache: {
        getFirstLinkpathDest: lookup,
      },
    } as never);

    const node: MindmapNode = {
      id: "n1",
      kind: "notebook",
      title: "Right",
      x: 0,
      y: 0,
      width: 180,
      height: 56,
      treeControl: "auto",
      notebook: {
        link: "[[Right]]",
        path: "notes/right.md",
        targetType: "file",
      },
      link: "[[Right]]",
    };

    expect(service.resolveNotebookFile(node, "maps/source.mindmap.json")).toBe(storedFile);
    expect(lookup).not.toHaveBeenCalled();
  });
});
