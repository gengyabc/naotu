export type SupportedFileNodeTargetKind = "image" | "excalidraw";

export const SUPPORTED_FILE_NODE_IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "avif",
  "bmp",
] as const;

const SUPPORTED_IMAGE_EXTENSION_SET = new Set<string>(SUPPORTED_FILE_NODE_IMAGE_EXTENSIONS);

export function parseFileNodeEmbedInput(input: string): { query: string } | null {
  const trimmedStart = input.trimStart();
  if (!trimmedStart.startsWith("![[")) return null;
  return { query: trimmedStart.slice(3).trim() };
}

export function getSupportedFileNodeTargetKind(path: string): SupportedFileNodeTargetKind | null {
  const normalized = path.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.endsWith(".excalidraw") || normalized.endsWith(".excalidraw.md")) {
    return "excalidraw";
  }

  const extension = getLastExtension(normalized);
  if (extension && SUPPORTED_IMAGE_EXTENSION_SET.has(extension)) {
    return "image";
  }

  return null;
}

export function isSupportedFileNodeTargetPath(path: string): boolean {
  return getSupportedFileNodeTargetKind(path) !== null;
}

export function getFileNodeTitle(path: string): string {
  const normalized = path.trim().replace(/\\+/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? normalized;
}

export function buildEmbeddedPreviewMarkdown(path: string): string {
  return `![[${path}]]`;
}

function getLastExtension(path: string): string | null {
  const leaf = getFileNodeTitle(path).toLowerCase();
  const lastDot = leaf.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === leaf.length - 1) return null;
  return leaf.slice(lastDot + 1);
}
