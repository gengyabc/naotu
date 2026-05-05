export interface SemanticMindmapSettings {
  notebookFolder: string;
  notebookTemplate: string;
  importHeadingsAsNotebookNodes: boolean;
  maxBacklinkMapNodes: number;
  showDebugOverlay: boolean;
}

export const DEFAULT_SETTINGS: SemanticMindmapSettings = {
  notebookFolder: "notebooks",
  notebookTemplate: "# {{title}}\n",
  importHeadingsAsNotebookNodes: true,
  maxBacklinkMapNodes: 80,
  showDebugOverlay: false,
};
