I checked the current `main` repo. Some problems are exactly as Obsidian reported, and some look partially fixed but still likely to be flagged.

The repo currently has:

* `src/core/autosave.ts` still falls back to `globalThis.setTimeout / clearTimeout`, which matches the Obsidian warning. ([GitHub][1])
* `src/renderer/notebook-preview-renderer.ts` now wraps `querySelectorAll` in a helper, but still calls `wrapper.querySelectorAll(selector)`, so the deprecation warning can still appear. ([GitHub][2])
* `src/renderer/projected-node-renderer.ts` uses untyped D3 drag events around `.filter`, `.on("start")`, `.on("drag")`, and `.on("end")`; the risky places are `event.target` and `event.sourceEvent?.stopPropagation()`. ([GitHub][3])
* `src/ui/context-menu.ts` no longer visibly has `const self = this`; it uses arrow class fields now, so the “aliasing this” warning may already be fixed on `main`. ([GitHub][4])
* `styles.css` still has many `!important` rules around embedded previews and search input styling, and still has duplicate `.mindmap-text-markdown-wrapper a` selectors. ([GitHub][5])

## Concrete implementation plan for the next LLM

### Goal

Fix all Obsidian review warnings without changing user-visible behavior:

```text
npm run build
npm test
```

must pass, and the Obsidian review warnings should be gone.

---

# Phase 1 — Fix `globalThis` in autosave

## File

`src/core/autosave.ts`

## Problem

Current fallback uses:

```ts
globalThis.setTimeout
globalThis.clearTimeout
```

Obsidian specifically warns against this because plugins should use `window` or `activeWindow` for popout compatibility. The file already imports `getActiveWindow`, so this should be a small fix.

## Required change

Replace the current `getTimerWindow()` with a version that only uses `activeWindow` first, then `window` as fallback. Do not use `globalThis`.

Suggested implementation:

```ts
type TimerWindow = Pick<Window, "setTimeout" | "clearTimeout">;

function getTimerWindow(): TimerWindow {
  try {
    const activeWin = getActiveWindow();

    if (
      activeWin &&
      typeof activeWin.setTimeout === "function" &&
      typeof activeWin.clearTimeout === "function"
    ) {
      return activeWin;
    }
  } catch {
    // activeWindow may not be available in test environment
  }

  if (
    typeof window !== "undefined" &&
    typeof window.setTimeout === "function" &&
    typeof window.clearTimeout === "function"
  ) {
    return window;
  }

  return {
    setTimeout,
    clearTimeout,
  };
}
```

## Acceptance check

Search result must be empty:

```bash
grep -R "globalThis" src
```

---

# Phase 2 — Remove deprecated `querySelectorAll`

## File

`src/renderer/notebook-preview-renderer.ts`

## Problem

The current helper still does this:

```ts
Array.from(wrapper.querySelectorAll(selector))
```

That avoids repetition, but not the Obsidian warning.

## Required change

Use Obsidian’s DOM extension method `findAll()` instead of `querySelectorAll()`.

Replace:

```ts
const queryAll = (selector: string): HTMLElement[] => {
  if (typeof wrapper.querySelectorAll !== "function") return [];
  return Array.from(wrapper.querySelectorAll(selector));
};
```

with:

```ts
const findAllInWrapper = (selector: string): HTMLElement[] => {
  return wrapper.findAll(selector);
};
```

Then replace all calls:

```ts
queryAll(...)
```

with:

```ts
findAllInWrapper(...)
```

Example:

```ts
findAllInWrapper(baseSelectors.join(", ")).forEach((element) => {
  element.classList.add("mindmap-embedded-preview-content");
});
```

For SVG elements, do not type the result as only `HTMLElement` if TypeScript complains. Use this safer version:

```ts
const findAllInWrapper = (selector: string): Element[] => {
  return wrapper.findAll(selector);
};
```

Then keep operations that exist on `Element`:

```ts
element.classList.add(...);
element.removeAttribute("width");
element.removeAttribute("height");
```

## Acceptance check

Search result must be empty:

```bash
grep -R "querySelectorAll" src
```

---

# Phase 3 — Fix unsafe D3 event typing

## File

`src/renderer/projected-node-renderer.ts`

## Problem

The warnings around lines 199–237 are caused by D3 event objects being treated as `any`. The risky parts are:

```ts
event.target
event.sourceEvent?.stopPropagation()
```

Current code has D3 drag callbacks but does not strongly type the drag behavior enough. ([GitHub][3])

## Required change

Add helper functions near the top of the file:

```ts
function getEventTarget(event: unknown): EventTarget | null {
  return event instanceof Event ? event.target : null;
}

function stopEventPropagation(event: unknown): void {
  if (event instanceof Event) {
    event.stopPropagation();
  }
}
```

Then change D3 drag construction to strongly type the element and datum.

Replace:

```ts
const dragBehavior = d3
  .drag()
```

with:

```ts
const dragBehavior = d3
  .drag<SVGGElement, ProjectedNode>()
```

Then replace the filter:

```ts
.filter((event) => canDragNodes(args.layoutMode) && shouldStartNodeDrag(event.target))
```

with:

```ts
.filter((event: Event) =>
  canDragNodes(args.layoutMode) && shouldStartNodeDrag(getEventTarget(event))
)
```

For drag callbacks, replace:

```ts
event.sourceEvent?.stopPropagation();
```

with:

```ts
stopEventPropagation(event.sourceEvent);
```

Do the same for resize drag:

```ts
const resizeBehavior = d3.drag<SVGGElement, ProjectedNode>()
```

and replace all `event.sourceEvent?.stopPropagation()` usages.

## Important

Do not use `as any`. The goal is to remove unsafe access, not hide it.

## Acceptance checks

Run:

```bash
npm run build
npm test
```

Then search manually:

```bash
grep -R "sourceEvent?.stopPropagation" src
grep -R "event.target" src/renderer/projected-node-renderer.ts
grep -R "as any" src/renderer/projected-node-renderer.ts
```

Expected:

* no `sourceEvent?.stopPropagation`
* no unsafe `event.target` in the D3 drag filter
* no new `as any`

---

# Phase 4 — Confirm or fix context menu `this` aliasing

## File

`src/ui/context-menu.ts`

## Current status

The current `main` version already uses class arrow fields:

```ts
private onDocumentPointerDown = (event: Event): void => { ... };
private onWindowBlur = (): void => this.close();
private onKeydown = (event: KeyboardEvent): void => { ... };
```

I did not see the old pattern like:

```ts
const self = this;
```

So this warning may already be fixed on `main`. ([GitHub][4])

## Required check

Search:

```bash
grep -R "const .* = this" src/ui/context-menu.ts
grep -R "let .* = this" src/ui/context-menu.ts
```

If found, replace with arrow functions or direct method binding.

## Acceptance check

No aliasing pattern remains.

---

# Phase 5 — Remove duplicate CSS selector

## File

`styles.css`

## Problem

There are two separate blocks for:

```css
.mindmap-text-markdown-wrapper a
```

One only sets pointer events, the other sets color and text decoration. ([GitHub][5])

## Required change

Merge them into one block.

Replace the two blocks with:

```css
.mindmap-text-markdown-wrapper a {
  pointer-events: auto;
  color: var(--text-accent);
  text-decoration: none;
}
```

Keep the hover block:

```css
.mindmap-text-markdown-wrapper a:hover {
  text-decoration: underline;
}
```

## Acceptance check

This command should return only one selector definition, plus hover if included:

```bash
grep -n "\.mindmap-text-markdown-wrapper a" styles.css
```

Expected:

```text
.mindmap-text-markdown-wrapper a {
.mindmap-text-markdown-wrapper a:hover {
```

---

# Phase 6 — Remove `!important` from search input CSS

## File

`styles.css`

## Problem

This block currently uses `!important`:

```css
.mindmap-search-wrapper input[type="text"] {
  border: none !important;
  background: transparent !important;
  padding: 0 !important;
  min-width: 140px !important;
}
```

It appears around the toolbar/search area. ([GitHub][5])

## Required change

Use higher selector specificity instead of `!important`.

Replace with:

```css
.semantic-mindmap-toolbar .mindmap-search-wrapper input[type="text"] {
  border: none;
  background: transparent;
  padding: 0;
  min-width: 140px;
}
```

If Obsidian’s default input style still wins, add properties that remove browser/Obsidian defaults without `!important`:

```css
.semantic-mindmap-toolbar .mindmap-search-wrapper input[type="text"] {
  border: none;
  box-shadow: none;
  background: transparent;
  padding: 0;
  min-width: 140px;
}
```

## Acceptance check

No `!important` remains in that search-input block.

---

# Phase 7 — Remove `!important` from embedded preview CSS

## File

`styles.css`

## Problem

Most remaining `!important` rules are in embedded file preview styles, especially:

```css
.mindmap-preview-wrapper.is-embedded-file .image-embed
.mindmap-preview-wrapper.is-embedded-file .mindmap-embedded-preview-content
.mindmap-preview-wrapper.is-embedded-file .mindmap-embedded-preview-media
.mindmap-preview-wrapper.is-embedded-file[data-target-kind="excalidraw"] ...
```

These currently force width, height, margin, padding, display, etc. ([GitHub][5])

## Required strategy

Do not fight Obsidian/Excalidraw styles with `!important`. Instead:

1. Increase selector specificity.
2. Prefer your own classes added by TypeScript:

   * `.mindmap-embedded-preview-content`
   * `.mindmap-embedded-preview-media`
3. Use CSS variables already being set from TypeScript:

   * `--mindmap-embed-width`
   * `--mindmap-embed-height`

## Replace embedded preview CSS with this shape

```css
.mindmap-preview-wrapper.is-embedded-file {
  overflow: hidden;
  padding: 0;
  background: transparent;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
}

.mindmap-preview-wrapper.is-embedded-file > * {
  margin: 0;
}

.mindmap-preview-wrapper.is-embedded-file .internal-embed,
.mindmap-preview-wrapper.is-embedded-file .markdown-embed,
.mindmap-preview-wrapper.is-embedded-file .media-embed,
.mindmap-preview-wrapper.is-embedded-file .image-embed {
  margin: 0;
  padding: 0;
  border: 0;
  box-shadow: none;
  background: transparent;
  max-width: none;
}

.mindmap-preview-wrapper.is-embedded-file .mindmap-embedded-preview-content,
.mindmap-preview-wrapper.is-embedded-file .mindmap-embedded-preview-media {
  width: var(--mindmap-embed-width, 100%);
  height: var(--mindmap-embed-height, 100%);
  max-width: none;
  max-height: none;
  min-width: 0;
  min-height: 0;
  margin: 0;
  padding: 0;
}

.mindmap-preview-wrapper.is-embedded-file .mindmap-embedded-preview-media {
  display: block;
}

.mindmap-preview-wrapper.is-embedded-file[data-target-kind="excalidraw"] .internal-embed,
.mindmap-preview-wrapper.is-embedded-file[data-target-kind="excalidraw"] .markdown-embed,
.mindmap-preview-wrapper.is-embedded-file[data-target-kind="excalidraw"] .media-embed,
.mindmap-preview-wrapper.is-embedded-file[data-target-kind="excalidraw"] .image-embed,
.mindmap-preview-wrapper.is-embedded-file[data-target-kind="excalidraw"] .mindmap-embedded-preview-content {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
}

.mindmap-preview-wrapper.is-embedded-file img,
.mindmap-preview-wrapper.is-embedded-file svg,
.mindmap-preview-wrapper.is-embedded-file canvas {
  display: block;
  margin: 0;
}

.mindmap-preview-wrapper.is-embedded-file[data-target-kind="image"] img,
.mindmap-preview-wrapper.is-embedded-file[data-target-kind="image"] svg,
.mindmap-preview-wrapper.is-embedded-file[data-target-kind="image"] canvas,
.mindmap-preview-wrapper.is-embedded-file[data-target-kind="excalidraw"] img,
.mindmap-preview-wrapper.is-embedded-file[data-target-kind="excalidraw"] svg,
.mindmap-preview-wrapper.is-embedded-file[data-target-kind="excalidraw"] canvas,
.mindmap-preview-wrapper.is-embedded-file[data-target-kind="excalidraw"] svg.excalidraw-svg,
.mindmap-preview-wrapper.is-embedded-file[data-target-kind="excalidraw"] img.excalidraw-svg,
.mindmap-preview-wrapper.is-embedded-file[data-target-kind="excalidraw"] [class^="excalidraw-svg"] img,
.mindmap-preview-wrapper.is-embedded-file[data-target-kind="excalidraw"] [class*=" excalidraw-svg"] img {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
```

## Important warning

Removing `!important` may slightly change embedded image/Excalidraw preview sizing. After this phase, manually test:

1. Markdown notebook preview.
2. Image node preview.
3. Excalidraw node preview.
4. Resize notebook node.
5. Zoom in/out with preview visible.

If embedded previews regress, do not re-add `!important`. Instead, add one more wrapper class from TypeScript and increase specificity.

Example:

```ts
wrapper.classList.add("mindmap-preview-normalized");
```

Then target:

```css
.mindmap-preview-wrapper.is-embedded-file.mindmap-preview-normalized ...
```

---

# Phase 8 — Final review cleanup

Run:

```bash
grep -R "globalThis" src
grep -R "querySelectorAll" src
grep -R "as any" src
grep -n "!important" styles.css
grep -n "\.mindmap-text-markdown-wrapper a" styles.css
npm run build
npm test
```

Expected result:

* no `globalThis`
* no `querySelectorAll`
* no new `as any`
* no `!important`
* only one normal `.mindmap-text-markdown-wrapper a` block plus hover
* build passes
* tests pass

---

## Single prompt you can give to the implementation LLM

```text
You are fixing Obsidian community plugin review warnings in this repo.

Warnings to fix:
1. Avoid globalThis in src/core/autosave.ts.
2. Avoid deprecated querySelectorAll in src/renderer/notebook-preview-renderer.ts.
3. Fix unsafe any usage around D3 drag events in src/renderer/projected-node-renderer.ts.
4. Confirm src/ui/context-menu.ts has no aliasing of this; if present, replace with arrow class fields or direct binding.
5. Remove all !important from styles.css by increasing selector specificity and using existing wrapper/classes/CSS variables.
6. Merge duplicate .mindmap-text-markdown-wrapper a selector blocks.

Implementation requirements:
- Do not introduce `as any`.
- Do not silence lint warnings with comments.
- Do not re-add !important.
- Preserve behavior for text nodes, notebook previews, image previews, Excalidraw previews, node dragging, node resizing, context menus, search input, and inline editing.
- Prefer activeWindow/window for Obsidian popout compatibility.
- Use Obsidian DOM helpers like findAll instead of querySelectorAll.
- Strongly type D3 drag behavior as d3.drag<SVGGElement, ProjectedNode>().
- Use helper functions for unknown native/source events:
  - getEventTarget(event: unknown): EventTarget | null
  - stopEventPropagation(event: unknown): void

After changes, run:
npm run build
npm test

Also run:
grep -R "globalThis" src
grep -R "querySelectorAll" src
grep -R "as any" src
grep -n "!important" styles.css
grep -n "\.mindmap-text-markdown-wrapper a" styles.css

The final result should have no Obsidian review warnings from the supplied list.
```
