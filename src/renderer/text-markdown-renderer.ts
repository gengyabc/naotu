import { App, Component, MarkdownRenderer } from "obsidian";
import { createOwnedDiv, getActiveDocument } from "../core/dom";
import { containsUnsafeMarkdownBlocks } from "../core/markdown-safety";
import { clampTextNodeText } from "../core/text-layout";

const childComponentByElement = new WeakMap<SVGForeignObjectElement, Component>();
const renderVersionByElement = new WeakMap<SVGForeignObjectElement, number>();
const renderedKeyByElement = new WeakMap<SVGForeignObjectElement, string>();

export async function renderTextAsMarkdown(args: {
  app: App;
  foreignObject: SVGForeignObjectElement | null;
  markdown: string;
  fontSize: number;
  sourcePath: string;
  component: Component;
}): Promise<void> {
  if (!args.foreignObject) return;

  let wrapper = args.foreignObject.querySelector<HTMLDivElement>(".mindmap-text-markdown-wrapper");
  if (!wrapper) {
    wrapper = createOwnedDiv(args.foreignObject.ownerDocument ?? getActiveDocument(), {
      cls: "mindmap-text-markdown-wrapper",
    });
    args.foreignObject.appendChild(wrapper);
  }

  wrapper.classList.toggle("is-underline", args.foreignObject.closest(".is-underline") !== null);

  const { text: clampedMarkdown, wasClamped } = clampTextNodeText({ text: args.markdown, fontSize: args.fontSize });
  const renderAsPlainText = wasClamped || containsUnsafeMarkdownBlocks(clampedMarkdown);
  const renderKey = `${renderAsPlainText ? "plain" : "markdown"}::${args.fontSize}::${args.sourcePath}::${clampedMarkdown}`;
  if (renderedKeyByElement.get(args.foreignObject) === renderKey) return;
  renderedKeyByElement.set(args.foreignObject, renderKey);

  const nextVersion = (renderVersionByElement.get(args.foreignObject) ?? 0) + 1;
  renderVersionByElement.set(args.foreignObject, nextVersion);

  if (renderAsPlainText) {
    cleanupRenderedTextMarkdown(args.foreignObject, args.component);
    wrapper.empty();
    wrapper.textContent = clampedMarkdown;
    return;
  }

  removeMountedChild(args.foreignObject, args.component);

  wrapper.empty();
  const renderHost = createOwnedDiv(args.foreignObject.ownerDocument ?? getActiveDocument());
  wrapper.appendChild(renderHost);

  const child = new Component();
  args.component.addChild(child);
  childComponentByElement.set(args.foreignObject, child);

  try {
    await MarkdownRenderer.render(
      args.app,
      clampedMarkdown,
      renderHost,
      args.sourcePath,
      child,
    );
    if (renderVersionByElement.get(args.foreignObject) !== nextVersion) {
      cleanupSpecificChild(args.component, child, args.foreignObject);
      renderHost.remove();
      return;
    }
  } catch {
    cleanupSpecificChild(args.component, child, args.foreignObject);
    renderHost.remove();
    if (renderVersionByElement.get(args.foreignObject) !== nextVersion) {
      return;
    }
    wrapper.textContent = clampedMarkdown;
  }
}

export function cleanupRenderedTextMarkdown(foreignObject: SVGForeignObjectElement | null, component: Component): void {
  if (!foreignObject) return;
  renderVersionByElement.delete(foreignObject);
  renderedKeyByElement.delete(foreignObject);
  removeMountedChild(foreignObject, component);
}

function removeMountedChild(foreignObject: SVGForeignObjectElement, component: Component): void {
  const child = childComponentByElement.get(foreignObject);
  if (!child) return;
  cleanupSpecificChild(component, child, foreignObject);
}

function cleanupSpecificChild(component: Component, child: Component, foreignObject: SVGForeignObjectElement): void {
  component.removeChild(child);
  childComponentByElement.delete(foreignObject);
}
