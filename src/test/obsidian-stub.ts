export class TFile {
  path = "";
  basename = "";
}

export class App {}

export class TFolder {}

export class Component {
  private _children: Component[] = [];
  private _loaded = false;

  addChild<T extends Component>(component: T): T {
    this._children.push(component);
    if (this._loaded) component.load();
    return component;
  }

  removeChild<T extends Component>(component: T): T {
    const index = this._children.indexOf(component);
    if (index >= 0) this._children.splice(index, 1);
    component.unload();
    return component;
  }

  load(): void {
    this._loaded = true;
    for (const child of this._children) child.load();
  }

  unload(): void {
    for (const child of this._children) child.unload();
    this._children = [];
    this._loaded = false;
  }
}

export class MarkdownRenderer {
  static async render(_app: App, markdown: string, wrapper: { renderedMarkdown?: string; renderedSourcePath?: string }, sourcePath: string, _component: Component): Promise<void> {
    wrapper.renderedMarkdown = markdown;
    wrapper.renderedSourcePath = sourcePath;
  }
}

export class Notice {
  constructor(_message: string, _timeout?: number) {}
}

export function normalizePath(path: string): string {
  return path;
}
