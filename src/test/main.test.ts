import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";

import SemanticZoomMindmapPlugin from "../main";
import { DEFAULT_SETTINGS } from "../types/settings";
import { createNotebookFile } from "./test-fixtures";

const hoisted = vi.hoisted(() => ({
  createMindmapFromMarkdown: vi.fn(),
}));

vi.mock("../core/mindmap-from-markdown", () => ({
  createMindmapFromMarkdown: hoisted.createMindmapFromMarkdown,
}));

vi.mock("../view/mindmap-view", () => ({
  MindmapView: class {},
}));

vi.mock("../ui/settings-tab", () => ({
  SemanticMindmapSettingTab: class {},
}));

vi.mock("../core/command-registry", () => ({
  registerMindmapCommands: vi.fn(),
}));

vi.mock("../ui/mindmap-file-suggest-modal", () => ({
  MindmapFileSuggestModal: class {},
}));

describe("SemanticZoomMindmapPlugin", () => {
  it("passes the import headings preference into markdown import", async () => {
    const sourceFile = createNotebookFile("notes/topic.md");
    const createdFile = createNotebookFile("notes/topic.naotu");
    const plugin = new SemanticZoomMindmapPlugin({
      vault: {
        read: vi.fn().mockResolvedValue("# Topic"),
        getAbstractFileByPath: vi.fn().mockReturnValue(null),
        create: vi.fn().mockResolvedValue(createdFile),
        modify: vi.fn(),
      },
      workspace: {},
    } as never, {} as never);
    plugin.settings = {
      ...DEFAULT_SETTINGS,
      importHeadingsAsNotebookNodes: false,
    };
    plugin.openMindmapFile = vi.fn().mockResolvedValue(undefined);
    hoisted.createMindmapFromMarkdown.mockReturnValue({ version: 1, title: "Topic", layoutMode: "tree-mirror", viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [] });

    await plugin.createMindmapFromMarkdownFile(sourceFile as TFile);

    expect(hoisted.createMindmapFromMarkdown).toHaveBeenCalledWith({
      markdown: "# Topic",
      fileBasename: "topic",
      filePath: "notes/topic.md",
      headingsAsNotebookNodes: false,
    });
  });
});
