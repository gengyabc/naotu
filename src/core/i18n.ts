export type Language = "zh" | "en";

const zh = {
  helpTitle: "Semantic Zoom Mindmap 帮助",
  createMindmap: "创建语义缩放脑图",
  save: "保存",
  exportSvg: "导出 SVG",
  exportPng: "导出 PNG",
};

const en = {
  helpTitle: "Semantic Zoom Mindmap Help",
  createMindmap: "Create semantic zoom mindmap",
  save: "Save",
  exportSvg: "Export SVG",
  exportPng: "Export PNG",
};

export function getLanguage(setting: "auto" | "zh" | "en"): Language {
  if (setting === "zh" || setting === "en") return setting;

  const locale = window.localStorage.getItem("language") ?? navigator.language;
  return locale.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function createTranslator(language: Language): (key: keyof typeof zh) => string {
  const dict = language === "zh" ? zh : en;
  return (key) => dict[key] ?? key;
}
