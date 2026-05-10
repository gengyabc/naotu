export function setCanvasA11y(el: HTMLElement): void {
  el.setAttr("role", "application");
  el.setAttr("aria-label", "Semantic Zoom Mindmap canvas");
}
