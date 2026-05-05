export function sanitizeFilename(input: string): string {
  const cleaned = input
    .trim()
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "Untitled";
}
