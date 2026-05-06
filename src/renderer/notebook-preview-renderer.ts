import { App, MarkdownRenderer } from "obsidian";
import { globalPreviewCache } from "../core/preview-cache";
import { readNotebookPreviewMarkdown } from "../core/notebook-content-extractor";

const renderedKeyByElement = new WeakMap<SVGForeignObjectElement, string>();
const wheelBindingByElement = new WeakSet<HTMLDivElement>();

function shouldKeepWheelWithinPreview(wrapper: HTMLDivElement, deltaY: number): boolean {
  if (wrapper.scrollHeight <= wrapper.clientHeight) return false;

  const atTop = wrapper.scrollTop <= 0;
  const atBottom = wrapper.scrollTop + wrapper.clientHeight >= wrapper.scrollHeight - 1;

  if (deltaY < 0) return !atTop;
  if (deltaY > 0) return !atBottom;
  return true;
}

export async function renderNotebookPreview(args: {
  app: App;
  foreignObject: SVGForeignObjectElement | null;
  link: string;
  sourcePath: string;
  storedPath?: string;
}): Promise<void> {
  if (!args.foreignObject) return;
  const key = `${globalPreviewCache.getVersion()}::${args.sourcePath}::${args.storedPath ?? args.link}`;
  if (renderedKeyByElement.get(args.foreignObject) === key) return;
  renderedKeyByElement.set(args.foreignObject, key);

  let wrapper = args.foreignObject.querySelector<HTMLDivElement>(".mindmap-preview-wrapper");
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.className = "mindmap-preview-wrapper";
    args.foreignObject.appendChild(wrapper);
  }
  if (!wheelBindingByElement.has(wrapper)) {
    wrapper.addEventListener("wheel", (event) => {
      if (shouldKeepWheelWithinPreview(wrapper, event.deltaY)) {
        event.stopPropagation();
      }
    });
    wheelBindingByElement.add(wrapper);
  }

  wrapper.empty();
  const markdown = await readNotebookPreviewMarkdown({
    app: args.app,
    link: args.link,
    sourcePath: args.sourcePath,
    storedPath: args.storedPath,
    maxLines: 40,
  });
  if (!markdown) {
    wrapper.createDiv({ cls: "mindmap-preview-empty", text: "无法预览 notebook" });
    return;
  }

  await MarkdownRenderer.render(args.app, markdown, wrapper, args.sourcePath, null as never);
}
