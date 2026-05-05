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
