import { App, TFile } from "obsidian";
import { describe, expect, it } from "vitest";

import { createLocalKnowledgeMap } from "../core/local-knowledge-map";
import { createNotebookFile } from "./test-fixtures";

describe("createLocalKnowledgeMap", () => {
  it("includes all related files for small neighborhoods", () => {
    const center = createNotebookFile("notes/topic.md");
    const alpha = createNotebookFile("notes/alpha.md");
    const beta = createNotebookFile("notes/beta.md");
    const gamma = createNotebookFile("notes/gamma.md");
    const delta = createNotebookFile("notes/delta.md");

    const app = createKnowledgeMapApp({
      center,
      outlinks: [alpha, beta],
      backlinks: [
        { file: gamma, weight: 1 },
        { file: delta, weight: 2 },
      ],
    });

    const doc = createLocalKnowledgeMap({ app, file: center as TFile });
    const titles = new Set(doc.nodes.map((node) => node.title));

    expect(doc.nodes).toHaveLength(5);
    expect(doc.title).toBe("topic Local Knowledge Map");
    expect(titles).toEqual(new Set(["topic", "alpha", "beta", "gamma", "delta"]));
  });

  it("automatically caps large neighborhoods while keeping direct outlinks", () => {
    const center = createNotebookFile("notes/topic.md");
    const outlinks = Array.from({ length: 10 }, (_, index) => createNotebookFile(`notes/out-${index.toString().padStart(2, "0")}.md`));
    const backlinks = Array.from({ length: 90 }, (_, index) => ({
      file: createNotebookFile(`notes/back-${index.toString().padStart(2, "0")}.md`),
      weight: 1,
    }));

    const app = createKnowledgeMapApp({ center, outlinks, backlinks });
    const doc = createLocalKnowledgeMap({ app, file: center as TFile });
    const titles = new Set(doc.nodes.map((node) => node.title));

    expect(doc.nodes).toHaveLength(81);
    expect(doc.title).toBe("topic Local Knowledge Map [truncated 80/100]");
    for (const file of outlinks) {
      expect(titles.has(file.basename)).toBe(true);
    }
    expect(Array.from(titles).filter((title) => title.startsWith("back-")).length).toBe(70);
  });
});

function createKnowledgeMapApp(args: {
  center: TFile;
  outlinks: TFile[];
  backlinks: Array<{ file: TFile; weight: number }>;
}): App {
  const files = [args.center, ...args.outlinks, ...args.backlinks.map((item) => item.file)];
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const outlinksByName = new Map(args.outlinks.map((file) => [file.basename, file]));
  const resolvedLinks: Record<string, Record<string, number>> = {
    [args.center.path]: Object.fromEntries(args.outlinks.map((file) => [file.path, 1])),
  };

  for (const backlink of args.backlinks) {
    resolvedLinks[backlink.file.path] = {
      [args.center.path]: backlink.weight,
    };
  }

  const app = new App();
  app.metadataCache = {
      getFileCache(file: TFile) {
        if (file.path !== args.center.path) return { links: [] };
        return {
          links: args.outlinks.map((target) => ({ link: target.basename })),
        };
      },
      getFirstLinkpathDest(linkpath: string) {
        return outlinksByName.get(linkpath) ?? null;
      },
      resolvedLinks,
    } as never;
  app.vault = {
      getAbstractFileByPath(path: string) {
        return filesByPath.get(path) ?? null;
      },
    } as never;
  return app;
}
