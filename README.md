# MindCanvas 脑图

[中文](#中文文档) | [English](#english-documentation)

---

## 中文文档

> A mindmap that is really a map.  
> 真正的思维投影。

脑图不是普通思维导图，而是一张可以像地图一样缩放、导航和承载资料的思维画布。

### 功能特性

#### 核心功能

- **文本节点** - 简单的一句话节点，用于表达脑图结构
- **笔记本节点** - 绑定 Obsidian 笔记，放大时可预览笔记内容
- **图片/Excalidraw节点** - 绑定图片或 Excalidraw 文件，放大时显示嵌入预览
- **语义缩放** - 缩放改变信息粒度而非简单放大文字，缩小看结构，放大看内容
- **子树语义缩放** - 选中节点后缩放仅影响该子树的展开/收起状态
- **分支颜色** - 根节点下的主要分支自动使用不同颜色，便于视觉区分
- **多种布局模式** - 镜像树、右向树、自由布局
- **Markdown 标题导入** - 从 Markdown 文件的标题结构生成脑图
- **局部知识地图** - 基于当前文件的双向链接生成知识图谱
- **SVG/PNG 导出** - 导出高清矢量图或位图（设置已预留，导出功能开发中）
- **工具栏** - 完整的工具栏按钮，支持撤销、重做、布局切换、搜索等操作
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
2. 或使用命令面板：`创建语义缩放脑图`
3. 打开已有脑图文件：命令面板 `打开脑图文件`，或在文件中打开 `.naotu` 后执行 `打开当前 .naotu`
4. 从 Markdown 文件创建：打开 .md 文件后执行 `从当前 Markdown 标题创建脑图`
5. 创建局部知识地图：打开 .md 文件后执行 `从当前文件创建本地知识图谱`
6. 创建示例脑图：命令面板选择 `创建示例脑图（100 / 1000 / 3000 节点）`（用于性能测试）

#### 节点类型

##### 文本节点

简单的单句脑图节点，用于构建思维结构。深度 ≥2 的文本节点渲染为仅下划线样式，减少视觉干扰。

##### 笔记本节点

绑定到 Obsidian 笔记的节点，放大时可预览笔记内容。

##### 图片节点

绑定到 Obsidian vault 内的图片文件（png、jpg、jpeg、gif、webp、svg、avif、bmp），放大时显示图片预览。

##### Excalidraw节点

绑定到 Excalidraw 文件（.excalidraw 或 .excalidraw.md），放大时显示 Excalidraw 绘图预览。

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
- **右键点击笔记本节点** - 重新选择文件或转为文本节点
- **滚轮** - 缩放（选中节点时仅缩放该子树）
- **拖拽** - 平移画布
- **拖拽节点边框** - 调整笔记本节点自定义尺寸

### 设置选项

#### Notebook 设置

- **Notebook 文件夹** - 文本节点转笔记本节点时自动创建笔记的文件夹
- **Notebook 模板** - 自动创建笔记本时使用的模板，支持 `{{title}}` 变量

#### Import 设置

- **导入 headings 为笔记本节点** - 从 Markdown 标题生成脑图时，是否让每个标题节点绑定对应标题
- **Backlinks map 最大节点数** - 防止生成过大的局部知识地图

#### Rendering 设置

- **显示小地图** - 在右上角显示缩略导航图
- **缩放速度** - 鼠标滚轮缩放速度（默认 0.003，值越大速度越快）
- **树布局水平间距** - 树布局每层的水平距离
- **树布局垂直间距** - 树布局相邻叶子槽位的垂直距离

#### Advanced 设置

- **显示 missing notebook 警告** - 标注丢失链接的 notebook 节点
- **自动保存** - 编辑后自动保存脑图文件
- **自动保存延迟** - 输入停止后多久执行自动保存
- **语言** - 界面语言（自动、中文、English）

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
      "customWidth": 200,
      "customHeight": 150,
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
  - `customWidth` / `customHeight` - 自定义尺寸（笔记本节点手动调整后）
  - `aspectRatio` - 宽高比（用于嵌入文件节点）
  - `treeControl` - 展开状态：`auto` | `manual-expanded` | `manual-collapsed`
  - `notebook` - 笔记本绑定信息（仅 notebook 类型）
    - `targetType` - 目标类型：`file` | `heading` | `block`
    - `targetKind` - 目标文件类型：`markdown` | `image` | `excalidraw`
  - `link` - Obsidian 内部链接（如 `[[note]]` 或 `![[image.png]]`）
  - `tags` - 标签数组（预留）
  - `importance` - 重要度数值（预留）
  - `style` - 自定义样式：`{ fill?, stroke? }`
- `edges` - 边数组
  - `relation` - 关系类型：`mindmap`（树结构）| `reference`（预留引用关系）
  - `type` - 边类型：`line` | `curve`
  - `label` - 边标签（预留）
  - `style` - 自定义样式：`{ stroke?, dashed? }`

### 隐私

本插件不发送任何分析数据、遥测数据或用户内容到远程服务器。

### 开发

详见 [DEVELOPMENT.md](./DEVELOPMENT.md)。

### 许可证

MIT

---

## English Documentation

# MindCanvas

> A mindmap that is really a map.  
> 真正的思维投影。

MindCanvas is a zoomable mindmap for Obsidian that helps you organize ideas, notes, images, links, and knowledge on a visual canvas like a real map.

### Features

#### Core Features

- **Text Nodes** - Simple one-sentence nodes for expressing mindmap structure
- **Notebook Nodes** - Nodes bound to Obsidian notes, with content preview when zoomed in
- **Image/Excalidraw Nodes** - Nodes bound to image or Excalidraw files, showing embedded preview when zoomed in
- **Semantic Zoom** - Zoom changes information granularity instead of simply scaling text; zoom out for structure, zoom in for content
- **Subtree Semantic Zoom** - When a node is selected, zoom only affects that subtree's expand/collapse state
- **Branch Colors** - Major branches under root node automatically use different colors for visual differentiation
- **Multiple Layout Modes** - Mirror tree, right tree, free layout
- **Markdown Heading Import** - Generate mindmaps from Markdown file heading structure
- **Local Knowledge Map** - Generate knowledge graphs based on backlinks/outlinks of current file
- **Toolbar** - Full toolbar buttons for undo, redo, layout switching, search, and more
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
6. Create sample mindmaps: command palette offers `Create sample mindmap (100 / 1000 / 3000 nodes)` (for performance testing)

#### Node Types

##### Text Node

Simple single-sentence mindmap nodes for building thought structures. Text nodes at depth ≥2 render as underline-only style to reduce visual clutter.

##### Notebook Node

Nodes bound to Obsidian notes, with content preview when zoomed in.

##### Image Node

Nodes bound to image files in Obsidian vault (png, jpg, jpeg, gif, webp, svg, avif, bmp), showing image preview when zoomed in.

##### Excalidraw Node

Nodes bound to Excalidraw files (.excalidraw or .excalidraw.md), showing Excalidraw drawing preview when zoomed in.

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
- **Right-click notebook node** - Rebind file or convert to text node
- **Scroll wheel** - Zoom (when node selected, zoom affects only that subtree)
- **Drag** - Pan canvas
- **Drag node border** - Resize notebook node custom size

### Settings

#### Notebook Settings

- **Notebook Folder** - Folder for auto-created notes when converting text nodes to notebook nodes
- **Notebook Template** - Template for auto-created notebooks, supports `{{title}}` variable

#### Import Settings

- **Import headings as notebook nodes** - Whether to bind each heading node when generating mindmaps from Markdown headings
- **Max backlinks map nodes** - Limit to prevent generating overly large local knowledge maps

#### Rendering Settings

- **Show minimap** - Display thumbnail navigation in top-right corner
- **Zoom speed** - Mouse wheel zoom speed (default 0.003, larger = faster)
- **Tree layout horizontal spacing** - Horizontal distance between tree layout levels
- **Tree layout vertical spacing** - Vertical distance between adjacent leaf slots

#### Advanced Settings

- **Show missing notebook warnings** - Mark notebook nodes with broken links
- **Auto-save** - Automatically save mindmap file after edits
- **Auto-save delay** - Time to wait after input stops before auto-saving
- **Language** - Interface language (auto, Chinese, English)

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
      "customWidth": 200,
      "customHeight": 150,
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
  - `customWidth` / `customHeight` - Custom size (after manual resize of notebook node)
  - `aspectRatio` - Aspect ratio (for embedded file nodes)
  - `treeControl` - Expand state: `auto` | `manual-expanded` | `manual-collapsed`
  - `notebook` - Notebook binding info (notebook type only)
    - `targetType` - Target type: `file` | `heading` | `block`
    - `targetKind` - Target file type: `markdown` | `image` | `excalidraw`
  - `link` - Obsidian internal link (e.g. `[[note]]` or `![[image.png]]`)
  - `tags` - Tags array (reserved)
  - `importance` - Importance value (reserved)
  - `style` - Custom style: `{ fill?, stroke? }`
- `edges` - Edge array
  - `relation` - Relation type: `mindmap` (tree structure) | `reference` (reserved reference relation)
  - `type` - Edge type: `line` | `curve`
  - `label` - Edge label (reserved)
  - `style` - Custom style: `{ stroke?, dashed? }`

### Privacy

This plugin does not send analytics, telemetry, or user content to remote servers.

### Development

See [DEVELOPMENT.md](./DEVELOPMENT.md).

### License

MIT
