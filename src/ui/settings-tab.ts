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

    this.renderHelpSettings(containerEl);
    this.renderNotebookSettings(containerEl);
    this.renderImportSettings(containerEl);
    this.renderRenderingSettings(containerEl);
    this.renderPerformanceSettings(containerEl);
    this.renderExportSettings(containerEl);
    this.renderDebugSettings(containerEl);
    this.renderAdvancedSettings(containerEl);
  }

  private createSection(containerEl: HTMLElement, title: string, desc?: string): void {
    containerEl.createEl("h3", { text: title });
    if (desc) {
      containerEl.createEl("p", { text: desc, cls: "setting-item-description" });
    }
  }

  private renderHelpSettings(containerEl: HTMLElement): void {
    this.createSection(containerEl, t("settings.help"));

    containerEl.createEl("p", {
      text: t("settings.helpDesc"),
    });

    containerEl.createEl("h4", { text: t("settings.mainActions"), cls: "setting-item-description" });
    const list = containerEl.createEl("ul");
    [
      t("settings.shortcuts.doubleClick"),
      t("settings.shortcuts.doubleArrow"),
      t("settings.shortcuts.plusMinus"),
      t("settings.shortcuts.tab"),
      t("settings.shortcuts.enter"),
      t("settings.shortcuts.space"),
      t("settings.shortcuts.f2"),
      t("settings.shortcuts.arrows"),
      t("settings.shortcuts.undo"),
      t("settings.shortcuts.redo"),
      t("settings.shortcuts.search"),
      t("settings.shortcuts.fitRoot"),
    ].forEach((text) => {
      list.createEl("li", { text });
    });

    containerEl.createEl("h4", { text: t("settings.semanticZoom"), cls: "setting-item-description" });
    containerEl.createEl("p", {
      text: t("settings.semanticZoomDesc"),
    });
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
      .setName(t("settings.defaultRenderMode"))
      .setDesc(t("settings.defaultRenderModeDesc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("auto", "Auto")
          .addOption("svg", "SVG")
          .addOption("hybrid", "Hybrid")
          .setValue(this.plugin.settings.defaultRenderMode)
          .onChange(async (value) => {
            this.plugin.settings.defaultRenderMode = value as "auto" | "svg" | "hybrid";
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

  private renderPerformanceSettings(containerEl: HTMLElement): void {
    this.createSection(containerEl, t("settings.performance"));

    new Setting(containerEl)
      .setName(t("settings.enableHybrid"))
      .setDesc(t("settings.enableHybridDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableHybridRenderer).onChange(async (value) => {
          this.plugin.settings.enableHybridRenderer = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t("settings.hybridThreshold"))
      .setDesc(t("settings.hybridThresholdDesc"))
      .addText((text) =>
        text.setValue(String(this.plugin.settings.hybridNodeThreshold)).onChange(async (value) => {
          const n = Number.parseInt(value, 10);
          this.plugin.settings.hybridNodeThreshold = Number.isFinite(n) ? Math.max(100, n) : 1200;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t("settings.enableCulling"))
      .setDesc(t("settings.enableCullingDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableViewportCulling).onChange(async (value) => {
          this.plugin.settings.enableViewportCulling = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t("settings.cullingThreshold"))
      .setDesc(t("settings.cullingThresholdDesc"))
      .addText((text) =>
        text.setValue(String(this.plugin.settings.cullingNodeThreshold)).onChange(async (value) => {
          const n = Number.parseInt(value, 10);
          this.plugin.settings.cullingNodeThreshold = Number.isFinite(n) ? Math.max(100, n) : 500;
          await this.plugin.saveSettings();
        }),
      );
  }

  private renderExportSettings(containerEl: HTMLElement): void {
    this.createSection(containerEl, t("settings.export"));

    new Setting(containerEl)
      .setName(t("settings.defaultExportFormat"))
      .setDesc(t("settings.defaultExportFormatDesc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("svg", "SVG")
          .addOption("png", "PNG")
          .setValue(this.plugin.settings.defaultExportFormat)
          .onChange(async (value) => {
            this.plugin.settings.defaultExportFormat = value as "svg" | "png";
            await this.plugin.saveSettings();
          }),
      );
  }

  private renderDebugSettings(containerEl: HTMLElement): void {
    this.createSection(containerEl, t("settings.debug"));

    new Setting(containerEl)
      .setName(t("settings.showDebug"))
      .setDesc(t("settings.showDebugDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showDebugOverlay).onChange(async (value) => {
          this.plugin.settings.showDebugOverlay = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t("settings.showMissingNotebook"))
      .setDesc(t("settings.showMissingNotebookDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showMissingNotebookWarnings).onChange(async (value) => {
          this.plugin.settings.showMissingNotebookWarnings = value;
          await this.plugin.saveSettings();
        }),
      );
  }

  private renderAdvancedSettings(containerEl: HTMLElement): void {
    this.createSection(containerEl, t("settings.advanced"));

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
