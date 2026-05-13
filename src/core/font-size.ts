export const FONT_SIZE_OFFSET_ROOT = 4;
export const FONT_SIZE_OFFSET_CHILDREN = 2;

/** Default Obsidian editor font size when --font-text-size is unavailable.
 *  Different from BASE_FONT_SIZE (14) in text-layout.ts which is the
 *  rendering measurement baseline for character width calculations. */
const OBSIDIAN_DEFAULT_FONT_SIZE = 16;

let cachedBaseFontSize: number | null = null;

export function getObsidianBaseFontSize(rootElement?: Element): number {
  if (rootElement) {
    const raw = getComputedStyle(rootElement).getPropertyValue("--font-text-size").trim();
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed) && parsed > 0) cachedBaseFontSize = parsed;
  }
  return cachedBaseFontSize ?? OBSIDIAN_DEFAULT_FONT_SIZE;
}

export function getFontSizeForDepth(depth: number, baseFontSize?: number): number {
  const base = baseFontSize ?? getObsidianBaseFontSize();
  if (depth === 0) return base + FONT_SIZE_OFFSET_ROOT;
  if (depth === 1) return base + FONT_SIZE_OFFSET_CHILDREN;
  return base;
}
