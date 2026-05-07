export interface SemanticMindmapSettings {
  notebookFolder: string;
  notebookTemplate: string;
  importHeadingsAsNotebookNodes: boolean;
  maxBacklinkMapNodes: number;
  showDebugOverlay: boolean;
  showMinimap: boolean;
  defaultRenderMode: "auto" | "svg" | "hybrid";
  enableHybridRenderer: boolean;
  hybridNodeThreshold: number;
  enableViewportCulling: boolean;
  cullingNodeThreshold: number;
  showMissingNotebookWarnings: boolean;
  autoSave: boolean;
  autoSaveDelayMs: number;
  defaultExportFormat: "svg" | "png";
  language: "auto" | "zh" | "en";
  layoutHorizontalSpacing: number;
  layoutVerticalSpacing: number;
  zoomSpeed: number;
}

export const DEFAULT_LAYOUT_HORIZONTAL_SPACING = 160;
export const DEFAULT_LAYOUT_VERTICAL_SPACING = 60;

export const DEFAULT_SETTINGS: SemanticMindmapSettings = {
  notebookFolder: "notebooks",
  notebookTemplate: "# {{title}}\n",
  importHeadingsAsNotebookNodes: true,
  maxBacklinkMapNodes: 80,
  showDebugOverlay: false,
  showMinimap: true,
  defaultRenderMode: "auto",
  enableHybridRenderer: true,
  hybridNodeThreshold: 1200,
  enableViewportCulling: true,
  cullingNodeThreshold: 500,
  showMissingNotebookWarnings: true,
  autoSave: true,
  autoSaveDelayMs: 800,
  defaultExportFormat: "svg",
  language: "auto",
  layoutHorizontalSpacing: DEFAULT_LAYOUT_HORIZONTAL_SPACING,
  layoutVerticalSpacing: DEFAULT_LAYOUT_VERTICAL_SPACING,
  zoomSpeed: 0.003,
};
