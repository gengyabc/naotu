import { App, Component, MarkdownRenderer } from "obsidian";
import { globalPreviewCache } from "../core/preview-cache";
import { readNotebookPreviewMarkdown } from "../core/notebook-content-extractor";

const renderedKeyByElement = new WeakMap<SVGForeignObjectElement, string>();
const wheelBindingByElement = new WeakSet<HTMLDivElement>();
const childComponentByElement = new WeakMap<SVGForeignObjectElement, Component>();

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
  component: Component;
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

  const prev = childComponentByElement.get(args.foreignObject);
  if (prev) {
    args.component.removeChild(prev);
    childComponentByElement.delete(args.foreignObject);
  }

  wrapper.empty();
  try {
    const result = await readNotebookPreviewMarkdown({
      app: args.app,
      link: args.link,
      sourcePath: args.sourcePath,
      storedPath: args.storedPath,
      maxLines: 40,
    });
    if (!result) {
      renderedKeyByElement.delete(args.foreignObject);
      wrapper.createDiv({ cls: "mindmap-preview-empty", text: "无法预览 notebook" });
      return;
    }

    // Use the notebook file's own path so image links resolve relative to it.
    const child = new Component();
    args.component.addChild(child);
    childComponentByElement.set(args.foreignObject, child);

    await MarkdownRenderer.render(args.app, result.markdown, wrapper, result.resolvedPath, child);
  } catch (error) {
    renderedKeyByElement.delete(args.foreignObject);
    const child = childComponentByElement.get(args.foreignObject);
    if (child) {
      args.component.removeChild(child);
      childComponentByElement.delete(args.foreignObject);
    }
    throw error;
  }
}
