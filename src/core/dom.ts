type ClosestCapable = {
  closest(selector: string): Element | null;
};

type CreateElOptions = {
  text?: string;
  cls?: string;
  type?: string;
  placeholder?: string;
};

type CreateElCapable = {
  createDiv(options?: CreateElOptions): HTMLDivElement;
  createSpan(options?: CreateElOptions): HTMLSpanElement;
  createEl<K extends keyof HTMLElementTagNameMap>(tagName: K, options?: CreateElOptions): HTMLElementTagNameMap[K];
  createSvg?(tagName: string): SVGElement;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function getCreateElHost(ownerDocument: Document): CreateElCapable | null {
  const host = ownerDocument.body;
  if (!host || !isRecord(host)) return null;
  if (
    typeof (host as { createDiv?: unknown }).createDiv !== "function"
    || typeof (host as { createSpan?: unknown }).createSpan !== "function"
    || typeof (host as { createEl?: unknown }).createEl !== "function"
  ) {
    return null;
  }
  return host as unknown as CreateElCapable;
}

export function getActiveDocument(): Document {
  return activeDocument;
}

export function getActiveWindow(): Window {
  return activeWindow;
}

export function createOwnedDiv(ownerDocument: Document, options: CreateElOptions = {}): HTMLDivElement {
  const host = getCreateElHost(ownerDocument);
  if (host) {
    const element = host.createDiv(options);
    element.remove();
    return element;
  }

  const element = ownerDocument.createElement("div");
  if (options.cls) element.className = options.cls;
  if (options.text) element.textContent = options.text;
  return element;
}

export function createOwnedSpan(ownerDocument: Document, options: CreateElOptions = {}): HTMLSpanElement {
  const host = getCreateElHost(ownerDocument);
  if (host) {
    const element = host.createSpan(options);
    element.remove();
    return element;
  }

  const element = ownerDocument.createElement("span");
  if (options.cls) element.className = options.cls;
  if (options.text) element.textContent = options.text;
  return element;
}

export function createOwnedElement<K extends keyof HTMLElementTagNameMap>(
  ownerDocument: Document,
  tagName: K,
  options: CreateElOptions = {},
): HTMLElementTagNameMap[K] {
  const host = getCreateElHost(ownerDocument);
  if (host) {
    const element = host.createEl(tagName, options);
    element.remove();
    return element;
  }

  const element = ownerDocument.createElement(tagName);
  if (options.cls) element.className = options.cls;
  if (options.text) element.textContent = options.text;
  if (options.type) element.setAttribute("type", options.type);
  if (options.placeholder) element.setAttribute("placeholder", options.placeholder);
  return element;
}

export function createOwnedSvgElement(ownerDocument: Document, tagName: string): SVGElement {
  const host = getCreateElHost(ownerDocument);
  if (host?.createSvg) {
    const element = host.createSvg(tagName);
    element.remove();
    return element;
  }

  return ownerDocument.createElementNS("http://www.w3.org/2000/svg", tagName);
}

export function isElementLike(value: unknown): value is Element & ClosestCapable {
  return isRecord(value) && typeof value.closest === "function";
}

export function isNodeLike(value: unknown): value is Node {
  return isRecord(value) && typeof value.nodeType === "number";
}

export function setDynamicCssProps(element: Element, props: Record<string, string>): void {
  const currentStyle = element.getAttribute("style") ?? "";
  const nextProps = new Map<string, string>();

  for (const declaration of currentStyle.split(";")) {
    const separatorIndex = declaration.indexOf(":");
    if (separatorIndex <= 0) continue;
    const name = declaration.slice(0, separatorIndex).trim();
    const value = declaration.slice(separatorIndex + 1).trim();
    if (!name || !value) continue;
    nextProps.set(name, value);
  }

  for (const [name, value] of Object.entries(props)) {
    nextProps.set(name, value);
  }

  const styleText = [...nextProps.entries()]
    .map(([name, value]) => `${name}: ${value}`)
    .join("; ");

  if (styleText.length > 0) {
    element.setAttribute("style", `${styleText};`);
  } else {
    element.removeAttribute("style");
  }
}
