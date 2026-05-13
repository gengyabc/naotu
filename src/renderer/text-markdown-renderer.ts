import { App, Component, MarkdownRenderer } from "obsidian";
import { getActiveDocument } from "../core/dom";

const childComponentByElement = new WeakMap<SVGForeignObjectElement, Component>();

export async function renderTextAsMarkdown(args: {
  app: App;
  foreignObject: SVGForeignObjectElement | null;
  markdown: string;
  sourcePath: string;
  component: Component;
}): Promise<void> {
  if (!args.foreignObject) return;

  let wrapper = args.foreignObject.querySelector<HTMLDivElement>(".mindmap-text-markdown-wrapper");
  if (!wrapper) {
    wrapper = (args.foreignObject.ownerDocument ?? getActiveDocument()).createElement("div");
    wrapper.className = "mindmap-text-markdown-wrapper";
    args.foreignObject.appendChild(wrapper);
  }

  wrapper.classList.toggle("is-underline", args.foreignObject.closest(".is-underline") !== null);

  const prev = childComponentByElement.get(args.foreignObject);
  if (prev) {
    args.component.removeChild(prev);
    childComponentByElement.delete(args.foreignObject);
  }

  wrapper.empty();

  const child = new Component();
  args.component.addChild(child);
  childComponentByElement.set(args.foreignObject, child);

  try {
    await MarkdownRenderer.render(
      args.app,
      args.markdown,
      wrapper,
      args.sourcePath,
      child,
    );
  } catch (error) {
    cleanupForeignObject(args);
    wrapper.textContent = args.markdown;
    console.warn("[text-markdown-renderer] Markdown render failed, falling back to plain text:", error);
  }
}

function cleanupForeignObject(args: {
  foreignObject: SVGForeignObjectElement | null;
  component: Component;
}): void {
  if (!args.foreignObject) return;
  const child = childComponentByElement.get(args.foreignObject);
  if (child) {
    args.component.removeChild(child);
    childComponentByElement.delete(args.foreignObject);
  }
}
