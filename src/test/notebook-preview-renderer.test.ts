import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";

import { globalPreviewCache } from "../core/preview-cache";
import { renderNotebookPreview } from "../renderer/notebook-preview-renderer";

interface FakeWrapper {
  className: string;
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  renderedMarkdown?: string;
  empty: () => void;
  createDiv: (args: { cls: string; text: string }) => void;
  addEventListener: (type: string, listener: EventListener) => void;
}

interface FakeForeignObject {
  wrapper: FakeWrapper | null;
  querySelector: () => FakeWrapper | null;
  appendChild: (wrapper: FakeWrapper) => void;
}

function createWrapper(): FakeWrapper {
  return {
    className: "",
    scrollTop: 20,
    clientHeight: 100,
    scrollHeight: 300,
    empty: vi.fn(),
    createDiv: vi.fn(),
    addEventListener: vi.fn(),
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
        sourcePath: "maps/source.naotu",
      });

      globalPreviewCache.clear();

      await renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[Right]]",
        storedPath: "notes/right.md",
        sourcePath: "maps/source.naotu",
      });
    } finally {
      vi.unstubAllGlobals();
      if (originalDocument) vi.stubGlobal("document", originalDocument);
    }

    expect(read).toHaveBeenCalledTimes(2);
    expect(wrapper.empty).toHaveBeenCalledTimes(2);
    expect(wrapper.renderedMarkdown).toBe("# Note\nFresh content");
  });

  it("binds wheel handling once so preview scrolling does not bubble to canvas zoom", async () => {
    globalPreviewCache.clear();

    const read = vi.fn().mockResolvedValue("# Note\nFresh content");
    const foreignObject: FakeForeignObject = {
      wrapper: null,
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
        sourcePath: "maps/source.naotu",
      });

      globalPreviewCache.clear();

      await renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[Right]]",
        storedPath: "notes/right.md",
        sourcePath: "maps/source.naotu",
      });
    } finally {
      vi.unstubAllGlobals();
      if (originalDocument) vi.stubGlobal("document", originalDocument);
    }

    expect(wrapper.addEventListener).toHaveBeenCalledTimes(1);
    expect(wrapper.addEventListener).toHaveBeenCalledWith("wheel", expect.any(Function));
  });

  it("keeps wheel events inside the preview while it can still scroll", async () => {
    globalPreviewCache.clear();

    const read = vi.fn().mockResolvedValue("# Note\nFresh content");
    const foreignObject: FakeForeignObject = {
      wrapper: null,
      querySelector: vi.fn(function (this: FakeForeignObject) {
        return this.wrapper;
      }),
      appendChild: vi.fn(function (this: FakeForeignObject, wrapper: FakeWrapper) {
        this.wrapper = wrapper;
      }),
    };

    const wrapper = createWrapper();
    let wheelListener: EventListener | undefined;
    wrapper.addEventListener = vi.fn((type: string, listener: EventListener) => {
      if (type === "wheel") wheelListener = listener;
    });

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
        sourcePath: "maps/source.naotu",
      });
    } finally {
      vi.unstubAllGlobals();
      if (originalDocument) vi.stubGlobal("document", originalDocument);
    }

    const stopPropagation = vi.fn();
    wheelListener?.({ deltaY: 20, stopPropagation } as unknown as Event);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("lets wheel events bubble when the preview is already at the top or bottom", async () => {
    globalPreviewCache.clear();

    const read = vi.fn().mockResolvedValue("# Note\nFresh content");
    const foreignObject: FakeForeignObject = {
      wrapper: null,
      querySelector: vi.fn(function (this: FakeForeignObject) {
        return this.wrapper;
      }),
      appendChild: vi.fn(function (this: FakeForeignObject, wrapper: FakeWrapper) {
        this.wrapper = wrapper;
      }),
    };

    const wrapper = createWrapper();
    let wheelListener: EventListener | undefined;
    wrapper.addEventListener = vi.fn((type: string, listener: EventListener) => {
      if (type === "wheel") wheelListener = listener;
    });

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
        sourcePath: "maps/source.naotu",
      });
    } finally {
      vi.unstubAllGlobals();
      if (originalDocument) vi.stubGlobal("document", originalDocument);
    }

    wrapper.scrollTop = 0;
    const stopAtTop = vi.fn();
    wheelListener?.({ deltaY: -20, stopPropagation: stopAtTop } as unknown as Event);
    expect(stopAtTop).not.toHaveBeenCalled();

    wrapper.scrollTop = wrapper.scrollHeight - wrapper.clientHeight;
    const stopAtBottom = vi.fn();
    wheelListener?.({ deltaY: 20, stopPropagation: stopAtBottom } as unknown as Event);
    expect(stopAtBottom).not.toHaveBeenCalled();
  });
});
