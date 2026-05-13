import { App, PluginSettingTab, Setting } from "obsidian";
import type SemanticZoomMindmapPlugin from "../main";
import { DEFAULT_LAYOUT_HORIZONTAL_SPACING, DEFAULT_LAYOUT_VERTICAL_SPACING } from "../types/settings";
import { setLocale, t } from "../i18n";

export class SemanticMindmapSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: SemanticZoomMindmapPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: t("settings.title") });

    this.renderNotebookSettings(containerEl);
    this.renderImportSettings(containerEl);
    this.renderRenderingSettings(containerEl);
    this.renderAdvancedSettings(containerEl);
  }

  private createSection(containerEl: HTMLElement, title: string, desc?: string): void {
    containerEl.createEl("h3", { text: title });
    if (desc) {
      containerEl.createEl("p", { text: desc, cls: "setting-item-description" });
    }
  }

  private renderNotebookSettings(containerEl: HTMLElement): void {
    this.createSection(containerEl, t("settings.notebook"));

    new Setting(containerEl)
      .setName(t("settings.notebookFolder"))
      .setDesc(t("settings.notebookFolderDesc"))
      .addText((text) =>
        text
          .setPlaceholder("notebooks")
          .setValue(this.plugin.settings.notebookFolder)
          .onChange(async (value) => {
            this.plugin.settings.notebookFolder = value.trim() || "notebooks";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("settings.notebookTemplate"))
      .setDesc(t("settings.notebookTemplateDesc"))
      .addTextArea((text) =>
        text.setValue(this.plugin.settings.notebookTemplate).onChange(async (value) => {
          this.plugin.settings.notebookTemplate = value || "# {{title}}\n";
          await this.plugin.saveSettings();
        }),
      );
  }

  private renderImportSettings(containerEl: HTMLElement): void {
    this.createSection(containerEl, t("settings.import"));

    new Setting(containerEl)
      .setName(t("settings.importHeadings"))
      .setDesc(t("settings.importHeadingsDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.importHeadingsAsNotebookNodes).onChange(async (value) => {
          this.plugin.settings.importHeadingsAsNotebookNodes = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t("settings.maxBacklinkNodes"))
      .setDesc(t("settings.maxBacklinkNodesDesc"))
      .addText((text) =>
        text.setValue(String(this.plugin.settings.maxBacklinkMapNodes)).onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          this.plugin.settings.maxBacklinkMapNodes = Number.isFinite(parsed) ? Math.max(10, parsed) : 80;
          await this.plugin.saveSettings();
        }),
      );
  }

  private renderRenderingSettings(containerEl: HTMLElement): void {
    this.createSection(containerEl, t("settings.rendering"));

    new Setting(containerEl)
      .setName(t("settings.showMinimap"))
      .setDesc(t("settings.showMinimapDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showMinimap).onChange(async (value) => {
          this.plugin.settings.showMinimap = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t("settings.zoomSpeed"))
      .setDesc(t("settings.zoomSpeedDesc"))
      .addText((text) =>
        text.setValue(String(this.plugin.settings.zoomSpeed)).onChange(async (value) => {
          const parsed = Number.parseFloat(value);
          this.plugin.settings.zoomSpeed = Number.isFinite(parsed) ? Math.max(0.0005, Math.min(0.01, parsed)) : 0.003;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t("settings.layoutHSpacing"))
      .setDesc(t("settings.layoutHSpacingDesc"))
      .addText((text) =>
        text.setValue(String(this.plugin.settings.layoutHorizontalSpacing)).onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          this.plugin.settings.layoutHorizontalSpacing = Number.isFinite(parsed) ? Math.max(0, parsed) : DEFAULT_LAYOUT_HORIZONTAL_SPACING;
          await this.plugin.saveSettings();
          await this.plugin.notifyLayoutSettingsChanged();
        }),
      );

    new Setting(containerEl)
      .setName(t("settings.layoutVSpacing"))
      .setDesc(t("settings.layoutVSpacingDesc"))
      .addText((text) =>
        text.setValue(String(this.plugin.settings.layoutVerticalSpacing)).onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          this.plugin.settings.layoutVerticalSpacing = Number.isFinite(parsed) ? Math.max(32, parsed) : DEFAULT_LAYOUT_VERTICAL_SPACING;
          await this.plugin.saveSettings();
          await this.plugin.notifyLayoutSettingsChanged();
        }),
      );
  }

  private renderAdvancedSettings(containerEl: HTMLElement): void {
    this.createSection(containerEl, t("settings.advanced"));

    new Setting(containerEl)
      .setName(t("settings.showMissingNotebook"))
      .setDesc(t("settings.showMissingNotebookDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showMissingNotebookWarnings).onChange(async (value) => {
          this.plugin.settings.showMissingNotebookWarnings = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t("settings.autoSave"))
      .setDesc(t("settings.autoSaveDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoSave).onChange(async (value) => {
          this.plugin.settings.autoSave = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t("settings.autoSaveDelay"))
      .setDesc(t("settings.autoSaveDelayDesc"))
      .addText((text) =>
        text.setValue(String(this.plugin.settings.autoSaveDelayMs)).onChange(async (value) => {
          const n = Number.parseInt(value, 10);
          this.plugin.settings.autoSaveDelayMs = Number.isFinite(n) ? Math.max(100, n) : 800;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t("settings.language"))
      .setDesc(t("settings.languageDesc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("auto", t("settings.auto"))
          .addOption("en", t("settings.english"))
          .addOption("zh", t("settings.chinese"))
          .setValue(this.plugin.settings.language)
          .onChange(async (value) => {
            this.plugin.settings.language = value as "auto" | "zh" | "en";
            await this.plugin.saveSettings();

            setLocale(this.plugin.settings.language);

            this.display();
          }),
      );

    containerEl.createEl("p", {
      text: t("settings.restartForCommands"),
      cls: "setting-item-description",
    });
  }
}
