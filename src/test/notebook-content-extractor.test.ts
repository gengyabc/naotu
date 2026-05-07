import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";

import { readNotebookPreviewMarkdown } from "../core/notebook-content-extractor";

function createFile(path: string, basename: string): TFile {
  return Object.assign(Object.create(TFile.prototype), { path, basename }) as TFile;
}

describe("readNotebookPreviewMarkdown", () => {
  it("prefers the stored notebook path over basename resolution", async () => {
    const read = vi.fn().mockResolvedValue("# Right\nExpected content");
    const lookup = vi.fn().mockReturnValue(createFile("notes/wrong.md", "wrong"));
    const storedFile = createFile("notes/right.md", "right");

    const result = await readNotebookPreviewMarkdown({
      app: {
        vault: {
          getAbstractFileByPath: vi.fn().mockReturnValue(storedFile),
          read,
        },
        metadataCache: {
          getFirstLinkpathDest: lookup,
        },
      } as never,
      link: "[[Right]]",
      storedPath: "notes/right.md",
      sourcePath: "maps/source.mindmap",
    });

    expect(result).toContain("Expected content");
    expect(read).toHaveBeenCalledWith(storedFile);
    expect(lookup).not.toHaveBeenCalled();
  });
});
