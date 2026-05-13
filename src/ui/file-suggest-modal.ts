import { App, FuzzySuggestModal, TFile } from "obsidian";
import { getSupportedFileNodeTargetKind } from "../core/file-node-support";
import type { NotebookTargetKind } from "../types/mindmap";
import { t } from "../i18n";

type FileBindingFilterState = Record<NotebookTargetKind, boolean>;

function getFilterLabels(): Record<NotebookTargetKind, string> {
  return {
    markdown: "Notebook",
    image: t("filePicker.image"),
    excalidraw: "Excalidraw",
  };
}

export class FileBindingSuggestModal extends FuzzySuggestModal<TFile> {
  private filters: FileBindingFilterState = {
    markdown: true,
    image: true,
    excalidraw: true,
  };

  private filterContainer: HTMLDivElement | null = null;

  constructor(
    app: App,
    private onChoose: (file: TFile, targetKind: NotebookTargetKind) => void,
  ) {
    super(app);
    this.setPlaceholder(t("filePicker.bindExistingPlaceholder"));
  }

  open(): this {
    super.open();
    this.renderTypeFilters();
    return this;
  }

  getItems(): TFile[] {
    return this.app.vault.getFiles().filter((file) => {
      const targetKind = this.getTargetKindForFile(file);
      return targetKind !== null && this.filters[targetKind];
    });
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    const targetKind = this.getTargetKindForFile(file);
    if (!targetKind) return;
    this.onChoose(file, targetKind);
  }

  setFilterEnabled(targetKind: NotebookTargetKind, enabled: boolean): void {
    this.filters[targetKind] = enabled;
    this.refreshSuggestions();
  }

  getEnabledKinds(): NotebookTargetKind[] {
    return (Object.keys(this.filters) as NotebookTargetKind[]).filter((kind) => this.filters[kind]);
  }

  private getTargetKindForFile(file: TFile): NotebookTargetKind | null {
    const byPath = getSupportedFileNodeTargetKind(file.path);
    if (byPath) return byPath;
    if (file.extension !== "md") return null;
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (frontmatter?.["excalidraw-plugin"]) return "excalidraw";
    return "markdown";
  }

  private renderTypeFilters(): void {
    const anchor = this.getFilterAnchor();
    const filterHost = this.getFilterHost();
    if (!filterHost) return;

    this.filterContainer?.remove();
    const container = document.createElement("div");
    container.className = "mindmap-file-binding-filters";

    const labels = getFilterLabels();
    for (const kind of Object.keys(labels) as NotebookTargetKind[]) {
      const label = document.createElement("label");
      label.className = "mindmap-file-binding-filter";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = this.filters[kind];
      checkbox.addEventListener("change", () => {
        this.setFilterEnabled(kind, checkbox.checked);
      });

      const text = document.createElement("span");
      text.textContent = labels[kind];

      label.appendChild(checkbox);
      label.appendChild(text);
      container.appendChild(label);
    }

    if (anchor && typeof anchor.before === "function") {
      anchor.before(container);
    } else {
      filterHost.prepend(container);
    }
    this.filterContainer = container;
  }

  private getFilterHost(): HTMLElement | null {
    const modal = this as {
      resultContainerEl?: HTMLElement;
      contentEl?: HTMLElement;
      inputEl?: { parentElement?: HTMLElement | null };
    };

    const promptHost = modal.resultContainerEl?.parentElement
      ?? modal.contentEl
      ?? modal.inputEl?.parentElement;

    return this.isHostElement(promptHost) ? promptHost : null;
  }

  private getFilterAnchor(): HTMLElement | null {
    const modal = this as {
      resultContainerEl?: HTMLElement;
    };
    return this.isHostElement(modal.resultContainerEl) ? modal.resultContainerEl : null;
  }

  private isHostElement(value: unknown): value is HTMLElement {
    return Boolean(
      value &&
      typeof value === "object" &&
      "prepend" in value &&
      typeof (value as { prepend?: unknown }).prepend === "function",
    );
  }

  private refreshSuggestions(): void {
    this.renderTypeFilters();
    ((this as unknown) as { updateSuggestions?: () => void }).updateSuggestions?.();
  }
}
