import { App, PluginSettingTab, Setting } from "obsidian";
import type SemanticZoomMindmapPlugin from "../main";
import { DEFAULT_LAYOUT_HORIZONTAL_SPACING, DEFAULT_LAYOUT_VERTICAL_SPACING } from "../types/settings";

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
    this.createSection(containerEl, "帮助");
    
    containerEl.createEl("p", {
      text: "text 节点只是一句话，用于脑图结构表达。notebook 节点绑定 Obsidian 笔记，用于知识展开。",
    });

    containerEl.createEl("h4", { text: "主要操作", cls: "setting-item-description" });
    const list = containerEl.createEl("ul");
    [
      "双击节点标题：编辑标题",
      "点击双下箭头：text 节点转 notebook，notebook 节点展开预览",
      "点击右侧 + / -：展开或收起子树",
      "Tab：新增子节点",
      "Enter：新增兄弟节点",
      "Space：展开 / 收起当前节点",
      "F2：编辑当前节点",
      "方向键：在节点之间移动",
      "Cmd/Ctrl + Z：撤销",
      "Cmd/Ctrl + Shift + Z：重做",
      "Cmd/Ctrl + F：搜索",
      "Cmd/Ctrl + 0：回到 root",
    ].forEach((text) => {
      list.createEl("li", { text });
    });

    containerEl.createEl("h4", { text: "语义缩放", cls: "setting-item-description" });
    containerEl.createEl("p", {
      text: "缩放不会简单放大文字，而是改变信息粒度。缩小看结构，放大看 notebook 内容。",
    });
  }

  private renderNotebookSettings(containerEl: HTMLElement): void {
    this.createSection(containerEl, "Notebook");

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
  }

  private renderImportSettings(containerEl: HTMLElement): void {
    this.createSection(containerEl, "Import");

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
  }

  private renderRenderingSettings(containerEl: HTMLElement): void {
    this.createSection(containerEl, "Rendering");

    new Setting(containerEl)
      .setName("显示小地图")
      .setDesc("在右上角显示 minimap。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showMinimap).onChange(async (value) => {
          this.plugin.settings.showMinimap = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("默认渲染模式")
      .setDesc("auto 会根据节点数量选择 SVG 或 Hybrid。")
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
      .setName("缩放速度")
      .setDesc("鼠标滚轮缩放的速度（默认 0.003，值越大速度越快）。")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.zoomSpeed)).onChange(async (value) => {
          const parsed = Number.parseFloat(value);
          this.plugin.settings.zoomSpeed = Number.isFinite(parsed) ? Math.max(0.0005, Math.min(0.01, parsed)) : 0.003;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("树布局水平间距(px)")
      .setDesc("树布局每层的水平距离。")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.layoutHorizontalSpacing)).onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          this.plugin.settings.layoutHorizontalSpacing = Number.isFinite(parsed) ? Math.max(0, parsed) : DEFAULT_LAYOUT_HORIZONTAL_SPACING;
          await this.plugin.saveSettings();
          await this.plugin.notifyLayoutSettingsChanged();
        }),
      );

    new Setting(containerEl)
      .setName("树布局垂直间距(px)")
      .setDesc("树布局相邻叶子槽位的垂直距离。")
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
    this.createSection(containerEl, "Performance");

    new Setting(containerEl)
      .setName("启用 Hybrid Renderer")
      .setDesc("大图时使用 Canvas 背景层 + SVG 交互层。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableHybridRenderer).onChange(async (value) => {
          this.plugin.settings.enableHybridRenderer = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Hybrid 节点阈值")
      .setDesc("节点数超过该值时，auto 模式使用 Hybrid renderer。")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.hybridNodeThreshold)).onChange(async (value) => {
          const n = Number.parseInt(value, 10);
          this.plugin.settings.hybridNodeThreshold = Number.isFinite(n) ? Math.max(100, n) : 1200;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("启用 viewport culling")
      .setDesc("大图时只渲染视口附近的节点。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableViewportCulling).onChange(async (value) => {
          this.plugin.settings.enableViewportCulling = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Culling 节点阈值")
      .setDesc("节点数超过该值时启用 culling。")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.cullingNodeThreshold)).onChange(async (value) => {
          const n = Number.parseInt(value, 10);
          this.plugin.settings.cullingNodeThreshold = Number.isFinite(n) ? Math.max(100, n) : 500;
          await this.plugin.saveSettings();
        }),
      );
  }

  private renderExportSettings(containerEl: HTMLElement): void {
    this.createSection(containerEl, "Export");

    new Setting(containerEl)
      .setName("默认导出格式")
      .setDesc("用于后续快捷导出。")
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
    this.createSection(containerEl, "Debug");

    new Setting(containerEl)
      .setName("显示调试信息")
      .setDesc("显示 zoom、节点数量等调试信息。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showDebugOverlay).onChange(async (value) => {
          this.plugin.settings.showDebugOverlay = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("显示 missing notebook 警告")
      .setDesc("在渲染层标注丢失链接的 notebook 节点。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showMissingNotebookWarnings).onChange(async (value) => {
          this.plugin.settings.showMissingNotebookWarnings = value;
          await this.plugin.saveSettings();
        }),
      );
  }

  private renderAdvancedSettings(containerEl: HTMLElement): void {
    this.createSection(containerEl, "Advanced");

    new Setting(containerEl)
      .setName("自动保存")
      .setDesc("编辑后自动保存 mindmap 文件。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoSave).onChange(async (value) => {
          this.plugin.settings.autoSave = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("自动保存延迟(ms)")
      .setDesc("输入停止后多久执行自动保存。")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.autoSaveDelayMs)).onChange(async (value) => {
          const n = Number.parseInt(value, 10);
          this.plugin.settings.autoSaveDelayMs = Number.isFinite(n) ? Math.max(100, n) : 800;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("语言")
      .setDesc("i18n 预留设置。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("auto", "Auto")
          .addOption("zh", "中文")
          .addOption("en", "English")
          .setValue(this.plugin.settings.language)
          .onChange(async (value) => {
            this.plugin.settings.language = value as "auto" | "zh" | "en";
            await this.plugin.saveSettings();
          }),
      );
  }
}
