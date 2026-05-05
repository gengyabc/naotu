import { App, normalizePath, TFile, TFolder } from "obsidian";
import type { MindmapNode } from "../types/mindmap";
import { DEFAULT_NOTEBOOK_FOLDER, UNTITLED_NODE_TITLE } from "../constants";
import { parseObsidianLink, resolveObsidianLinkFile } from "./obsidian-link";
import { sanitizeFilename } from "./sanitize-filename";

export class NotebookService {
  constructor(
    private app: App,
    private getNotebookFolder: () => string = () => DEFAULT_NOTEBOOK_FOLDER,
    private getNotebookTemplate: () => string = () => "# {{title}}\n",
  ) {}

  async createOrBindNotebookForTextNode(
    node: MindmapNode,
    sourcePath: string,
  ): Promise<{ file: TFile; patch: Partial<MindmapNode> }> {
    const title = sanitizeFilename(node.title || UNTITLED_NODE_TITLE);
    const existing = this.app.metadataCache.getFirstLinkpathDest(title, sourcePath);

    if (existing) {
      return {
        file: existing,
        patch: {
          kind: "notebook",
          title: existing.basename,
          notebook: { link: `[[${existing.basename}]]`, path: existing.path, targetType: "file" },
          link: `[[${existing.basename}]]`,
        },
      };
    }

    await this.ensureNotebookFolder();
    const path = await this.createUniqueNotebookPath(title);
    const file = await this.app.vault.create(path, this.renderTemplate(title));

    return {
      file,
      patch: {
        kind: "notebook",
        title: file.basename,
        notebook: { link: `[[${file.basename}]]`, path: file.path, targetType: "file" },
        link: `[[${file.basename}]]`,
      },
    };
  }

  resolveNotebookFile(node: MindmapNode, sourcePath: string): TFile | null {
    const link = node.notebook?.link ?? node.link;
    if (!link) return null;
    return resolveObsidianLinkFile({
      app: this.app,
      link,
      sourcePath,
      storedPath: node.notebook?.path,
    });
  }

  async renameNotebookFileForNode(
    node: MindmapNode,
    nextTitle: string,
    sourcePath: string,
  ): Promise<Partial<MindmapNode>> {
    if (node.kind !== "notebook" || !node.notebook) {
      return { title: sanitizeFilename(nextTitle) };
    }

    const parsed = parseObsidianLink(node.notebook.link);
    if (!parsed || parsed.targetType !== "file") {
      throw new Error("该 notebook 节点绑定到 heading/block，不能通过脑图重命名。");
    }

    const file = this.resolveNotebookFile(node, sourcePath);
    if (!file) throw new Error("找不到对应 notebook 文件。");

    const cleanTitle = sanitizeFilename(nextTitle);
    const parentPath = file.parent?.path ?? "";
    const nextPath = normalizePath(parentPath ? `${parentPath}/${cleanTitle}.md` : `${cleanTitle}.md`);
    await this.app.fileManager.renameFile(file, nextPath);

    return {
      title: cleanTitle,
      notebook: { link: `[[${cleanTitle}]]`, path: nextPath, targetType: "file" },
      link: `[[${cleanTitle}]]`,
    };
  }

  disconnectNotebook(node: MindmapNode): Partial<MindmapNode> {
    return { kind: "text", title: node.title, notebook: undefined, link: undefined };
  }

  bindExistingFileAsNotebook(file: TFile): Partial<MindmapNode> {
    return {
      kind: "notebook",
      title: file.basename,
      notebook: {
        link: `[[${file.basename}]]`,
        path: file.path,
        targetType: "file",
      },
      link: `[[${file.basename}]]`,
    };
  }

  async syncNotebookPathIfMoved(
    node: MindmapNode,
    sourcePath: string,
  ): Promise<Partial<MindmapNode> | null> {
    if (node.kind !== "notebook") return null;
    const file = this.resolveNotebookFile(node, sourcePath);
    if (!file) return null;
    if (node.notebook?.path === file.path) return null;

    return {
      notebook: {
        ...(node.notebook ?? { link: `[[${file.basename}]]`, targetType: "file" }),
        path: file.path,
      },
    };
  }

  private async ensureNotebookFolder(): Promise<void> {
    const normalized = normalizePath(this.getNotebookFolder());
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing instanceof TFolder) return;
    if (existing) throw new Error(`${normalized} 已存在，但不是文件夹。`);
    await this.app.vault.createFolder(normalized);
  }

  private renderTemplate(title: string): string {
    return this.getNotebookTemplate().split("{{title}}").join(title);
  }

  private async createUniqueNotebookPath(title: string): Promise<string> {
    const base = sanitizeFilename(title);
    const notebookFolder = normalizePath(this.getNotebookFolder());
    let candidate = normalizePath(`${notebookFolder}/${base}.md`);
    let index = 2;

    while (this.app.vault.getAbstractFileByPath(candidate)) {
      candidate = normalizePath(`${notebookFolder}/${base} ${index}.md`);
      index += 1;
    }

    return candidate;
  }
}
