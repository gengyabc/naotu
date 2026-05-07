import { App, FuzzySuggestModal, TFile } from "obsidian";

export class MindmapFileSuggestModal extends FuzzySuggestModal<TFile> {
  constructor(
    app: App,
    private onChoose: (file: TFile) => void,
  ) {
    super(app);
    this.setPlaceholder("选择一个脑图文件...");
  }

  getItems(): TFile[] {
    return this.app.vault.getFiles().filter((file) => file.path.endsWith(".mindmap.json"));
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.onChoose(file);
  }
}