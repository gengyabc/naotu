import { App, MarkdownRenderer } from "obsidian";
import { parseObsidianLink } from "../core/obsidian-link";
import { globalPreviewCache } from "../core/preview-cache";

const renderedKeyByElement = new WeakMap<SVGForeignObjectElement, string>();

export async function renderNotebookPreview(args: {
  app: App;
  foreignObject: SVGForeignObjectElement | null;
  link: string;
  sourcePath: string;
}): Promise<void> {
  if (!args.foreignObject) return;
  const key = `${args.sourcePath}::${args.link}`;
  if (renderedKeyByElement.get(args.foreignObject) === key) return;
  renderedKeyByElement.set(args.foreignObject, key);

  let wrapper = args.foreignObject.querySelector<HTMLDivElement>(".mindmap-preview-wrapper");
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.className = "mindmap-preview-wrapper";
    args.foreignObject.appendChild(wrapper);
  }

  wrapper.empty();
  const markdown = await readLinkedMarkdown(args.app, args.link, args.sourcePath);
  if (!markdown) {
    wrapper.createDiv({ cls: "mindmap-preview-empty", text: "无法预览 notebook" });
    return;
  }

  await MarkdownRenderer.render(args.app, markdown, wrapper, args.sourcePath, null as never);
}

async function readLinkedMarkdown(app: App, link: string, sourcePath: string): Promise<string | null> {
  const parsed = parseObsidianLink(link);
  if (!parsed) return null;
  const file = app.metadataCache.getFirstLinkpathDest(parsed.path, sourcePath);
  if (!file) return null;

  const cacheKey = `${file.path}::${parsed.subpath ?? ""}`;
  const cached = globalPreviewCache.get(cacheKey);
  if (cached) return cached;

  const content = await app.vault.read(file);
  const result = content.split("\n").slice(0, 40).join("\n");
  globalPreviewCache.set(cacheKey, result);
  return result;
}
