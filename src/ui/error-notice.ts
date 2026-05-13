import { Notice } from "obsidian";
import { t, type I18nKey } from "../i18n";
import { ExternalConflictError } from "../core/external-conflict-error";

export function showErrorNotice(error: unknown, fallbackKey: I18nKey = "notices.operationFailed"): void {
  let message: string;
  if (error instanceof ExternalConflictError) {
    message = t("notices.saveConflict");
  } else if (error instanceof Error) {
    message = error.message || t(fallbackKey);
  } else {
    message = t(fallbackKey);
  }
  new Notice(message, 6000);
}
