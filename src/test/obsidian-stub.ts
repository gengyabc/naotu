export class TFile {
  path = "";
  basename = "";
}

export class App {}

export class TFolder {}

export class MarkdownRenderer {
  static async render(_app: App, markdown: string, wrapper: { renderedMarkdown?: string }, _sourcePath: string): Promise<void> {
    wrapper.renderedMarkdown = markdown;
  }
}

export class Notice {
  constructor(_message: string, _timeout?: number) {}
}

export function normalizePath(path: string): string {
  return path;
}
