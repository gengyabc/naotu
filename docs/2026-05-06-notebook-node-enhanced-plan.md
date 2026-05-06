# Notebook Node Enhanced UX 详细执行计划

基于需求文档：`docs/requirements/2026-05-06-notebook-node-enhanced.md`

这份计划的目标不是“讨论方向”，而是直接给实现模型一份可执行说明。
实现时按本文顺序做，不要临时改数据结构，不要自己重新设计交互。

---

## 0. 目标

本次只实现 4 件事：

1. notebook 节点扩展到 level 5 后，不能与其他节点重叠
2. 在 notebook 节点顶部标题下方增加“打开 md”按钮，点击后在 split pane 打开对应文件
3. notebook level 5 预览区支持原生细滚动条
4. notebook level 5 支持右下角 resize handler，自由调整宽高，并持久化到 `.mindmap.json`

---

## 1. 实现原则

1. 只改现有 SVG + `foreignObject` 渲染链路，不引入新渲染层
2. 不改 text 节点行为
3. 不改 notebook level 0-4 的尺寸行为
4. 不把 resize 能力扩散到其他节点类型
5. 不新增设置项
6. 尽量复用现有 `renderProjectedNodes`、`createSemanticProjection`、`MindmapView` 交互流
7. 所有尺寸调整都以屏幕像素为准，因为 `displayWidth` / `displayHeight` 本来就是屏幕空间尺寸

---

## 2. 必须先修正的现状问题

当前 `SvgMindmapRenderer` / `HybridMindmapRenderer` 中，`forcedDetailLevel` 是在 `createSemanticProjection()` 之后才写回 `projection.nodes` 的：

- `src/renderer/svg-mindmap-renderer.ts:121-125`
- `src/renderer/hybrid-mindmap-renderer.ts:126-130`

这会导致一个隐藏问题：

1. `detailLevel` 变成 5 了
2. 但 `displayWidth` / `displayHeight` 还是旧 detail 计算出来的
3. `layout-relaxation` 也还是基于旧尺寸跑的

这次功能必须先修这个问题，否则：

- level 5 notebook 的尺寸可能不对
- anti-overlap 不可靠
- resize 后 re-render 逻辑会混乱

### 固定决策

不要继续在 renderer 里“投影后再改 detail”。

改成：

1. `createSemanticProjection()` 接收 `forcedDetailLevels`
2. 在 projection 阶段就把最终 detail 算出来
3. `displayWidth` / `displayHeight` / `projectedX` / `projectedY` / overlap relaxation 全部基于最终 detail 计算

---

## 3. 数据结构改动

### 3.1 修改 `src/types/mindmap.ts`

在 `MindmapNode` 上新增：

```ts
customWidth?: number;
customHeight?: number;
```

放在 `width` / `height` 后面，表示 notebook level 5 的自定义显示尺寸。

不要删除现有的 `width` / `height`。
原因：

1. 现有文档已经有这两个字段
2. tree/free 布局、历史数据、测试数据都依赖它们存在
3. 这次 resize 只影响 semantic display size，不要把老字段语义改坏

### 3.2 修改 `ProjectedNode`

新增：

```ts
showOpenNotebookButton: boolean;
showResizeHandle: boolean;
usesCustomSize: boolean;
```

用途：

1. `showOpenNotebookButton`：只在 notebook level 5 且存在 link 时显示
2. `showResizeHandle`：只在 notebook level 5 时显示
3. `usesCustomSize`：便于测试和渲染逻辑判断当前是否用了持久化尺寸

### 3.3 修改 `CreateSemanticProjectionExtra`

在 `src/core/semantic-projection.ts` 的 `CreateSemanticProjectionExtra` 增加：

```ts
forcedDetailLevels?: ReadonlyMap<string, NodeDetailLevel>;
```

`ReadonlyMap` 就够用，不需要可变 map。

---

## 4. 尺寸与 UI 常量

不要在多个文件里写魔法数字，统一在 `src/renderer/projected-node-renderer.ts` 顶部定义常量。

新增常量：

```ts
const NOTEBOOK_RESIZE_MIN_WIDTH = 200;
const NOTEBOOK_RESIZE_MIN_HEIGHT = 150;

const NOTEBOOK_OPEN_BUTTON_X = 12;
const NOTEBOOK_OPEN_BUTTON_Y = 34;
const NOTEBOOK_OPEN_BUTTON_WIDTH = 78;
const NOTEBOOK_OPEN_BUTTON_HEIGHT = 20;

const NOTEBOOK_PREVIEW_X = 8;
const NOTEBOOK_PREVIEW_Y = 62;
const NOTEBOOK_PREVIEW_RIGHT_PADDING = 8;
const NOTEBOOK_PREVIEW_BOTTOM_PADDING = 20;

const NOTEBOOK_RESIZE_HANDLE_SIZE = 12;
const NOTEBOOK_RESIZE_HANDLE_INSET = 8;
```

说明：

1. 顶部按钮放在标题下方
2. preview 从 `y=62` 开始，留出标题和按钮区
3. preview 底部额外留 `20px`，避免挡住右下角 resize handle
4. 最小尺寸固定就是需求里约定的 `200 x 150`

如果后续实现发现视觉上需要微调，只允许微调这些常量，不允许改布局结构。

---

## 5. Projection 层改造

### 5.1 修改 `src/core/semantic-projection.ts`

目标：在 projection 阶段产出最终尺寸。

#### 步骤 1：合并 forced detail

在循环每个 node 时：

1. 先调用 `computeSemanticDetailLevel()` 得到 `computedDetail`
2. 读取 `extra.forcedDetailLevels?.get(node.id)`
3. 最终 detail 使用：

```ts
const detail = forcedDetail !== undefined && forcedDetail > computedDetail
  ? forcedDetail
  : computedDetail;
```

不要在 renderer 再改 `node.detailLevel`。

#### 步骤 2：增加 notebook level 5 自定义尺寸解析

在 `semantic-projection.ts` 内新增一个私有 helper，例如：

```ts
function resolveProjectedDisplaySize(args: {
  node: MindmapDocument["nodes"][number];
  detail: NodeDetailLevel;
}): { width: number; height: number; usesCustomSize: boolean }
```

逻辑固定为：

1. 先拿 `getVisualSpec(node.kind, detail)` 的默认尺寸
2. 只有满足下面全部条件时才允许覆盖：
   - `node.kind === "notebook"`
   - `detail === 5`
   - `typeof node.customWidth === "number"`
   - `typeof node.customHeight === "number"`
3. 覆盖时做最小值钳制：

```ts
width = Math.max(200, Math.round(node.customWidth));
height = Math.max(150, Math.round(node.customHeight));
```

4. 其他情况使用默认尺寸

不要在 projection 层做最大值限制。

#### 步骤 3：用最终尺寸计算位置

当前逻辑是：

```ts
projectedX = projectedCenter.x - visual.width / (2 * zoom)
projectedY = projectedCenter.y - visual.height / (2 * zoom)
displayWidth = visual.width
displayHeight = visual.height
```

改成使用 `resolvedSize.width/height`。

#### 步骤 4：投影节点上新增 UI flag

写入：

```ts
showOpenNotebookButton: node.kind === "notebook" && detail === 5 && Boolean(node.notebook?.link),
showResizeHandle: node.kind === "notebook" && detail === 5,
usesCustomSize,
```

已移除独立展开按钮，相关操作改由右键菜单触发。

#### 步骤 5：调用 relax 时根据场景切参数

先算：

```ts
const hasExpandedNotebook = projectedNodes.some(
  (node) => node.kind === "notebook" && node.detailLevel === 5,
);
```

然后：

```ts
projectedNodes = relaxProjectedNodes(projectedNodes, {
  zoom: context.zoom,
  iterations: hasExpandedNotebook ? 12 : doc.nodes.length > 300 ? 2 : 4,
  pushStrength: hasExpandedNotebook ? 36 : 28,
  maxMovePerIteration: hasExpandedNotebook ? 72 : 48,
  settleUntilNoOverlap: hasExpandedNotebook,
  maxSettlePasses: hasExpandedNotebook ? 8 : 0,
  overlapPadding: hasExpandedNotebook ? 16 : 12,
});
```

这里不是建议，是固定实现。

---

## 6. Anti-overlap 实现细节

### 6.1 修改 `src/core/layout-relaxation.ts`

扩展 `RelaxProjectionOptions`：

```ts
settleUntilNoOverlap?: boolean;
maxSettlePasses?: number;
overlapPadding?: number;
```

### 6.2 新增 helper

新增内部 helper：

```ts
function isExpandedNotebook(node: ProjectedNode): boolean {
  return node.kind === "notebook" && node.detailLevel === 5;
}

function hasAnyOverlap(nodes: ProjectedNode[], zoom: number, padding: number): boolean
```

### 6.3 冲突解算优先级规则

当前逻辑里 `isFocus || isSelected` 就算 fixed，两个 fixed 节点相撞时直接跳过。这次不能这么做，否则仍可能残留重叠。

改成下面这个固定规则：

1. 如果两个节点都不是 expanded notebook，保留原有 fixed 语义
2. 如果 overlap 中包含 expanded notebook，则 expanded notebook 优先保位，优先推动另一个节点
3. 如果两个节点都是 expanded notebook：
   - 如果其中一个是 focus/selected，优先保它，另一个移动更多
   - 如果两者同级，双方各移动一半
4. 只在“两个都是非-notebook 且都 fixed”时允许 continue

这能保证需求 1 的核心语义：扩展后的 notebook 不和别人重叠。

### 6.4 必须增加 settle pass

主 iterations 结束后：

1. 如果 `settleUntilNoOverlap` 为 `false`，直接返回
2. 如果为 `true`，循环做额外 pass
3. 每个额外 pass：重新扫描所有 pair，只要还有 overlap 就继续
4. 最多 `maxSettlePasses`
5. 提前退出条件：一整轮没有任何 pair overlap

不要递归，用普通循环。

### 6.5 overlap 判断 padding

原来固定写死 `12`，现在改成使用 `overlapPadding`。

---

## 7. Renderer 回调接口改造

### 7.1 修改 `src/renderer/projected-node-renderer.ts` 的参数签名

在 `renderProjectedNodes(args)` 的参数里新增：

```ts
onOpenNotebook: (id: string) => void;
onNotebookResizeStart: (id: string) => void;
onNotebookResize: (args: { id: string; width: number; height: number }) => void;
onNotebookResizeEnd: (args: { id: string; width: number; height: number }) => void;
```

不要把 resize 复用到 `onNodesMove`。

原因：

1. move 是 world-space 文档坐标
2. resize 是 screen-space display size
3. 两者语义不同，混在一起会导致实现变脏

### 7.2 修改两个 renderer 的 options

同步修改：

- `src/renderer/svg-mindmap-renderer.ts`
- `src/renderer/hybrid-mindmap-renderer.ts`

在构造参数 `options` 中增加相同 callback。

然后在调用 `renderProjectedNodes()` 时透传进去。

### 7.3 强制 detail 改造

两个 renderer 中：

1. `createSemanticProjection()` 调用时，把 `forcedDetailLevels: this.forcedDetailLevel` 传进去
2. 删除 projection 返回后对 `node.detailLevel` 的二次覆盖逻辑

也就是删掉：

```ts
const forced = this.forcedDetailLevel.get(node.id);
if (forced !== undefined && forced > node.detailLevel) node.detailLevel = forced;
```

因为这部分已经前移到 projection 了。

---

## 8. 节点渲染结构改造

### 8.1 修改 `src/renderer/projected-node-renderer.ts` 的 enter 结构

当前 enter 节点有：

```ts
rect.mindmap-node-bg
text.mindmap-node-title
text.mindmap-node-kind-badge
text.mindmap-node-tree-toggle
右键菜单中的 notebook 相关操作
foreignObject.mindmap-node-preview
```

改成：

```ts
rect.mindmap-node-bg
text.mindmap-node-title
text.mindmap-node-kind-badge
g.mindmap-node-open-notebook
text.mindmap-node-tree-toggle
右键菜单中的 notebook 相关操作
g.mindmap-node-resize-handle
foreignObject.mindmap-node-preview
```

### 8.2 “notebook badge” 与 “open md button” 的显示规则

固定规则：

1. notebook level 2-4：继续显示现有 `text.mindmap-node-kind-badge`，文字仍是 `notebook`
2. notebook level 5：隐藏 badge，改显示 `g.mindmap-node-open-notebook`
3. text 节点：两者都不显示

这样就符合“按钮放在 notebook label 原来的位置”的要求。

### 8.3 open button 的精确结构

`g.mindmap-node-open-notebook` 内部结构固定为：

```ts
rect.mindmap-node-open-notebook-bg
text.mindmap-node-open-notebook-text
```

布局：

1. `rect`
   - `x = 12`
   - `y = 34`
   - `width = 78`
   - `height = 20`
   - `rx = 10`
   - `ry = 10`
2. `text`
   - `x = 24`
   - `y = 48`
   - 文本固定：`Open md`

交互：

1. 整个 group 设置 `cursor: pointer`
2. click 时 `event.stopPropagation()`
3. 调 `args.onOpenNotebook(node.id)`

不要让它触发节点 selection / drag。

### 8.4 resize handle 的精确结构

`g.mindmap-node-resize-handle` 内部结构固定为：

```ts
rect.mindmap-node-resize-hitbox
path.mindmap-node-resize-icon
```

用途：

1. `hitbox` 放大命中区域，便于拖拽
2. `icon` 画成右下角三条斜线即可

布局：

1. group transform：

```ts
translate(
  node.displayWidth - NOTEBOOK_RESIZE_HANDLE_SIZE - NOTEBOOK_RESIZE_HANDLE_INSET,
  node.displayHeight - NOTEBOOK_RESIZE_HANDLE_SIZE - NOTEBOOK_RESIZE_HANDLE_INSET,
)
```

2. `hitbox`
   - `x = -4`
   - `y = -4`
   - `width = 20`
   - `height = 20`
   - `fill = transparent`
3. `icon`
   - 画三条从左上到右下的短线，固定 12x12 区域内即可

显示规则：

1. `node.showResizeHandle === true` 时显示
2. 其他情况隐藏

### 8.5 preview 的位置改造

当前 preview：

```ts
x = 8
y = 72
width = node.displayWidth - 16
height = node.displayHeight - 80
```

改成固定规则：

```ts
x = 8
y = 62
width = node.displayWidth - 16
height = node.displayHeight - 82
```

解释：

1. 顶部给标题 + 按钮留空间
2. 底部留空间给 resize handle
3. 最小高度 150 时，preview 仍然有可用区域

这里不要按 detail 分支写多套布局，level 5 notebook 统一用这套值即可。

---

## 9. Resize 交互实现

### 9.1 关键规则

resize 只允许在 `notebook level 5` 上触发。

尺寸变化是 screen-space 的，所以拖拽时直接使用 `event.dx` / `event.dy` 加到 `displayWidth` / `displayHeight`，不要做 zoom 变换。

### 9.2 在 `projected-node-renderer.ts` 内新增 resize drag behavior

不要复用节点整体 drag behavior，单独创建：

```ts
const resizeBehavior = d3
  .drag<SVGGElement, ProjectedNode>()
```

#### start 阶段

1. `event.sourceEvent?.stopPropagation()`
2. 调 `args.onNotebookResizeStart(node.id)`
3. 记录起始尺寸到局部变量：

```ts
let nextWidth = node.displayWidth;
let nextHeight = node.displayHeight;
```

#### drag 阶段

1. `nextWidth = Math.max(200, nextWidth + event.dx)`
2. `nextHeight = Math.max(150, nextHeight + event.dy)`
3. `Math.round` 后传给：

```ts
args.onNotebookResize({
  id: node.id,
  width: Math.round(nextWidth),
  height: Math.round(nextHeight),
});
```

#### end 阶段

用最后一组尺寸调：

```ts
args.onNotebookResizeEnd({
  id: node.id,
  width: Math.round(nextWidth),
  height: Math.round(nextHeight),
});
```

### 9.3 不要让 resize 拖拽触发 node drag

必须确保：

1. resize handle group 自己 `.call(resizeBehavior)`
2. resize handle click / pointerdown 都 stopPropagation
3. 节点根 group 的通用 drag 不应接管这个事件

---

## 10. MindmapView 层实现

### 10.1 新增 view 内部状态

修改 `src/view/mindmap-view.ts`，新增：

```ts
private notebookResizeSession:
  | { id: string }
  | null = null;
```

### 10.2 新增 4 个方法

#### 方法 1：`handleOpenNotebook`

签名：

```ts
private async handleOpenNotebook(id: string): Promise<void>
```

固定逻辑：

1. 找 node
2. 如果不是 notebook 或没有 `node.notebook?.link`，return
3. `const leaf = this.app.workspace.getLeaf("split")`
4. 调 `leaf.openFile(...)` 前，先通过 `notebookService.resolveNotebookFile()` 或直接根据 `node.notebook.path` / `link` 解析目标文件

这里的固定实现建议：

1. 优先用 `this.notebookService.resolveNotebookFile(node.notebook, this.sourceFile?.path ?? "")`
2. 如果拿不到 `TFile`，弹 `showErrorNotice(new Error("找不到 notebook 文件"), "无法打开 notebook")`
3. 如果拿到了文件：

```ts
await leaf.openFile(file, { active: true });
```

不要自己拼 `openLinkText()` 字符串跳转，直接打开解析后的 `TFile`，实现更稳。

#### 方法 2：`handleNotebookResizeStart`

签名：

```ts
private handleNotebookResizeStart(id: string): void
```

逻辑：

1. 如果当前 session 已经是这个 id，直接 return
2. `this.commitHistory()`
3. `this.notebookResizeSession = { id }`

只在 resize 开始时提交一次历史快照，不要每帧提交。

#### 方法 3：`handleNotebookResize`

签名：

```ts
private handleNotebookResize(args: { id: string; width: number; height: number }): void
```

固定逻辑：

1. `this.store.patchNode(args.id, { customWidth: args.width, customHeight: args.height })`
2. `this.renderer?.render()`
3. `this.markDirty()`

这里不要：

1. 不要调用 `applyDocumentChange()`
2. 不要 relayout 文档
3. 不要 schedule autosave

原因：resize drag 过程中会高频触发。

#### 方法 4：`handleNotebookResizeEnd`

签名：

```ts
private handleNotebookResizeEnd(args: { id: string; width: number; height: number }): void
```

固定逻辑：

1. 再 patch 一次最终值，保证最后一帧落盘
2. `this.renderer?.render()`
3. `this.markDirty()`
4. `this.autosave.schedule()`
5. `this.notebookResizeSession = null`

### 10.3 不要触发 tree relayout

resize 只是 notebook preview 的显示尺寸变化，不是树布局结构变化。

因此：

1. 不能走 `applyDocumentChange()` 的默认 `relayoutDocument()` 路径
2. 否则 tree layout 会在拖动过程中重复回流，体验差且没意义

---

## 11. Renderer 与 View 的连接

### 11.1 修改 `MindmapView` 创建 renderer 的地方

不管是 SVG 还是 Hybrid renderer，传入：

```ts
onOpenNotebook: (id) => void
onNotebookResizeStart: (id) => void
onNotebookResize: (args) => void
onNotebookResizeEnd: (args) => void
```

绑定到：

```ts
this.handleOpenNotebook
this.handleNotebookResizeStart
this.handleNotebookResize
this.handleNotebookResizeEnd
```

如果当前文件里是用匿名函数包裹的风格，保持同样风格。

### 11.2 保持 notebook expand 逻辑不变

`handleNotebookExpand()` 仍然负责：

1. text -> notebook 转换
2. notebook 强制 detail 5

本次不要把“打开 md”与“展开 notebook”合并成同一个按钮。

两个动作分离：

1. 底部双 V：展开/转 notebook
2. 顶部按钮：打开 md

---

## 12. Notebook preview 滚动条实现

### 12.1 修改 `src/renderer/notebook-preview-renderer.ts`

在创建 wrapper 时保留现有类名：

```ts
wrapper.className = "mindmap-preview-wrapper";
```

不需要新增 DOM 结构。

### 12.2 修改 `styles.css`

把 `.mindmap-preview-wrapper` 从：

```css
overflow: hidden;
```

改成：

```css
overflow-y: auto;
overflow-x: hidden;
```

然后新增：

```css
.mindmap-preview-wrapper {
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb-bg) transparent;
}

.mindmap-preview-wrapper::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.mindmap-preview-wrapper::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-bg);
  border-radius: 999px;
}

.mindmap-preview-wrapper::-webkit-scrollbar-track {
  background: transparent;
}
```

不要做 hover 才显示，不要做自定义 JS 滚动条。

### 12.3 交互注意点

wheel 事件应该优先作用在 preview 内部滚动。

这里先不要写额外 JS 拦截。先依赖 `foreignObject + overflow-y: auto` 的原生行为。

如果实现后发现滚轮仍被外层 zoom 抢走，再补一层最小改动：

1. 给 wrapper 绑定 `wheel`
2. 当内容可滚动时 `event.stopPropagation()`

但这一步是 fallback，不是第一实现路径。

---

## 13. 样式实现

### 13.1 `styles.css` 新增类

新增：

```css
.mindmap-node-open-notebook {
  cursor: pointer;
}

.mindmap-node-open-notebook-bg {
  fill: var(--background-secondary);
  stroke: var(--background-modifier-border);
  stroke-width: 1px;
}

.mindmap-node-open-notebook-text {
  fill: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  pointer-events: none;
}

.mindmap-node-open-notebook:hover .mindmap-node-open-notebook-bg {
  stroke: var(--interactive-accent);
}

.mindmap-node-open-notebook:hover .mindmap-node-open-notebook-text {
  fill: var(--interactive-accent);
}

.mindmap-node-resize-handle {
  cursor: nwse-resize;
  color: var(--text-muted);
}

.mindmap-node-resize-handle:hover {
  color: var(--interactive-accent);
}

.mindmap-node-resize-icon {
  stroke: currentColor;
  stroke-width: 1.5px;
  fill: none;
  stroke-linecap: round;
}
```

不要把 handle 做成太抢眼的实体块，保持轻量。

### 13.2 保留现有选中态样式

不要改 `.mindmap-node-bg`、`.mindmap-node.is-selected`、`.mindmap-node.is-focus` 的主样式逻辑。

---

## 14. DocumentStore 改造

### 14.1 修改 `src/core/document-store.ts`

新增方法：

```ts
updateNodeSize(id: string, customWidth: number, customHeight: number): void {
  this.patchNode(id, { customWidth, customHeight });
}
```

虽然直接 `patchNode()` 也能用，但这里建议加这个方法，原因：

1. 语义清晰
2. 测试更容易写
3. 后续如果要加尺寸清理逻辑，只改这里

`save()` 不需要特殊处理，因为整个 doc 是整体 JSON 序列化。

---

## 15. 测试改造

### 15.1 修改受影响测试数据

因为 `ProjectedNode` 新增了 3 个字段：

```ts
showOpenNotebookButton
showResizeHandle
usesCustomSize
```

以下测试文件里的手写 `ProjectedNode` mock 都要补字段：

- `src/test/viewport-culling.test.ts`
- `src/test/projected-edge-renderer.test.ts`

如果有其他编译报错的 mock，也统一补齐。

默认填：

```ts
showOpenNotebookButton: false,
showResizeHandle: false,
usesCustomSize: false,
```

### 15.2 `src/test/semantic-projection.test.ts` 新增测试

至少新增以下 4 个测试：

#### 测试 1：forced detail 在 projection 阶段生效

构造 notebook 节点，传 `forcedDetailLevels: new Map([["nodeId", 5]])`，断言：

1. `detailLevel === 5`
2. `displayWidth === 360`
3. `displayHeight === 300`

#### 测试 2：level 5 notebook 使用 custom size

文档节点：

```ts
customWidth: 520,
customHeight: 260,
```

断言：

1. `displayWidth === 520`
2. `displayHeight === 260`
3. `usesCustomSize === true`

#### 测试 3：custom size 有最小值钳制

文档节点：

```ts
customWidth: 120,
customHeight: 90,
```

断言：

1. `displayWidth === 200`
2. `displayHeight === 150`

#### 测试 4：expanded notebook overlap 最终被消除

构造两个非常接近的节点：

1. root 或普通节点
2. notebook 强制 detail 5

跑 `createSemanticProjection()` 后，把两个节点转成 screen rect，断言两者不 overlap。

### 15.3 `src/test/document-store.test.ts` 新增测试

新增一个测试：

1. 初始 doc 有一个 node
2. 调 `updateNodeSize("id", 480, 260)`
3. 断言 node 上出现：

```ts
customWidth: 480
customHeight: 260
```

### 15.4 `src/test/projected-node-renderer.test.ts` 新增纯函数测试

当前这个文件只有 `screenDragDeltaToWorldDelta()`。

为了不引入复杂 DOM 测试，新增一个小纯函数并测试它，例如放在 `projected-node-renderer.ts`：

```ts
export function clampNotebookResizeSize(width: number, height: number): { width: number; height: number }
```

测试：

1. `clampNotebookResizeSize(120, 90)` -> `200, 150`
2. `clampNotebookResizeSize(420.7, 260.2)` -> `421, 260`

这是为了给 resize 核心规则一个稳定单测。

不要为了这个功能强行上大段 DOM 事件测试。

---

## 16. 手工验证清单

实现完成后，必须手工验证下面所有项。

### 16.1 expand + anti-overlap

1. 打开一张有多个相邻节点的图
2. 把一个 text 节点转为 notebook
3. 点击底部展开按钮进入 level 5
4. 确认相邻节点被推开
5. 确认展开后的 notebook 与任何其他节点没有视觉重叠

### 16.2 open md

1. notebook level 5 顶部出现 `Open md` 按钮
2. 点击后在 split pane 打开对应 markdown 文件
3. 原脑图 pane 不被替换

### 16.3 scroll preview

1. notebook 预览内容超过可视高度
2. 鼠标滚轮在 preview 区域滚动
3. preview 能滚动
4. 滚动条是 thin/native 风格

### 16.4 resize

1. 右下角出现 resize handle
2. 拖动时宽高实时变化
3. 宽高可以独立变化
4. 最小不会小于 `200 x 150`
5. resize 后周围节点会重新避让，不与其重叠

### 16.5 persistence

1. resize 一个 notebook 节点
2. 保存 / 等 autosave
3. 关闭再重新打开 mindmap
4. 自定义宽高仍在

### 16.6 regression

1. 节点选择仍正常
2. 节点整体拖拽仍正常
3. context menu 仍正常
4. tree toggle 仍正常
5. expand 按钮仍正常
6. inline rename 仍正常

---

## 17. 推荐实施顺序

严格按这个顺序做，避免返工：

1. 改 `types/mindmap.ts`
2. 改 `semantic-projection.ts`，把 forced detail 前移，并接入 custom size
3. 改 `layout-relaxation.ts`，完成 anti-overlap settle pass
4. 改 `svg-mindmap-renderer.ts` 和 `hybrid-mindmap-renderer.ts`，删除 post-projection forced detail 写回
5. 改 `projected-node-renderer.ts`，加入 open button / resize handle / resize drag
6. 改 `mindmap-view.ts`，接 open notebook 与 resize 回调
7. 改 `document-store.ts`
8. 改 `notebook-preview-renderer.ts` 和 `styles.css`
9. 补测试
10. 跑 `npm test`
11. 跑 `npm run build`
12. 做手工验证

---

## 18. 明确不做的事

本次实现中，以下都不要顺手加：

1. 不加 resize 双击恢复默认
2. 不加 hover tooltip
3. 不加 open button 图标系统
4. 不加 preview 区顶部工具栏
5. 不加拖动动画
6. 不加 resize 记忆到 settings
7. 不加 notebook level 5 以下的按钮重排

---

## 19. 完成标准

只有同时满足下面条件，才算完成：

1. `npm test` 通过
2. `npm run build` 通过
3. 需求文档中的 6 条 success criteria 全部满足
4. 手工验证清单全部通过
5. 没有破坏 SVG renderer 和 Hybrid renderer 的行为一致性
