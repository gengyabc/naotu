import { App, FuzzySuggestModal, TFile } from "obsidian";

export class MarkdownFileSuggestModal extends FuzzySuggestModal<TFile> {
  constructor(
    app: App,
    private onChoose: (file: TFile) => void,
  ) {
    super(app);
    this.setPlaceholder("选择一个 Markdown 文件作为 notebook...");
  }

  getItems(): TFile[] {
    return this.app.vault.getMarkdownFiles();
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.onChoose(file);
  }
}
