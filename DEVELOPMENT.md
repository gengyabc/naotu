# Development Notes

## Build

```bash
npm install      # Install dependencies
npm run dev      # Development mode (watch file changes, NO typecheck)
npm run build    # Build (tsc --noEmit --skipLibCheck THEN esbuild)
npm run test     # Run tests
npm run test:watch  # Test watch mode
npx tsc --noEmit  # Manual typecheck after dev session
```

**Important**: `npm run dev` does NOT typecheck. Run `tsc --noEmit` manually after dev-session changes.

## Frequently Encountered Problems

### 1. Focus Competition Issue

**Problem**: When double-clicking a node to edit its title, the inline editing input closes immediately, appearing as if "double-click has no effect".

**Root Cause**: The delayed "focus canvas" calls triggered by the first two clicks stole the focus from the newly opened input field.

**Event chain**:
1. First click → triggers selection → `handleNodeSelection()` queues `requestAnimationFrame(() => focusCanvas())`
2. Second click → queues another `focusCanvas()`
3. Then `dblclick` fires → inline input field created and focused
4. The queued `requestAnimationFrame` callbacks execute → focus switches back to canvas
5. Input field receives `blur` → closes immediately

**Solution**: Check if the current active element is the inline editing input (`.mindmap-inline-title-input`) before stealing focus.

**Code locations**:
- `src/view/mindmap-view.ts`: `focusCanvasUnlessInlineEditorActive()`
- `src/view/mindmap-interactions.ts`: Focus management in `handleNodeSelection()`
- `src/renderer/shared-mindmap-renderer-base.ts`: D3 zoom's `dblclick.zoom` disabled

**General lesson**: If an interactive element closes immediately after opening, check for delayed focus stealing logic.

---

### 2. Duplicate Tabs Issue

**Problem**: Clicking the same `.naotu` file in the file explorer creates a new tab instead of activating the existing one, causing a brief refresh/flash.

**Root Cause**: `MindmapView` inherited from `ItemView`, so Obsidian treated it as a generic custom view rather than a file view. Obsidian didn't recognize it as the same file.

**Solution**: Migrate `MindmapView` from `ItemView` to `FileView`:

1. Change `extends ItemView` to `extends FileView`
2. Implement required methods: `getViewData()`, `setViewData(data, clear)`, `clear()`, `onLoadFile(file)`
3. Use `this.file` (from FileView) as the authoritative file reference
4. Delete `active-leaf-change` / `file-open` "post-hoc deduplication" logic
5. In `openMindmapFile()`, find existing leaf before creating new tab

**Key insight**: `FileView` lets Obsidian handle file-based tab reuse natively, avoiding the "create new tab → detect duplicate → switch back → close new tab" cascade.

**Code locations**:
- `src/view/mindmap-view.ts`: `MindmapView` extends `FileView`
- `src/main.ts`: `openMindmapFile()` uses `findOpenMindmapLeaf()`

**Manual verification**:
- Open a `.naotu` file
- Click the same file in file explorer → should NOT create new tab, NOT refresh
- Click a different `.naotu` → should open new tab
- Rename/move `.naotu` → tab title and internal path should update

---

### 3. Resize Runaway Growth

**Problem**: When resizing a notebook node with aspect ratio locked, the size could grow uncontrollably during the drag operation.

**Root Cause**: The resize logic was recalculating the axis (width vs height) on every drag event, causing instability when the aspect ratio made the axis flip between width and height.

**Solution**: Lock the resize axis at the start of the drag operation and maintain it throughout:

```ts
resizeDrafts.set(node.id, { 
  width: node.displayWidth, 
  height: node.displayHeight, 
  axis: "width"  // Lock axis at start
});
```

Then during drag, use the locked `currentDraft.axis` instead of recalculating.

**Code location**: `src/renderer/projected-node-renderer.ts`

---

### 4. Terminal Zoom Cascade

**Problem**: When a node is selected and the user zooms out repeatedly, the subtree semantic zoom could cause a cascade where zooming out further collapses more nodes, eventually leading to terminal zoom-out behavior.

**Root Cause**: The selected node's visibility wasn't guaranteed in the projection logic, so zooming could hide the selected node itself.

**Solution**: Add the selected node and its ancestor path to `forcedExpandedNodeIds` and `visibleNodeIds` in `createSemanticProjection()`:

```ts
const selectedNodeId = context.selectedNodeIds.find(id => hierarchy.nodes.has(id));
const selectedPath = selectedNodeId ? getAncestorPath(selectedNodeId, hierarchy) : [];
const forcedExpandedNodeIds = new Set([
  ...focusPath.filter(id => id !== focusNodeId),
  ...selectedPath.filter(id => id !== selectedNodeId),
]);
// Also add selected node to visibleNodeIds
if (selectedNodeId) visibleNodeIds.add(selectedNodeId);
```

**Code location**: `src/core/semantic-projection.ts`

**General lesson**: When implementing subtree semantic zoom, ensure the selected node remains visible across all zoom levels.

---

### 5. Mindmap Edge Crossing

**Problem**: In tree layout, edges could cross each other when subtrees were tall, creating visual confusion.

**Root Cause**: The anchor point selection for edges was dimension-aware (considering both dx and dy), which could cause edges to use top/bottom anchors for tall subtrees, leading to crossing.

**Solution**: Create a separate `getMindmapAnchorPoint()` for tree edges that always uses horizontal (left/right) anchors regardless of vertical distance:

```ts
function getMindmapAnchorPoint(node: ProjectedNode, toward: ProjectedNode) {
  const dx = toward.projectedX - node.projectedX;
  return {
    x: dx >= 0 ? node.projectedX + node.displayWidth : node.projectedX,
    y: ... // center or bottom for underline nodes
  };
}
```

Reference edges (non-tree connections) continue using the dimension-aware `getAnchorPoint()`.

**Code location**: `src/core/edge-routing.ts`

---

### 6. Keyboard Focus Restoration

**Problem**: After selecting a node, keyboard shortcuts like Space wouldn't work because the canvas lost focus.

**Root Cause**: Focus restoration was synchronous, but the click event could propagate and cause focus issues.

**Solution**: Use `requestAnimationFrame` for focus restoration:

```ts
// In bindFocusRestore()
this.svg.on("click.focus", (event) => {
  requestAnimationFrame(() => this.options.container.focus());
  // ...
});
```

**Code locations**:
- `src/renderer/svg-mindmap-renderer.ts`
- `src/renderer/hybrid-mindmap-renderer.ts`

---

### 7. Inline Editor Outside Click

**Problem**: Clicking outside the inline title editor didn't commit the changes, leaving the edit pending.

**Solution**: Add a document-level click listener that commits on outside click:

```ts
const onClickOutside = (event: MouseEvent) => {
  if (!this.textarea?.contains(event.target as Node)) {
    void this.commit();
  }
};
document.addEventListener("mousedown", onClickOutside, { capture: true });
```

Cleanup the listener in `close()`.

**Code location**: `src/renderer/inline-title-editor.ts`

---

### 8. Canvas Pan Speed Coupled to Zoom Level

**Problem**: When zoomed in, panning the canvas became too fast and uncontrollable. When zoomed out, panning was too slow.

**Root Cause**: D3 zoom's built-in pan behavior scales pan distance by the inverse of the zoom level. At zoom=0.5, panning by 1px moves the world by 2px, making it feel fast. At zoom=2.0, panning by 1px moves the world by 0.5px, making it feel sluggish.

**Solution**: Disable D3 zoom's built-in pan filter and implement custom pan handling that uses raw screen pixel deltas directly:

```ts
// In D3 zoom setup:
this.zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
  .scaleExtent([0.12, 4])
  .filter((event) => "touches" in event)  // Only allow touch events through D3 zoom
  .on("zoom", (event) => {
    const t = event.transform;
    this.options.onViewportChange(t.x, t.y, t.k);
  });

// Implement custom pan via mousedown/mousemove/mouseup:
private bindCustomPan(): void {
  this.svg.on("mousedown.pan", (event) => {
    if (event.button !== 0) return;  // Only left click
    if (event.target.closest(".mindmap-node")) return;  // Don't pan on nodes
    this.panActive = true;
    this.panPrev = { x: event.clientX, y: event.clientY };
  });

  this.panDocMouse = (e: MouseEvent) => {
    if (!this.panActive) return;
    const dx = e.clientX - this.panPrev.x;
    const dy = e.clientY - this.panPrev.y;
    this.panPrev = { x: e.clientX, y: e.clientY };
    this.options.onViewportChange(currentX - dx, currentY - dy, currentZoom);
  };
  // ...
}
```

**Key insight**: Raw screen pixel deltas provide consistent pan speed regardless of zoom level. The trade-off is that you must implement your own pan gesture handling (mousedown/mousemove/mouseup) instead of relying on D3 zoom's built-in pan.

**Code location**: `src/renderer/shared-mindmap-renderer-base.ts`

---

### 9. Tree Layout Overlap

**Problem**: Nodes in tree layout could overlap each other, especially when notebook nodes were expanded or had custom sizes.

**Root Cause**: The tree layout algorithm was using a simple "node count" weight to determine subtree spacing, rather than the actual rendered node sizes. This caused subtrees with large nodes to overlap with adjacent subtrees.

**Solution**: Replace `computeVisibleSubtreeWeights()` with `computeVisibleSubtreeSpans()` that uses actual node sizes:

```ts
// Before: weight-based spacing
const weights = computeVisibleSubtreeWeights(rootId, childrenById, nodeMap);

// After: actual size-based spacing
const spans = computeVisibleSubtreeSpans(rootId, childrenById, nodeMap, verticalSpacing);
```

The `spans` calculation considers each node's actual `displayWidth` and `displayHeight` (including notebook nodes at their current detail level), ensuring subtrees get enough vertical space.

**Code location**: `src/core/tree-layout.ts`

---

### 10. Manual Tree Control States Lost on Zoom

**Problem**: When a user manually expanded or collapsed a node (via +/- button or Space key), the state would be lost when zooming, causing the node to revert to auto-calculated expand/collapse behavior.

**Root Cause**: `setViewportAndSyncTreeControls()` was resetting manual states back to "auto" whenever zoom changed, because it assumed the zoom change should trigger a recalculation of which nodes should be expanded.

**Solution**: Remove the zoom-dependent tree control reset logic from `setViewportAndSyncTreeControls()`. Manual states (`manual-expanded` / `manual-collapsed`) should persist until the user explicitly changes them:

```ts
// REMOVED: Don't reset manual states on zoom change
setViewportAndSyncTreeControls(x, y, zoom): void {
  this.doc.viewport = { x, y, zoom };
  this.emit();
}
```

The semantic projection engine already handles auto-expand/collapse based on zoom level. Manual states should only be set when the user explicitly clicks +/- or presses Space.

**Code location**: `src/core/document-store.ts`

---

### 11. Title Hitbox for Stable Double-Click Editing

**Problem**: Double-clicking on a node to edit its title was unreliable — sometimes the edit didn't trigger, or it triggered when clicking on non-title areas of the node.

**Root Cause**: The double-click handler was attached to the entire node group, and the click target detection was too broad, causing inconsistent behavior.

**Solution**: Add an invisible hitbox rect specifically for the title area, and only trigger inline editing when double-clicking on the title hitbox:

```ts
// In renderProjectedNodes:
entered.append("rect").attr("class", "mindmap-node-title-hitbox");

// In shouldStartInlineTitleEdit:
return Boolean(elementTarget.closest(".mindmap-node-title, .mindmap-node-title-hitbox"));
```

The hitbox is slightly larger than the actual title text, making it easier to hit, but only covers the title area (not the entire node).

**Code location**: `src/renderer/projected-node-renderer.ts`

---

### 12. Subtree Drag with Hidden Nodes

**Problem**: In free layout mode, when dragging a node that has hidden (collapsed) descendants, only the visible nodes moved, leaving hidden nodes behind.

**Root Cause**: The drag logic only moved nodes that were currently visible in the projection. Hidden nodes weren't included in the drag operation.

**Solution**: Use `getSubtreeNodeIds()` to resolve all descendants (visible and hidden) when calculating drag movements:

```ts
export function resolveDraggedNodeIds(doc: MindmapDocument, draggedNodeId: string, selectedIds: string[]): string[] {
  const baseIds = selectedIds.includes(draggedNodeId) ? selectedIds : [draggedNodeId];
  const rootIds = baseIds.filter(id => !baseIds.some(otherId => otherId !== id && isDescendantNode(doc, otherId, id)));
  const resolved: string[] = [];
  const seen = new Set<string>();

  for (const id of rootIds) {
    for (const subtreeId of getSubtreeNodeIds(doc, id)) {
      if (seen.has(subtreeId)) continue;
      seen.add(subtreeId);
      resolved.push(subtreeId);
    }
  }

  return resolved;
}
```

This ensures that dragging a parent node moves all its descendants, even if they're currently hidden.

**Code location**: `src/core/tree-editing.ts`

---

## General Debugging Guidelines

### Hotspots to Watch

- `src/view/mindmap-view.ts` — integration hub, easy to regress
- `src/core/semantic-projection.ts` — complex projection engine
- Changes spanning `src/view/`, `src/renderer/`, and `src/core/`

### Stability Workflow

1. **Add regression tests** when fixing bugs — don't just reproduce manually
2. **Run `tsc --noEmit`** after dev sessions
3. **Run focused tests** before finishing renderer/projection changes:
   ```bash
   npx vitest run src/test/semantic-projection.test.ts
   npx vitest run src/test/projected-node-renderer.test.ts
   npm run test
   ```

### Manual Verification Checklist

After cross-feature UI changes:
- Selection and keyboard shortcuts work
- Tree expand/collapse and semantic zoom behave correctly
- Dragging/resizing marks document dirty and autosaves
- Notebook binding, rename, moved-file sync, missing-link warnings work
- Search, minimap render correctly

## Tech Stack

- TypeScript
- D3.js — Layout and rendering
- Obsidian API

## License

MIT