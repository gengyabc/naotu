import { describe, expect, it, beforeEach, vi } from "vitest";
import { t, setLocale, getLocale, resolveLocale, subscribeLocale } from "../i18n";

describe("i18n", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
      configurable: true,
    });

    setLocale("en");
  });

  describe("resolveLocale", () => {
    it("returns zh for zh locale", () => {
      expect(resolveLocale("zh")).toBe("zh");
    });

    it("returns en for en locale", () => {
      expect(resolveLocale("en")).toBe("en");
    });

    it("returns en for auto when navigator is not zh", () => {
      const originalLanguage = Object.getOwnPropertyDescriptor(globalThis.navigator, "language");
      Object.defineProperty(globalThis.navigator, "language", {
        value: "en-US",
        configurable: true,
      });
      expect(resolveLocale("auto")).toBe("en");
      if (originalLanguage) {
        Object.defineProperty(globalThis.navigator, "language", originalLanguage);
      }
    });

    it("returns zh for auto when navigator is zh", () => {
      const originalLanguage = Object.getOwnPropertyDescriptor(globalThis.navigator, "language");
      Object.defineProperty(globalThis.navigator, "language", {
        value: "zh-CN",
        configurable: true,
      });
      expect(resolveLocale("auto")).toBe("zh");
      if (originalLanguage) {
        Object.defineProperty(globalThis.navigator, "language", originalLanguage);
      }
    });

    it("prefers Obsidian language over navigator for auto", () => {
      const originalLanguage = Object.getOwnPropertyDescriptor(globalThis.navigator, "language");
      Object.defineProperty(globalThis.navigator, "language", {
        value: "en-US",
        configurable: true,
      });

      globalThis.localStorage.setItem("language", "zh-CN");

      expect(resolveLocale("auto")).toBe("zh");

      if (originalLanguage) {
        Object.defineProperty(globalThis.navigator, "language", originalLanguage);
      }
    });
  });

  describe("setLocale / getLocale", () => {
    it("defaults to en", () => {
      expect(getLocale()).toBe("en");
    });

    it("changes locale", () => {
      setLocale("zh");
      expect(getLocale()).toBe("zh");
    });

    it("notifies subscribers when locale changes", () => {
      const listener = vi.fn();
      const unsubscribe = subscribeLocale(listener);
      try {
        setLocale("zh");
        expect(listener).toHaveBeenCalledTimes(1);
        setLocale("en");
        expect(listener).toHaveBeenCalledTimes(2);
        setLocale("en");
        expect(listener).toHaveBeenCalledTimes(2);
      } finally {
        unsubscribe();
      }
    });
  });

  describe("t()", () => {
    it("returns english text by default", () => {
      expect(t("toolbar.open")).toBe("Open");
    });

    it("returns chinese text when locale is zh", () => {
      setLocale("zh");
      expect(t("toolbar.open")).toBe("打开");
    });

    it("interpolates params", () => {
      expect(t("notices.fileNotFound", { path: "test.naotu" })).toBe("Mindmap file not found: test.naotu");
    });

    it("interpolates multiple params", () => {
      expect(t("notices.fileNotFound", { path: "foo" })).toBe("Mindmap file not found: foo");
    });

    it("falls back to key when translation is missing", () => {
      expect(t("nonexistent.key" as never)).toBe("nonexistent.key");
    });

    it("returns chinese node titles when locale is zh", () => {
      setLocale("zh");
      expect(t("nodeTitles.centralTopic")).toBe("中心主题");
      expect(t("nodeTitles.newChildNode")).toBe("新节点");
      expect(t("nodeTitles.untitledNode")).toBe("未命名节点");
      expect(t("nodeTitles.untitledMindmap")).toBe("未命名导图");
      expect(t("nodeTitles.untitled")).toBe("未命名");
    });

    it("returns english node titles by default", () => {
      expect(t("nodeTitles.centralTopic")).toBe("Central topic");
      expect(t("nodeTitles.newChildNode")).toBe("New node");
      expect(t("nodeTitles.untitledNode")).toBe("Untitled node");
      expect(t("nodeTitles.untitledMindmap")).toBe("Untitled mindmap");
      expect(t("nodeTitles.untitled")).toBe("Untitled");
    });

    it("falls back to english when zh translation is missing", () => {
      setLocale("zh");
      expect(t("nonexistent.key" as never)).toBe("nonexistent.key");
    });
  });
});
