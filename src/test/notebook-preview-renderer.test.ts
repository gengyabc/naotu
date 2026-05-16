import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { TFile, Component, MarkdownRenderer } from "obsidian";

import { globalPreviewCache } from "../core/preview-cache";
import { cleanupNotebookPreview, getPreviewMaxLines, renderNotebookPreview } from "../renderer/notebook-preview-renderer";
import { setLocale, t } from "../i18n";

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => {};
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeAll(() => {
  setLocale("zh");
});

afterAll(() => {
  setLocale("en");
});

interface FakeWrapper {
  className: string;
  classList: { toggle(token: string, force?: boolean): void };
  dataset: Record<string, string>;
  style: Record<string, string | undefined>;
  styleText?: string;
  scrollTop: number;
  clientWidth: number;
  clientHeight: number;
  scrollHeight: number;
  children?: unknown[];
  empty: () => void;
  setCssProps: (props: Record<string, string>) => void;
  createDiv: (args: { cls: string; text: string }) => void;
  appendChild: (child: unknown) => void;
  addEventListener: (type: string, listener: EventListener) => void;
  findAll: (selector: string) => Element[];
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
  renderedMarkdown?: string;
  renderedSourcePath?: string;
  textContent?: string;
}

interface FakeForeignObject {
  wrapper: FakeWrapper | null;
  querySelector: () => FakeWrapper | null;
  appendChild: (wrapper: FakeWrapper) => void;
}

function createWrapper(): FakeWrapper {
  const attributes = new Map<string, string>();
  const wrapper: FakeWrapper = {
    className: "",
    classList: {
      toggle(token: string, force?: boolean) {
        const classNames = new Set(wrapper.className.split(/\s+/).filter(Boolean));
        const shouldAdd = force !== undefined ? force : !classNames.has(token);
        if (shouldAdd) classNames.add(token);
        else classNames.delete(token);
        wrapper.className = Array.from(classNames).join(" ");
      },
    },
    dataset: {},
    style: {},
    scrollTop: 20,
    clientWidth: 200,
    clientHeight: 100,
    scrollHeight: 300,
    children: [],
    empty: vi.fn(() => {
      wrapper.children = [];
      wrapper.renderedMarkdown = undefined;
      wrapper.renderedSourcePath = undefined;
      wrapper.textContent = undefined;
    }),
    setCssProps: vi.fn((props: Record<string, string>) => {
      for (const [key, value] of Object.entries(props)) {
        if (key === "pointer-events") wrapper.style.pointerEvents = value;
      }
      Object.assign(wrapper.style, props);
    }),
    createDiv: vi.fn(),
    appendChild: vi.fn((child: unknown) => {
      wrapper.children?.push(child);
    }),
    addEventListener: vi.fn(),
    findAll: () => [],
    getAttribute: vi.fn((name: string) => attributes.get(name) ?? null),
    setAttribute: vi.fn((name: string, value: string) => {
      attributes.set(name, value);
      if (name !== "style") return;
      wrapper.styleText = value;
      for (const declaration of value.split(";")) {
        const separatorIndex = declaration.indexOf(":");
        if (separatorIndex <= 0) continue;
        const key = declaration.slice(0, separatorIndex).trim();
        const styleValue = declaration.slice(separatorIndex + 1).trim();
        if (key === "pointer-events") wrapper.style.pointerEvents = styleValue;
        (wrapper.style as Record<string, string | undefined>)[key] = styleValue;
      }
    }),
    removeAttribute: vi.fn((name: string) => {
      attributes.delete(name);
      if (name === "style") {
        wrapper.styleText = "";
        wrapper.style = {};
      }
    }),
  };
  return wrapper;
}

function stubActiveDocument(wrapper: FakeWrapper): void {
  const stubDocument = {
    createElement: vi.fn(() => wrapper),
  };
  vi.stubGlobal("document", stubDocument);
  vi.stubGlobal("activeDocument", stubDocument);
}

function createFile(path: string, basename: string): TFile {
  return Object.assign(Object.create(TFile.prototype), { path, basename }) as TFile;
}

function createApp(read: ReturnType<typeof vi.fn>) {
  return {
    vault: {
      getAbstractFileByPath: vi.fn().mockReturnValue(createFile("notes/right.md", "right")),
      read,
    },
    metadataCache: {
      getFirstLinkpathDest: vi.fn(),
    },
  } as never;
}

function createMarkdownLines(count: number): string {
  return Array.from({ length: count }, (_value, index) => `Line ${index + 1}`).join("\n");
}

describe("renderNotebookPreview", () => {
  it("computes maxLines from each notebook preview height independently", () => {
    expect(getPreviewMaxLines(120)).toBe(20);
    expect(getPreviewMaxLines(160)).toBe(24);
    expect(getPreviewMaxLines(420)).toBe(66);
  });

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
    stubActiveDocument(wrapper);

    try {
      const app = createApp(read);
      const component = new Component();
      component.load();

      await renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[Right]]",
        storedPath: "notes/right.md",
        sourcePath: "maps/source.naotu",
        previewHeight: 120,
        component,
      });

      globalPreviewCache.clear();

      await renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[Right]]",
        storedPath: "notes/right.md",
        sourcePath: "maps/source.naotu",
        previewHeight: 120,
        component,
      });

      component.unload();
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
    stubActiveDocument(wrapper);

    try {
      const app = createApp(read);
      const component = new Component();
      component.load();

      await renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[Right]]",
        storedPath: "notes/right.md",
        sourcePath: "maps/source.naotu",
        previewHeight: 120,
        component,
      });

      globalPreviewCache.clear();

      await renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[Right]]",
        storedPath: "notes/right.md",
        sourcePath: "maps/source.naotu",
        previewHeight: 120,
        component,
      });

      component.unload();
    } finally {
      vi.unstubAllGlobals();
      if (originalDocument) vi.stubGlobal("document", originalDocument);
    }

    expect(wrapper.addEventListener).toHaveBeenCalledTimes(2);
    expect(wrapper.addEventListener).toHaveBeenCalledWith("wheel", expect.any(Function));
    expect(wrapper.addEventListener).toHaveBeenCalledWith("scroll", expect.any(Function));
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
    stubActiveDocument(wrapper);

    try {
      const app = createApp(read);
      const component = new Component();
      component.load();

      await renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[Right]]",
        storedPath: "notes/right.md",
        sourcePath: "maps/source.naotu",
        previewHeight: 120,
        component,
      });

      component.unload();
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
    stubActiveDocument(wrapper);

    try {
      const app = createApp(read);
      const component = new Component();
      component.load();

      await renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[Right]]",
        storedPath: "notes/right.md",
        sourcePath: "maps/source.naotu",
        previewHeight: 120,
        component,
      });

      component.unload();
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

  it("lets modified wheel events bubble for canvas zoom", async () => {
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
    stubActiveDocument(wrapper);

    try {
      const app = createApp(read);
      const component = new Component();
      component.load();

      await renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[Right]]",
        storedPath: "notes/right.md",
        sourcePath: "maps/source.naotu",
        previewHeight: 120,
        component,
      });

      component.unload();
    } finally {
      vi.unstubAllGlobals();
      if (originalDocument) vi.stubGlobal("document", originalDocument);
    }

    const stopPropagation = vi.fn();
    wheelListener?.({ deltaY: 20, metaKey: true, stopPropagation } as unknown as Event);
    expect(stopPropagation).not.toHaveBeenCalled();
  });

  it("unloads previous child component before re-rendering", async () => {
    globalPreviewCache.clear();

    const read = vi.fn().mockResolvedValue("# Note\nContent");
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
    stubActiveDocument(wrapper);

    const addedChildren: Component[] = [];

    try {
      const app = createApp(read);
      const component = new Component();
      const origAddChild = component.addChild.bind(component);
      component.addChild = <T extends Component>(child: T): T => {
        addedChildren.push(child);
        return origAddChild(child);
      };
      component.load();

      await renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[Right]]",
        storedPath: "notes/right.md",
        sourcePath: "maps/source.naotu",
        previewHeight: 120,
        component,
      });

      expect(addedChildren.length).toBe(1);
      const firstChild = addedChildren[0];
      const firstChildUnload = vi.spyOn(firstChild, "unload");

      globalPreviewCache.clear();

      await renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[Right]]",
        storedPath: "notes/right.md",
        sourcePath: "maps/source.naotu",
        previewHeight: 120,
        component,
      });

      expect(firstChildUnload).toHaveBeenCalledTimes(1);
      expect(addedChildren.length).toBe(2);

      component.unload();
    } finally {
      vi.unstubAllGlobals();
      if (originalDocument) vi.stubGlobal("document", originalDocument);
    }
  });

  it("uses the notebook file path as sourcePath for MarkdownRenderer.render", async () => {
    globalPreviewCache.clear();

    const read = vi.fn().mockResolvedValue("# Note\nWith image ![[photo.jpg]]");
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
    stubActiveDocument(wrapper);

    try {
      const notebookFile = createFile("notebooks/华强集团.md", "华强集团");
      const app = {
        vault: {
          getAbstractFileByPath: vi.fn().mockReturnValue(notebookFile),
          read,
        },
        metadataCache: {
          getFirstLinkpathDest: vi.fn().mockReturnValue(notebookFile),
        },
      } as never;

      const component = new Component();
      component.load();

      await renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[华强集团]]",
        sourcePath: "maps/source.naotu",
        previewHeight: 120,
        component,
      });

      expect(wrapper.renderedSourcePath).toBe("notebooks/华强集团.md");

      component.unload();
    } finally {
      vi.unstubAllGlobals();
      if (originalDocument) vi.stubGlobal("document", originalDocument);
    }
  });

  it("falls back to plain text for notebook previews with fenced code blocks", async () => {
    globalPreviewCache.clear();

    const read = vi.fn().mockResolvedValue("# Note\n```ts\nconst x = 1\n```");
    const renderSpy = vi.spyOn(MarkdownRenderer, "render");
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
    stubActiveDocument(wrapper);

    try {
      const notebookFile = createFile("notebooks/code.md", "code");
      const app = {
        vault: {
          getAbstractFileByPath: vi.fn().mockReturnValue(notebookFile),
          read,
        },
        metadataCache: {
          getFirstLinkpathDest: vi.fn().mockReturnValue(notebookFile),
        },
      } as never;

      const component = new Component();
      component.load();

      await renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[code]]",
        sourcePath: "maps/source.naotu",
        previewHeight: 120,
        component,
      });

      expect(renderSpy).not.toHaveBeenCalled();
      expect(wrapper.textContent).toBe("# Note\n```ts\nconst x = 1\n```");

      component.unload();
    } finally {
      vi.unstubAllGlobals();
      if (originalDocument) vi.stubGlobal("document", originalDocument);
    }
  });

  it("ignores async preview render completion after cleanup", async () => {
    globalPreviewCache.clear();

    const read = vi.fn().mockResolvedValue("# Note\nAsync content");
    const deferred = createDeferred();
    vi.spyOn(MarkdownRenderer, "render").mockImplementation(async (_app, markdown, wrapper, sourcePath) => {
      await deferred.promise;
      (wrapper as unknown as FakeWrapper).renderedMarkdown = markdown;
      (wrapper as unknown as FakeWrapper).renderedSourcePath = sourcePath;
    });

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
    stubActiveDocument(wrapper);

    try {
      const app = createApp(read);
      const component = new Component();
      component.load();

      const renderPromise = renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[Right]]",
        storedPath: "notes/right.md",
        sourcePath: "maps/source.naotu",
        previewHeight: 120,
        component,
      });

      cleanupNotebookPreview(foreignObject as never);
      deferred.resolve();
      await renderPromise;

      expect(wrapper.renderedMarkdown).toBeUndefined();
      expect(wrapper.renderedSourcePath).toBeUndefined();

      component.unload();
    } finally {
      vi.unstubAllGlobals();
      if (originalDocument) vi.stubGlobal("document", originalDocument);
    }
  });

  it("retries preview rendering after a previously missing notebook becomes available", async () => {
    globalPreviewCache.clear();

    const read = vi.fn().mockResolvedValue("# Note\nRecovered content");
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
    stubActiveDocument(wrapper);

    try {
      const app = {
        vault: {
          getAbstractFileByPath: vi.fn().mockReturnValue(null),
          read,
        },
        metadataCache: {
          getFirstLinkpathDest: vi
            .fn()
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(createFile("notes/right.md", "right")),
        },
      } as never;

      const component = new Component();
      component.load();

      await renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[Right]]",
        sourcePath: "maps/source.naotu",
        previewHeight: 120,
        component,
      });

      expect(wrapper.createDiv).toHaveBeenCalledWith({ cls: "mindmap-preview-empty", text: t("renderer.cannotPreviewNotebook") });

      await renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[Right]]",
        sourcePath: "maps/source.naotu",
        previewHeight: 120,
        component,
      });

      expect(read).toHaveBeenCalledTimes(1);
      expect(wrapper.renderedMarkdown).toBe("# Note\nRecovered content");

      component.unload();
    } finally {
      vi.unstubAllGlobals();
      if (originalDocument) vi.stubGlobal("document", originalDocument);
    }
  });

  it("rerenders more lines when the same notebook preview gets taller", async () => {
    globalPreviewCache.clear();

    const read = vi.fn().mockResolvedValue(createMarkdownLines(80));
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
    stubActiveDocument(wrapper);

    try {
      const app = createApp(read);
      const component = new Component();
      component.load();

      await renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[Right]]",
        storedPath: "notes/right.md",
        sourcePath: "maps/source.naotu",
        previewHeight: 120,
        component,
      });

      const shortPreview = wrapper.renderedMarkdown ?? "";
      expect(shortPreview.split("\n")).toHaveLength(getPreviewMaxLines(120));

      await renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[Right]]",
        storedPath: "notes/right.md",
        sourcePath: "maps/source.naotu",
        previewHeight: 420,
        component,
      });

      const tallPreview = wrapper.renderedMarkdown ?? "";
      expect(tallPreview.split("\n")).toHaveLength(getPreviewMaxLines(420));
      expect(tallPreview).toContain("Line 66");
      expect(tallPreview).not.toEqual(shortPreview);

      component.unload();
    } finally {
      vi.unstubAllGlobals();
      if (originalDocument) vi.stubGlobal("document", originalDocument);
    }
  });

  it("loads more lines when scrolling near the bottom of a long notebook preview", async () => {
    globalPreviewCache.clear();

    const read = vi.fn().mockResolvedValue(createMarkdownLines(120));
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
    let scrollListener: EventListener | undefined;
    wrapper.addEventListener = vi.fn((type: string, listener: EventListener) => {
      if (type === "scroll") scrollListener = listener;
    });

    const originalDocument = globalThis.document;
    stubActiveDocument(wrapper);

    try {
      const app = createApp(read);
      const component = new Component();
      component.load();

      await renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[Right]]",
        storedPath: "notes/right.md",
        sourcePath: "maps/source.naotu",
        previewHeight: 120,
        component,
      });

      expect((wrapper.renderedMarkdown ?? "").split("\n")).toHaveLength(getPreviewMaxLines(120));

      wrapper.clientHeight = 100;
      wrapper.scrollHeight = 360;
      wrapper.scrollTop = 260;
      await (scrollListener as (() => Promise<void>) | undefined)?.();
      await vi.waitFor(() => {
        expect((wrapper.renderedMarkdown ?? "").split("\n")).toHaveLength(40);
      });

      expect(read).toHaveBeenCalledTimes(1);

      component.unload();
    } finally {
      vi.unstubAllGlobals();
      if (originalDocument) vi.stubGlobal("document", originalDocument);
    }
  });

  it("renders embedded markdown for image targets using mindmap source path", async () => {
    globalPreviewCache.clear();

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
    stubActiveDocument(wrapper);

    try {
      const imageFile = createFile("assets/photo.png", "photo");
      const app = {
        vault: {
          getAbstractFileByPath: vi.fn().mockReturnValue(imageFile),
          read: vi.fn(),
        },
        metadataCache: {
          getFirstLinkpathDest: vi.fn().mockReturnValue(imageFile),
        },
      } as never;

      const component = new Component();
      component.load();

      await renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[photo.png]]",
        sourcePath: "maps/source.naotu",
        targetKind: "image",
        previewWidth: 200,
        previewHeight: 120,
        component,
      });

      expect(wrapper.renderedMarkdown).toBe("![[assets/photo.png|200x120]]");
      expect(wrapper.renderedSourcePath).toBe("maps/source.naotu");
      expect(wrapper.className).toContain("is-embedded-file");
      expect(wrapper.className).not.toContain("is-interactive");

      component.unload();
    } finally {
      vi.unstubAllGlobals();
      if (originalDocument) vi.stubGlobal("document", originalDocument);
    }
  });

  it("reapplies excalidraw sizing when the preview wrapper is resized", async () => {
    globalPreviewCache.clear();

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
    const embedClassCalls: string[] = [];
    const imageClassCalls: string[] = [];
    const embedElement = {
      classList: {
        add: vi.fn((cls: string) => {
          embedClassCalls.push(cls);
        }),
      },
    };
    const imageElement = {
      classList: {
        add: vi.fn((cls: string) => {
          imageClassCalls.push(cls);
        }),
      },
      removeAttribute: vi.fn(),
    };
    wrapper.findAll = vi.fn((selector: string) => {
      if (selector.includes(".internal-embed")) return [embedElement as unknown as Element];
      if (selector.includes("img.excalidraw-svg") || selector.includes("svg.excalidraw-svg")) {
        return [imageElement as unknown as Element];
      }
      if (selector.includes("excalidraw-svg")) return [embedElement as unknown as Element];
      return [];
    });

    const resizeObservers: Array<{ callback: ResizeObserverCallback; observe: ReturnType<typeof vi.fn> }> = [];
    class FakeResizeObserver {
      observe = vi.fn();
      disconnect = vi.fn();

      constructor(callback: ResizeObserverCallback) {
        resizeObservers.push({ callback, observe: this.observe });
      }
    }

    const originalDocument = globalThis.document;
    const originalResizeObserver = globalThis.ResizeObserver;
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    stubActiveDocument(wrapper);
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(cb, 0));

    try {
      const excalidrawFile = createFile("whiteboards/diagram.excalidraw.md", "diagram.excalidraw");
      const app = {
        vault: {
          getAbstractFileByPath: vi.fn().mockReturnValue(excalidrawFile),
          read: vi.fn(),
        },
        metadataCache: {
          getFirstLinkpathDest: vi.fn().mockReturnValue(excalidrawFile),
        },
      } as never;

      const component = new Component();
      component.load();

      await renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[diagram.excalidraw.md]]",
        sourcePath: "maps/source.naotu",
        targetKind: "excalidraw",
        previewWidth: 200,
        previewHeight: 120,
        component,
      });

      expect(wrapper.renderedMarkdown).toBe("![[whiteboards/diagram.excalidraw.md|200x120]]");
      expect(resizeObservers.length).toBeGreaterThan(0);
      const lastResizeObserver = resizeObservers[resizeObservers.length - 1];
      expect(lastResizeObserver?.observe).toHaveBeenCalledWith(wrapper);
      expect(wrapper.getAttribute("style")).toContain("--mindmap-embed-width: 200px");
      expect(wrapper.getAttribute("style")).toContain("--mindmap-embed-height: 100px");
      expect(embedClassCalls).toContain("mindmap-embedded-preview-content");
      expect(imageClassCalls).toContain("mindmap-embedded-preview-media");

      wrapper.clientWidth = 260;
      wrapper.clientHeight = 180;
      lastResizeObserver?.callback([] as ResizeObserverEntry[], {} as ResizeObserver);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(wrapper.getAttribute("style")).toContain("--mindmap-embed-width: 260px");
      expect(wrapper.getAttribute("style")).toContain("--mindmap-embed-height: 180px");
      expect(imageElement.removeAttribute).toHaveBeenCalledWith("width");
      expect(imageElement.removeAttribute).toHaveBeenCalledWith("height");

      component.unload();
    } finally {
      vi.unstubAllGlobals();
      if (originalDocument) vi.stubGlobal("document", originalDocument);
      if (originalResizeObserver) vi.stubGlobal("ResizeObserver", originalResizeObserver);
      if (originalRequestAnimationFrame) vi.stubGlobal("requestAnimationFrame", originalRequestAnimationFrame);
    }
  });

  it("renders excalidraw files through ExcalidrawAutomate instead of markdown embeds", async () => {
    globalPreviewCache.clear();

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
    const svg = {
      classList: { add: vi.fn() },
      removeAttribute: vi.fn(),
      style: { setProperty: vi.fn() },
    };
    const createSVG = vi.fn().mockResolvedValue(svg);
    const reset = vi.fn();
    const originalDocument = globalThis.document;
    stubActiveDocument(wrapper);

    try {
      const excalidrawFile = createFile("whiteboards/diagram.excalidraw.md", "diagram.excalidraw");
      const app = {
        vault: {
          getAbstractFileByPath: vi.fn().mockReturnValue(excalidrawFile),
          read: vi.fn(),
        },
        metadataCache: {
          getFirstLinkpathDest: vi.fn().mockReturnValue(excalidrawFile),
        },
        plugins: {
          plugins: {
            "obsidian-excalidraw-plugin": {
              ea: { reset, createSVG },
            },
          },
        },
      } as never;

      const component = new Component();
      component.load();

      await renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[diagram.excalidraw.md]]",
        sourcePath: "maps/source.naotu",
        targetKind: "excalidraw",
        previewWidth: 200,
        previewHeight: 120,
        component,
      });

      expect(reset).toHaveBeenCalledTimes(1);
      expect(createSVG).toHaveBeenCalledWith(
        "whiteboards/diagram.excalidraw.md",
        false,
        expect.objectContaining({ withBackground: true, withTheme: true, isMask: false, skipInliningFonts: true }),
        undefined,
        undefined,
        0,
      );
      expect(wrapper.renderedMarkdown).toBeUndefined();
      expect(wrapper.appendChild).toHaveBeenCalledWith(svg);
      expect(svg.removeAttribute).toHaveBeenCalledWith("width");
      expect(svg.removeAttribute).toHaveBeenCalledWith("height");

      component.unload();
    } finally {
      vi.unstubAllGlobals();
      if (originalDocument) vi.stubGlobal("document", originalDocument);
    }
  });

  it("drops stale excalidraw resize renders that finish out of order", async () => {
    globalPreviewCache.clear();

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
    stubActiveDocument(wrapper);

    type RenderedSvg = {
      classList: { add: ReturnType<typeof vi.fn> };
      removeAttribute: ReturnType<typeof vi.fn>;
      style: { setProperty: ReturnType<typeof vi.fn> };
    };
    let resolveFirst!: (value: RenderedSvg) => void;
    let resolveSecond!: (value: RenderedSvg) => void;
    const firstSvg = {
      classList: { add: vi.fn() },
      removeAttribute: vi.fn(),
      style: { setProperty: vi.fn() },
    };
    const secondSvg = {
      classList: { add: vi.fn() },
      removeAttribute: vi.fn(),
      style: { setProperty: vi.fn() },
    };
    const firstPromise = new Promise<RenderedSvg>((resolve) => {
      resolveFirst = resolve;
    });
    const secondPromise = new Promise<RenderedSvg>((resolve) => {
      resolveSecond = resolve;
    });
    const createSVG = vi.fn()
      .mockImplementationOnce(() => firstPromise)
      .mockImplementationOnce(() => secondPromise);

    try {
      const excalidrawFile = createFile("whiteboards/diagram.excalidraw.md", "diagram.excalidraw");
      const app = {
        vault: {
          getAbstractFileByPath: vi.fn().mockReturnValue(excalidrawFile),
          read: vi.fn(),
        },
        metadataCache: {
          getFirstLinkpathDest: vi.fn().mockReturnValue(excalidrawFile),
        },
        plugins: {
          plugins: {
            "obsidian-excalidraw-plugin": {
              ea: { reset: vi.fn(), createSVG },
            },
          },
        },
      } as never;

      const component = new Component();
      component.load();

      const firstRender = renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[diagram.excalidraw.md]]",
        sourcePath: "maps/source.naotu",
        targetKind: "excalidraw",
        previewWidth: 200,
        previewHeight: 120,
        component,
      });

      const secondRender = renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[diagram.excalidraw.md]]",
        sourcePath: "maps/source.naotu",
        targetKind: "excalidraw",
        previewWidth: 260,
        previewHeight: 180,
        component,
      });

      resolveSecond(secondSvg);
      await secondRender;
      resolveFirst(firstSvg);
      await firstRender;

      expect(wrapper.appendChild).toHaveBeenCalledTimes(1);
      expect(wrapper.appendChild).toHaveBeenCalledWith(secondSvg);

      component.unload();
    } finally {
      vi.unstubAllGlobals();
      if (originalDocument) vi.stubGlobal("document", originalDocument);
    }
  });

  it("keeps in-flight excalidraw render when a duplicate-size rerender arrives", async () => {
    globalPreviewCache.clear();

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
    stubActiveDocument(wrapper);

    type RenderedSvg = {
      classList: { add: ReturnType<typeof vi.fn> };
      removeAttribute: ReturnType<typeof vi.fn>;
      style: { setProperty: ReturnType<typeof vi.fn> };
    };
    let resolveSvg!: (value: RenderedSvg) => void;
    const svg = {
      classList: { add: vi.fn() },
      removeAttribute: vi.fn(),
      style: { setProperty: vi.fn() },
    };
    const svgPromise = new Promise<RenderedSvg>((resolve) => {
      resolveSvg = resolve;
    });
    const createSVG = vi.fn().mockImplementationOnce(() => svgPromise);

    try {
      const excalidrawFile = createFile("whiteboards/diagram.excalidraw.md", "diagram.excalidraw");
      const app = {
        vault: {
          getAbstractFileByPath: vi.fn().mockReturnValue(excalidrawFile),
          read: vi.fn(),
        },
        metadataCache: {
          getFirstLinkpathDest: vi.fn().mockReturnValue(excalidrawFile),
        },
        plugins: {
          plugins: {
            "obsidian-excalidraw-plugin": {
              ea: { reset: vi.fn(), createSVG },
            },
          },
        },
      } as never;

      const component = new Component();
      component.load();

      const firstRender = renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[diagram.excalidraw.md]]",
        sourcePath: "maps/source.naotu",
        targetKind: "excalidraw",
        previewWidth: 200,
        previewHeight: 120,
        component,
      });

      const secondRender = renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[diagram.excalidraw.md]]",
        sourcePath: "maps/source.naotu",
        targetKind: "excalidraw",
        previewWidth: 200,
        previewHeight: 120,
        component,
      });

      resolveSvg(svg);
      await Promise.all([firstRender, secondRender]);

      expect(createSVG).toHaveBeenCalledTimes(1);
      expect(wrapper.appendChild).toHaveBeenCalledTimes(1);
      expect(wrapper.appendChild).toHaveBeenCalledWith(svg);

      component.unload();
    } finally {
      vi.unstubAllGlobals();
      if (originalDocument) vi.stubGlobal("document", originalDocument);
    }
  });

  it("keeps the previous excalidraw preview visible until a resize rerender completes", async () => {
    globalPreviewCache.clear();

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
    stubActiveDocument(wrapper);

    type RenderedSvg = {
      classList: { add: ReturnType<typeof vi.fn> };
      removeAttribute: ReturnType<typeof vi.fn>;
      style: { setProperty: ReturnType<typeof vi.fn> };
    };
    const firstSvg = {
      classList: { add: vi.fn() },
      removeAttribute: vi.fn(),
      style: { setProperty: vi.fn() },
    };
    let resolveSecond!: (value: RenderedSvg) => void;
    const secondSvg = {
      classList: { add: vi.fn() },
      removeAttribute: vi.fn(),
      style: { setProperty: vi.fn() },
    };
    const secondPromise = new Promise<RenderedSvg>((resolve) => {
      resolveSecond = resolve;
    });
    const createSVG = vi.fn()
      .mockResolvedValueOnce(firstSvg)
      .mockImplementationOnce(() => secondPromise);

    try {
      const excalidrawFile = createFile("whiteboards/diagram.excalidraw.md", "diagram.excalidraw");
      const app = {
        vault: {
          getAbstractFileByPath: vi.fn().mockReturnValue(excalidrawFile),
          read: vi.fn(),
        },
        metadataCache: {
          getFirstLinkpathDest: vi.fn().mockReturnValue(excalidrawFile),
        },
        plugins: {
          plugins: {
            "obsidian-excalidraw-plugin": {
              ea: { reset: vi.fn(), createSVG },
            },
          },
        },
      } as never;

      const component = new Component();
      component.load();

      await renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[diagram.excalidraw.md]]",
        sourcePath: "maps/source.naotu",
        targetKind: "excalidraw",
        previewWidth: 200,
        previewHeight: 120,
        component,
      });

      expect(wrapper.children).toEqual([firstSvg]);

      const secondRender = renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[diagram.excalidraw.md]]",
        sourcePath: "maps/source.naotu",
        targetKind: "excalidraw",
        previewWidth: 260,
        previewHeight: 180,
        component,
      });

      expect(wrapper.children).toEqual([firstSvg]);

      resolveSecond(secondSvg);
      await secondRender;

      expect(wrapper.children).toEqual([secondSvg]);

      component.unload();
    } finally {
      vi.unstubAllGlobals();
      if (originalDocument) vi.stubGlobal("document", originalDocument);
    }
  });

  it("does not observe embedded preview attribute mutations that it triggers itself", async () => {
    globalPreviewCache.clear();

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
    const mutationObserverCalls: MutationObserverInit[] = [];
    class FakeMutationObserver {
      disconnect = vi.fn();

      constructor(_callback: MutationCallback) {}

      observe(_target: Node, options?: MutationObserverInit): void {
        mutationObserverCalls.push(options ?? {});
      }
    }

    const originalDocument = globalThis.document;
    const originalMutationObserver = globalThis.MutationObserver;
    stubActiveDocument(wrapper);
    vi.stubGlobal("MutationObserver", FakeMutationObserver);

    try {
      const imageFile = createFile("assets/photo.png", "photo");
      const app = {
        vault: {
          getAbstractFileByPath: vi.fn().mockReturnValue(imageFile),
          read: vi.fn(),
        },
        metadataCache: {
          getFirstLinkpathDest: vi.fn().mockReturnValue(imageFile),
        },
      } as never;

      const component = new Component();
      component.load();

      await renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[photo.png]]",
        sourcePath: "maps/source.naotu",
        targetKind: "image",
        previewWidth: 200,
        previewHeight: 120,
        component,
      });

      expect(mutationObserverCalls.length).toBeGreaterThan(0);
      expect(mutationObserverCalls[mutationObserverCalls.length - 1]).toEqual({ childList: true, subtree: true });

      component.unload();
    } finally {
      vi.unstubAllGlobals();
      if (originalDocument) vi.stubGlobal("document", originalDocument);
      if (originalMutationObserver) vi.stubGlobal("MutationObserver", originalMutationObserver);
    }
  });

  it("keeps markdown preview wrappers interactive", async () => {
    globalPreviewCache.clear();

    const read = vi.fn().mockResolvedValue("# Note\nBody");
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
    stubActiveDocument(wrapper);

    try {
      const app = createApp(read);
      const component = new Component();
      component.load();

      await renderNotebookPreview({
        app,
        foreignObject: foreignObject as never,
        link: "[[Right]]",
        storedPath: "notes/right.md",
        sourcePath: "maps/source.naotu",
        targetKind: "markdown",
        previewHeight: 120,
        component,
      });

      expect(wrapper.className).toContain("is-interactive");

      component.unload();
    } finally {
      vi.unstubAllGlobals();
      if (originalDocument) vi.stubGlobal("document", originalDocument);
    }
  });
});
