import { getLanguage } from "obsidian";
import { en } from "./en";
import { zh } from "./zh";
import type { Locale } from "./types";

type DeepStringRecord = { [key: string]: string | DeepStringRecord };

type NestedKey<T> = T extends object
  ? { [K in keyof T]: `${K & string}${T[K] extends object ? `.${NestedKey<T[K]>}` : ""}` }[keyof T]
  : never;

export type I18nKey = NestedKey<typeof en>;

const dictionaries: Record<"en" | "zh", DeepStringRecord> = {
  en: en as unknown as DeepStringRecord,
  zh: zh as unknown as DeepStringRecord,
};

let currentLocale: "en" | "zh" = "en";
const localeListeners = new Set<() => void>();

function resolveAutoLocale(): "en" | "zh" {
  return getLanguage().toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function resolveLocale(locale: Locale): "en" | "zh" {
  if (locale === "zh" || locale === "en") {
    return locale;
  }

  return resolveAutoLocale();
}

export function setLocale(locale: Locale): void {
  const next = resolveLocale(locale);
  if (currentLocale === next) return;
  currentLocale = next;
  for (const listener of localeListeners) {
    listener();
  }
}

export function getLocale(): "en" | "zh" {
  return currentLocale;
}

export function subscribeLocale(listener: () => void): () => void {
  localeListeners.add(listener);
  return () => localeListeners.delete(listener);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function t(key: I18nKey, params?: Record<string, string | number>): string {
  const dict = dictionaries[currentLocale] ?? en;
  const fallback = en;

  let value = getNestedValue(dict, key) ?? getNestedValue(fallback as unknown as DeepStringRecord, key) ?? key;

  if (params) {
    for (const [name, paramValue] of Object.entries(params)) {
      const regex = new RegExp(`\\{\\{${escapeRegExp(name)}\\}\\}`, "g");
      value = value.replace(regex, String(paramValue));
    }
  }

  return value;
}

function getNestedValue(obj: unknown, path: string): string | undefined {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return typeof current === "string" ? current : undefined;
}
