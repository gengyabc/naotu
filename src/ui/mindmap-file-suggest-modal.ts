import { App, FuzzySuggestModal, TFile } from "obsidian";
import { t } from "../i18n";

export class MindmapFileSuggestModal extends FuzzySuggestModal<TFile> {
  constructor(
    app: App,
    private onChoose: (file: TFile) => void,
  ) {
    super(app);
    this.setPlaceholder(t("filePicker.openMindmapPlaceholder"));
  }

  getItems(): TFile[] {
    return this.app.vault.getFiles().filter((file) => file.extension === "naotu");
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.onChoose(file);
  }
}