import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";

import { NotebookService } from "../core/notebook-service";
import type { MindmapNode } from "../types/mindmap";

function createFile(path: string, basename: string): TFile {
  return Object.assign(Object.create(TFile.prototype), { path, basename }) as TFile;
}

describe("NotebookService", () => {
  it("creates a notebook in the configured folder instead of binding an unrelated same-named note", async () => {
    const create = vi.fn().mockResolvedValue(createFile("notebooks/Inbox.md", "Inbox"));
    const getAbstractFileByPath = vi.fn().mockReturnValue(null);
    const lookup = vi.fn().mockReturnValue(createFile("archive/Inbox.md", "Inbox"));
    const service = new NotebookService(
      {
        vault: {
          create,
          createFolder: vi.fn().mockResolvedValue(undefined),
          getAbstractFileByPath,
        },
        metadataCache: {
          getFirstLinkpathDest: lookup,
        },
      } as never,
      () => "notebooks",
    );

    const node: MindmapNode = {
      id: "n1",
      kind: "text",
      title: "Inbox",
      x: 0,
      y: 0,
      width: 180,
      height: 56,
      treeControl: "auto",
    };

    const result = await service.createOrBindNotebookForTextNode(node, "maps/source.naotu");

    expect(result.file.path).toBe("notebooks/Inbox.md");
    expect(result.patch.notebook?.path).toBe("notebooks/Inbox.md");
    expect(create).toHaveBeenCalledWith("notebooks/Inbox.md", "# Inbox\n");
    expect(lookup).not.toHaveBeenCalled();
  });

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

    expect(service.resolveNotebookFile(node, "maps/source.naotu")).toBe(storedFile);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("binds image and excalidraw files with filename fallback titles", () => {
    const service = new NotebookService({ vault: {}, metadataCache: {} } as never);
    const image = createFile("assets/photo.png", "photo");
    const excalidraw = createFile("assets/diagram.excalidraw.md", "diagram.excalidraw");

    const imagePatch = service.bindExistingFileNode(image, "image");
    expect(imagePatch.title).toBe("photo.png");
    expect(imagePatch.notebook?.link).toBe("[[photo.png]]");
    expect(imagePatch.notebook?.targetKind).toBe("image");

    const excalidrawPatch = service.bindExistingFileNode(excalidraw, "excalidraw");
    expect(excalidrawPatch.title).toBe("diagram.excalidraw.md");
    expect(excalidrawPatch.notebook?.link).toBe("[[diagram.excalidraw.md]]");
    expect(excalidrawPatch.notebook?.targetKind).toBe("excalidraw");
  });

  it("binds markdown files as notebook targets without custom fallback filenames", () => {
    const service = new NotebookService({ vault: {}, metadataCache: {} } as never);
    const markdown = createFile("notes/topic.md", "topic");

    const patch = service.bindExistingFileNode(markdown, "markdown");

    expect(patch.title).toBe("topic");
    expect(patch.notebook?.targetKind).toBe("markdown");
    expect(patch.notebook?.path).toBe("notes/topic.md");
  });

  it("syncs moved embedded file nodes using the stored filename link", async () => {
    const movedFile = createFile("archive/photo.png", "photo");
    const lookup = vi.fn().mockReturnValue(movedFile);
    const service = new NotebookService({
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue(null),
      },
      metadataCache: {
        getFirstLinkpathDest: lookup,
      },
    } as never);

    const node: MindmapNode = {
      id: "n1",
      kind: "notebook",
      title: "photo.png",
      x: 0,
      y: 0,
      width: 180,
      height: 56,
      treeControl: "auto",
      notebook: {
        link: "[[photo.png]]",
        path: "assets/photo.png",
        targetType: "file",
        targetKind: "image",
      },
      link: "[[photo.png]]",
    };

    await expect(service.syncNotebookPathIfMoved(node, "maps/source.naotu")).resolves.toEqual({
      notebook: {
        link: "[[photo.png]]",
        path: "archive/photo.png",
        targetType: "file",
        targetKind: "image",
      },
    });
    expect(lookup).toHaveBeenCalledWith("photo.png", "maps/source.naotu");
  });
});
