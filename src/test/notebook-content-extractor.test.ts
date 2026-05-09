import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";

import { globalPreviewCache } from "../core/preview-cache";
import { readNotebookPreviewMarkdown } from "../core/notebook-content-extractor";

function createFile(path: string, basename: string): TFile {
  return Object.assign(Object.create(TFile.prototype), { path, basename }) as TFile;
}

describe("readNotebookPreviewMarkdown", () => {
  it("prefers the stored notebook path over basename resolution", async () => {
    globalPreviewCache.clear();

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
      sourcePath: "maps/source.naotu",
    });

    expect(result?.markdown).toContain("Expected content");
    expect(result?.resolvedPath).toBe("notes/right.md");
    expect(read).toHaveBeenCalledWith(storedFile);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("keeps preview cache entries separate for different maxLines", async () => {
    globalPreviewCache.clear();

    const storedFile = createFile("notes/right.md", "right");
    const read = vi.fn().mockResolvedValue(Array.from({ length: 80 }, (_value, index) => `Line ${index + 1}`).join("\n"));
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue(storedFile),
        read,
      },
      metadataCache: {
        getFirstLinkpathDest: vi.fn(),
      },
    } as never;

    const shortPreview = await readNotebookPreviewMarkdown({
      app,
      link: "[[Right]]",
      storedPath: "notes/right.md",
      sourcePath: "maps/source.naotu",
      maxLines: 20,
    });
    const tallPreview = await readNotebookPreviewMarkdown({
      app,
      link: "[[Right]]",
      storedPath: "notes/right.md",
      sourcePath: "maps/source.naotu",
      maxLines: 60,
    });

    expect(shortPreview?.markdown.split("\n")).toHaveLength(20);
    expect(tallPreview?.markdown.split("\n")).toHaveLength(60);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
