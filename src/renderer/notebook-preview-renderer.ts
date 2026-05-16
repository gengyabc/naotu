import { App, Component, MarkdownRenderer } from "obsidian";
import { containsUnsafeMarkdownBlocks } from "../core/markdown-safety";
import { globalPreviewCache } from "../core/preview-cache";
import { readNotebookPreviewMarkdown } from "../core/notebook-content-extractor";
import { buildEmbeddedPreviewMarkdown } from "../core/file-node-support";
import { createOwnedDiv, getActiveDocument, getActiveWindow, setDynamicCssProps } from "../core/dom";
import { resolveObsidianLinkFile } from "../core/obsidian-link";
import { t } from "../i18n";

const renderedKeyByElement = new WeakMap<SVGForeignObjectElement, string>();
const wheelBindingByElement = new WeakSet<HTMLDivElement>();
const scrollBindingByElement = new WeakSet<HTMLDivElement>();
const childComponentByElement = new WeakMap<SVGForeignObjectElement, Component>();
const embeddedObserverByElement = new WeakMap<HTMLDivElement, MutationObserver>();
const embeddedResizeObserverByElement = new WeakMap<HTMLDivElement, ResizeObserver>();
const renderRunIdByElement = new WeakMap<SVGForeignObjectElement, number>();

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

type ExcalidrawAutomateLike = {
  reset?: () => void;
  createSVG?: (
    templatePath?: string,
    embedFont?: boolean,
    exportSettings?: Record<string, unknown>,
    loader?: unknown,
    theme?: string,
    padding?: number,
  ) => Promise<SVGSVGElement | null | undefined>;
};

function getExcalidrawAutomate(app: App): ExcalidrawAutomateLike | null {
  const appWithPlugins = app as App & {
    plugins?: { plugins?: Record<string, { ea?: ExcalidrawAutomateLike }> };
  };
  const pluginEa = appWithPlugins.plugins?.plugins?.["obsidian-excalidraw-plugin"]?.ea;
  if (pluginEa?.createSVG) return pluginEa;

  const activeWindowWithEa = getActiveWindow() as Window & { ExcalidrawAutomate?: ExcalidrawAutomateLike };
  if (activeWindowWithEa.ExcalidrawAutomate?.createSVG) return activeWindowWithEa.ExcalidrawAutomate;

  return null;
}

async function renderExcalidrawPreview(args: {
  app: App;
  filePath: string;
}): Promise<SVGSVGElement | null> {
  const ea = getExcalidrawAutomate(args.app);
  if (!ea?.createSVG) return null;

  ea.reset?.();
  const svg = await ea.createSVG(
    args.filePath,
    false,
    {
      withBackground: true,
      withTheme: true,
      isMask: false,
      skipInliningFonts: true,
    },
    undefined,
    undefined,
    0,
  );
  if (!svg) return null;

  svg.classList?.add("mindmap-embedded-preview-media", "excalidraw-svg");
  svg.removeAttribute("width");
  svg.removeAttribute("height");

  return svg;
}

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

  const findAllInWrapper = (selector: string): Element[] => {
    return wrapper.findAll(selector);
  };

  const width = Math.max(0, Math.round(wrapper.clientWidth));
  const height = Math.max(0, Math.round(wrapper.clientHeight));
  const widthValue = width > 0 ? `${width}px` : "100%";
  const heightValue = height > 0 ? `${height}px` : "100%";
  setDynamicCssProps(wrapper, {
    "--mindmap-embed-width": widthValue,
    "--mindmap-embed-height": heightValue,
  });

  const baseSelectors = [
    ".internal-embed",
    ".markdown-embed",
    ".media-embed",
    ".image-embed",
  ];
  findAllInWrapper(baseSelectors.join(", ")).forEach((element) => {
    element.classList?.add("mindmap-embedded-preview-content");
  });

  if (targetKind !== "excalidraw") return;

  findAllInWrapper("[class^='excalidraw-svg'], [class*=' excalidraw-svg']").forEach((element) => {
    element.classList?.add("mindmap-embedded-preview-content");
  });

  findAllInWrapper("[class^='excalidraw-svg'] img, [class*=' excalidraw-svg'] img, svg.excalidraw-svg, img.excalidraw-svg").forEach((element) => {
    element.classList?.add("mindmap-embedded-preview-media");
    element.removeAttribute("width");
    element.removeAttribute("height");
  });
}

function bindEmbeddedPreviewObserver(
  wrapper: HTMLDivElement,
  targetKind: "markdown" | "image" | "excalidraw",
): void {
  embeddedObserverByElement.get(wrapper)?.disconnect();
  embeddedObserverByElement.delete(wrapper);
  embeddedResizeObserverByElement.get(wrapper)?.disconnect();
  embeddedResizeObserverByElement.delete(wrapper);

  normalizeEmbeddedPreviewOutput(wrapper, targetKind);
  if (targetKind === "markdown") return;

  if (typeof MutationObserver !== "undefined") {
    const observer = new MutationObserver(() => {
      normalizeEmbeddedPreviewOutput(wrapper, targetKind);
    });
    observer.observe(wrapper, { childList: true, subtree: true });
    embeddedObserverByElement.set(wrapper, observer);
  }

  if (typeof ResizeObserver !== "undefined") {
    let resizeRafId = 0;
    const ownerWindow = wrapper.ownerDocument?.defaultView ?? getActiveWindow();
    const resizeObserver = new ResizeObserver(() => {
      ownerWindow?.cancelAnimationFrame(resizeRafId);
      resizeRafId = ownerWindow?.requestAnimationFrame(() => {
        normalizeEmbeddedPreviewOutput(wrapper, targetKind);
      }) ?? 0;
    });
    resizeObserver.observe(wrapper);
    embeddedResizeObserverByElement.set(wrapper, resizeObserver);
  }

  (wrapper.ownerDocument?.defaultView ?? getActiveWindow()).requestAnimationFrame(() => normalizeEmbeddedPreviewOutput(wrapper, targetKind));
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
    wrapper = createOwnedDiv(args.foreignObject.ownerDocument ?? getActiveDocument(), {
      cls: "mindmap-preview-wrapper",
    });
    args.foreignObject.appendChild(wrapper);
  }
  setEmbeddedWrapperState(wrapper, (args.targetKind ?? "markdown") !== "markdown", args.targetKind);
  bindEmbeddedPreviewObserver(wrapper, args.targetKind ?? "markdown");
  const isInteractive = (args.targetKind ?? "markdown") === "markdown";
  wrapper.classList.toggle("is-interactive", isInteractive);
  if (!wheelBindingByElement.has(wrapper)) {
    wrapper.addEventListener("wheel", (event: WheelEvent) => {
      if (event.metaKey || event.ctrlKey) return;
      if (shouldKeepWheelWithinPreview(wrapper, event.deltaY)) {
        event.stopPropagation();
      }
    });
    wheelBindingByElement.add(wrapper);
  }
  if (!scrollBindingByElement.has(wrapper)) {
    wrapper.addEventListener("scroll", () => {
      void maybeLoadMore(args.foreignObject!);
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

export function cleanupNotebookPreview(foreignObject: SVGForeignObjectElement | null): void {
  if (!foreignObject) return;
  renderRunIdByElement.delete(foreignObject);
  renderedKeyByElement.delete(foreignObject);

  const wrapper = foreignObject.querySelector<HTMLDivElement>(".mindmap-preview-wrapper");
  if (wrapper) {
    embeddedObserverByElement.get(wrapper)?.disconnect();
    embeddedObserverByElement.delete(wrapper);
    embeddedResizeObserverByElement.get(wrapper)?.disconnect();
    embeddedResizeObserverByElement.delete(wrapper);
  }

  const child = childComponentByElement.get(foreignObject);
  const state = previewStateByElement.get(foreignObject);
  if (child && state) {
    state.component.removeChild(child);
  }
  childComponentByElement.delete(foreignObject);
  previewStateByElement.delete(foreignObject);
}

async function renderNotebookPreviewLines(foreignObject: SVGForeignObjectElement, maxLines: number): Promise<void> {
  const state = previewStateByElement.get(foreignObject);
  if (!state) return;

  const key = `${state.sourceKey}::${state.previewWidth}::${state.previewHeight}::${maxLines}`;
  if (renderedKeyByElement.get(foreignObject) === key) return;
  renderedKeyByElement.set(foreignObject, key);
  const renderRunId = (renderRunIdByElement.get(foreignObject) ?? 0) + 1;
  renderRunIdByElement.set(foreignObject, renderRunId);

  let wrapper = foreignObject.querySelector<HTMLDivElement>(".mindmap-preview-wrapper");
  if (!wrapper) {
    wrapper = createOwnedDiv(foreignObject.ownerDocument ?? getActiveDocument(), {
      cls: "mindmap-preview-wrapper",
    });
    foreignObject.appendChild(wrapper);
  }
  setEmbeddedWrapperState(wrapper, (state.targetKind ?? "markdown") !== "markdown", state.targetKind);
  bindEmbeddedPreviewObserver(wrapper, state.targetKind ?? "markdown");

  const previousScrollTop = wrapper.scrollTop;
  const clearCommittedContent = (): void => {
    const prev = childComponentByElement.get(foreignObject);
    if (prev) {
      state.component.removeChild(prev);
      childComponentByElement.delete(foreignObject);
    }
    wrapper.empty();
  };

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
        wrapper.createDiv({ cls: "mindmap-preview-empty", text: t("renderer.cannotPreviewNotebook") });
        return;
      }

      state.requestedLines = maxLines;
      state.totalLines = maxLines;

      if ((state.targetKind ?? "markdown") === "excalidraw") {
        const svg = await renderExcalidrawPreview({
          app: state.app,
          filePath: resolved.path,
        });
        if (renderRunIdByElement.get(foreignObject) !== renderRunId) return;
        if (svg) {
          clearCommittedContent();
          wrapper.appendChild(svg);
          bindEmbeddedPreviewObserver(wrapper, state.targetKind ?? "markdown");
          wrapper.scrollTop = previousScrollTop;
          return;
        }
      }

      clearCommittedContent();
      const child = new Component();
      state.component.addChild(child);
      childComponentByElement.set(foreignObject, child);
      await MarkdownRenderer.render(
        state.app,
        buildEmbeddedPreviewMarkdown(resolved.path, state.previewWidth, state.previewHeight),
        wrapper,
        state.sourcePath,
        child,
      );
      if (renderRunIdByElement.get(foreignObject) !== renderRunId) {
        wrapper.empty();
        return;
      }
      bindEmbeddedPreviewObserver(wrapper, state.targetKind ?? "markdown");
      wrapper.scrollTop = previousScrollTop;
      return;
    }

    clearCommittedContent();
    const result = await readNotebookPreviewMarkdown({
      app: state.app,
      link: state.link,
      sourcePath: state.sourcePath,
      storedPath: state.storedPath,
      maxLines,
    });
    if (!result) {
      renderedKeyByElement.delete(foreignObject);
      wrapper.createDiv({ cls: "mindmap-preview-empty", text: t("renderer.cannotPreviewNotebook") });
      return;
    }

    state.requestedLines = maxLines;
    state.totalLines = result.totalLines;

    if (containsUnsafeMarkdownBlocks(result.markdown)) {
      wrapper.textContent = result.markdown;
      wrapper.scrollTop = previousScrollTop;
      return;
    }

    // Use the notebook file's own path so image links resolve relative to it.
    const child = new Component();
    state.component.addChild(child);
    childComponentByElement.set(foreignObject, child);

    await MarkdownRenderer.render(state.app, result.markdown, wrapper, result.resolvedPath, child);
    if (renderRunIdByElement.get(foreignObject) !== renderRunId) {
      wrapper.empty();
      return;
    }
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
