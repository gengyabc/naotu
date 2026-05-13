import { Platform } from "obsidian";

export function isMacOS(): boolean {
  return Platform.isMacOS;
}

export function getModifierKey(): string {
  return isMacOS() ? "Cmd" : "Ctrl";
}
