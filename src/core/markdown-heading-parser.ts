export interface MarkdownHeading {
  level: number;
  title: string;
  line: number;
}

export function parseMarkdownHeadings(markdown: string): MarkdownHeading[] {
  const lines = markdown.split("\n");
  const headings: MarkdownHeading[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (!match) continue;

    headings.push({
      level: match[1].length,
      title: match[2].trim(),
      line: i + 1,
    });
  }

  return headings;
}
