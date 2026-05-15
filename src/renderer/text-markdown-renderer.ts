import { App, Component, MarkdownRenderer } from "obsidian";
import { createOwnedDiv, getActiveDocument } from "../core/dom";
import { clampTextNodeText } from "../core/text-layout";

const childComponentByElement = new WeakMap<SVGForeignObjectElement, Component>();
const renderVersionByElement = new WeakMap<SVGForeignObjectElement, number>();

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

  const nextVersion = (renderVersionByElement.get(args.foreignObject) ?? 0) + 1;
  renderVersionByElement.set(args.foreignObject, nextVersion);

  const { text: clampedMarkdown, wasClamped } = clampTextNodeText({ text: args.markdown, fontSize: args.fontSize });
  if (wasClamped) {
    cleanupForeignObject(args);
    wrapper.empty();
    wrapper.textContent = clampedMarkdown;
    return;
  }

  const prev = childComponentByElement.get(args.foreignObject);
  if (prev) {
    args.component.removeChild(prev);
    childComponentByElement.delete(args.foreignObject);
  }

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
      cleanupSpecificChild(args.component, child);
      renderHost.remove();
      return;
    }
  } catch {
    cleanupSpecificChild(args.component, child);
    renderHost.remove();
    if (renderVersionByElement.get(args.foreignObject) !== nextVersion) {
      return;
    }
    childComponentByElement.delete(args.foreignObject);
    wrapper.textContent = clampedMarkdown;
  }
}

function cleanupSpecificChild(component: Component, child: Component): void {
  component.removeChild(child);
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
