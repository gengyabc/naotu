# Semantic Zoom Mindmap

An Obsidian plugin for semantic zoom mindmaps with focus-protected hierarchical semantic zoom and radial layout.

## Features

- **Semantic Zoom**: Nodes change detail level based on zoom and focus state
- **Focus Protection**: Selected/focused nodes stay detailed while others simplify
- **Radial Layout**: Center-to-periphery automatic layout
- **Notebook Nodes**: Bind nodes to Obsidian notes and preview content
- **Text Nodes**: Simple one-line mindmap nodes
- **Inline Editing**: Double-click to edit node titles inline
- **Tree Control**: +/- buttons to expand/collapse subtrees

## Installation

### From Obsidian

1. Open Settings → Community Plugins
2. Disable Safe Mode
3. Click "Browse" and search for "Semantic Zoom Mindmap"
4. Install and enable

### Manual Installation

1. Download `main.js`, `styles.css`, and `manifest.json` from releases
2. Create folder `.obsidian/plugins/semantic-zoom-mindmap` in your vault
3. Copy the files into that folder
4. Enable the plugin in Settings → Community Plugins

## Usage

### Creating a Mindmap

- **Ribbon Icon**: Click the git-fork icon in the left ribbon
- **Command**: Run "Create semantic zoom mindmap" from command palette
- **Direct**: Create a `.mindmap.json` file and open it

### Node Types

#### Text Nodes
- Simple one-line nodes for structure
- Double-click title to edit inline
- Click double-down arrow to convert to notebook

#### Notebook Nodes
- Bound to Obsidian notes
- Display notebook badge at higher detail levels
- Click double-down arrow to preview note content
- Rename node renames the underlying note file

### Controls

- **Zoom**: Mouse wheel to zoom, semantic detail levels change automatically
- **Pan**: Drag canvas to pan
- **Tree Expand/Collapse**: +/- button on node right side
- **Selection**: Click to select, Cmd/Ctrl+Click to toggle, Shift+Click to multi-select
- **Context Menu**: Right-click for options (convert to text, delete)

### Layout

- **Radial Layout**: Click "中心布局" button to auto-arrange from center
- Root stays at center, children spread radially

## Data Format

Mindmaps are stored as `.mindmap.json` files:

```json
{
  "version": 1,
  "title": "Untitled Mindmap",
  "layoutMode": "radial",
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "nodes": [
    {
      "id": "root",
      "kind": "text",
      "title": "中心主题",
      "x": 0,
      "y": 0,
      "width": 180,
      "height": 56,
      "treeControl": "auto"
    }
  ],
  "edges": []
}
```

## Development

### Build

```bash
npm install
npm run build
```

### Typecheck

```bash
npm run typecheck
```

### Dev Mode

```bash
npm run dev
```

## License

MIT

## Roadmap

Phase 2 features:
- Tab to add child node
- Enter to add sibling node
- Node drag
- Connection editing
- Undo/redo
- Search nodes
- Multi-select/box select
- Notebook file selector
- Settings: notebook folder
- Large graph performance optimization