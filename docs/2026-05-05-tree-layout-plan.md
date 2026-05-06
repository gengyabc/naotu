# Tree Layout 实施方案

基于 `docs/requirements/2026-05-05-tree-layout.md`，并结合当前代码现状整理。目标不是讨论方向，而是给后续编码模型一份可直接执行、不会卡在关键设计缺口上的实施计划。

## 1. 当前代码现状与必须处理的约束

### 1.1 布局现状

- 当前只有 `src/core/radial-layout.ts`，入口在：
  - `src/view/mindmap-view.ts:16, 163-166, 609-619`
  - `src/core/sample-data.ts:4, 63`
  - `src/core/mindmap-from-markdown.ts:5, 88`
  - `src/core/local-knowledge-map.ts:5, 81-91`
- `LayoutMode` 仍是 `"radial" | "free"`，默认文档、创建文件、迁移、测试夹具全部写死了 `"radial"`。

### 1.2 拖拽现状

- `src/renderer/projected-node-renderer.ts:42-74` 的拖拽行为只支持“按像素移动节点坐标”。
- `src/view/mindmap-view.ts:269-281` 中，拖拽期间直接调用 `store.updateNodePositions()`，没有重排、没有换父、没有 drop 命中判定。
- 当前多选拖拽是自由移动语义，不适合树模式下的重排/换父。

### 1.3 树顺序的真实存储方式

- 当前没有单独的 `childOrder` 字段。
- `buildHierarchy()` 会按 `doc.edges` 中 `mindmap` 边的遍历顺序建立 `childrenById`。
- 这意味着“同级顺序”的持久化方案应当直接复用 `doc.edges` 顺序，不要新增新的顺序模型。

### 1.4 收起/展开对布局的影响

- `semantic-projection.ts` 里可见性受 `treeControl` 和 `zoom` 共同影响。
- 但布局不应随着缩放实时跳动，否则会造成视图抖动和额外重排成本。
- 因此树布局阶段只把 `treeControl === "manual-collapsed"` 视为“该子树不参与占位”；`"auto"` 和 `"manual-expanded"` 都按展开处理。

### 1.5 设置即时生效的现状问题

- 设置页只会 `saveSettings()`，不会通知已打开的 `MindmapView` 重新布局。
- 如果新增横/纵间距设置，必须补一条“设置变更 -> 所有打开视图重布局”的链路，否则无法满足“immediate effect”。

## 2. 已决策实现口径

以下口径在实施时不要再重新发明一套。

### 2.1 新布局模式定义

- `LayoutMode` 改为 `"tree-mirror" | "tree-right" | "free"`。
- 不保留 `"radial"` 在运行态类型中；老文档里的 `"radial"` 在迁移时直接映射成 `"tree-mirror"`。
- 新建文档、示例文档、Markdown 导图、本地知识地图，默认都写入 `"tree-mirror"`。

### 2.2 tree-right 的定位语义

- 根节点仍放在世界坐标 `(0, 0)`。
- “root left” 的含义定义为：所有后代都位于根节点右侧，即深度越深 `x` 越大。
- 不额外修改 viewport 语义，不做“自动把根贴到屏幕左边”的视口逻辑。

### 2.3 tree-mirror 的分支分配规则

- 仅根节点的直属子节点需要做左右分流。
- 根的子节点保持当前顺序不变，按该顺序做“前缀叶子权重最接近平衡点”的切分：
  - 从左到右累计子树叶子权重。
  - 选择一个切分点，使左侧总权重与右侧总权重差值最小。
  - 切分点左侧全部放左边，右侧全部放右边。
- 非根节点以下的子树不再左右扩散：
  - 位于左半边的整棵子树继续向左生长。
  - 位于右半边的整棵子树继续向右生长。

这样可以满足“first half of children left, second half right, visually balanced”的要求，同时保留用户 sibling 顺序。

### 2.4 垂直占位规则

- 子树权重使用“可参与布局的叶子数”。
- 计算时：
  - `manual-collapsed` 节点视作叶子，权重为 `1`，不继续向下展开。
  - 其他节点递归累加子树。
- 每个叶子槽位高度为 `verticalSpacing`。
- 某节点子树总高度定义为 `subtreeWeight * verticalSpacing`。
- 子节点在父节点中心线附近按各自子树高度连续排布，保证兄弟之间天然留出纵向空间。

### 2.5 坐标锚点规则

- 所有节点坐标继续使用节点中心点作为布局锚点，保持与现有渲染/边线逻辑兼容。
- `x` 按层级递增/递减：`parent.x + direction * horizontalSpacing`。
- `y` 由子树带宽中心决定。
- 不在布局阶段考虑节点宽高差异；碰撞微调仍交给现有 `relaxProjectedNodes()`。

### 2.6 树模式拖拽语义

- `free` 模式：保留现有多选自由拖拽。
- `tree-mirror` / `tree-right`：拖拽只支持单节点树编辑，统一为：
  - drag start 时如果当前选区不是单个拖拽节点，直接把选区切到该节点；
  - drag 中允许节点临时跟手移动，作为 drop 命中预览；
  - drop 时只做两类结果：
    - reorder among siblings
    - reparent onto another node
  - drop 完成立即重新树布局，拖拽预览坐标不持久化。

### 2.7 drop 判定优先级

- 优先判定“reparent onto node”，次级判定“reorder among siblings”。
- 具体规则：
  - 若松手时命中某个非自身、非自身后代的节点矩形内部，则执行 reparent，该命中节点成为新父节点，插入为其最后一个子节点。
  - 否则，若拖拽节点有父节点，且释放点落在任一同级节点的“排序带”内，则在该同级前/后插入。
- “排序带”定义：
  - 仍以同级节点矩形中心 `y` 为基准。
  - 节点中心线上方半带表示插到该节点前，下方半带表示插到该节点后。
  - tree-right 与 tree-mirror 都用同一套纵向判定；不使用横向位置决定顺序。

### 2.8 非法 drop 的处理

- 以下情况直接回退到原树结构并重布局，不做任何结构修改：
  - 拖到自己身上。
  - 拖到自己的后代身上。
  - 根节点试图被 reparent。
  - 没有命中合法父节点，也没有命中合法同级排序带。

### 2.9 自动布局触发边界

- 树模式下，以下变更后必须重布局：
  - 打开文档 / 外部文件重新加载
  - undo / redo
  - add node / delete node
  - add or remove `mindmap` edge
  - reparent / reorder
  - toggle tree control / subtree expand collapse
  - 文本节点标题修改后如果没有结构变化，可不强制布局；但为简化实现，允许统一走重布局。
  - 布局模式切换
  - 横向/纵向 spacing 设置变更
- 以下变更不触发布局：
  - viewport 平移缩放
  - `free` 模式下的节点拖拽
  - 树模式拖拽进行中的预览位移

## 3. 推荐实施架构

不要把布局逻辑硬塞进 `MindmapDocumentStore` 的每个方法里。当前 store 不持有 plugin settings，也不应该知道视图层拖拽是否处于预览阶段。

推荐做法：在 `MindmapView` 增加统一事务入口，把“文档变更 + 条件性重布局 + render/save”收口。

### 3.1 在 `MindmapView` 增加统一辅助方法

增加以下私有方法：

```ts
private relayoutDocument(doc: MindmapDocument): MindmapDocument
private applyDocumentChange(mutator: () => void, options?: { commitHistory?: boolean; relayout?: boolean; render?: boolean; autosave?: boolean }): void
private applyReplacedDocument(doc: MindmapDocument, options?: { commitHistory?: boolean; render?: boolean; autosave?: boolean }): void
private isTreeLayoutMode(mode = this.store.getDocument().layoutMode): boolean
private handleLayoutSettingsChanged(): void
```

规则：

- `relayoutDocument()`
  - 当 `layoutMode` 为 `tree-mirror` 或 `tree-right` 时，调用 `TreeLayoutEngine`。
  - 当 `layoutMode` 为 `free` 时，原样返回。
- `applyDocumentChange()`
  - 先按需 `commitHistory()`。
  - 执行 mutator，对 store 做原地改动。
  - 如果 `relayout !== false`，则对当前文档取快照并走 `applyReplacedDocument(relayoutDocument(doc))`。
  - 最后统一 `render + markDirty + autosave.schedule()`。
- 树模式拖拽预览时调用 `applyDocumentChange(..., { relayout: false })`。

这样可以在不重写 store 的前提下，把自动布局收口到一个位置，避免遗漏。

## 4. 文件级改动计划

## 4.1 `src/types/mindmap.ts`

- 修改 `LayoutMode`：

```ts
export type LayoutMode = "tree-mirror" | "tree-right" | "free";
```

无需新增其它文档字段。

## 4.2 `src/types/settings.ts`

- 为 `SemanticMindmapSettings` 新增：

```ts
layoutHorizontalSpacing: number;
layoutVerticalSpacing: number;
```

- `DEFAULT_SETTINGS` 增加默认值：
  - `layoutHorizontalSpacing: 220`
  - `layoutVerticalSpacing: 80`

## 4.3 新建 `src/core/tree-layout.ts`

替代 `radial-layout.ts`，导出：

```ts
export interface TreeLayoutOptions {
  mode: "tree-mirror" | "tree-right";
  horizontalSpacing: number;
  verticalSpacing: number;
}

export class TreeLayoutEngine {
  layout(doc: MindmapDocument, options: TreeLayoutOptions, rootNodeId?: string): MindmapDocument
}
```

内部拆成纯函数即可，不要引入额外状态类层级。

建议内部函数：

```ts
function computeVisibleSubtreeWeights(...): Map<string, number>
function splitRootChildrenForMirror(...): { left: string[]; right: string[] }
function layoutDirectedSubtree(...): void
function isCollapsedForLayout(node: MindmapNode): boolean
```

### 4.3.1 具体算法

1. `structuredClone(doc)` 得到 `next`。
2. `buildHierarchy(next)` 获取 `childrenById` 与 `rootId`。
3. 根节点坐标设为 `(0, 0)`。
4. 基于“manual-collapsed 视作叶子”的规则计算所有节点 `subtreeWeight`。
5. 若模式是 `tree-right`：
   - 根的全部 children 作为一个向右子树布局。
6. 若模式是 `tree-mirror`：
   - 仅对根的直属 children 做平衡切分。
   - 左组 `direction = -1`，右组 `direction = 1`。
7. `layoutDirectedSubtree()` 的布局规则：
   - 输入父节点 id、children 列表、方向、下一层 depth。
   - 当前 children 总高度 `totalHeight = sum(weight(child)) * verticalSpacing`。
   - `cursorTop = parent.y - totalHeight / 2`。
   - 对每个 child：
     - `childHeight = weight(child) * verticalSpacing`
     - `childCenterY = cursorTop + childHeight / 2`
     - `child.x = parent.x + direction * horizontalSpacing`
     - `child.y = childCenterY`
     - 若 child 非 collapsed，则递归布局其子节点，方向沿用当前方向。
     - `cursorTop += childHeight`
8. `next.layoutMode = options.mode`。

### 4.3.2 性能约束

- 所有计算必须是 O(n) 或 O(n log n) 内的顺序遍历。
- 不要在递归里频繁 `find()` 节点；入口先建 `nodeMap`。
- 不做几何碰撞求解，不做动画，不做多轮迭代。

## 4.4 删除 `src/core/radial-layout.ts`

- 完成所有引用替换后删除文件。
- 同时删除 `src/test/radial-layout.test.ts`，改为新的 `tree-layout.test.ts`。

## 4.5 `src/core/document-migration.ts`

- `layoutMode` 迁移规则改成：

```ts
layoutMode:
  doc.layoutMode === "radial" || doc.layoutMode == null
    ? "tree-mirror"
    : doc.layoutMode,
```

- 这里需要接受旧 JSON 中的 `radial`，但返回值必须满足新类型。
- 可在函数内部通过局部联合类型或窄化处理，不要把 `LayoutMode` 又扩回包含 `radial`。

## 4.6 `src/constants.ts` / `src/main.ts` / 文档生成入口

统一把默认 `layoutMode` 从 `radial` 改为 `tree-mirror`，涉及：

- `src/constants.ts`
- `src/main.ts#createMindmapFile`
- `src/core/sample-data.ts`
- `src/core/mindmap-from-markdown.ts`
- `src/core/local-knowledge-map.ts`
- 所有测试夹具

并把 `sample-data.ts`、`mindmap-from-markdown.ts`、`local-knowledge-map.ts` 的布局调用全部切到 `TreeLayoutEngine`。

## 4.7 `src/core/tree-editing.ts`

在现有文件上继续扩展，不新建第二个树编辑模块。

新增纯函数：

```ts
export function moveMindmapNode(
  doc: MindmapDocument,
  args: { nodeId: string; newParentId: string; targetIndex: number }
): MindmapDocument

export function isDescendantNode(doc: MindmapDocument, ancestorId: string, nodeId: string): boolean

export function getMindmapChildIds(doc: MindmapDocument, parentId: string): string[]
```

### 4.7.1 `moveMindmapNode()` 的精确定义

- 返回 `structuredClone(doc)` 后的新文档。
- 只操作 `relation === "mindmap"` 的那一条父子边。
- 实现步骤：
  1. 找到拖拽节点当前入边（若无则说明它是根，直接返回原文档）。
  2. 从 `edges` 中移除该入边。
  3. 收集 `newParentId` 当前所有 `mindmap` 子边，保留它们在 `edges` 中的原相对顺序。
  4. 生成一条新的 parent->child `mindmap` 边：
     - 若换父，沿用原边 `id` 也可以；
     - 更简单稳定的做法是保留原边对象，修改 `source` 和插入位置。
  5. 按 `targetIndex` 把这条边插入 `newParentId` 的子边序列中。
  6. 其它非 mindmap 边、reference 边顺序保持不变。

关键点：通过重排 `doc.edges` 中 mindmap 边顺序来持久化 sibling order。

## 4.8 `src/renderer/projected-node-renderer.ts`

拖拽接口需要扩充，最小改动方案如下：

```ts
onBeforeNodeDragStart: (node: ProjectedNode) => void;
onNodesMove: (args: { node: ProjectedNode; moves: Array<{ id: string; x: number; y: number }> }) => void;
onNodeDragEnd: (args: { node: ProjectedNode }) => void;
```

原因：tree 模式 drop 判定需要知道“当前被拖的是谁”。只传 moves 不够。

拖拽行为保持一套 d3 代码，不分两套 renderer。

## 4.9 `src/renderer/svg-mindmap-renderer.ts` 与 `src/renderer/hybrid-mindmap-renderer.ts`

- 仅透传新的 drag callback 签名。
- 不要把树编辑逻辑写进 renderer，renderer 只负责交互事件转发。

## 4.10 `src/view/mindmap-view.ts`

这是本次改动最多的文件。

### 4.10.1 工具栏改造

- 删除“中心布局”按钮与 `applyRadialLayout()`。
- 新增布局方向切换控件，建议用两个按钮即可：
  - `镜像树`
  - `右向树`
- 交互规则：
  - 点击后把 `doc.layoutMode` 设为对应值。
  - 立即调用 `applyReplacedDocument(relayoutDocument(nextDoc))`。
  - 若当前是 `free`，点击后即从 `free` 切回树模式。
- `free` 不提供按钮入口。

### 4.10.2 所有文档修改入口统一收口

下列方法全部改成走 `applyDocumentChange()` 或 `applyReplacedDocument()`：

- `setFile()` 载入后先 `relayoutDocument()` 再 render。
- `handleVaultModify()` 重新加载后先 `relayoutDocument()` 再 render。
- `undo()` / `redo()`
- `addTextNode()`
- `addChildNode()`
- `addSiblingNode()`
- `toggleSelectedTree()`
- `onToggleTree`
- `deleteSelectedNodes()`
- context menu 里的：展开/收起、删除、转换 notebook、绑定 notebook 等

说明：标题修改、notebook path 同步这类非结构变更，统一重布局不会出错，先优先保证逻辑闭合。

### 4.10.3 树模式下新增节点的初始坐标策略

- `addTextNode()` 新建孤立节点时仍可先给一个占位坐标，例如 `(120, 120)`。
- 但如果文档处于树模式，新增后会立刻整体重布局，所以初值无所谓。
- `createTextNodeNearParent()` 保留，但改为读取 settings 默认间距作为初始偏移更一致；若嫌耦合太高，也可以先保持常量 `220/80`，因为树模式下会立即被布局覆盖。

### 4.10.4 树模式拖拽落地

新增视图层私有状态：

```ts
private draggingTreeNodeId: string | null = null;
```

实现流程：

1. `onBeforeNodeDragStart(node)`
   - `commitHistory()`
   - 如果当前是树模式：
     - `draggingTreeNodeId = node.id`
     - `selection.setOnly(node.id)`

2. `onNodesMove({ node, moves })`
   - `free` 模式：保持当前逻辑，直接 `updateNodePositions + render + autosave.schedule()`。
   - tree 模式：
     - 只更新拖拽节点预览坐标：`store.updateNodePositions(moves)`。
     - 明确传 `relayout: false`，不要在 drag 中触发布局。
     - render 以便用户看到当前位置。

3. `onNodeDragEnd({ node })`
   - 若不是树模式：保持现有逻辑。
   - 若是树模式：
     - 读取拖拽节点最终预览位置。
     - 基于当前文档和 hierarchy 进行 drop 判定。
     - 如果命中 reparent：调用 `moveMindmapNode(..., { newParentId, targetIndex: childCount })`
     - 否则如果命中 reorder：调用 `moveMindmapNode(..., { newParentId: parentId, targetIndex })`
     - 否则不改结构。
     - 无论是否改结构，都调用 `applyReplacedDocument(relayoutDocument(baseDoc))` 回到规范树布局。
     - 清空 `draggingTreeNodeId`。

### 4.10.5 drop 命中算法

在 `MindmapView` 内新增私有辅助函数：

```ts
private resolveTreeDrop(nodeId: string):
  | { type: "reparent"; newParentId: string; targetIndex: number }
  | { type: "reorder"; newParentId: string; targetIndex: number }
  | null
```

判定细节：

1. 取拖拽节点当前坐标 `(x, y)` 作为释放点。
2. 建立 `nodeMap` 与 `hierarchy`。
3. 遍历所有其他节点，找第一个包含释放点的节点矩形：
   - 矩形按节点当前 `x/y/width/height` 计算，使用现有 `nodeWorldRect()`。
   - 排除自身与自身后代。
   - 若命中则返回 `reparent`，`targetIndex = getMindmapChildIds(doc, target.id).length`。
4. 若未命中父节点：
   - 找当前父节点；若无父节点则返回 `null`。
   - 取该父节点的 children，排除自己。
   - 按 `y` 排序后，逐个用“节点中心 y 的上下半区”计算插入位：
     - `y < siblingCenterY` -> 插到该 sibling 前
     - 否则继续
   - 若所有 sibling 都未命中前插，则插到最后。
5. 为避免“在远处随便松手也触发 reorder”，增加一个纵向吸附阈值：
   - 仅当释放点 `x` 与同级层级列的标准 `x` 差值不超过 `horizontalSpacing * 0.75` 时，reorder 才成立。
   - 否则返回 `null`。

这条阈值是必须的，否则树模式下任何非命中父节点的松手都会变成 reorder，用户体验会很差。

## 4.11 `src/ui/settings-tab.ts`

在 Rendering 或 Advanced 区新增两个数字输入：

- `树布局水平间距(px)`
- `树布局垂直间距(px)`

规则：

- 输入解析失败时回退默认值 `220` / `80`。
- 最小值建议限制为：
  - horizontal `>= 120`
  - vertical `>= 32`
- 保存后，调用插件新增的方法通知所有打开的脑图视图立即重布局。

## 4.12 `src/main.ts`

新增方法：

```ts
async notifyLayoutSettingsChanged(): Promise<void>
```

实现：

- 遍历 `this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)`。
- 对每个 `MindmapView` 调用 `handleLayoutSettingsChanged()`。

设置页里修改 spacing 后：

```ts
await this.plugin.saveSettings();
await this.plugin.notifyLayoutSettingsChanged();
```

避免只保存配置却不刷新视图。

## 5. 测试计划

## 5.1 新增 `src/test/tree-layout.test.ts`

至少覆盖：

1. `tree-right` 根节点位于 `(0, 0)`，子节点都在右侧。
2. `tree-mirror` 根节点子树被分到左右两侧。
3. `tree-mirror` 保持根 children 原顺序，不因为平衡而排序。
4. `verticalSpacing` 变大后，兄弟节点纵向间距随之增大。
5. `horizontalSpacing` 变大后，层间 `x` 距离随之增大。
6. 单节点文档不抛错。
7. 深链文档按层级单向展开。
8. 宽树文档不会递归爆栈，且所有节点都有有限坐标。
9. `manual-collapsed` 节点按叶子处理，不继续给后代分配空间。
10. 循环 mindmap edge 存在时不抛错。

## 5.2 新增 `src/test/tree-editing.test.ts`

至少覆盖：

1. `moveMindmapNode()` 可同父重排，并通过 `buildHierarchy()` 读出新顺序。
2. `moveMindmapNode()` 可换父。
3. `reference` 边不受影响。
4. 根节点不能被移动。
5. 移动到后代下方会被调用方拒绝；若 helper 层也做保护更好。

## 5.3 修改现有测试

- 把所有夹具和文档默认值中的 `layoutMode: "radial"` 改成 `"tree-mirror"`。
- 若需要，新增 `document-migration` 测试，验证旧 `radial` 能迁移到 `tree-mirror`。

## 5.4 验证命令

编码完成后必须执行：

```bash
npm test
npm run build
```

## 6. 建议编码顺序

按这个顺序做，返工最少：

1. 改类型与默认值：`LayoutMode`、settings、migration、fixtures。
2. 实现 `TreeLayoutEngine` 及其单元测试。
3. 替换所有 `RadialLayoutEngine` 引用，删除 radial 代码与测试。
4. 在 `tree-editing.ts` 加 `moveMindmapNode()` 等纯函数并补测试。
5. 改 renderer drag 回调签名。
6. 在 `MindmapView` 引入统一 `applyDocumentChange()` / `relayoutDocument()` 流程。
7. 接入树模式拖拽 drop 判定。
8. 修改工具栏，移除“中心布局”，加入 mirror/right 切换。
9. 修改设置页与 `main.ts` 的即时重布局通知。
10. 跑测试和 build，修正类型与行为问题。

## 7. 后续编码时不要踩的坑

### 7.1 不要在 drag 中自动布局

否则节点会在鼠标移动过程中不断被布局引擎拉回去，根本无法完成 drop。

### 7.2 不要新建 childOrder 字段

当前 `doc.edges` 顺序已经是现成的持久化载体，新增第二套顺序源只会制造同步问题。

### 7.3 不要让布局依赖 zoom

projection 的可见性可以依赖 zoom，但树布局不能随缩放重排，否则会出现“缩放即抖动”的问题。

### 7.4 不要把 reference edge 当树边处理

布局、重排、换父、顺序计算都只看 `relation === "mindmap"`。

### 7.5 不要把树编辑逻辑塞进 renderer

renderer 只做交互事件分发，树结构修改必须留在 core/view。

## 8. 完成定义

满足以下条件才算完成：

1. 代码库中不再存在 `RadialLayoutEngine` 与 `"radial"` 运行态布局分支。
2. 新建/导入/示例/本地知识地图默认生成树布局文档。
3. 工具栏没有“中心布局”，有 mirror/right 切换。
4. 树模式下新增、删除、展开/收起、undo/redo、reparent、reorder 都会自动重布局。
5. `free` 模式仍可保留自由拖拽，但没有 UI 入口。
6. 修改横/纵间距设置后，已打开脑图立即生效。
7. `npm test` 和 `npm run build` 全通过。
