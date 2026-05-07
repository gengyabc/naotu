import { shouldSuggestNotebook } from "../core/text-layout";

export interface InlineTitleEditorOptions {
  layer: HTMLElement;
  x: number;
  y: number;
  width: number;
  value: string;
  onCommit: (value: string) => Promise<void> | void;
  onCancel: () => void;
}

export class InlineTitleEditor {
  private input: HTMLInputElement | null = null;
  private warning: HTMLDivElement | null = null;

  constructor(private options: InlineTitleEditorOptions) {}

  open(): void {
    this.close();
    const input = document.createElement("input");
    input.className = "mindmap-inline-title-input";
    input.value = this.options.value;
    input.style.left = `${this.options.x}px`;
    input.style.top = `${this.options.y}px`;
    input.style.width = `${this.options.width}px`;

    this.options.layer.appendChild(input);
    this.input = input;

    input.focus();
    input.select();

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void this.commit();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        this.cancel();
      }
    });

    input.addEventListener("input", () => {
      input.value = input.value.replace(/\n/g, " ");
      this.checkLengthWarning();
    });

    input.addEventListener("blur", () => {
      void this.commit();
    });

    this.checkLengthWarning();
  }

  private checkLengthWarning(): void {
    if (!this.input) return;

    const value = this.input.value;
    if (shouldSuggestNotebook(value)) {
      this.showWarning();
    } else {
      this.hideWarning();
    }
  }

  private showWarning(): void {
    if (this.warning) return;
    if (!this.input) return;

    const warning = document.createElement("div");
    warning.className = "mindmap-inline-title-warning";
    warning.textContent = "内容较多，建议转为笔记节点";
    warning.style.left = `${this.options.x}px`;
    warning.style.top = `${this.options.y + 32}px`;
    warning.style.width = `${this.options.width}px`;

    this.options.layer.appendChild(warning);
    this.warning = warning;
  }

  private hideWarning(): void {
    this.warning?.remove();
    this.warning = null;
  }

  async commit(): Promise<void> {
    if (!this.input) return;
    const value = this.input.value.trim();
    this.hideWarning();
    this.close();

    if (!value) {
      this.options.onCancel();
      return;
    }

    await this.options.onCommit(value);
  }

  cancel(): void {
    this.hideWarning();
    this.close();
    this.options.onCancel();
  }

  close(): void {
    this.input?.remove();
    this.input = null;
    this.warning?.remove();
    this.warning = null;
  }
}
