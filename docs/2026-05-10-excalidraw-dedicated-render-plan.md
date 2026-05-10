# Excalidraw Dedicated Render Plan(TODO)

## Background

Current notebook preview rendering uses `MarkdownRenderer.render()` for all embedded file nodes, including Excalidraw.

For images this is acceptable because Obsidian's native image embed respects container-driven resizing reasonably well.

For Excalidraw this is not sufficient. The Excalidraw plugin intercepts the markdown embed, exports its own SVG or image representation, and applies its own sizing rules based on the drawing's actual content bounds and plugin settings. As a result:

- mindmap node size can grow
- embed syntax can include larger width and height hints
- CSS can try to stretch the rendered output
- but the Excalidraw plugin may still clamp or regenerate the rendered result to its own preferred size

This means the current architecture cannot guarantee continuous scaling of Excalidraw notebook nodes.

## Root Cause

The root issue is not in our node sizing logic. It is that we delegate final Excalidraw rendering to the Excalidraw markdown embed pipeline.

Current path:

1. `projected-node-renderer` computes preview frame size.
2. `notebook-preview-renderer` calls `MarkdownRenderer.render()` with `![[file|widthxheight]]`.
3. The Excalidraw plugin processes that embed and produces a rendered DOM subtree.
4. The Excalidraw plugin's export and sizing logic decides the effective size.

Because step 4 is outside our control, we cannot make Excalidraw previews scale freely just by changing CSS or embed syntax.

## Goal

Render Excalidraw notebook nodes through a dedicated render path that we control end-to-end, so node size directly determines preview size.

Expected result:

- Excalidraw node preview always fills the notebook preview frame
- enlarging the node enlarges the Excalidraw preview continuously
- shrinking the node shrinks the preview continuously
- preview aspect ratio remains tied to the drawing's aspect ratio when desired by node sizing logic
- markdown notebook previews remain unchanged
- image notebook previews remain on the existing path unless a later simplification combines them

## Chosen Direction

Add a dedicated Excalidraw renderer that bypasses `MarkdownRenderer` for `targetKind === "excalidraw"`.

Instead of embedding `![[file]]`, we will:

1. locate the Excalidraw plugin instance from Obsidian's loaded plugins
2. resolve the target file
3. request SVG output from the Excalidraw plugin API if available
4. inject the returned SVG directly into the notebook preview wrapper
5. normalize the SVG by removing fixed width and height constraints when necessary
6. size the injected SVG to the preview frame under our control

Fallback behavior:

- if Excalidraw plugin API is unavailable or rendering fails, show a preview error placeholder
- optionally fall back to the old markdown embed path only if we decide degraded behavior is preferable to no preview

## Implementation Plan

### 1. Add Excalidraw integration helper

Create a small integration module, likely under `src/core/` or `src/renderer/`, responsible for:

- discovering the Excalidraw plugin instance from `app.plugins.plugins`
- validating the API surface we rely on
- rendering a file to SVG using the plugin API

Possible API paths to probe:

- plugin methods exposed directly on the plugin instance
- a loaded `ExcalidrawView` for the file if one exists
- utility methods such as `getSVG()` or `createSVG()` if exposed by the plugin runtime

This helper should hide plugin-specific shape checks from the notebook preview renderer.

### 2. Add dedicated Excalidraw render branch

Update `src/renderer/notebook-preview-renderer.ts`:

- keep markdown path as-is
- keep image path using markdown embed or simplify later if needed
- add a dedicated Excalidraw branch before markdown embed rendering

Behavior for the Excalidraw branch:

- resolve the file path
- request SVG markup or SVG element from the helper
- clear previous child content
- insert the SVG directly into the wrapper
- apply explicit sizing styles on the inserted root SVG element

### 3. Normalize SVG sizing

When injecting Excalidraw SVG output:

- inspect root `svg`
- preserve `viewBox`
- remove or override `width` and `height` attributes if they block scaling
- set CSS so the SVG fills the preview frame

Desired styling:

- `width: 100%`
- `height: 100%`
- `display: block`
- optionally `preserveAspectRatio` handling if the SVG needs explicit alignment behavior

### 4. Cache and invalidation

Extend current preview cache behavior so Excalidraw preview rerenders when:

- file content changes
- preview frame width or height changes
- relevant plugin output changes after refresh

Avoid introducing a second independent cache unless needed.

### 5. Error handling

If Excalidraw rendering fails:

- do not break the whole node render pass
- show a targeted preview placeholder such as `无法预览 Excalidraw`
- log enough detail in code comments or console only if already consistent with project style

### 6. Tests

Add focused tests for:

- selecting Excalidraw dedicated path instead of markdown embed path
- rendering SVG output into wrapper
- rerendering when preview size changes
- preserving notebook node resize behavior
- handling unavailable plugin API gracefully

Most tests will likely live in `src/test/notebook-preview-renderer.test.ts` with mocked plugin API responses.

## Scope Notes

This plan intentionally does not:

- change markdown notebook preview behavior
- refactor image notebook preview unless required
- depend on Excalidraw auto-export files
- add persistent new document schema unless necessary

## Risks

1. Excalidraw plugin API may not be stable across versions.
2. The plugin may expose different methods depending on whether a view is open.
3. SVG output may include assumptions about host DOM or theme.
4. If the plugin only exposes async view-bound APIs, we may need a temporary hidden view or a different integration point.

## Verification

Minimum verification after implementation:

1. Bind an Excalidraw file to a notebook node.
2. Confirm initial preview renders.
3. Resize the node larger multiple times and verify preview keeps enlarging.
4. Resize the node smaller and verify preview shrinks correctly.
5. Reopen the mindmap file and verify preview still renders.
6. Run focused tests plus full `npm run test` and `npm run build`.

## Success Criteria

The work is complete when Excalidraw notebook previews are no longer limited by the Excalidraw markdown embed pipeline and instead scale continuously with the node preview frame under our direct control.
