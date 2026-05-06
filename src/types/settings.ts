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
}

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
  layoutHorizontalSpacing: 220,
  layoutVerticalSpacing: 80,
};
