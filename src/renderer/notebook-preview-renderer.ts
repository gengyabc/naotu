import { App, Component, MarkdownRenderer } from "obsidian";
import { globalPreviewCache } from "../core/preview-cache";
import { readNotebookPreviewMarkdown } from "../core/notebook-content-extractor";
import { buildEmbeddedPreviewMarkdown } from "../core/file-node-support";
import { resolveObsidianLinkFile } from "../core/obsidian-link";

const renderedKeyByElement = new WeakMap<SVGForeignObjectElement, string>();
const wheelBindingByElement = new WeakSet<HTMLDivElement>();
const scrollBindingByElement = new WeakSet<HTMLDivElement>();
const childComponentByElement = new WeakMap<SVGForeignObjectElement, Component>();
const embeddedObserverByElement = new WeakMap<HTMLDivElement, MutationObserver>();

interface PreviewRenderState {
  app: App;
  foreignObject: SVGForeignObjectElement;
  link: string;
  sourcePath: string;
  storedPath?: string;
  targetKind?: "markdown" | "image" | "excalidraw";
  previewWidth: number;
  previewHeight: number;
  component: Component;
  sourceKey: string;
  baseMaxLines: number;
  requestedLines: number;
  totalLines: number;
  loading: boolean;
}

const previewStateByElement = new WeakMap<SVGForeignObjectElement, PreviewRenderState>();

const PREVIEW_VERTICAL_PADDING = 12;
const PREVIEW_LINE_HEIGHT = 18;
const PREVIEW_MIN_LINES = 20;
const PREVIEW_MAX_LINES = 200;

function setEmbeddedWrapperState(
  wrapper: HTMLDivElement,
  embedded: boolean,
  targetKind?: "markdown" | "image" | "excalidraw",
): void {
  wrapper.classList.toggle("is-embedded-file", embedded);

  if (embedded) wrapper.dataset.targetKind = targetKind ?? "markdown";
  else delete wrapper.dataset.targetKind;
}

function shouldKeepWheelWithinPreview(wrapper: HTMLDivElement, deltaY: number): boolean {
  if (wrapper.scrollHeight <= wrapper.clientHeight) return false;

  const atTop = wrapper.scrollTop <= 0;
  const atBottom = wrapper.scrollTop + wrapper.clientHeight >= wrapper.scrollHeight - 1;

  if (deltaY < 0) return !atTop;
  if (deltaY > 0) return !atBottom;
  return true;
}

function normalizeEmbeddedPreviewOutput(
  wrapper: HTMLDivElement,
  targetKind: "markdown" | "image" | "excalidraw",
): void {
  if (targetKind === "markdown") return;

  const baseSelectors = [
    ".internal-embed",
    ".markdown-embed",
    ".media-embed",
    ".image-embed",
  ];
  wrapper.querySelectorAll<HTMLElement>(baseSelectors.join(", ")).forEach((element) => {
    element.style.setProperty("width", "100%", "important");
    element.style.setProperty("height", "100%", "important");
    element.style.setProperty("max-width", "none", "important");
    element.style.setProperty("max-height", "none", "important");
    element.style.setProperty("margin", "0", "important");
    element.style.setProperty("padding", "0", "important");
  });

  if (targetKind !== "excalidraw") return;

  wrapper.querySelectorAll<HTMLElement>("[class^='excalidraw-svg'], [class*=' excalidraw-svg']").forEach((element) => {
    element.style.setProperty("width", "100%", "important");
    element.style.setProperty("height", "100%", "important");
    element.style.setProperty("max-width", "none", "important");
    element.style.setProperty("max-height", "none", "important");
    element.style.setProperty("margin", "0", "important");
    element.style.setProperty("padding", "0", "important");
  });

  wrapper.querySelectorAll<HTMLElement>("[class^='excalidraw-svg'] img, [class*=' excalidraw-svg'] img, svg.excalidraw-svg, img.excalidraw-svg").forEach((element) => {
    element.style.setProperty("width", "100%", "important");
    element.style.setProperty("height", "100%", "important");
    element.style.setProperty("max-width", "none", "important");
    element.style.setProperty("max-height", "none", "important");
    element.style.setProperty("display", "block", "important");
    if (element instanceof SVGElement) {
      element.removeAttribute("width");
      element.removeAttribute("height");
    }
  });
}

function bindEmbeddedPreviewObserver(
  wrapper: HTMLDivElement,
  targetKind: "markdown" | "image" | "excalidraw",
): void {
  embeddedObserverByElement.get(wrapper)?.disconnect();
  embeddedObserverByElement.delete(wrapper);

  normalizeEmbeddedPreviewOutput(wrapper, targetKind);
  if (targetKind === "markdown" || typeof MutationObserver === "undefined") return;

  const observer = new MutationObserver(() => {
    normalizeEmbeddedPreviewOutput(wrapper, targetKind);
  });
  observer.observe(wrapper, { childList: true, subtree: true, attributes: true });
  embeddedObserverByElement.set(wrapper, observer);

  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => normalizeEmbeddedPreviewOutput(wrapper, targetKind));
  }
}

export async function renderNotebookPreview(args: {
  app: App;
  foreignObject: SVGForeignObjectElement | null;
  link: string;
  sourcePath: string;
  storedPath?: string;
  targetKind?: "markdown" | "image" | "excalidraw";
  previewWidth?: number;
  previewHeight: number;
  component: Component;
}): Promise<void> {
  if (!args.foreignObject) return;
  const version = globalPreviewCache.getVersion();
  const sourceKey = `${version}::${args.sourcePath}::${args.storedPath ?? args.link}`;
  const baseMaxLines = getPreviewMaxLines(args.previewHeight);
  const prevState = previewStateByElement.get(args.foreignObject);
  const requestedLines = prevState?.sourceKey === sourceKey
    ? Math.max(prevState.requestedLines, baseMaxLines)
    : baseMaxLines;

  let wrapper = args.foreignObject.querySelector<HTMLDivElement>(".mindmap-preview-wrapper");
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.className = "mindmap-preview-wrapper";
    args.foreignObject.appendChild(wrapper);
  }
  setEmbeddedWrapperState(wrapper, (args.targetKind ?? "markdown") !== "markdown", args.targetKind);
  bindEmbeddedPreviewObserver(wrapper, args.targetKind ?? "markdown");
  wrapper.style.pointerEvents = (args.targetKind ?? "markdown") === "markdown" ? "auto" : "none";
  if (!wheelBindingByElement.has(wrapper)) {
    wrapper.addEventListener("wheel", (event) => {
      if (shouldKeepWheelWithinPreview(wrapper, event.deltaY)) {
        event.stopPropagation();
      }
    });
    wheelBindingByElement.add(wrapper);
  }
  if (!scrollBindingByElement.has(wrapper)) {
    wrapper.addEventListener("scroll", async () => {
      await maybeLoadMore(args.foreignObject!);
    });
    scrollBindingByElement.add(wrapper);
  }

  previewStateByElement.set(args.foreignObject, {
    app: args.app,
    foreignObject: args.foreignObject,
    link: args.link,
    sourcePath: args.sourcePath,
    storedPath: args.storedPath,
    targetKind: args.targetKind,
    previewWidth: args.previewWidth ?? 0,
    previewHeight: args.previewHeight,
    component: args.component,
    sourceKey,
    baseMaxLines,
    requestedLines,
    totalLines: prevState?.sourceKey === sourceKey ? prevState.totalLines : 0,
    loading: false,
  });

  await renderNotebookPreviewLines(args.foreignObject, requestedLines);
}

async function renderNotebookPreviewLines(foreignObject: SVGForeignObjectElement, maxLines: number): Promise<void> {
  const state = previewStateByElement.get(foreignObject);
  if (!state) return;

  const key = `${state.sourceKey}::${state.previewWidth}::${state.previewHeight}::${maxLines}`;
  if (renderedKeyByElement.get(foreignObject) === key) return;
  renderedKeyByElement.set(foreignObject, key);

  let wrapper = foreignObject.querySelector<HTMLDivElement>(".mindmap-preview-wrapper");
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.className = "mindmap-preview-wrapper";
    foreignObject.appendChild(wrapper);
  }
  setEmbeddedWrapperState(wrapper, (state.targetKind ?? "markdown") !== "markdown", state.targetKind);
  bindEmbeddedPreviewObserver(wrapper, state.targetKind ?? "markdown");

  const prev = childComponentByElement.get(foreignObject);
  if (prev) {
    state.component.removeChild(prev);
    childComponentByElement.delete(foreignObject);
  }

  const previousScrollTop = wrapper.scrollTop;
  wrapper.empty();
  try {
    if ((state.targetKind ?? "markdown") !== "markdown") {
      const resolved = resolveObsidianLinkFile({
        app: state.app,
        link: state.link,
        sourcePath: state.sourcePath,
        storedPath: state.storedPath,
      });
      if (!resolved) {
        renderedKeyByElement.delete(foreignObject);
        wrapper.createDiv({ cls: "mindmap-preview-empty", text: "无法预览 notebook" });
        return;
      }

      const child = new Component();
      state.component.addChild(child);
      childComponentByElement.set(foreignObject, child);
      state.requestedLines = maxLines;
      state.totalLines = maxLines;

      await MarkdownRenderer.render(
        state.app,
        buildEmbeddedPreviewMarkdown(resolved.path, state.previewWidth, state.previewHeight),
        wrapper,
        state.sourcePath,
        child,
      );
      bindEmbeddedPreviewObserver(wrapper, state.targetKind ?? "markdown");
      wrapper.scrollTop = previousScrollTop;
      return;
    }

    const result = await readNotebookPreviewMarkdown({
      app: state.app,
      link: state.link,
      sourcePath: state.sourcePath,
      storedPath: state.storedPath,
      maxLines,
    });
    if (!result) {
      renderedKeyByElement.delete(foreignObject);
      wrapper.createDiv({ cls: "mindmap-preview-empty", text: "无法预览 notebook" });
      return;
    }

    // Use the notebook file's own path so image links resolve relative to it.
    const child = new Component();
    state.component.addChild(child);
    childComponentByElement.set(foreignObject, child);

    state.requestedLines = maxLines;
    state.totalLines = result.totalLines;

    await MarkdownRenderer.render(state.app, result.markdown, wrapper, result.resolvedPath, child);
    wrapper.scrollTop = previousScrollTop;
  } catch (error) {
    renderedKeyByElement.delete(foreignObject);
    const child = childComponentByElement.get(foreignObject);
    if (child) {
      state.component.removeChild(child);
      childComponentByElement.delete(foreignObject);
    }
    throw error;
  }
}

async function maybeLoadMore(foreignObject: SVGForeignObjectElement): Promise<void> {
  const state = previewStateByElement.get(foreignObject);
  if (!state || state.loading || state.totalLines <= state.requestedLines) return;

  const wrapper = foreignObject.querySelector<HTMLDivElement>(".mindmap-preview-wrapper");
  if (!wrapper) return;

  const distanceToBottom = wrapper.scrollHeight - (wrapper.scrollTop + wrapper.clientHeight);
  if (distanceToBottom > PREVIEW_LINE_HEIGHT * 2) return;

  state.loading = true;
  try {
    const nextLines = Math.min(
      state.totalLines,
      state.requestedLines + Math.max(state.baseMaxLines, PREVIEW_MIN_LINES),
    );
    if (nextLines > state.requestedLines) {
      await renderNotebookPreviewLines(foreignObject, nextLines);
    }
  } finally {
    state.loading = false;
  }
}

export function getPreviewMaxLines(previewHeight: number): number {
  const visibleLines = Math.floor((Math.max(0, previewHeight) - PREVIEW_VERTICAL_PADDING) / PREVIEW_LINE_HEIGHT);
  return Math.max(PREVIEW_MIN_LINES, Math.min(PREVIEW_MAX_LINES, visibleLines * 3));
}
