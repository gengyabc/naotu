# Semantic Zoom Mindmap

[中文](#中文文档) | [English](#english-documentation)

---

## 中文文档

一个为 Obsidian 打造的语义缩放脑图插件，支持文本节点、笔记本节点、聚焦保持的层级缩放。

### 功能特性

#### 核心功能

- **文本节点** - 简单的一句话节点，用于表达脑图结构
- **笔记本节点** - 绑定 Obsidian 笔记，放大时可预览笔记内容
- **语义缩放** - 缩放改变信息粒度而非简单放大文字，缩小看结构，放大看内容
- **多种布局模式** - 镜像树、右向树、自由布局
- **Markdown 标题导入** - 从 Markdown 文件的标题结构生成脑图
- **局部知识地图** - 基于当前文件的双向链接生成知识图谱
- **SVG/PNG 导出** - 导出高清矢量图或位图
- **小地图** - 右上角显示缩略图便于导航
- **键盘导航** - 方向键在节点间移动
- **撤销/重做** - 完整的操作历史支持
- **搜索** - 快速搜索节点内容
- **自动保存** - 编辑后自动保存

#### 性能优化

- **混合渲染器** - 大图自动切换 Canvas 背景层 + SVG 交互层
- **视口剔除** - 仅渲染视口附近的节点
- **预览缓存** - 笔记本内容预览智能缓存

### 安装

将插件文件放入 Obsidian vault 的 `.obsidian/plugins/naotu/` 目录下。

### 使用方法

#### 创建脑图

1. 点击左侧功能区脑图图标创建新脑图
2. 或使用命令面板：`Create semantic zoom mindmap`
3. 打开已有脑图文件：命令面板 `Open mindmap file`，或在文件中打开 `.naotu` 后执行 `Open current .naotu`
4. 从 Markdown 文件创建：打开 .md 文件后执行 `Create mindmap from current markdown headings`
5. 创建局部知识地图：打开 .md 文件后执行 `Create local knowledge map from current file`
6. 创建示例脑图：命令面板选择 100 / 1000 / 3000 节点示例（用于性能测试）

#### 节点类型

##### 文本节点

简单的单句脑图节点，用于构建思维结构。

##### 笔记本节点

绑定到 Obsidian 笔记的节点，放大时可预览笔记内容。

#### 操作快捷键

| 操作 | 快捷键 |
|------|--------|
| 编辑节点标题 | 双击标题 |
| 新增子节点 | Tab |
| 新增兄弟节点 | Enter |
| 展开/收起节点 | Space |
| 编辑当前节点 | F2 |
| 节点间移动 | 方向键 |
| 回到根节点 | Home |
| 删除节点 | Delete / Backspace |
| 撤销 | Cmd/Ctrl + Z |
| 重做 | Cmd/Ctrl + Shift + Z |
| 搜索 | Cmd/Ctrl + F |
| 回到根节点并适配视口 | Cmd/Ctrl + 0 |
| 放大 | Cmd/Ctrl + + |
| 缩小 | Cmd/Ctrl + - |
| 清除选择 | Escape |

#### 鼠标操作

- **双击节点标题** - 编辑标题
- **点击双下箭头** - 文本节点转笔记本节点，笔记本节点展开预览
- **点击右侧 +/-** - 展开/收起子树
- **右键点击文本节点** - 创建或绑定笔记本
- **滚轮** - 缩放
- **拖拽** - 平移画布

### 设置选项

#### Notebook 设置

- **Notebook 文件夹** - 文本节点转笔记本节点时自动创建笔记的文件夹
- **Notebook 模板** - 自动创建笔记本时使用的模板，支持 `{{title}}` 变量

#### Import 设置

- **导入 headings 为笔记本节点** - 从 Markdown 标题生成脑图时，是否让每个标题节点绑定对应标题
- **Backlinks map 最大节点数** - 防止生成过大的局部知识地图

#### Rendering 设置

- **显示小地图** - 在右上角显示缩略导航图
- **默认渲染模式** - auto/SVG/Hybrid，auto 根据节点数量自动选择
- **缩放速度** - 鼠标滚轮缩放速度
- **树布局水平间距** - 树布局每层的水平距离
- **树布局垂直间距** - 树布局相邻叶子槽位的垂直距离

#### Performance 设置

- **启用 Hybrid Renderer** - 大图时使用 Canvas 背景 + SVG 交互层
- **Hybrid 节点阈值** - 节点数超过此值时使用 Hybrid 模式
- **启用视口剔除** - 大图时仅渲染视口附近节点
- **Culling 节点阈值** - 节点数超过此值时启用剔除

#### Export 设置

- **默认导出格式** - SVG 或 PNG

#### Advanced 设置

- **自动保存** - 编辑后自动保存脑图文件
- **自动保存延迟** - 输入停止后多久执行自动保存
- **语言** - 界面语言（auto 自动检测、中文、English）

#### Debug 设置

- **显示调试信息** - 显示 zoom、节点数量等调试信息
- **显示 missing notebook 警告** - 标注丢失链接的 notebook 节点

### 文件格式

脑图保存为 `.naotu` 文件，格式如下：

```json
{
  "version": 1,
  "title": "Mindmap Title",
  "layoutMode": "tree-mirror",
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "nodes": [
    {
      "id": "node-id",
      "kind": "text",
      "title": "Node Title",
      "x": 0,
      "y": 0,
      "width": 180,
      "height": 56,
      "treeControl": "auto"
    }
  ],
  "edges": [
    {
      "id": "edge-id",
      "source": "parent-id",
      "target": "child-id",
      "relation": "mindmap",
      "type": "curve"
    }
  ]
}
```

#### 字段说明

- `version` - 文档版本号
- `layoutMode` - 布局模式：`tree-mirror` | `tree-right` | `free`
- `viewport` - 视口状态
- `nodes` - 节点数组
  - `kind` - 节点类型：`text` | `notebook`
  - `treeControl` - 展开状态：`auto` | `manual-expanded` | `manual-collapsed`
  - `notebook` - 笔记本绑定信息（仅 notebook 类型）
- `edges` - 边数组
  - `relation` - 关系类型：`mindmap` | `reference`
  - `type` - 边类型：`line` | `curve`

### 隐私

本插件不发送任何分析数据、遥测数据或用户内容到远程服务器。

### 开发

```bash
# 安装依赖
npm install

# 开发模式（监听文件变化）
npm run dev

# 构建
npm run build

# 运行测试
npm run test

# 测试监听模式
npm run test:watch
```

### 开发注意事项

#### 焦点竞争问题

**问题描述**: 双击节点编辑标题时，内联编辑输入框会立即关闭，用户看起来像"双击没反应"。

**根本原因**: 不是双击事件没触发，而是前两次单击触发的"延迟聚焦画布"把刚打开的输入框焦点抢走了。

事件链：
1. 第一次点击节点 → 触发选中 → `handleNodeSelection()` 排队 `requestAnimationFrame(() => focusCanvas())`
2. 第二次点击节点 → 再排队一个 `focusCanvas()`
3. 随后 `dblclick` 触发 → 内联输入框创建并 `focus()`
4. 前面排队的两个 `requestAnimationFrame` 立刻执行 → 把焦点切回画布
5. 输入框收到 `blur` → `InlineTitleEditor` 的 `blur` 逻辑会 `commit()` 并关闭
6. 结果：用户看到"双击没反应"

**解决方案**: 在 `focusCanvas()` 时检查当前激活元素是否是内联编辑输入框（`.mindmap-inline-title-input`），如果是则不抢焦点。

相关代码位置：
- `src/view/mindmap-view.ts`: `focusCanvasUnlessInlineEditorActive()` 方法
- `src/view/mindmap-interactions.ts`: `handleNodeSelection()` 中的焦点管理
- `src/renderer/shared-mindmap-renderer-base.ts`: D3 zoom 的 `dblclick.zoom` 禁用

**注意**: 如果以后遇到类似的"交互元素打开后立即关闭"问题，首先检查是否有延迟焦点抢夺逻辑。

### 技术栈

- TypeScript
- D3.js - 布局和渲染
- Obsidian API

### 许可证

MIT

---

## English Documentation

A semantic zoom mindmap plugin for Obsidian with text nodes, notebook nodes, and focus-preserving hierarchical zoom.

### Features

#### Core Features

- **Text Nodes** - Simple one-sentence nodes for expressing mindmap structure
- **Notebook Nodes** - Nodes bound to Obsidian notes, with content preview when zoomed in
- **Semantic Zoom** - Zoom changes information granularity instead of simply scaling text; zoom out for structure, zoom in for content
- **Multiple Layout Modes** - Mirror tree, right tree, free layout
- **Markdown Heading Import** - Generate mindmaps from Markdown file heading structure
- **Local Knowledge Map** - Generate knowledge graphs based on backlinks/outlinks of current file
- **SVG/PNG Export** - Export high-quality vector or raster images
- **Minimap** - Thumbnail navigation in top-right corner
- **Keyboard Navigation** - Navigate between nodes with arrow keys
- **Undo/Redo** - Full operation history support
- **Search** - Quick node content search
- **Auto-save** - Automatic saving after edits

#### Performance Optimization

- **Hybrid Renderer** - Automatically switch to Canvas background + SVG interaction layer for large graphs
- **Viewport Culling** - Only render nodes near the viewport
- **Preview Cache** - Smart caching of notebook content previews

### Installation

Place plugin files in your Obsidian vault's `.obsidian/plugins/naotu/` directory.

### Usage

#### Creating Mindmaps

1. Click the mindmap icon in the left ribbon to create a new mindmap
2. Or use command palette: `Create semantic zoom mindmap`
3. Open an existing mindmap: command palette `Open mindmap file`, or open a `.naotu` file and run `Open current .naotu`
4. Create from Markdown file: Open a .md file and run `Create mindmap from current markdown headings`
5. Create local knowledge map: Open a .md file and run `Create local knowledge map from current file`
6. Create sample mindmaps: command palette offers 100 / 1000 / 3000 node samples (for performance testing)

#### Node Types

##### Text Node

Simple single-sentence mindmap nodes for building thought structures.

##### Notebook Node

Nodes bound to Obsidian notes, with content preview when zoomed in.

#### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Edit node title | Double-click title |
| Add child node | Tab |
| Add sibling node | Enter |
| Expand/collapse node | Space |
| Edit current node | F2 |
| Navigate between nodes | Arrow keys |
| Go to root node | Home |
| Delete node | Delete / Backspace |
| Undo | Cmd/Ctrl + Z |
| Redo | Cmd/Ctrl + Shift + Z |
| Search | Cmd/Ctrl + F |
| Fit root in viewport | Cmd/Ctrl + 0 |
| Zoom in | Cmd/Ctrl + + |
| Zoom out | Cmd/Ctrl + - |
| Clear selection | Escape |

#### Mouse Operations

- **Double-click node title** - Edit title
- **Click double-down arrow** - Convert text node to notebook node, expand notebook node preview
- **Click +/- on right side** - Expand/collapse subtree
- **Right-click text node** - Create or bind notebook
- **Scroll wheel** - Zoom
- **Drag** - Pan canvas

### Settings

#### Notebook Settings

- **Notebook Folder** - Folder for auto-created notes when converting text nodes to notebook nodes
- **Notebook Template** - Template for auto-created notebooks, supports `{{title}}` variable

#### Import Settings

- **Import headings as notebook nodes** - Whether to bind each heading node when generating mindmaps from Markdown headings
- **Max backlinks map nodes** - Limit to prevent generating overly large local knowledge maps

#### Rendering Settings

- **Show minimap** - Display thumbnail navigation in top-right corner
- **Default render mode** - auto/SVG/Hybrid, auto selects based on node count
- **Zoom speed** - Mouse wheel zoom speed
- **Tree layout horizontal spacing** - Horizontal distance between tree layout levels
- **Tree layout vertical spacing** - Vertical distance between adjacent leaf slots

#### Performance Settings

- **Enable Hybrid Renderer** - Use Canvas background + SVG interaction layer for large graphs
- **Hybrid node threshold** - Node count threshold to switch to Hybrid mode
- **Enable viewport culling** - Only render nodes near viewport for large graphs
- **Culling node threshold** - Node count threshold to enable culling

#### Export Settings

- **Default export format** - SVG or PNG

#### Advanced Settings

- **Auto-save** - Automatically save mindmap file after edits
- **Auto-save delay** - Time to wait after input stops before auto-saving
- **Language** - Interface language (auto detects from browser, Chinese, English)

#### Debug Settings

- **Show debug info** - Display zoom, node count, and other debug info
- **Show missing notebook warnings** - Mark notebook nodes with broken links

### File Format

Mindmaps are saved as `.naotu` files:

```json
{
  "version": 1,
  "title": "Mindmap Title",
  "layoutMode": "tree-mirror",
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "nodes": [
    {
      "id": "node-id",
      "kind": "text",
      "title": "Node Title",
      "x": 0,
      "y": 0,
      "width": 180,
      "height": 56,
      "treeControl": "auto"
    }
  ],
  "edges": [
    {
      "id": "edge-id",
      "source": "parent-id",
      "target": "child-id",
      "relation": "mindmap",
      "type": "curve"
    }
  ]
}
```

#### Field Descriptions

- `version` - Document version number
- `layoutMode` - Layout mode: `tree-mirror` | `tree-right` | `free`
- `viewport` - Viewport state
- `nodes` - Node array
  - `kind` - Node type: `text` | `notebook`
  - `treeControl` - Expand state: `auto` | `manual-expanded` | `manual-collapsed`
  - `notebook` - Notebook binding info (notebook type only)
- `edges` - Edge array
  - `relation` - Relation type: `mindmap` | `reference`
  - `type` - Edge type: `line` | `curve`

### Privacy

This plugin does not send analytics, telemetry, or user content to remote servers.

### Development

```bash
# Install dependencies
npm install

# Development mode (watch file changes)
npm run dev

# Build
npm run build

# Run tests
npm run test

# Test watch mode
npm run test:watch
```

### Development Notes

#### Focus Competition Issue

**Problem**: When double-clicking a node to edit its title, the inline editing input closes immediately, appearing as if "double-click has no effect".

**Root Cause**: Not that the double-click event didn't fire, but that the delayed "focus canvas" calls triggered by the first two clicks stole the focus from the newly opened input field.

Event chain:
1. First click on node → triggers selection → `handleNodeSelection()` queues `requestAnimationFrame(() => focusCanvas())`
2. Second click on node → queues another `focusCanvas()`
3. Then `dblclick` fires → inline input field is created and `focus()` is called
4. The two queued `requestAnimationFrame` callbacks execute immediately → focus switches back to canvas
5. Input field receives `blur` → `InlineTitleEditor`'s `blur` logic calls `commit()` and closes
6. Result: User sees "double-click has no effect"

**Solution**: When calling `focusCanvas()`, check if the current active element is the inline editing input (`.mindmap-inline-title-input`). If it is, don't steal the focus.

Related code locations:
- `src/view/mindmap-view.ts`: `focusCanvasUnlessInlineEditorActive()` method
- `src/view/mindmap-interactions.ts`: Focus management in `handleNodeSelection()`
- `src/renderer/shared-mindmap-renderer-base.ts`: D3 zoom's `dblclick.zoom` disabled

**Note**: If you encounter similar "interactive element closes immediately after opening" issues, first check if there's delayed focus stealing logic.

### Tech Stack

- TypeScript
- D3.js - Layout and rendering
- Obsidian API

### License

MIT