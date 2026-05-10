export class FakeElement {
  tagName: string;
  textContent = "";
  value = "";
  tabIndex = 0;
  focused = false;
  selected = false;
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  classNames = new Set<string>();
  attributes = new Map<string, string>();
  style: Record<string, string> = {};
  onclick: (() => void) | null = null;
  oninput: (() => void) | null = null;
  onkeydown: ((event: KeyboardEvent) => void) | null = null;
  private listeners = new Map<string, Set<(event: Event) => void>>();

  constructor(
    tagName = "div",
    options: { text?: string; cls?: string; type?: string; placeholder?: string } = {},
  ) {
    this.tagName = tagName.toUpperCase();
    if (options.text) this.textContent = options.text;
    if (options.cls) this.classNames.add(options.cls);
    if (options.type) this.attributes.set("type", options.type);
    if (options.placeholder) this.attributes.set("placeholder", options.placeholder);
  }

  createDiv(options: { cls?: string } = {}): FakeElement {
    return this.createEl("div", options);
  }

  createSpan(options: { cls?: string; text?: string } = {}): FakeElement {
    return this.createEl("span", options);
  }

  createEl(tagName: string, options: { text?: string; cls?: string; type?: string; placeholder?: string } = {}): FakeElement {
    const child = new FakeElement(tagName, options);
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  empty(): void {
    this.children = [];
    this.textContent = "";
  }

  addClass(name: string): void {
    this.classNames.add(name);
  }

  removeClass(name: string): void {
    this.classNames.delete(name);
  }

  toggleClass(name: string, enabled: boolean): void {
    if (enabled) this.classNames.add(name);
    else this.classNames.delete(name);
  }

  setText(value: string): void {
    this.textContent = value;
  }

  setAttr(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttr(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  focus(): void {
    this.focused = true;
  }

  select(): void {
    this.selected = true;
  }

  closest(selector: string): FakeElement | null {
    const tags = selector.split(",").map((part) => part.trim().toUpperCase());
    if (tags.includes(this.tagName)) return this;
    return this.parentElement?.closest(selector) ?? null;
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const listeners = this.listeners.get(type) ?? new Set<(event: Event) => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: Event): boolean {
    this.listeners.get(event.type)?.forEach((listener) => listener(event));
    return true;
  }

  getBoundingClientRect(): DOMRect {
    return {
      x: 0,
      y: 0,
      width: 1200,
      height: 800,
      top: 0,
      left: 0,
      bottom: 800,
      right: 1200,
      toJSON: () => ({}),
    } as DOMRect;
  }
}

export class TFolder {
  path = "";
  name = "";
  parent: TFolder | null = null;

  constructor(path = "") {
    setFolderPath(this, path);
  }
}

export class TFile {
  path = "";
  basename = "";
  extension = "";
  parent: TFolder | null = null;

  constructor(path = "") {
    setFilePath(this, path);
  }
}

export class App {
  vault: Record<string, unknown> = {};
  workspace: Record<string, unknown> = {};
  metadataCache: Record<string, unknown> = {};
  fileManager: Record<string, unknown> = {};

  constructor(init: Partial<App> = {}) {
    Object.assign(this, init);
  }
}

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

export class WorkspaceLeaf {
  view: unknown;
  lastOpenedFile: TFile | null = null;

  constructor(public app: App = new App()) {}

  async openFile(file: TFile, _options?: unknown): Promise<void> {
    this.lastOpenedFile = file;
  }

  async setViewState(_state: unknown): Promise<void> {}
}

export class ItemView extends Component {
  app: App;
  contentEl: FakeElement;

  constructor(public leaf: WorkspaceLeaf) {
    super();
    this.app = leaf.app;
    this.contentEl = new FakeElement("div");
    leaf.view = this;
  }
}

export class MarkdownRenderer {
  static async render(_app: App, markdown: string, wrapper: { renderedMarkdown?: string; renderedSourcePath?: string }, sourcePath: string, _component: Component): Promise<void> {
    wrapper.renderedMarkdown = markdown;
    wrapper.renderedSourcePath = sourcePath;
  }
}

export class Notice {
  static instances: Notice[] = [];
  message: string;
  timeout?: number;

  constructor(message: string, timeout?: number) {
    this.message = message;
    this.timeout = timeout;
    Notice.instances.push(this);
  }

  static reset(): void {
    Notice.instances = [];
  }
}

class MenuItem {
  title = "";
  icon = "";
  onClickCallback: (() => void) | null = null;

  setTitle(title: string | { textContent?: string | null }): this {
    this.title = typeof title === "string" ? title : title.textContent ?? "";
    return this;
  }

  setIcon(icon: string): this {
    this.icon = icon;
    return this;
  }

  onClick(callback: () => void): this {
    this.onClickCallback = callback;
    return this;
  }
}

export class Menu {
  static lastShown: Menu | null = null;
  items: MenuItem[] = [];

  addItem(builder: (item: MenuItem) => void): this {
    const item = new MenuItem();
    builder(item);
    this.items.push(item);
    return this;
  }

  addSeparator(): this {
    return this;
  }

  showAtPosition(_position: { x: number; y: number }): void {
    Menu.lastShown = this;
  }
}

export class FuzzySuggestModal<T> {
  placeholder = "";
  opened = false;

  constructor(public app: App) {}

  setPlaceholder(value: string): void {
    this.placeholder = value;
  }

  open(): this {
    this.opened = true;
    return this;
  }

  getItems(): T[] {
    return [];
  }

  getItemText(_item: T): string {
    return "";
  }

  onChooseItem(_item: T): void {}
}

export class Plugin extends Component {
  app: App;

  constructor(app = new App()) {
    super();
    this.app = app;
  }

  addSettingTab(_tab: unknown): void {}
  registerView(_type: string, _creator: unknown): void {}
  registerExtensions(_extensions: string[], _type: string): void {}
  addRibbonIcon(_icon: string, _label: string, _callback: () => void): void {}
  registerEvent(_event: unknown): void {}
  async loadData(): Promise<unknown> { return {}; }
  async saveData(_data: unknown): Promise<void> {}
}

export class PluginSettingTab {
  containerEl = new FakeElement("div");

  constructor(public app: App, public plugin: Plugin) {}
}

export class Setting {
  constructor(_containerEl: FakeElement) {}

  setName(_name: string): this { return this; }
  setDesc(_desc: string): this { return this; }
  addText(_callback: (component: { setPlaceholder(value: string): unknown; setValue(value: string): unknown; onChange(callback: (value: string) => unknown): unknown }) => void): this { return this; }
  addToggle(_callback: (component: { setValue(value: boolean): unknown; onChange(callback: (value: boolean) => unknown): unknown }) => void): this { return this; }
  addDropdown(_callback: (component: { addOption(value: string, label: string): unknown; setValue(value: string): unknown; onChange(callback: (value: string) => unknown): unknown }) => void): this { return this; }
  addSlider(_callback: (component: { setLimits(min: number, max: number, step: number): unknown; setValue(value: number): unknown; setDynamicTooltip(): unknown; onChange(callback: (value: number) => unknown): unknown }) => void): this { return this; }
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/(^|\/)\.\//g, "$1");
}

export function setFilePath(file: TFile, path: string): void {
  file.path = normalizePath(path);
  const segments = file.path.split("/");
  const name = segments[segments.length - 1] ?? file.path;
  const dotIndex = name.lastIndexOf(".");
  file.extension = dotIndex >= 0 ? name.slice(dotIndex + 1) : "";
  file.basename = dotIndex >= 0 ? name.slice(0, dotIndex) : name;
  const parentPath = segments.slice(0, -1).join("/");
  file.parent = parentPath ? new TFolder(parentPath) : null;
}

function setFolderPath(folder: TFolder, path: string): void {
  folder.path = normalizePath(path);
  const segments = folder.path.split("/");
  folder.name = segments[segments.length - 1] ?? folder.path;
  const parentPath = segments.slice(0, -1).join("/");
  folder.parent = parentPath ? new TFolder(parentPath) : null;
}
