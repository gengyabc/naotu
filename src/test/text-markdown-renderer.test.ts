import { describe, expect, it, vi, beforeEach } from "vitest";
import { App, Component, MarkdownRenderer } from "obsidian";
import { renderTextAsMarkdown } from "../renderer/text-markdown-renderer";

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => {};
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createFakeForeignObject() {
  const children: HTMLElement[] = [];
  return {
    children,
    querySelector: vi.fn((selector: string) => {
      if (selector === ".mindmap-text-markdown-wrapper") {
        return children.find((c) => c.classList.contains("mindmap-text-markdown-wrapper")) ?? null;
      }
      return null;
    }),
    appendChild: vi.fn((child: HTMLElement) => {
      children.push(child);
    }),
    closest: vi.fn(() => null),
  } as unknown as SVGForeignObjectElement;
}

function createFakeElement() {
  const classList = new Set<string>();
  const children: HTMLElement[] = [];
  return {
    children,
    classList: {
      contains: (name: string) => classList.has(name),
      add: (name: string) => classList.add(name),
      remove: (name: string) => classList.delete(name),
      toggle: (name: string, force?: boolean) => {
        if (force === false || (force === undefined && classList.has(name))) classList.delete(name);
        else classList.add(name);
      },
    },
    empty: vi.fn(() => {
      children.length = 0;
    }),
    appendChild: vi.fn((child: HTMLElement) => {
      children.push(child);
    }),
  } as unknown as HTMLElement;
}

describe("text-markdown-renderer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates wrapper and calls MarkdownRenderer.render with correct markdown", async () => {
    const foreignObject = createFakeForeignObject();
    const app = new App();
    const component = new Component();
    const renderSpy = vi.spyOn(MarkdownRenderer, "render");

    await renderTextAsMarkdown({
      app,
      foreignObject,
      markdown: "**bold** and *italic*",
      fontSize: 14,
      sourcePath: "test.md",
      component,
    });

    expect(foreignObject.appendChild).toHaveBeenCalled();
    expect(renderSpy).toHaveBeenCalledWith(
      app,
      "**bold** and *italic*",
      expect.anything(),
      "test.md",
      expect.anything(),
    );
  });

  it("reuses existing wrapper on subsequent calls", async () => {
    const existingWrapper = createFakeElement();
    const foreignObject = {
      querySelector: vi.fn(() => existingWrapper),
      appendChild: vi.fn(),
      closest: vi.fn(() => null),
    } as unknown as SVGForeignObjectElement;

    const app = new App();
    const component = new Component();

    await renderTextAsMarkdown({
      app,
      foreignObject,
      markdown: "second render",
      fontSize: 14,
      sourcePath: "test.md",
      component,
    });

    expect(foreignObject.appendChild).not.toHaveBeenCalled();
    expect(existingWrapper.empty).toHaveBeenCalled();
  });

  it("falls back to plain text on render failure", async () => {
    const wrapper = createFakeElement();
    const foreignObject = {
      querySelector: vi.fn(() => wrapper),
      appendChild: vi.fn(),
      closest: vi.fn(() => null),
    } as unknown as SVGForeignObjectElement;

    vi.spyOn(MarkdownRenderer, "render").mockRejectedValueOnce(new Error("render failed"));

    await expect(renderTextAsMarkdown({
      app: new App(),
      foreignObject,
      markdown: "fallback content",
      fontSize: 14,
      sourcePath: "test.md",
      component: new Component(),
    })).resolves.toBeUndefined();

    expect((wrapper as any).textContent).toBe("fallback content");
  });

  it("skips markdown rendering for oversized text-node content", async () => {
    const wrapper = createFakeElement();
    const foreignObject = {
      querySelector: vi.fn(() => wrapper),
      appendChild: vi.fn(),
      closest: vi.fn(() => null),
    } as unknown as SVGForeignObjectElement;

    const renderSpy = vi.spyOn(MarkdownRenderer, "render");
    const longMarkdown = `**${"这是一段很长的文本节点内容".repeat(8)}**`;

    await renderTextAsMarkdown({
      app: new App(),
      foreignObject,
      markdown: longMarkdown,
      fontSize: 14,
      sourcePath: "test.md",
      component: new Component(),
    });

    expect(renderSpy).not.toHaveBeenCalled();
    expect((wrapper as any).textContent.length).toBeLessThan(longMarkdown.length);
  });

  it("ignores stale async renders without clearing newer content", async () => {
    const foreignObject = createFakeForeignObject();
    const app = new App();
    const component = new Component();
    const first = createDeferred();
    const second = createDeferred();

    vi.spyOn(MarkdownRenderer, "render").mockImplementation(async (_app, markdown, wrapper) => {
      if (markdown === "first") {
        await first.promise;
      } else {
        await second.promise;
      }
      (wrapper as { textContent?: string }).textContent = markdown;
    });

    const firstRender = renderTextAsMarkdown({
      app,
      foreignObject,
      markdown: "first",
      fontSize: 14,
      sourcePath: "test.md",
      component,
    });
    const secondRender = renderTextAsMarkdown({
      app,
      foreignObject,
      markdown: "second",
      fontSize: 14,
      sourcePath: "test.md",
      component,
    });

    second.resolve();
    await secondRender;

    const wrapper = foreignObject.children[0] as HTMLElement;
    expect(wrapper.textContent).toBe("second");

    first.resolve();
    await firstRender;

    expect(wrapper.textContent).toBe("second");
  });
});
