下面这段可以直接给 OpenCode 执行。重点是：**不要再用“打开后发现重复再关闭”的方案；改成让 `.naotu` 成为真正的 Obsidian FileView，让 Obsidian 在打开文件时按文件维度识别同一个 tab。**

---

# 任务：将 Naotu 视图从 ItemView 迁移到 FileView，解决重复打开与刷新问题

## 背景问题

当前问题是：

同一个 `.naotu` 文件如果已经打开，再次点击 Obsidian 左侧文件栏中的该文件，仍会新建 tab。之前尝试过：

1. 修改 `openMindmapFile`，在插件内部打开时先查找已有 leaf；
2. 监听 `file-open` / `active-leaf-change`，打开后发现重复再切回已有 leaf 并关闭新 leaf。

这两个方案都不够好。

原因是：

* `openMindmapFile` 只覆盖插件主动打开，不覆盖左侧文件栏点击；
* 左侧文件栏点击是 Obsidian 通过 `registerExtensions(["naotu"], VIEW_TYPE_MINDMAP)` 直接处理的，会绕过 `openMindmapFile`；
* `active-leaf-change` 是“事后去重”，流程是：先创建新 tab → 新 view 初始化/刷新 → 再发现重复 → 切回旧 tab → 关闭新 tab，因此用户仍然看到刷新/闪烁。已有记录中也说明了这个问题：侧边栏点击会绕过 `openMindmapFile`，后续的 `active-leaf-change` 去重只是补救。

目标是借鉴 Obsidian 内置 Markdown 文件的打开方式：**同一个文件已经打开时，点击文件栏只激活已有 tab，不创建新 tab，不触发重渲染。**

---

# 核心方案

将 `MindmapView` 从 `ItemView` 改为 `FileView`。

当前 `.naotu` 本质上是一个文件视图，但如果它继承 `ItemView`，Obsidian 只把它当作普通自定义视图。更合理的是继承 `FileView`，让 Obsidian 把它纳入文件打开、文件状态、tab 复用、文件重命名/移动等文件视图机制中。

需要注意：之前 OpenCode 的分析里也提到过这个方向：`FileView` 有自己的 `file` 属性，并要求实现 `getViewData()` / `setViewData()`；可以选择在 `onLoadFile` 中继续复用现有 `setFile` 逻辑，或者让 `setViewData` 使用传入内容避免二次读文件。

建议分两阶段做：

1. **第一阶段：最小迁移到 FileView，优先解决重复 tab 和刷新。**
2. **第二阶段：优化 setViewData，避免重复读取文件。**

先做第一阶段，不要一口气重构太多。

---

# Phase 1：最小迁移到 FileView

## 1. 修改 `src/view/mindmap-view.ts`

找到：

```ts
import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
```

改成：

```ts
import { FileView, WorkspaceLeaf, TFile } from "obsidian";
```

找到：

```ts
export class MindmapView extends ItemView {
```

改成：

```ts
export class MindmapView extends FileView {
```

---

## 2. 处理 `sourceFile`

当前代码里大概率有类似：

```ts
private sourceFile: TFile | null = null;
```

或者：

```ts
sourceFile: TFile;
```

迁移到 `FileView` 后，优先使用 `FileView` 自带的：

```ts
this.file
```

但为了最小改动，可以先保留 `sourceFile`，并让它和 `this.file` 同步。

建议第一阶段不要到处替换 `sourceFile`，先这样做：

```ts
private sourceFile: TFile | null = null;
```

然后在 `setFile(file: TFile)` 开头同步：

```ts
async setFile(file: TFile): Promise<void> {
  this.sourceFile = file;
  this.file = file;

  // 保留原来的加载逻辑
}
```

如果 TypeScript 报 `this.file` 是 readonly，就不要手动赋值，改成只设置：

```ts
this.sourceFile = file;
```

因为 `FileView` 在 `onLoadFile(file)` 时通常会自己维护 `file`。

所有读取当前文件的地方，封装一个 helper，避免到处判断：

```ts
private getCurrentFile(): TFile | null {
  return this.file ?? this.sourceFile ?? null;
}
```

然后把原来直接用：

```ts
this.sourceFile
```

的关键地方，逐步改成：

```ts
this.getCurrentFile()
```

尤其是：

* `getDisplayText`
* 保存逻辑
* autosave
* notebook 绑定逻辑
* file rename / file move sync
* tab title
* missing link 检查

---

## 3. 实现 FileView 必需方法

`FileView` 通常要求实现：

```ts
getViewData(): string;
setViewData(data: string, clear: boolean): void;
clear(): void;
```

实际 Obsidian 类型可能是同步，也可能允许异步。以本项目 TypeScript 报错为准。

先写成最稳妥的版本：

```ts
getViewData(): string {
  try {
    return this.store.serialize();
  } catch (error) {
    console.error("[Naotu] Failed to serialize mindmap view data", error);
    return "";
  }
}

setViewData(data: string, clear: boolean): void {
  void this.loadViewData(data, clear);
}

clear(): void {
  this.store.clear?.();
  this.render();
}

private async loadViewData(data: string, clear: boolean): Promise<void> {
  const file = this.getCurrentFile();

  if (!file) {
    return;
  }

  try {
    // 第一阶段可以先不真正使用 data，继续复用现有 setFile 逻辑
    // 这样风险最低，避免破坏 document-store 的加载流程
    await this.setFile(file);
  } catch (error) {
    console.error("[Naotu] Failed to load mindmap view data", error);
  }
}
```

如果 `store` 没有 `serialize()` / `clear()`，不要硬写。改成使用项目已有方法。

需要让 OpenCode 搜索：

```bash
rg "serialize|toJSON|export|save|openFile|loadDocument|DocumentStore" src
```

目标是找到现有保存 `.naotu` 的方法。可能已有类似：

```ts
this.store.toJSON()
this.store.serializeDocument()
this.store.exportDocument()
this.store.getDocument()
this.store.save()
```

然后让 `getViewData()` 返回当前 `.naotu` 文件内容字符串。

如果没有现成方法，可以临时实现：

```ts
getViewData(): string {
  return "";
}
```

但这只是为了通过类型检查，不建议长期这样，因为 FileView 可能会调用 `getViewData()` 保存内容。

更好的做法是补一个 `document-store` 方法：

```ts
serializeToString(): string {
  return JSON.stringify(this.document, null, 2);
}
```

实际字段名以项目现有结构为准。

---

## 4. 让 `onLoadFile` 继续走旧逻辑

保留或新增：

```ts
async onLoadFile(file: TFile): Promise<void> {
  this.sourceFile = file;
  await this.setFile(file);
}
```

如果已有：

```ts
async onLoadFile(file: TFile): Promise<void> {
  await this.setFile(file);
}
```

可以先保留，只在里面同步 `sourceFile`：

```ts
async onLoadFile(file: TFile): Promise<void> {
  this.sourceFile = file;
  await this.setFile(file);
}
```

这一版的关键目标是：**让 Obsidian 通过 FileView 识别这是一个文件视图**，而不是马上优化读取流程。

---

## 5. 处理 `getState` / `setState`

如果当前 `MindmapView` 有：

```ts
getState() {
  return {
    file: this.sourceFile.path,
  };
}

async setState(state: any, result: any) {
  ...
}
```

迁移到 `FileView` 后建议第一阶段先保留，但改得更稳：

```ts
getState(): Record<string, unknown> {
  const state = super.getState?.() ?? {};
  const file = this.getCurrentFile();

  return {
    ...state,
    file: file?.path,
  };
}
```

`setState` 可以保留旧逻辑，但要避免和 `FileView` 冲突。建议：

```ts
async setState(state: any, result: any): Promise<void> {
  await super.setState?.(state, result);

  const filePath = state?.file;
  if (!filePath || typeof filePath !== "string") {
    return;
  }

  const file = this.app.vault.getAbstractFileByPath(filePath);
  if (!(file instanceof TFile)) {
    return;
  }

  this.sourceFile = file;
  await this.setFile(file);
}
```

如果 TypeScript 报 `FileView.setState` 签名不同，就以类型提示为准调整。

但注意：如果 `FileView` 已经能通过 `onLoadFile` 正确加载文件，`setState` 可以简化，甚至删除。第一阶段建议保留，确保布局恢复时旧 workspace state 还能打开 `.naotu`。

---

# Phase 2：修改 `src/main.ts`

## 1. 保留 `registerExtensions`

继续保留：

```ts
this.registerExtensions(["naotu"], VIEW_TYPE_MINDMAP);
```

这个仍然需要，用于告诉 Obsidian `.naotu` 文件应该用 `MindmapView` 打开。

---

## 2. 删除 `active-leaf-change` / `file-open` 去重逻辑

删除之前为去重新增的代码，例如：

```ts
this.registerEvent(
  this.app.workspace.on("active-leaf-change", ...)
);
```

以及：

```ts
this.registerEvent(
  this.app.workspace.on("file-open", ...)
);
```

这些都是“事后去重”，会导致刷新/闪烁。之前的记录里也已经指出这种方案的风险：新 leaf 会短暂渲染再被销毁，用户可能看到闪烁；这不是原生 FileView 式复用。

---

## 3. 修改 `openMindmapFile`

即使迁移到 `FileView`，插件内部主动打开仍然应该先复用已有 leaf。

建议实现一个统一方法：

```ts
private findOpenMindmapLeaf(file: TFile): WorkspaceLeaf | null {
  const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP);

  for (const leaf of leaves) {
    const view = leaf.view;

    if (view instanceof MindmapView) {
      const currentFile = view.file ?? view.getCurrentFile?.();

      if (currentFile?.path === file.path) {
        return leaf;
      }
    }

    const stateFile = leaf.getViewState()?.state?.file;
    if (stateFile === file.path) {
      return leaf;
    }
  }

  return null;
}
```

如果 `getCurrentFile` 是 private，不能从 main 调用。可以在 `MindmapView` 中增加公开方法：

```ts
getOpenFile(): TFile | null {
  return this.file ?? this.sourceFile ?? null;
}
```

然后 main 中用：

```ts
if (view instanceof MindmapView && view.getOpenFile()?.path === file.path) {
  return leaf;
}
```

`openMindmapFile` 改成：

```ts
async openMindmapFile(file: TFile): Promise<void> {
  const existingLeaf = this.findOpenMindmapLeaf(file);

  if (existingLeaf) {
    this.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
    return;
  }

  const leaf = this.app.workspace.getLeaf("tab");

  await leaf.setViewState({
    type: VIEW_TYPE_MINDMAP,
    state: {
      file: file.path,
    },
    active: true,
  });

  this.app.workspace.setActiveLeaf(leaf, { focus: true });
}
```

注意：不要再用：

```ts
getLeaf(true)
```

它倾向于创建新 tab。用：

```ts
getLeaf("tab")
```

或项目里当前更合适的打开方式。

---

# Phase 3：优化 DocumentStore，支持 `setViewData(data)`

第一阶段可以先让 `onLoadFile(file)` 调用旧的 `setFile(file)`，但长期最好让 `setViewData(data, clear)` 直接使用 Obsidian 传进来的内容，避免重复读文件。

假设现在有：

```ts
async openFile(file: TFile): Promise<void> {
  const content = await this.app.vault.read(file);
  const data = JSON.parse(content);
  this.loadDocument(data);
}
```

建议改成：

```ts
async openFile(file: TFile, content?: string): Promise<void> {
  const raw = content ?? await this.app.vault.read(file);

  if (!raw.trim()) {
    this.loadDocument(this.createEmptyDocument());
    return;
  }

  const data = JSON.parse(raw);
  this.loadDocument(data);
}
```

这里一定要处理空字符串，之前记录里也指出过潜在问题：`content ?? await read()` 只处理 `null/undefined`，如果传入 `""`，`JSON.parse("")` 会报错。

然后 `MindmapView` 可以改成：

```ts
setViewData(data: string, clear: boolean): void {
  void this.loadDocumentFromViewData(data, clear);
}

private async loadDocumentFromViewData(data: string, clear: boolean): Promise<void> {
  const file = this.getCurrentFile();

  if (!file) {
    return;
  }

  try {
    this.sourceFile = file;
    await this.store.openFile(file, data);

    this.clearSelection?.();
    this.history?.clear?.();
    await this.syncNotebookPaths?.();
    this.render();
  } catch (error) {
    console.error("[Naotu] Failed to set view data", error);
  }
}
```

如果现有加载逻辑集中在 `setFile(file)`，可以改为：

```ts
async setFile(file: TFile, content?: string): Promise<void> {
  this.sourceFile = file;

  await this.store.openFile(file, content);

  // 保留原来的 relayout/render/history/notebook sync 逻辑
}
```

然后：

```ts
async onLoadFile(file: TFile): Promise<void> {
  this.sourceFile = file;
  await this.setFile(file);
}

setViewData(data: string, clear: boolean): void {
  const file = this.getCurrentFile();

  if (!file) {
    return;
  }

  void this.setFile(file, data);
}
```

---

# Phase 4：测试清单

让 OpenCode 修改后必须跑：

```bash
npm run test
```

以及：

```bash
npx tsc --noEmit
```

如果仍然出现之前已有的 rollup 类型错误：

```txt
Cannot find module 'rollup/parseAst'
```

不要把它当成本次修改失败。之前记录里多次出现这个错误，但测试是通过的。

还需要手动验证：

1. 打开一个 `.naotu` 文件；
2. 再次点击左侧文件栏同一个 `.naotu`；
3. 不应该新建 tab；
4. 不应该刷新画布；
5. 当前缩放、选区、滚动位置尽量保持；
6. 点击另一个 `.naotu` 文件，应该正常打开新 tab；
7. 已打开 A、B 两个 `.naotu` 后，点击 A，应激活 A 的已有 tab；
8. 重命名 `.naotu` 文件后，tab 标题和内部 file path 应更新；
9. 移动 `.naotu` 文件后，仍能保存；
10. 修改内容后 autosave 仍然工作；
11. 关闭 tab 后重新打开，内容正常加载；
12. Obsidian 重启后 workspace layout 能恢复 `.naotu` tab。

---

# 最终给 OpenCode 的执行提示词

可以直接复制下面这一段：

````md
你需要修复 Obsidian 插件中 `.naotu` 文件重复打开 tab 且点击已有文件仍刷新/闪烁的问题。

当前已有尝试：
1. `openMindmapFile` 中查找已有 leaf，只能处理插件主动打开；
2. `active-leaf-change` / `file-open` 事后去重，可以关闭重复 leaf，但会先创建新 tab 并触发刷新/闪烁。

不要继续使用事后去重方案。目标是借鉴 Obsidian 原生 Markdown 文件打开方式：同一个文件已经打开时，再次点击左侧文件栏只激活已有 tab，不创建新 tab，不刷新画布。

请采用 FileView 方案：

## 主要修改

1. 将 `src/view/mindmap-view.ts` 中的 `MindmapView` 从 `ItemView` 迁移到 `FileView`。
2. 保留 `registerExtensions(["naotu"], VIEW_TYPE_MINDMAP)`。
3. 删除之前新增的 `active-leaf-change` / `file-open` 去重逻辑。
4. 在 `MindmapView` 中实现 FileView 需要的方法：
   - `getViewData()`
   - `setViewData(data, clear)`
   - `clear()`
   - `onLoadFile(file)`
5. 优先保持现有加载流程不被破坏：
   - 如果现有 `setFile(file)` / `store.openFile(file)` 已经能完整加载、布局、渲染、同步 notebook、初始化 history，就先复用它。
   - 可以第一阶段让 `onLoadFile(file)` 调用 `setFile(file)`。
   - `setViewData(data, clear)` 可以进一步调用 `setFile(file, data)`，但如果改动太大，先走现有逻辑。
6. 将当前文件来源统一处理：
   - FileView 自带 `this.file`。
   - 如果项目已有 `sourceFile`，第一阶段可以保留，但必须与 `this.file` 同步。
   - 增加 `getOpenFile(): TFile | null`，返回 `this.file ?? this.sourceFile ?? null`。
7. 修改 `openMindmapFile(file)`：
   - 仍然先查找已有 `MindmapView` leaf。
   - 如果已有 leaf 的 `view.getOpenFile()?.path === file.path`，直接 `setActiveLeaf`。
   - 只有没有已有 leaf 时才创建新 tab。
8. 不要使用 `getLeaf(true)` 强制创建新 tab，除非确认没有已有 leaf。
9. 如果 `document-store.openFile(file, content?)` 支持传入 content，请修复空字符串问题：
   - 不要直接 `JSON.parse("")`。
   - 使用 `if (!raw.trim())` 处理空文件。
10. 保持所有现有测试通过。

## 验证

运行：

```bash
npm run test
npx tsc --noEmit
````

如果 `npx tsc --noEmit` 只出现已有的 `rollup/parseAst` 类型问题，不算本次失败，但要在总结里说明。

## 手动验证

* 打开一个 `.naotu` 文件；
* 再次点击左侧文件栏同一个 `.naotu`；
* 不能新建 tab；
* 不能刷新/闪烁；
* 当前缩放、选区、滚动位置尽量保持；
* 点击另一个 `.naotu` 文件应正常打开；
* 已打开 A/B 两个 `.naotu` 后，点击 A 应激活 A 的已有 tab；
* 重命名、移动、保存、autosave、重启恢复都要正常。

请先检查当前代码结构，再按最小改动实现。不要大规模重构 UI、布局、历史记录、notebook 绑定等无关逻辑。

```

我的建议是让 OpenCode **先只做 Phase 1 + Phase 2**。如果它一开始就大改 `DocumentStore`，容易引入新 bug。
```
