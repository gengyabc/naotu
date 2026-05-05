import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";

import { globalPreviewCache } from "../core/preview-cache";
import { renderNotebookPreview } from "../renderer/notebook-preview-renderer";

interface FakeWrapper {
  className: string;
  renderedMarkdown?: string;
  empty: () => void;
  createDiv: (args: { cls: string; text: string }) => void;
}

interface FakeForeignObject {
  wrapper: FakeWrapper | null;
  querySelector: () => FakeWrapper | null;
  appendChild: (wrapper: FakeWrapper) => void;
}

function createWrapper(): FakeWrapper {
  return {
    className: "",
    empty: vi.fn(),
    createDiv: vi.fn(),
  };
}

function createFile(path: string, basename: string): TFile {
  return Object.assign(Object.create(TFile.prototype), { path, basename }) as TFile;
}

describe("renderNotebookPreview", () => {
  it("rerenders mounted previews after the preview cache is cleared", async () => {
    globalPreviewCache.clear();

    const read = vi.fn().mockResolvedValue("# Note\nFresh content");
    const foreignObject: FakeForeignObject = {
      wrapper: null as FakeWrapper | null,
      querySelector: vi.fn(function (this: FakeForeignObject) {
        return this.wrapper;
      }),
      appendChild: vi.fn(function (this: FakeForeignObject, wrapper: FakeWrapper) {
        this.wrapper = wrapper;
      }),
    };

    const wrapper = createWrapper();
    const originalDocument = globalThis.document;
    vi.stubGlobal("document", {
      createElement: vi.fn(() => wrapper),
    });

    try {
      const app = {
        vault: {
          getAbstractFileByPath: vi.fn().mockReturnValue(createFile("notes/right.md", "right")),
          read,
        },
        metadataCache: {
          getFirstLinkpathDest: vi.fn(),
        },
      } as never;

      await renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[Right]]",
        storedPath: "notes/right.md",
        sourcePath: "maps/source.mindmap.json",
      });

      globalPreviewCache.clear();

      await renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[Right]]",
        storedPath: "notes/right.md",
        sourcePath: "maps/source.mindmap.json",
      });
    } finally {
      vi.unstubAllGlobals();
      if (originalDocument) vi.stubGlobal("document", originalDocument);
    }

    expect(read).toHaveBeenCalledTimes(2);
    expect(wrapper.empty).toHaveBeenCalledTimes(2);
    expect(wrapper.renderedMarkdown).toBe("# Note\nFresh content");
  });
});
