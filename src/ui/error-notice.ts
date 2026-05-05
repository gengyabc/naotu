import { Notice } from "obsidian";

export function showErrorNotice(error: unknown, fallback = "操作失败"): void {
  const message = error instanceof Error ? error.message : fallback;
  new Notice(message, 6000);
}
