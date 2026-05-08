# Mindmap View Full Refactor Plan

This document is a behavior-preserving refactor plan for the current `MindmapView`-centered architecture. The goal is to reduce regression risk by shrinking the integration hotspot, moving mixed responsibilities into smaller modules, and adding enough coverage that future diffs do not reintroduce already-solved bugs.

## 1. Goal

Refactor the current view stack so that:

1. `src/view/mindmap-view.ts` becomes a thin composition root.
2. Document mutation side effects become centralized and consistent.
3. Notebook actions, tree actions, and interaction policy have explicit ownership.
4. UI chrome and menu construction move out of the integration hub.
5. Future features land in smaller, more testable files.

## 2. Non-goals

1. Do not change persisted document structure unless strictly required.
2. Do not rewrite semantic projection, tree layout, or renderer internals in the early refactor phases.
3. Do not migrate to a reactive/store framework during this refactor.
4. Do not mix behavior changes with structural moves in the same phase.

## 3. Current Problem Summary

`src/view/mindmap-view.ts` currently mixes all of the following:

1. file lifecycle and vault reload handling
2. edit transactions, history, dirty state, and autosave
3. toolbar and save status DOM
4. renderer selection and callback wiring
5. keyboard shortcuts, search, selection, connection mode, and zoom semantics
6. notebook workflows
7. tree-layout workflows
8. export actions

This makes the file the main regression hotspot. A change that should affect one behavior can accidentally affect several others because they share state, timing, and renderer refresh paths.

## 4. Target Architecture

### 4.1 Keep `src/view/mindmap-view.ts` as the shell

Responsibilities that remain in `MindmapView`:

1. Obsidian `ItemView` lifecycle
2. high-level collaborator construction
3. file ownership and top-level state composition
4. delegating to extracted modules

### 4.2 Introduce these extracted modules

1. `src/view/mindmap-edit-session.ts`
   Owns document mutation flow, history, dirty state, autosave coordination, save/flush, and shared mutation helpers.

2. `src/ui/mindmap-toolbar.ts`
   Owns toolbar DOM creation, button wiring surface, search box wiring surface, and save-status element updates.

3. `src/ui/context-menu.ts`
   Owns node menu and edge menu construction from callbacks and node capabilities.

4. `src/view/mindmap-notebook-actions.ts`
   Owns create/bind/open/rename/disconnect/sync/missing-link-refresh notebook workflows.

5. `src/view/mindmap-tree-actions.ts`
   Owns tree-specific workflows such as relayout, layout mode switching, add child/sibling, tree toggle, and drag-drop resolution.

6. `src/view/mindmap-interactions.ts`
   Owns keyboard interaction policy, selection helpers, search flow, connection mode state machine, root focus flow, and semantic subtree zoom flow.

7. `src/view/mindmap-renderer-coordinator.ts`
   Owns renderer selection, adapter construction, adapter state synchronization, and render callback wiring.

### 4.3 Keep existing focused modules as they are early on

Do not refactor these in the first passes:

1. `src/core/semantic-projection.ts`
2. `src/core/tree-layout.ts`
3. `src/core/tree-editing.ts`
4. `src/core/subtree-semantic-zoom.ts`
5. `src/renderer/svg-mindmap-renderer.ts`
6. `src/renderer/hybrid-mindmap-renderer.ts`
7. `src/renderer/projected-node-renderer.ts`

They may deserve cleanup later, but they are not the primary coupling hotspot right now.

## 5. Refactor Principles

1. Preserve behavior first, simplify second.
2. Move code before redesigning code.
3. Keep mutation side effects in one path.
4. Prefer callback-driven extraction before introducing new abstractions.
5. Keep each phase independently mergeable.
6. Add tests before moving fragile behavior.

## 6. Phase Plan

### Phase 0: Characterization tests

Add integration-oriented coverage around `MindmapView` behavior before structural extraction.

Required coverage targets:

1. dirty state and autosave scheduling
2. source file reload vs notebook file modify handling
3. selection and keyboard shortcut flows
4. search result focus flow
5. tree expand/collapse behavior
6. layout mode switch and relayout trigger
7. drag/resize marks dirty and schedules autosave
8. notebook bind/rename/moved-file sync/missing-link refresh
9. connection mode edge creation flow
10. export path behavior

Exit gate:

1. focused tests for the touched behavior
2. `npm run test`
3. `npm run build`

### Phase 1: Extract toolbar and save status UI

Move DOM-heavy toolbar code out of `renderView()` while keeping callbacks owned by `MindmapView`.

Expected result:

1. `MindmapView` stops manually constructing all toolbar elements.
2. Save-status subscription updates happen through toolbar API instead of ad hoc DOM mutation.

### Phase 2: Extract context menus

Move node and edge menu assembly out of `MindmapView` and into `src/ui/context-menu.ts`.

Expected result:

1. `MindmapView` decides actions.
2. UI layer decides menu construction.

### Phase 3: Extract edit session

Centralize all mutation side effects.

Expected result:

1. history push/undo/redo become explicit session operations
2. relayout / render / markDirty / autosave ordering is no longer duplicated
3. future behavior changes touch one mutation pipeline instead of many methods

### Phase 4: Extract notebook action workflows

Move notebook-specific flows into a dedicated view helper.

Expected result:

1. notebook logic no longer spreads across unrelated view methods
2. missing-link refresh and moved-path sync have one owner

### Phase 5: Extract tree actions

Move tree-specific editing and relayout logic into a dedicated helper.

Expected result:

1. tree mode behavior is isolated from notebook and keyboard concerns
2. tree drag/drop heuristics become easier to test

### Phase 6: Extract interaction policy

Move keyboard/search/selection/connection/subtree zoom policy into a dedicated module.

Expected result:

1. interaction state transitions become explicit
2. `subtreeVirtualZoomState` reset points become easier to audit

### Phase 7: Extract renderer coordinator

Move renderer mode choice and callback assembly into a dedicated coordinator.

Expected result:

1. `MindmapView` stops being the place where all renderer callbacks are handwritten
2. adapter synchronization becomes a dedicated concern

### Phase 8: Optional renderer deduplication

Only do this if earlier phases are stable and duplication remains painful.

Potential outcome:

1. share setup and projection flow between SVG and hybrid renderers
2. keep performance measurements unchanged or better

## 7. Main Risks To Control

1. mutation ordering is behavior, not just implementation detail
2. `subtreeVirtualZoomState` is easy to break because many actions reset it
3. tree drag/drop behavior depends on layout mode, relayout timing, and settings
4. notebook flows mix vault IO, modals, focus changes, and missing-link refresh
5. renderer callback extraction can accidentally change focus/render timing

## 8. Verification Matrix Per Phase

For every phase that touches `src/view/mindmap-view.ts` or extracted collaborators, verify:

1. selection still works
2. keyboard shortcuts still work
3. tree expand/collapse still works
4. semantic zoom still works
5. drag/resize still marks dirty and autosaves
6. notebook bind/rename/sync still works
7. missing-link warnings still update
8. search still highlights and focuses
9. minimap still updates
10. export still writes files

Also run:

1. focused tests for touched behavior
2. `npm run test`
3. `npm run build`

## 9. Concrete Implementation Backlog

This backlog is intentionally file-by-file and phase-by-phase so work can be split into small safe PRs.

### Phase 0 backlog: characterization coverage

#### `src/test/mindmap-view.test.ts`

1. Create a new integration-style test file for `MindmapView`.
2. Add tests for keyboard shortcuts that currently live in `handleCanvasKeydown()`.
3. Add tests for layout mode switching and relayout invocation.
4. Add tests for dirty state transitions on edit, save, and save failure.
5. Add tests for vault modify handling when the source `.naotu` file changes.
6. Add tests for notebook-linked file modify handling and missing-link refresh.
7. Add tests for connection mode edge creation.

#### `src/test/obsidian-stub.ts`

1. Extend the stub with any missing `ItemView`, `WorkspaceLeaf`, `Menu`, vault, and file-manager behavior needed by new view tests.
2. Keep the stub minimal and only add surface actually required by tests.

#### `src/test/test-fixtures.ts`

1. Add helper fixtures for `MindmapDocument`, source file objects, notebook file objects, and prewired test app/workspace scaffolding.
2. Add helpers to reduce repeated setup in `mindmap-view.test.ts`.

### Phase 1 backlog: toolbar extraction

#### New file: `src/ui/mindmap-toolbar.ts`

1. Create a toolbar factory or class that renders the toolbar DOM.
2. Accept callbacks for add, layout switches, open, save, export, connect, and search.
3. Expose save-status updates through a small API instead of direct DOM access.
4. Preserve current Chinese UI labels.

#### `src/view/mindmap-view.ts`

1. Remove inline toolbar creation from `renderView()`.
2. Replace it with a toolbar collaborator call.
3. Keep all behavior identical by passing existing methods as callbacks.
4. Keep focus and connection-mode behavior unchanged.

#### `src/test/mindmap-view.test.ts`

1. Add or update tests that prove toolbar actions still call the expected view behavior.
2. Add a save-status update assertion if practical.

### Phase 2 backlog: context menu extraction

#### `src/ui/context-menu.ts`

1. Replace the placeholder export with real node-menu and edge-menu builders.
2. Accept node kind, capabilities, and callbacks instead of direct document ownership.
3. Preserve current menu labels and ordering.

#### `src/view/mindmap-view.ts`

1. Remove inline menu construction from `openContextMenu()` and `openEdgeContextMenu()`.
2. Keep only capability lookup and callback plumbing if still needed.
3. Delegate menu assembly to `src/ui/context-menu.ts`.

#### `src/test/mindmap-view.test.ts`

1. Add or update tests for node context menu actions that affect document state.
2. Add or update tests for edge delete action.

### Phase 3 backlog: edit session extraction

#### New file: `src/view/mindmap-edit-session.ts`

1. Create a dedicated session object around `MindmapDocumentStore`, `HistoryManager`, `DirtyStateManager`, and `DebouncedAutosave`.
2. Move the semantics of `commitHistory()`, `undo()`, `redo()`, `applyDocumentChange()`, and `applyReplacedDocument()` into this module.
3. Preserve options such as `commitHistory`, `relayout`, `render`, and `autosave`.
4. Expose a small API that the view and later helpers can use.

#### `src/view/mindmap-view.ts`

1. Stop owning history/autosave/dirty mutation logic directly.
2. Construct and use the edit session.
3. Keep save/flush behavior on `onClose()` and manual save identical.

#### `src/core/history.ts`

1. Leave the core implementation unchanged unless extraction reveals a minimal API gap.
2. If needed, only make narrow naming or helper improvements.

#### `src/core/dirty-state.ts`

1. Leave unchanged unless a tiny API addition clearly simplifies session extraction.

#### `src/test/mindmap-view.test.ts`

1. Add or update tests that assert mutation side-effect ordering stays stable.
2. Cover undo/redo after extraction.

#### Optional new file: `src/test/mindmap-edit-session.test.ts`

1. Add focused tests if the session module becomes sufficiently independent to test directly.

### Phase 4 backlog: notebook action extraction

#### New file: `src/view/mindmap-notebook-actions.ts`

1. Extract notebook-related workflows from `MindmapView`.
2. Own create notebook, bind existing file, open notebook, rename notebook-backed node, disconnect notebook, sync moved paths, and refresh missing links.
3. Accept collaborators such as `NotebookService`, app, source path getter, renderer hooks, and edit session callbacks.

#### `src/view/mindmap-view.ts`

1. Remove notebook workflow methods or reduce them to thin delegates.
2. Keep node selection, focus, and force-detail behavior unchanged.

#### `src/core/notebook-service.ts`

1. Keep as the domain service for notebook file operations.
2. Only extract additional pure helpers here if notebook-action code reveals duplication that belongs in core rather than view.

#### `src/core/missing-link-detector.ts`

1. Keep unchanged unless a very small API improvement is needed for cleaner notebook-action integration.

#### `src/test/notebook-service.test.ts`

1. Add cases only if extraction exposes currently-untested service semantics.

#### `src/test/mindmap-view.test.ts`

1. Add or update coverage for notebook create/bind/open/rename/disconnect flows.
2. Add or update coverage for moved-file sync and missing-link warning refresh.

### Phase 5 backlog: tree action extraction

#### New file: `src/view/mindmap-tree-actions.ts`

1. Extract relayout, layout mode switching, add child/sibling, tree toggle, and tree drop-resolution workflows.
2. Own the bridge between `TreeLayoutEngine`, `tree-editing.ts`, and the edit session.
3. Keep tree-mode and free-mode behavior distinct.

#### `src/view/mindmap-view.ts`

1. Remove tree-specific workflow methods or reduce them to delegates.
2. Keep renderer drag hooks and selection coordination behavior unchanged.

#### `src/core/tree-editing.ts`

1. Consider extracting any pure helper from `MindmapView.resolveTreeDrop()` only if it becomes clearly testable and reused.
2. Do not force a move if it makes the phase larger.

#### `src/core/tree-layout.ts`

1. Keep behavior unchanged.
2. Only touch if a tiny API clarification helps the extraction boundary.

#### `src/test/tree-editing.test.ts`

1. Add cases if tree action extraction reveals missing coverage around reparent/reorder behavior.

#### `src/test/mindmap-view.test.ts`

1. Add or update tests for add child, add sibling, tree toggle, and layout mode switching.
2. Add or update tests for tree drag/drop result selection.

### Phase 6 backlog: interaction policy extraction

#### New file: `src/view/mindmap-interactions.ts`

1. Extract keyboard shortcuts, search, selection helpers, connection mode state, root focus flow, and subtree semantic zoom flow.
2. Make reset rules for `subtreeVirtualZoomState` explicit and centralized.
3. Keep this module policy-oriented, not DOM-heavy.

#### `src/view/mindmap-view.ts`

1. Remove interaction-heavy methods or reduce them to delegates.
2. Keep `canvas` event binding but delegate behavior.

#### `src/core/search.ts`

1. Keep unchanged unless a tiny helper extraction improves readability.

#### `src/core/keyboard-navigation.ts`

1. Keep unchanged unless a tiny helper extraction improves reuse.

#### `src/core/subtree-semantic-zoom.ts`

1. Keep unchanged unless extraction identifies a narrow missing seam.

#### `src/test/mindmap-view.test.ts`

1. Add or update tests for keyboard navigation, search focus, and connection mode.
2. Add or update tests around subtree semantic zoom state reset behavior.

### Phase 7 backlog: renderer coordinator extraction

#### New file: `src/view/mindmap-renderer-coordinator.ts`

1. Encapsulate render mode choice and adapter construction.
2. Own callback assembly passed to `SvgMindmapRenderer` or `HybridMindmapRenderer`.
3. Own adapter synchronization calls for search results, missing notebook ids, connection state, and focus hooks.
4. Keep `MinimapRenderer` and `PerformanceDebugOverlay` integration behavior unchanged.

#### `src/view/mindmap-view.ts`

1. Stop directly instantiating renderers in `renderView()`.
2. Delegate renderer wiring to the coordinator.
3. Keep view-level lifecycle ownership of mount/unmount.

#### `src/renderer/renderer-adapter.ts`

1. Review whether a tiny adapter contract clarification helps the coordinator.
2. Only change the interface if it clearly reduces branching and does not ripple unnecessarily.

#### `src/renderer/svg-mindmap-renderer.ts`

1. Avoid functional changes.
2. Only adapt constructor or callback shape if strictly required by the coordinator extraction.

#### `src/renderer/hybrid-mindmap-renderer.ts`

1. Avoid functional changes.
2. Only adapt constructor or callback shape if strictly required by the coordinator extraction.

#### `src/test/mindmap-view.test.ts`

1. Add or update tests that verify render mode choice does not break interaction behavior.
2. Add or update tests for minimap/debug hook continuity if practical.

### Phase 8 backlog: optional renderer deduplication

#### `src/renderer/svg-mindmap-renderer.ts`

1. Compare duplicated mount/render/projection flow with hybrid renderer.
2. Extract shared helpers only after earlier phases stabilize.

#### `src/renderer/hybrid-mindmap-renderer.ts`

1. Same as above.

#### Optional new file: `src/renderer/shared-renderer-base.ts`

1. Introduce only if duplication is still painful and the shared shape is obvious.
2. Keep performance characteristics measurable before and after.

#### `src/test/semantic-projection.test.ts`

1. Keep as a guardrail against accidental projection regressions during renderer cleanup.

#### `src/test/projected-node-renderer.test.ts`

1. Add cases only if renderer deduplication exposes missing behavior coverage.

## 10. Suggested PR Split

1. PR1: Phase 0 test harness and `mindmap-view.test.ts`
2. PR2: toolbar extraction
3. PR3: context menu extraction
4. PR4: edit session extraction
5. PR5: notebook action extraction
6. PR6: tree action extraction
7. PR7: interaction policy extraction
8. PR8: renderer coordinator extraction
9. PR9: optional renderer deduplication

## 11. Definition Of Done

The refactor is complete when:

1. `src/view/mindmap-view.ts` is substantially smaller and mostly orchestration
2. document mutation side effects are centralized
3. notebook/tree/interaction/render coordination each have explicit owners
4. the new view-level tests cover the previously fragile flows
5. all phases pass `npm run test` and `npm run build`
6. manual cross-feature checks still pass
