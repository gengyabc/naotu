import { App, PluginSettingTab, Setting } from "obsidian";
import type SemanticZoomMindmapPlugin from "../main";

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

    containerEl.createEl("h2", { text: "Semantic Zoom Mindmap 设置" });

    new Setting(containerEl)
      .setName("Notebook 文件夹")
      .setDesc("text 节点转 notebook 节点时，自动创建 note 的文件夹。")
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
      .setName("Notebook 模板")
      .setDesc("自动创建 notebook 时使用。支持 {{title}}。")
      .addTextArea((text) =>
        text.setValue(this.plugin.settings.notebookTemplate).onChange(async (value) => {
          this.plugin.settings.notebookTemplate = value || "# {{title}}\n";
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("导入 headings 为 notebook 节点")
      .setDesc("从 Markdown 标题生成脑图时，是否让每个 heading 节点绑定到对应 heading。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.importHeadingsAsNotebookNodes).onChange(async (value) => {
          this.plugin.settings.importHeadingsAsNotebookNodes = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Backlinks map 最大节点数")
      .setDesc("防止一次生成太大的局部知识地图。")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.maxBacklinkMapNodes)).onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          this.plugin.settings.maxBacklinkMapNodes = Number.isFinite(parsed) ? Math.max(10, parsed) : 80;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("显示调试信息")
      .setDesc("显示 zoom、节点数量等调试信息。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showDebugOverlay).onChange(async (value) => {
          this.plugin.settings.showDebugOverlay = value;
          await this.plugin.saveSettings();
        }),
      );
  }
}
