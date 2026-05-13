import { layoutText, shouldSuggestNotebook, BASE_FONT_SIZE, TITLE_MAX_WIDTH_CHARS, CHAR_WIDTH_CHINESE } from "../core/text-layout";
import { t } from "../i18n";

// padding 8px * 2 + border 1px * 2 = 18, rounded up for scrollbars
const TEXTAREA_CHROME_HORIZONTAL = 20;

const measureCtx = document.createElement("canvas").getContext("2d");

function measureTextWidth(text: string, fontFamily: string, fontSize: number): number {
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

  constructor(private options: InlineTitleEditorOptions) {
    const fontFace = getComputedStyle(document.documentElement).getPropertyValue("--font-interface").trim() || "sans-serif";
    this.fontFamily = fontFace;
    const scaleFactor = options.fontSize / BASE_FONT_SIZE;
    this.maxWidth = TITLE_MAX_WIDTH_CHARS * CHAR_WIDTH_CHINESE * scaleFactor + TEXTAREA_CHROME_HORIZONTAL;
  }

  open(): void {
    this.close();
    const textarea = document.createElement("textarea");
    textarea.className = "mindmap-inline-title-input";
    if (this.options.isBold) textarea.classList.add("is-bold");
    textarea.value = this.options.value;
    textarea.style.left = `${this.options.x}px`;
    textarea.style.top = `${this.options.y}px`;
    textarea.style.minHeight = `${this.options.height}px`;
    textarea.style.fontSize = `${this.options.fontSize}px`;
    if (this.options.isBold) textarea.style.fontWeight = "700";
    textarea.style.width = `${this.getInitialWidth()}px`;

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

    textarea.addEventListener("input", () => {
      this.autoResize();
      this.checkLengthWarning();
    });

    textarea.addEventListener("blur", () => {
      void this.commit();
    });

    this.autoResize();
    this.checkLengthWarning();
  }

  private getInitialWidth(): number {
    const valueWidth = measureTextWidth(this.options.value, this.fontFamily, this.options.fontSize) + TEXTAREA_CHROME_HORIZONTAL;
    return Math.max(valueWidth, this.options.width);
  }

  private autoResize(): void {
    if (!this.textarea) return;

    const value = this.textarea.value;
    const lines = value.split("\n");
    let maxLineWidth = 0;

    for (const line of lines) {
      const lineWidth = measureTextWidth(line, this.fontFamily, this.options.fontSize);
      maxLineWidth = Math.max(maxLineWidth, lineWidth);
    }

    const neededWidth = maxLineWidth + TEXTAREA_CHROME_HORIZONTAL;
    const minWidth = this.options.width;
    const newWidth = Math.max(minWidth, Math.min(neededWidth, this.maxWidth));

    this.textarea.style.width = `${newWidth}px`;
    this.textarea.style.height = "auto";

    const scrollHeight = this.textarea.scrollHeight;
    const minHeight = this.options.height;
    this.textarea.style.height = `${Math.max(scrollHeight, minHeight)}px`;
  }

  private checkLengthWarning(): void {
    if (!this.textarea) return;

    const value = this.textarea.value;
    if (shouldSuggestNotebook(value)) {
      this.showWarning();
    } else {
      this.hideWarning();
    }
  }

  private showWarning(): void {
    if (this.warning) return;
    if (!this.textarea) return;

    const warning = document.createElement("div");
    warning.className = "mindmap-inline-title-warning";
    warning.textContent = t("renderer.longContentWarning");
    warning.style.left = `${this.options.x}px`;
    warning.style.top = `${this.options.y + this.textarea.offsetHeight + 4}px`;
    warning.style.width = `${this.textarea.offsetWidth}px`;

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
    this.textarea?.remove();
    this.textarea = null;
    this.warning?.remove();
    this.warning = null;
  }
}
