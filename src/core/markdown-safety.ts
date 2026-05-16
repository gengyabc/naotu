export function containsUnsafeMarkdownBlocks(markdown: string): boolean {
  return /(^|\n)```/.test(markdown) || /(^|\n)~~~/.test(markdown);
}
