export interface SemanticMindmapSettings {
  notebookFolder: string;
  notebookTemplate: string;
  importHeadingsAsNotebookNodes: boolean;
  showMinimap: boolean;
  showMissingNotebookWarnings: boolean;
  autoSave: boolean;
  autoSaveDelayMs: number;
  language: "auto" | "zh" | "en";
  layoutHorizontalSpacing: number;
  layoutVerticalSpacing: number;
  zoomSpeed: number;
}

export const DEFAULT_LAYOUT_HORIZONTAL_SPACING = 50;
export const DEFAULT_LAYOUT_VERTICAL_SPACING = 60;

export const DEFAULT_SETTINGS: SemanticMindmapSettings = {
  notebookFolder: "notebooks",
  notebookTemplate: "# {{title}}\n",
  importHeadingsAsNotebookNodes: true,
  showMinimap: true,
  showMissingNotebookWarnings: true,
  autoSave: true,
  autoSaveDelayMs: 800,
  language: "auto",
  layoutHorizontalSpacing: DEFAULT_LAYOUT_HORIZONTAL_SPACING,
  layoutVerticalSpacing: DEFAULT_LAYOUT_VERTICAL_SPACING,
  zoomSpeed: 0.003,
};
