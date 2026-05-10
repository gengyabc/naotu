import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";

import { FileBindingSuggestModal } from "../ui/file-suggest-modal";

function createFile(path: string): TFile {
  const name = path.split("/").pop() ?? path;
  const dotIndex = name.lastIndexOf(".");
  return Object.assign(Object.create(TFile.prototype), {
    path,
    basename: dotIndex >= 0 ? name.slice(0, dotIndex) : name,
    extension: dotIndex >= 0 ? name.slice(dotIndex + 1) : "",
    parent: { path: path.split("/").slice(0, -1).join("/") || "" },
  }) as TFile;
}

describe("FileBindingSuggestModal", () => {
  it("filters markdown, image, and excalidraw files independently", () => {
    const files = [
      createFile("notes/topic.md"),
      createFile("assets/photo.png"),
      createFile("whiteboards/diagram.excalidraw.md"),
      createFile("maps/source.naotu"),
    ];
    const modal = new FileBindingSuggestModal({
      vault: { getFiles: vi.fn(() => files) },
      metadataCache: { getFileCache: vi.fn(() => ({})) },
    } as never, vi.fn());

    expect(modal.getItems().map((file) => file.path)).toEqual([
      "notes/topic.md",
      "assets/photo.png",
      "whiteboards/diagram.excalidraw.md",
    ]);

    modal.setFilterEnabled("markdown", false);
    expect(modal.getItems().map((file) => file.path)).toEqual([
      "assets/photo.png",
      "whiteboards/diagram.excalidraw.md",
    ]);

    modal.setFilterEnabled("image", false);
    expect(modal.getItems().map((file) => file.path)).toEqual(["whiteboards/diagram.excalidraw.md"]);

    modal.setFilterEnabled("excalidraw", false);
    expect(modal.getItems()).toEqual([]);
  });

  it("classifies markdown and frontmatter excalidraw targets correctly on choose", () => {
    const onChoose = vi.fn();
    const markdown = createFile("notes/topic.md");
    const excalidraw = createFile("notes/sketch.md");
    const modal = new FileBindingSuggestModal({
      vault: { getFiles: vi.fn(() => [markdown, excalidraw]) },
      metadataCache: {
        getFileCache: vi.fn((file: TFile) => (file.path === excalidraw.path ? { frontmatter: { "excalidraw-plugin": true } } : {})),
      },
    } as never, onChoose);

    modal.onChooseItem(markdown);
    modal.onChooseItem(excalidraw);

    expect(onChoose).toHaveBeenNthCalledWith(1, markdown, "markdown");
    expect(onChoose).toHaveBeenNthCalledWith(2, excalidraw, "excalidraw");
  });

  it("renders filter checkboxes into the prompt host when the modal opens", () => {
    const onChoose = vi.fn();
    const promptHost = createFakeHost();
    const resultContainer = createFakeHost();
    promptHost.appendChild(resultContainer);
    const modal = new FileBindingSuggestModal({
      vault: { getFiles: vi.fn(() => []) },
      metadataCache: { getFileCache: vi.fn(() => ({})) },
    } as never, onChoose);

    (modal as any).resultContainerEl = resultContainer;

    const originalDocument = globalThis.document;
    vi.stubGlobal("HTMLElement", FakeHTMLElement);
    vi.stubGlobal("document", {
      createElement: vi.fn((tagName: string) => new FakeHTMLElement(tagName)),
    });

    try {
      modal.open();
    } finally {
      vi.unstubAllGlobals();
      if (originalDocument) vi.stubGlobal("document", originalDocument);
    }

    expect(promptHost.children).toHaveLength(2);
    const filterContainer = promptHost.children[0];
    expect(filterContainer.className).toBe("mindmap-file-binding-filters");
    expect(filterContainer.children).toHaveLength(3);
    expect(filterContainer.children.map((child) => child.className)).toEqual([
      "mindmap-file-binding-filter",
      "mindmap-file-binding-filter",
      "mindmap-file-binding-filter",
    ]);
    expect(promptHost.children[1]).toBe(resultContainer);
  });
});

class FakeHTMLElement {
  className = "";
  type = "";
  checked = false;
  textContent = "";
  children: FakeHTMLElement[] = [];
  parentElement: FakeHTMLElement | null = null;

  constructor(public tagName: string) {}

  appendChild(child: FakeHTMLElement): FakeHTMLElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  prepend(child: FakeHTMLElement): void {
    child.parentElement = this;
    this.children.unshift(child);
  }

  before(sibling: FakeHTMLElement): void {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    const index = siblings.indexOf(this);
    sibling.parentElement = this.parentElement;
    if (index < 0) siblings.push(sibling);
    else siblings.splice(index, 0, sibling);
  }

  remove(): void {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }

  addEventListener(_type: string, _listener: EventListener): void {}
}

function createFakeHost(): FakeHTMLElement {
  return new FakeHTMLElement("div");
}
