const CHAR_WIDTH_CHINESE = 14;
const CHAR_WIDTH_ENGLISH = 8;
const CHAR_WIDTH_SPACE = 4;
const TITLE_MAX_WIDTH_CHARS = 30;
const TITLE_MAX_LINES = 2;
const TITLE_PADDING_HORIZONTAL = 24;
const TITLE_PADDING_VERTICAL_SINGLE_LINE = 30;
const TITLE_PADDING_VERTICAL_TWO_LINES = 48;
const TITLE_LINE_HEIGHT_FACTOR = 1.4;

export interface TextLayoutResult {
  lines: string[];
  width: number;
  height: number;
  isOverflow: boolean;
}

function measureCharWidth(char: string): number {
  if (char === " ") return CHAR_WIDTH_SPACE;
  if (/[\u4e00-\u9fa5]/.test(char)) return CHAR_WIDTH_CHINESE;
  return CHAR_WIDTH_ENGLISH;
}

function measureTextWidth(text: string, fontSize: number): number {
  const scaleFactor = fontSize / 14;
  let width = 0;
  for (const char of text) {
    width += measureCharWidth(char) * scaleFactor;
  }
  return width;
}

export function layoutText(args: { text: string; fontSize: number }): TextLayoutResult {
  const { text, fontSize } = args;
  const scaleFactor = fontSize / 14;
  const maxWidth = TITLE_MAX_WIDTH_CHARS * CHAR_WIDTH_CHINESE * scaleFactor;
  
  const lines: string[] = [];
  let currentLine = "";
  let currentWidth = 0;
  let isOverflow = false;

  for (const char of text) {
    const charWidth = measureCharWidth(char) * scaleFactor;
    
    if (currentWidth + charWidth > maxWidth) {
      if (lines.length >= TITLE_MAX_LINES - 1) {
        isOverflow = true;
        break;
      }
      lines.push(currentLine);
      currentLine = char;
      currentWidth = charWidth;
    } else {
      currentLine += char;
      currentWidth += charWidth;
    }
  }

  if (currentLine && lines.length < TITLE_MAX_LINES) {
    lines.push(currentLine);
  }

  if (lines.length === 0) {
    lines.push("");
  }

  const lineHeight = fontSize * TITLE_LINE_HEIGHT_FACTOR;
  const numLines = lines.length;
  
  const actualTextWidth = measureTextWidth(lines[0] || "", fontSize);
  const secondLineTextWidth = lines[1] ? measureTextWidth(lines[1], fontSize) : 0;
  const maxLineWidth = Math.max(actualTextWidth, secondLineTextWidth);
  const width = maxLineWidth + TITLE_PADDING_HORIZONTAL;
  
  const paddingVertical = numLines === 1 ? TITLE_PADDING_VERTICAL_SINGLE_LINE : TITLE_PADDING_VERTICAL_TWO_LINES;
  const height = numLines * lineHeight + paddingVertical;

  return {
    lines,
    width,
    height,
    isOverflow,
  };
}

export function shouldSuggestNotebook(text: string): boolean {
  const result = layoutText({ text, fontSize: 14 });
  return result.isOverflow;
}

export function getTextNodeDisplaySize(args: { title: string; fontSize: number }): { width: number; height: number } {
  const result = layoutText({ text: args.title, fontSize: args.fontSize });
  return {
    width: result.width,
    height: result.height,
  };
}