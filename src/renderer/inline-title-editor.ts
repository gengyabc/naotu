import { clampTextNodeText, shouldSuggestNotebook, BASE_FONT_SIZE, TITLE_MAX_WIDTH_CHARS, CHAR_WIDTH_CHINESE } from "../core/text-layout";
import { createOwnedDiv, createOwnedElement, getActiveDocument, isNodeLike, setDynamicCssProps } from "../core/dom";
import { t } from "../i18n";

// padding 8px * 2 + border 1px * 2 = 18, rounded up for scrollbars
const TEXTAREA_CHROME_HORIZONTAL = 20;

const measureCtxByDocument = new WeakMap<Document, CanvasRenderingContext2D | null>();

function getMeasureCtx(ownerDocument: Document): CanvasRenderingContext2D | null {
  const cached = measureCtxByDocument.get(ownerDocument);
  if (cached !== undefined) return cached;

  const next = createOwnedElement(ownerDocument, "canvas").getContext("2d");
  measureCtxByDocument.set(ownerDocument, next);
  return next;
}

function measureTextWidth(text: string, fontFamily: string, fontSize: number, ownerDocument: Document): number {
  const measureCtx = getMeasureCtx(ownerDocument);
  if (!measureCtx) return text.length * fontSize * 0.6;
  measureCtx.font = `${fontSize}px ${fontFamily}`;
  return measureCtx.measureText(text).width;
}

export interface InlineTitleEditorOptions {
  layer: HTMLElement;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  isBold: boolean;
  value: string;
  onCommitText: (value: string) => Promise<void> | void;
  onCancel: () => void;
}

export class InlineTitleEditor {
  private textarea: HTMLTextAreaElement | null = null;
  private warning: HTMLDivElement | null = null;
  private maxWidth: number;
  private fontFamily: string;
  private ownerDocument: Document;
  private initialValue: string;
  private _cleanupClickOutside: (() => void) | null = null;

  constructor(private options: InlineTitleEditorOptions) {
    this.ownerDocument = options.layer.ownerDocument ?? getActiveDocument();
    const fontFace = getComputedStyle(this.ownerDocument.documentElement).getPropertyValue("--font-interface").trim() || "sans-serif";
    this.fontFamily = fontFace;
    this.initialValue = options.value;
    const scaleFactor = options.fontSize / BASE_FONT_SIZE;
    this.maxWidth = TITLE_MAX_WIDTH_CHARS * CHAR_WIDTH_CHINESE * scaleFactor + TEXTAREA_CHROME_HORIZONTAL;
  }

  open(): void {
    this.close();
    const textarea = createOwnedElement(this.ownerDocument, "textarea", {
      cls: "mindmap-inline-title-input",
    });
    if (this.options.isBold) textarea.classList.add("is-bold");
    textarea.value = this.options.value;
    setDynamicCssProps(textarea, {
      left: `${this.options.x}px`,
      top: `${this.options.y}px`,
      "min-height": `${this.options.height}px`,
      "font-size": `${this.options.fontSize}px`,
      width: `${this.getInitialWidth()}px`,
    });

    this.options.layer.appendChild(textarea);
    this.textarea = textarea;

    textarea.focus();
    textarea.select();

    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void this.commit();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        this.cancel();
      }
    });

    textarea.addEventListener("beforeinput", (event) => {
      const currentTextarea = this.textarea;
      if (!currentTextarea) return;

      if (event.inputType.startsWith("delete") || event.inputType === "historyUndo" || event.inputType === "historyRedo") {
        return;
      }

      const nextValue = this.getNextValueForBeforeInput(event);
      if (nextValue === null) return;

      const currentValue = currentTextarea.value;
      const currentClamp = clampTextNodeText({ text: currentValue, fontSize: this.options.fontSize });
      const nextClamp = clampTextNodeText({ text: nextValue, fontSize: this.options.fontSize });
      if (!nextClamp.wasClamped) return;

      const currentOverflow = currentClamp.wasClamped;
      const reducesOverflow = nextValue.length < currentValue.length;
      if (currentOverflow && reducesOverflow) return;

      event.preventDefault();
      this.showWarning();
    });

    textarea.addEventListener("input", () => {
      const wasClamped = this.enforceTextLimit();
      this.autoResize();
      this.checkLengthWarning(wasClamped);
    });

    textarea.addEventListener("blur", () => {
      void this.commit();
    });

    // 点击编辑器外部时自动提交
    const onClickOutside = (event: MouseEvent) => {
      if (!this.textarea) return;
      if (!isNodeLike(event.target) || !this.textarea.contains(event.target)) {
        void this.commit();
      }
    };
    this.ownerDocument.addEventListener("mousedown", onClickOutside, { capture: true });
    // 在提交或取消时移除监听器
    const cleanup = () => {
      this.ownerDocument.removeEventListener("mousedown", onClickOutside, { capture: true });
    };
    this._cleanupClickOutside = cleanup;

    this.autoResize();
    this.checkLengthWarning(false);
  }

  private getNextValueForBeforeInput(event: InputEvent): string | null {
    if (!this.textarea) return null;

    const start = this.textarea.selectionStart ?? this.textarea.value.length;
    const end = this.textarea.selectionEnd ?? start;
    const insertedText = event.data ?? "";
    return `${this.textarea.value.slice(0, start)}${insertedText}${this.textarea.value.slice(end)}`;
  }

  private enforceTextLimit(): boolean {
    if (!this.textarea) return false;

    if (this.textarea.value === this.initialValue) {
      return false;
    }

    const { text, wasClamped } = clampTextNodeText({ text: this.textarea.value, fontSize: this.options.fontSize });
    if (!wasClamped) return false;

    this.textarea.value = text;
    this.textarea.setSelectionRange(text.length, text.length);
    return true;
  }

  private getInitialWidth(): number {
    const valueWidth = measureTextWidth(this.options.value, this.fontFamily, this.options.fontSize, this.ownerDocument) + TEXTAREA_CHROME_HORIZONTAL;
    return Math.max(valueWidth, this.options.width);
  }

  private autoResize(): void {
    if (!this.textarea) return;

    const value = this.textarea.value;
    const lines = value.split("\n");
    let maxLineWidth = 0;

    for (const line of lines) {
      const lineWidth = measureTextWidth(line, this.fontFamily, this.options.fontSize, this.ownerDocument);
      maxLineWidth = Math.max(maxLineWidth, lineWidth);
    }

    const neededWidth = maxLineWidth + TEXTAREA_CHROME_HORIZONTAL;
    const minWidth = this.options.width;
    const newWidth = Math.max(minWidth, Math.min(neededWidth, this.maxWidth));

    setDynamicCssProps(this.textarea, { width: `${newWidth}px`, height: "auto" });

    const scrollHeight = this.textarea.scrollHeight;
    const minHeight = this.options.height;
    setDynamicCssProps(this.textarea, { height: `${Math.max(scrollHeight, minHeight)}px` });
  }

  private checkLengthWarning(forceShow = false): void {
    if (!this.textarea) return;

    const value = this.textarea.value;
    if (forceShow || shouldSuggestNotebook(value)) {
      this.showWarning();
    } else {
      this.hideWarning();
    }
  }

  private showWarning(): void {
    if (this.warning) return;
    if (!this.textarea) return;

    const warning = createOwnedDiv(this.ownerDocument, {
      cls: "mindmap-inline-title-warning",
      text: t("renderer.longContentWarning"),
    });
    setDynamicCssProps(warning, {
      left: `${this.options.x}px`,
      top: `${this.options.y + this.textarea.offsetHeight + 4}px`,
      width: `${this.textarea.offsetWidth}px`,
    });

    this.options.layer.appendChild(warning);
    this.warning = warning;
  }

  private hideWarning(): void {
    this.warning?.remove();
    this.warning = null;
  }

  async commit(): Promise<void> {
    if (!this.textarea) return;
    const value = this.textarea.value.trim();
    this.hideWarning();
    this.close();

    if (!value) {
      this.options.onCancel();
      return;
    }

    await this.options.onCommitText(value);
  }

  cancel(): void {
    this.hideWarning();
    this.close();
    this.options.onCancel();
  }

  close(): void {
    const cleanupClickOutside = this._cleanupClickOutside;
    const textarea = this.textarea;
    const warning = this.warning;

    this._cleanupClickOutside = null;
    this.textarea = null;
    this.warning = null;

    cleanupClickOutside?.();
    textarea?.remove();
    warning?.remove();
  }
}
