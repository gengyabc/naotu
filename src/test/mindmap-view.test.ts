import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Menu, Notice, TFile, WorkspaceLeaf } from "obsidian";

import { DEFAULT_SETTINGS } from "../types/settings";
import { MindmapView } from "../view/mindmap-view";
import type { MindmapDocument, ProjectedNode } from "../types/mindmap";
import { createNotebookFile, createSmallTestDocument, createSourceMindmapFile } from "./test-fixtures";

const hoisted = vi.hoisted(() => {
  class FakeRenderer {
    static instances: FakeRenderer[] = [];
    options: any;
    projectedNodes: ProjectedNode[] = [];
    render = vi.fn();
    mount = vi.fn();
    unmount = vi.fn();
    focusNode = vi.fn();
    setLastFocusNodeId = vi.fn();
    forceDetailLevel = vi.fn();
    setSearchResultIds = vi.fn();
    setConnectionState = vi.fn();
    setMissingNotebookNodeIds = vi.fn();
    startInlineEditByNodeId = vi.fn();
    zoomBy = vi.fn();
    fitRoot = vi.fn();
    jumpToWorldPoint = vi.fn();
    getViewportWorldRect = vi.fn(() => ({ x: 0, y: 0, width: 1200, height: 800 }));

    constructor(options: any) {
      this.options = options;
      FakeRenderer.instances.push(this);
    }

    getLastProjectedNodes(): ProjectedNode[] {
      return this.projectedNodes;
    }
  }

  class FakeMarkdownFileSuggestModal {
    static lastInstance: FakeMarkdownFileSuggestModal | null = null;
    opened = false;

    constructor(
      public app: unknown,
      private onChoose: (file: TFile) => void,
    ) {
      FakeMarkdownFileSuggestModal.lastInstance = this;
    }

    open(): this {
      this.opened = true;
      return this;
    }

    choose(file: TFile): void {
      this.onChoose(file);
    }
  }

  class FakeMinimapRenderer {
    render = vi.fn();
    remove = vi.fn();
  }

  class FakePerformanceDebugOverlay {
    update = vi.fn();
    remove = vi.fn();
  }

  return {
    FakeRenderer,
    FakeMarkdownFileSuggestModal,
    FakeMinimapRenderer,
    FakePerformanceDebugOverlay,
    renderMindmapToSvgString: vi.fn(() => "<svg />"),
    renderSvgStringToPngArrayBuffer: vi.fn(async () => new ArrayBuffer(16)),
  };
});

vi.mock("../renderer/svg-mindmap-renderer", () => ({
  SvgMindmapRenderer: hoisted.FakeRenderer,
}));

vi.mock("../renderer/hybrid-mindmap-renderer", () => ({
  HybridMindmapRenderer: hoisted.FakeRenderer,
}));

vi.mock("../renderer/minimap-renderer", () => ({
  MinimapRenderer: hoisted.FakeMinimapRenderer,
}));

vi.mock("../ui/performance-debug-overlay", () => ({
  PerformanceDebugOverlay: hoisted.FakePerformanceDebugOverlay,
}));

vi.mock("../ui/file-suggest-modal", () => ({
  MarkdownFileSuggestModal: hoisted.FakeMarkdownFileSuggestModal,
}));

vi.mock("../renderer/export-renderer", () => ({
  renderMindmapToSvgString: hoisted.renderMindmapToSvgString,
  renderSvgStringToPngArrayBuffer: hoisted.renderSvgStringToPngArrayBuffer,
}));

type FileRecord = {
  file: TFile;
  content?: string;
  binary?: ArrayBuffer;
  cache?: { headings?: Array<{ heading?: string }>; blocks?: Record<string, unknown> };
};

function serializeDocument(doc: MindmapDocument): string {
  return JSON.stringify(doc, null, 2);
}

function createProjectedNode(args: {
  id: string;
  title: string;
  x: number;
  y: number;
  kind?: "text" | "notebook";
  hasChildren?: boolean;
  childrenExpanded?: boolean;
}): ProjectedNode {
  return {
    id: args.id,
    sourceNodeId: args.id,
    kind: args.kind ?? "text",
    title: args.title,
    worldX: args.x,
    worldY: args.y,
    projectedX: args.x,
    projectedY: args.y,
    displayWidth: 180,
    displayHeight: 56,
    detailLevel: 3,
    isRoot: args.id === "root",
    isFocus: false,
    isSelected: false,
    isHovered: false,
    isAncestorPath: false,
    hasChildren: args.hasChildren ?? false,
    childrenExpanded: args.childrenExpanded ?? true,
    showOpenNotebookButton: false,
    showResizeHandle: false,
    usesCustomSize: false,
  };
}

function createHarness(args: { document?: MindmapDocument } = {}) {
  const sourceFile = createSourceMindmapFile("maps/source.naotu");
  const fileRecords = new Map<string, FileRecord>();
  const folders = new Map<string, { path: string }>();
  const document = args.document ?? createSmallTestDocument();
  fileRecords.set(sourceFile.path, { file: sourceFile, content: serializeDocument(document) });

  const getByPath = (path: string): FileRecord | undefined => fileRecords.get(path);

  const vault = {
    read: vi.fn(async (file: TFile) => getByPath(file.path)?.content ?? ""),
    modify: vi.fn(async (file: TFile, content: string) => {
      const record = getByPath(file.path);
      if (record) record.content = content;
    }),
    create: vi.fn(async (path: string, content: string) => {
      const file = path.endsWith(".md") ? createNotebookFile(path) : createSourceMindmapFile(path);
      fileRecords.set(file.path, { file, content });
      return file;
    }),
    createBinary: vi.fn(async (path: string, binary: ArrayBuffer) => {
      const file = createSourceMindmapFile(path);
      fileRecords.set(file.path, { file, binary });
      return file;
    }),
    modifyBinary: vi.fn(async (file: TFile, binary: ArrayBuffer) => {
      const record = getByPath(file.path);
      if (record) record.binary = binary;
    }),
    getAbstractFileByPath: vi.fn((path: string) => getByPath(path)?.file ?? folders.get(path) ?? null),
    createFolder: vi.fn(async (path: string) => {
      folders.set(path, { path });
    }),
    getMarkdownFiles: vi.fn(() => [...fileRecords.values()].map((record) => record.file).filter((file) => file.extension === "md")),
    getFiles: vi.fn(() => [...fileRecords.values()].map((record) => record.file)),
    on: vi.fn(),
  };

  const metadataCache = {
    getFirstLinkpathDest: vi.fn((path: string) => {
      for (const record of fileRecords.values()) {
        if (record.file.path === path || record.file.basename === path || record.file.path.endsWith(`/${path}.md`)) {
          return record.file;
        }
      }
      return null;
    }),
    getFileCache: vi.fn((file: TFile) => getByPath(file.path)?.cache ?? {}),
  };

  const createLeaf = (): WorkspaceLeaf => Object.assign(Object.create(WorkspaceLeaf.prototype), { app, view: null, lastOpenedFile: null }) as WorkspaceLeaf;

  const workspace = {
    getLeaf: vi.fn(() => createLeaf()),
    getLeavesOfType: vi.fn(() => []),
    revealLeaf: vi.fn(),
    getActiveFile: vi.fn(() => null),
  };

  const fileManager = {
    renameFile: vi.fn(async (file: TFile, nextPath: string) => {
      const record = getByPath(file.path);
      if (!record) return;
      fileRecords.delete(file.path);
      const nextFile = createNotebookFile(nextPath);
      Object.assign(file, nextFile);
      fileRecords.set(file.path, { ...record, file });
    }),
  };

  const app = {
    vault,
    metadataCache,
    workspace,
    fileManager,
  };

  const plugin = {
    settings: {
      ...DEFAULT_SETTINGS,
      defaultRenderMode: "svg",
      enableHybridRenderer: false,
      showMinimap: false,
      showDebugOverlay: false,
      autoSave: true,
      autoSaveDelayMs: 25,
    },
    openMindmapFileSelector: vi.fn(),
  };

  const leaf = createLeaf();
  const view = new MindmapView(leaf as never, plugin as never);

  return {
    app,
    view,
    plugin,
    sourceFile,
    vault,
    workspace,
    metadataCache,
    fileManager,
    fileRecords,
    addMarkdownFile(path: string, content = "# note\n", cache?: FileRecord["cache"]): TFile {
      const file = createNotebookFile(path);
      fileRecords.set(file.path, { file, content, cache });
      return file;
    },
    setFileContent(path: string, content: string): void {
      const record = getByPath(path);
      if (record) record.content = content;
    },
    getRenderer(): InstanceType<typeof hoisted.FakeRenderer> {
      return hoisted.FakeRenderer.instances[hoisted.FakeRenderer.instances.length - 1]!;
    },
  };
}

function getDocument(view: MindmapView): MindmapDocument {
  return (view as any).store.getDocument();
}

function getDirtyState(view: MindmapView): string {
  return (view as any).editSession.getDirtyState();
}

function getSelection(view: MindmapView): string[] {
  return (view as any).selection.getIds();
}

function createKeyEvent(args: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  return {
    key: args.key,
    code: args.code,
    metaKey: args.metaKey ?? false,
    ctrlKey: args.ctrlKey ?? false,
    shiftKey: args.shiftKey ?? false,
    target: args.target,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent;
}

describe("MindmapView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (Notice as any).reset();
    (Menu as any).lastShown = null;
    hoisted.FakeRenderer.instances = [];
    hoisted.FakeMarkdownFileSuggestModal.lastInstance = null;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("window", { confirm: vi.fn(() => true) });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("marks dirty edits and autosaves after drag and resize flows", async () => {
    const harness = createHarness();
    await harness.view.setFile(harness.sourceFile);
    const renderer = harness.getRenderer();

    renderer.options.onNodesMove({
      node: createProjectedNode({ id: "child", title: "Child", x: 240, y: 20 }),
      moves: [{ id: "child", x: 240, y: 20 }],
    });

    expect(getDirtyState(harness.view)).toBe("dirty");
    expect(harness.vault.modify).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(harness.plugin.settings.autoSaveDelayMs);
    expect(harness.vault.modify).toHaveBeenCalledTimes(1);
    expect(getDirtyState(harness.view)).toBe("saved");

    renderer.options.onNotebookResizeEnd({ id: "root", width: 320, height: 140 });
    expect(getDirtyState(harness.view)).toBe("dirty");

    await vi.advanceTimersByTimeAsync(harness.plugin.settings.autoSaveDelayMs);
    expect(harness.vault.modify).toHaveBeenCalledTimes(2);
    expect(getDirtyState(harness.view)).toBe("saved");
  });

  it("reloads source file updates but only refreshes notebook-linked file modifications", async () => {
    const doc = createSmallTestDocument();
    doc.nodes.push({
      id: "note-1",
      kind: "notebook",
      title: "Topic",
      x: 120,
      y: 180,
      width: 180,
      height: 56,
      treeControl: "auto",
      notebook: { link: "[[Topic]]", path: "notes/Topic.md", targetType: "file" },
      link: "[[Topic]]",
    });

    const harness = createHarness({ document: doc });
    const notebookFile = harness.addMarkdownFile("notes/Topic.md", "# Topic\n");
    await harness.view.setFile(harness.sourceFile);
    const renderer = harness.getRenderer();
    const renderCountAfterLoad = renderer.render.mock.calls.length;

    const reloaded = structuredClone(doc);
    reloaded.title = "Reloaded";
    harness.setFileContent(harness.sourceFile.path, serializeDocument(reloaded));
    await harness.view.handleVaultModify(harness.sourceFile);

    expect(getDocument(harness.view).title).toBe("Reloaded");

    harness.metadataCache.getFirstLinkpathDest.mockReturnValueOnce(notebookFile);
    await harness.view.handleVaultModify(notebookFile);

    expect(getDocument(harness.view).title).toBe("Reloaded");
    expect(renderer.render.mock.calls.length).toBeGreaterThan(renderCountAfterLoad);
  });

  it("handles keyboard shortcuts for search focus, navigation, add, and delete", async () => {
    const harness = createHarness();
    await harness.view.setFile(harness.sourceFile);
    const renderer = harness.getRenderer();
    renderer.projectedNodes = [
      createProjectedNode({ id: "root", title: "Root", x: 0, y: 0, hasChildren: true, childrenExpanded: true }),
      createProjectedNode({ id: "child", title: "Child", x: 220, y: 0 }),
    ];

    (harness.view as any).setSelectionOnly("root");

    (harness.view as any).handleCanvasKeydown(createKeyEvent({ key: "f", ctrlKey: true, target: harness.view.contentEl as never }));
    const toolbar = (harness.view as any).toolbar;
    expect(toolbar).not.toBeNull();

    (harness.view as any).handleCanvasKeydown(createKeyEvent({ key: "ArrowRight", target: harness.view.contentEl as never }));
    expect(getSelection(harness.view)).toEqual(["child"]);
    expect(renderer.focusNode).toHaveBeenCalledWith("child");

    const nodeCountBeforeTab = getDocument(harness.view).nodes.length;
    (harness.view as any).handleCanvasKeydown(createKeyEvent({ key: "Tab", target: harness.view.contentEl as never }));
    expect(getDocument(harness.view).nodes.length).toBe(nodeCountBeforeTab + 1);

    const nodeCountBeforeDelete = getDocument(harness.view).nodes.length;
    (harness.view as any).handleCanvasKeydown(createKeyEvent({ key: "Delete", target: harness.view.contentEl as never }));
    expect(getDocument(harness.view).nodes.length).toBe(nodeCountBeforeDelete - 1);
  });

  it("undoes and redoes document edits through keyboard shortcuts", async () => {
    const harness = createHarness();
    await harness.view.setFile(harness.sourceFile);

    (harness.view as any).setSelectionOnly("root");
    (harness.view as any).handleCanvasKeydown(createKeyEvent({ key: "Tab", target: harness.view.contentEl as never }));
    const nodeCountAfterAdd = getDocument(harness.view).nodes.length;

    (harness.view as any).handleCanvasKeydown(createKeyEvent({ key: "z", ctrlKey: true, target: harness.view.contentEl as never }));
    expect(getDocument(harness.view).nodes.length).toBe(nodeCountAfterAdd - 1);

    (harness.view as any).handleCanvasKeydown(createKeyEvent({ key: "z", ctrlKey: true, shiftKey: true, target: harness.view.contentEl as never }));
    expect(getDocument(harness.view).nodes.length).toBe(nodeCountAfterAdd);
  });

  it("focuses the first search result", async () => {
    const harness = createHarness();
    await harness.view.setFile(harness.sourceFile);
    const renderer = harness.getRenderer();

    (harness.view as any).updateSearch("Child");
    (harness.view as any).focusFirstSearchResult();

    expect(getSelection(harness.view)).toEqual(["child"]);
    expect(renderer.setSearchResultIds).toHaveBeenCalled();
    expect(renderer.focusNode).toHaveBeenCalledWith("child");
  });

  it("toggles selected tree nodes through keyboard collapse flow", async () => {
    const doc = createSmallTestDocument();
    doc.layoutMode = "tree-right";
    const harness = createHarness({ document: doc });
    await harness.view.setFile(harness.sourceFile);
    const renderer = harness.getRenderer();
    renderer.projectedNodes = [
      createProjectedNode({ id: "root", title: "Root", x: 0, y: 0, hasChildren: true, childrenExpanded: true }),
      createProjectedNode({ id: "child", title: "Child", x: 220, y: 0 }),
    ];

    (harness.view as any).setSelectionOnly("root");
    (harness.view as any).handleCanvasKeydown(createKeyEvent({ key: " ", target: harness.view.contentEl as never }));

    expect(getDocument(harness.view).nodes.find((node) => node.id === "root")?.treeControl).toBe("manual-collapsed");
    expect(getDirtyState(harness.view)).toBe("dirty");
  });

  it("switches layout mode and relayouts the document", async () => {
    const harness = createHarness();
    await harness.view.setFile(harness.sourceFile);
    const before = getDocument(harness.view).nodes.find((node) => node.id === "child");

    (harness.view as any).applyTreeLayoutMode("tree-right");

    const after = getDocument(harness.view).nodes.find((node) => node.id === "child");
    expect(getDocument(harness.view).layoutMode).toBe("tree-right");
    expect(after?.x).not.toBe(before?.x);
  });

  it("binds notebooks, renames notebook nodes, syncs moved paths, and refreshes missing-link warnings", async () => {
    const harness = createHarness();
    const notebookFile = harness.addMarkdownFile("notes/Topic.md", "# Topic\n");
    await harness.view.setFile(harness.sourceFile);
    const renderer = harness.getRenderer();

    (harness.view as any).openContextMenu("child", 10, 10);
    const bindItem = ((Menu as any).lastShown?.items as Array<{ title: string; onClickCallback?: () => void }> | undefined)
      ?.find((item: { title: string }) => item.title === "选择已有 notebook...");
    bindItem?.onClickCallback?.();
    hoisted.FakeMarkdownFileSuggestModal.lastInstance?.choose(notebookFile);

    const boundNode = getDocument(harness.view).nodes.find((node) => node.id === "child");
    expect(boundNode?.kind).toBe("notebook");
    expect(renderer.forceDetailLevel).toHaveBeenCalledWith("child", 5);

    await (harness.view as any).handleInlineTitleCommit("child", "Renamed Topic");
    expect(harness.fileManager.renameFile).toHaveBeenCalledWith(notebookFile, "notes/Renamed Topic.md");
    expect(getDocument(harness.view).nodes.find((node) => node.id === "child")?.notebook?.path).toBe("notes/Renamed Topic.md");

    const movedFile = createNotebookFile("archive/Renamed Topic.md");
    harness.fileRecords.delete("notes/Renamed Topic.md");
    harness.fileRecords.set(movedFile.path, { file: movedFile, content: "# Renamed Topic\n" });
    harness.metadataCache.getFirstLinkpathDest.mockReturnValueOnce(movedFile);
    await harness.view.refreshNotebookLinks();
    expect(getDocument(harness.view).nodes.find((node) => node.id === "child")?.notebook?.path).toBe("archive/Renamed Topic.md");

    harness.fileRecords.delete("archive/Renamed Topic.md");
    harness.metadataCache.getFirstLinkpathDest.mockReturnValueOnce(null);
    await harness.view.refreshNotebookLinks();
    expect(renderer.setMissingNotebookNodeIds).toHaveBeenLastCalledWith(new Set(["child"]));
  });

  it("deletes a node through the extracted node context menu", async () => {
    const harness = createHarness();
    await harness.view.setFile(harness.sourceFile);

    (harness.view as any).openContextMenu("child", 10, 10);
    const deleteItem = ((Menu as any).lastShown?.items as Array<{ title: string; onClickCallback?: () => void }> | undefined)
      ?.find((item: { title: string }) => item.title === "删除节点");
    deleteItem?.onClickCallback?.();

    expect(getDocument(harness.view).nodes.find((node) => node.id === "child")).toBeUndefined();
    expect(getDocument(harness.view).edges.find((edge) => edge.id === "edge1")).toBeUndefined();
    expect(getDirtyState(harness.view)).toBe("dirty");
  });

  it("deletes an edge through the extracted edge context menu", async () => {
    const harness = createHarness();
    await harness.view.setFile(harness.sourceFile);

    (harness.view as any).openEdgeContextMenu("edge1", 10, 10);
    const deleteItem = ((Menu as any).lastShown?.items as Array<{ title: string; onClickCallback?: () => void }> | undefined)
      ?.find((item: { title: string }) => item.title === "删除连线");
    deleteItem?.onClickCallback?.();

    expect(getDocument(harness.view).edges.find((edge) => edge.id === "edge1")).toBeUndefined();
    expect(getDirtyState(harness.view)).toBe("dirty");
  });

  it("creates a reference edge through connection mode", async () => {
    const harness = createHarness();
    await harness.view.setFile(harness.sourceFile);
    const renderer = harness.getRenderer();

    (harness.view as any).connectionMode = true;
    renderer.options.onSelectNode("root", "replace");
    renderer.options.onSelectNode("child", "replace");

    const edge = getDocument(harness.view).edges.find((item) => item.relation === "reference");
    expect(edge).toMatchObject({ source: "root", target: "child", relation: "reference" });
    expect(renderer.setConnectionState).toHaveBeenCalledWith({ enabled: true, sourceId: undefined });
  });

  it("exports svg and png next to the source file", async () => {
    const harness = createHarness();
    await harness.view.setFile(harness.sourceFile);

    await (harness.view as any).exportSvg();
    await (harness.view as any).exportPng();

    expect(hoisted.renderMindmapToSvgString).toHaveBeenCalled();
    expect(harness.vault.create).toHaveBeenCalledWith("maps/source.export.svg", "<svg />");
    expect(harness.vault.createBinary).toHaveBeenCalledWith("maps/source.export.png", expect.any(ArrayBuffer));
  });
});
