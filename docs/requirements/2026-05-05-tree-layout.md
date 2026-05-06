# Tree Layout

## Focus

Replace radial layout with tree-based automatic layout (mirror/right), remove manual "中心布局" trigger, re-layout on every change.

## In Scope

- Replace `LayoutMode` type: `"radial" | "free"` → `"tree-mirror" | "tree-right" | "free"`
- Implement `TreeLayoutEngine` with two modes:
  - `tree-mirror`: root center, children split left/right symmetrically by subtree weight
  - `tree-right`: root left, all children extend rightward
- Layout algorithm: horizontal layer spacing + vertical sibling spacing, both configurable
- Auto-layout trigger: recompute on every document change (add/delete node, drag reorder/reparent, toggle collapse, etc.)
- Drag behavior in tree mode:
  - Drag to reorder among siblings (changes child order in hierarchy)
  - Drag onto another node to reparent (changes parent)
  - On drop, system recalculates positions
- Remove "中心布局" toolbar button
- Remove `RadialLayoutEngine` class
- Add layout direction selector to toolbar (mirror / right toggle)
- Add horizontal/vertical spacing settings to `SemanticMindmapSettings` with defaults
- Persist `layoutMode` in document as before
- `free` mode preserved but no UI to switch to it for now

## Out of Scope

- Left-only tree layout (`tree-left`)
- Animation transitions on layout change
- Minimap updates (follows existing render cycle)
- Export renderer changes (uses node positions, no layout awareness needed)
- Removing `free` mode entirely

## Constraints

- Node positions are still stored as absolute `x, y` on `MindmapNode`; layout engine writes these on every change
- Existing `buildHierarchy` used for tree structure; no changes to edge/hierarchy model
- `relaxProjectedNodes` still runs for collision fix in projection layer (separate from layout)
- Performance: layout must complete < 16ms for ~200 nodes to avoid frame drops on auto-layout

## Assumptions

- Tree structure derived from `mindmap` edges (existing `buildHierarchy`) is the source of truth for layout
- Subtree weight (leaf count) used to balance mirror split and vertical space allocation
- Drag reorder/reparent only applies in `tree-mirror` / `tree-right` modes; `free` mode keeps current drag-to-move
- Spacing defaults: horizontal 220px, vertical 80px (matching current `createTextNodeNearParent` offset)

## Success Criteria

- Nodes never overlap after layout (no position collision at any zoom level)
- `tree-mirror`: root centered, first half of children left, second half right, visually balanced
- `tree-right`: root at left, all descendants flow right in tree structure
- Adding/deleting a node immediately re-layouts without manual trigger
- Drag to reorder siblings works; drop recalculates layout
- Drag to reparent works; drop recalculates layout
- "中心布局" button removed from toolbar
- Layout direction toggle present in toolbar
- Spacing configurable in settings with immediate effect
- Existing tests pass; new layout engine covered by unit tests

## Decomposition

1. **Update types**: `LayoutMode` → `"tree-mirror" | "tree-right" | "free"`; add spacing fields to settings
2. **Implement `TreeLayoutEngine`**: core algorithm with mirror/right modes, configurable spacing
3. **Auto-layout integration**: hook into `MindmapDocumentStore` mutations to trigger re-layout on every change
4. **Drag reorder/reparent**: modify drag handlers to detect sibling reorder vs reparent, update hierarchy accordingly
5. **UI changes**: remove "中心布局" button, add layout direction toggle, add spacing settings
6. **Remove `RadialLayoutEngine`**: delete class and all references
7. **Migration**: existing docs with `layoutMode: "radial"` → default to `"tree-mirror"`
8. **Tests**: unit tests for `TreeLayoutEngine` (mirror, right, spacing, single node, deep tree, wide tree)

## Key

tree-layout
