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
    });

    input.addEventListener("blur", () => {
      void this.commit();
    });
  }

  async commit(): Promise<void> {
    if (!this.input) return;
    const value = this.input.value.trim();
    this.close();

    if (!value) {
      this.options.onCancel();
      return;
    }

    await this.options.onCommit(value);
  }

  cancel(): void {
    this.close();
    this.options.onCancel();
  }

  close(): void {
    this.input?.remove();
    this.input = null;
  }
}
