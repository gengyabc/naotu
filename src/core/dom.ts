type ClosestCapable = {
  closest(selector: string): Element | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

export function getActiveDocument(): Document {
  return activeDocument;
}

export function getActiveWindow(): Window {
  return activeWindow;
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
