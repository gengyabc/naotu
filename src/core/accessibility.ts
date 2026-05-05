export function setButtonA11y(
  el: HTMLElement,
  label: string,
  pressed?: boolean,
): void {
  el.setAttr("aria-label", label);
  if (pressed !== undefined) {
    el.setAttr("aria-pressed", pressed ? "true" : "false");
  }
}

export function setCanvasA11y(el: HTMLElement): void {
  el.setAttr("role", "application");
  el.setAttr("aria-label", "Semantic Zoom Mindmap canvas");
}
