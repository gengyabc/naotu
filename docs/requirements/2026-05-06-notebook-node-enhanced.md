# Notebook Node Enhanced UX

## Status

ready

## Title

Notebook Node Enhanced UX: anti-overlap, navigate button, scrollbar, and resize

## Focus

Improve the expanded notebook node (level 5) experience in the semantic-zoom mindmap by preventing overlap, adding navigation, scroll, and manual resize capabilities.

## In Scope

1. **Anti-overlap on expand** — When a notebook node expands to level 5 (360×300+), the layout relaxation must guarantee it pushes overlapping nodes away so no two nodes share screen space.
2. **Navigate-to-md button** — A clickable button inside the notebook node that opens the linked `.md` file in a **split pane**. Placed at the top of the node, just under the title bar, where the "notebook" kind badge currently sits (replacing or augmenting that badge).
3. **Scrollbar for preview content** — The `foreignObject` markdown preview area gets a thin/native scrollbar so users can scroll long content.
4. **Resize handle + persistence** — A resize handle at the bottom-right corner of notebook nodes at level 5, allowing free-form (independent width/height) resizing. Minimum bounds: **200×150**. Resized dimensions are persisted to the `.mindmap.json` document.

## Out of Scope

- Resizing text nodes or notebook nodes below level 5
- Resize snapping / grid alignment
- Aspect-ratio locking
- Animations for the expand/push transition
- Multi-node batch resize

## Constraints

- Must work within the existing D3 SVG + `foreignObject` rendering pipeline
- Must not break existing drag-to-move, click-selection, or context-menu interactions on nodes
- Resize handle must not conflict with the existing notebook expand chevron button at the bottom center
- The scrollbar lives inside `foreignObject`; must be CSS-only (no custom JS scrollbar)
- Must remain compatible with Obsidian's `MarkdownRenderer.render()` output

## Assumptions

- The existing `layout-relaxation.ts` iterative solver is the right place to enhance collision guarantees (increase iterations or push strength for notebook-level-5 nodes)
- `MindmapNode` data model can be extended with optional `customWidth` / `customHeight` fields for persistence
- `ProjectedNode` can carry a `customSize` flag to override `getVisualSpec()` dimensions at level 5
- The "notebook" kind badge text at the top of the node can be replaced with a clickable element (or the badge itself becomes the click target)

## Success Criteria

1. Expanding a notebook node to level 5 visually pushes all overlapping nodes away with zero remaining overlap
2. Clicking the navigate button opens the linked `.md` file in a split pane
3. Scrolling a long notebook preview with mouse wheel works smoothly inside the node
4. Dragging the bottom-right handle resizes the notebook node in real-time (free-form, min 200×150)
5. Resized dimensions survive save/reload of the `.mindmap.json` file
6. Existing interactions (drag-to-move, select, context menu, expand/collapse subtree) still work on notebook nodes

## Decomposition

### D1: Anti-overlap guarantee
- File: `src/core/layout-relaxation.ts`
- Increase push strength and/or iteration count when notebook-level-5 nodes are involved
- Add a post-relaxation overlap check; if any overlaps remain, run additional passes

### D2: Navigate button
- File: `src/renderer/projected-node-renderer.ts`
- Replace or augment the `text.mindmap-node-kind-badge` element for notebook nodes at level 5 with a clickable group
- On click: call `app.workspace.openLinkText(link, '', { split: true })` via a new `onNavigateToNotebook(id)` callback
- Wire callback in `src/view/mindmap-view.ts`

### D3: Scrollbar for preview
- File: `src/renderer/notebook-preview-renderer.ts`, `styles.css`
- Set `overflow-y: auto` with thin scrollbar CSS on the `foreignObject` content div
- Add Obsidian-compatible thin scrollbar styles (`::-webkit-scrollbar { width: 6px }`, etc.)

### D4: Resize handle + persistence
- Data model: add `customWidth?: number` and `customHeight?: number` to `MindmapNode` in `src/types/mindmap.ts`
- Projection: when `node.kind === "notebook"` and `detailLevel === 5` and `customWidth/customHeight` exist, use them instead of `getVisualSpec()` defaults in `src/core/semantic-projection.ts`
- Rendering: add a `g.mindmap-node-resize-handle` SVG group at bottom-right corner in `src/renderer/projected-node-renderer.ts`
- Interaction: D3 drag on the handle updates `customWidth/customHeight` in real-time, triggers re-projection (not full re-render), enforces min 200×150
- Persistence: `document-store.ts` already saves the full node object; new fields are included automatically
- Re-projection after resize: trigger relaxation to push neighbors away from the new size

## Key

notebook-node-enhanced
