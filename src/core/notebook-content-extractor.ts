import { App } from "obsidian";
import { globalPreviewCache } from "./preview-cache";
import { parseObsidianLink, resolveObsidianLinkFile } from "./obsidian-link";

const fullPreviewContentCache = new Map<string, string>();
let fullPreviewContentCacheVersion = -1;

export async function readNotebookPreviewMarkdown(args: {
  app: App;
  link: string;
  sourcePath: string;
  storedPath?: string;
  maxLines?: number;
}): Promise<{ markdown: string; resolvedPath: string; totalLines: number; hasMore: boolean } | null> {
  const parsed = parseObsidianLink(args.link);
  if (!parsed) return null;

  const version = globalPreviewCache.getVersion();
  if (fullPreviewContentCacheVersion !== version) {
    fullPreviewContentCache.clear();
    fullPreviewContentCacheVersion = version;
  }

  const file = resolveObsidianLinkFile({
    app: args.app,
    link: args.link,
    sourcePath: args.sourcePath,
    storedPath: args.storedPath,
  });
  if (!file) return null;

  const fullContentCacheKey = `${file.path}::${parsed.subpath ?? ""}`;
  const maxLines = args.maxLines ?? 40;
  const cacheKey = `${fullContentCacheKey}::${maxLines}`;
  const cached = globalPreviewCache.get(cacheKey);
  if (cached !== null) {
    const totalLines = countLines(fullPreviewContentCache.get(fullContentCacheKey) ?? cached);
    return { markdown: cached, resolvedPath: file.path, totalLines, hasMore: totalLines > countLines(cached) };
  }

  let markdown = fullPreviewContentCache.get(fullContentCacheKey);
  if (markdown === undefined) {
    const content = await args.app.vault.read(file);

    if (!parsed.subpath) {
      markdown = content;
    } else if (parsed.targetType === "heading") {
      markdown = extractHeadingSection(content, parsed.subpath);
    } else if (parsed.targetType === "block") {
      markdown = extractBlock(content, parsed.subpath);
    } else {
      markdown = content;
    }

    fullPreviewContentCache.set(fullContentCacheKey, markdown);
  }

  const lines = markdown.split("\n");
  const result = lines.slice(0, maxLines).join("\n");
  globalPreviewCache.set(cacheKey, result);
  return { markdown: result, resolvedPath: file.path, totalLines: lines.length, hasMore: lines.length > maxLines };
}

function countLines(markdown: string): number {
  if (!markdown) return 0;
  return markdown.split("\n").length;
}

export function extractHeadingSection(content: string, heading: string): string {
  const lines = content.split("\n");
  const target = normalizeHeading(heading);

  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (!match) continue;
    if (normalizeHeading(match[2]) === target) {
      start = i;
      level = match[1].length;
      break;
    }
  }

  if (start < 0) return "";

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (match && match[1].length <= level) {
      end = i;
      break;
    }
  }

  return lines.slice(start, end).join("\n");
}

export function extractBlock(content: string, blockId: string): string {
  const cleanBlockId = blockId.startsWith("^") ? blockId : `^${blockId}`;
  const paragraphs = content.split(/\n\s*\n/);
  const found = paragraphs.find((paragraph) => paragraph.includes(cleanBlockId));
  if (found) return found;

  const lines = content.split("\n");
  return lines.find((line) => line.includes(cleanBlockId)) ?? "";
}

function normalizeHeading(input: string): string {
  return input.trim().toLowerCase();
}
