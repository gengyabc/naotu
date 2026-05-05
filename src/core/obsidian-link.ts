import { App, TFile } from "obsidian";

export function parseObsidianLink(
  raw: string,
): { path: string; subpath?: string; targetType: "file" | "heading" | "block" } | null {
  const match = raw.match(/^\[\[([^\]]+)\]\]$/);
  if (!match) return null;

  const body = match[1].trim();
  const [pathPart, subpathPart] = body.split("#");
  if (!pathPart) return null;

  if (!subpathPart) {
    return { path: pathPart.trim(), targetType: "file" };
  }

  if (subpathPart.startsWith("^")) {
    return { path: pathPart.trim(), subpath: subpathPart.trim(), targetType: "block" };
  }

  return { path: pathPart.trim(), subpath: subpathPart.trim(), targetType: "heading" };
}

export function resolveObsidianLinkFile(args: {
  app: App;
  link: string;
  sourcePath: string;
  storedPath?: string;
}): TFile | null {
  if (args.storedPath) {
    const file = args.app.vault.getAbstractFileByPath(args.storedPath);
    if (file instanceof TFile) return file;
  }

  const parsed = parseObsidianLink(args.link);
  if (!parsed) return null;
  return args.app.metadataCache.getFirstLinkpathDest(parsed.path, args.sourcePath);
}

export function doesSubpathExist(args: {
  app: App;
  file: TFile;
  targetType: "file" | "heading" | "block";
  subpath?: string;
}): boolean {
  if (args.targetType === "file") return true;
  if (!args.subpath) return false;

  const cache = args.app.metadataCache.getFileCache(args.file) as
    | {
        headings?: Array<{ heading?: string }>;
        blocks?: Record<string, unknown>;
      }
    | undefined;

  if (args.targetType === "heading") {
    const target = normalizeHeading(args.subpath);
    return (cache?.headings ?? []).some((item) => normalizeHeading(item.heading) === target);
  }

  const blockId = args.subpath.startsWith("^") ? args.subpath.slice(1) : args.subpath;
  return Boolean(cache?.blocks?.[blockId]);
}

function normalizeHeading(input: string | undefined): string {
  return (input ?? "").trim().toLowerCase();
}
