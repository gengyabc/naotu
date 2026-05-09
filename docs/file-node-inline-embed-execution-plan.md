# File Node Inline Embed Execution Plan

## Goal

Allow editing a normal text node into an image or Excalidraw-backed file node by typing `![[` in the inline title editor.

This is an inline conversion flow, not a new standalone node type.

## Final Product Decisions

1. Do not add a new `image` or `excalidraw` node kind.
2. Do not keep the node as `text` after a file is chosen.
3. Reuse the existing `kind: "notebook"` capability chain for now, but treat it as a file-backed node in product behavior.
4. Choosing an image or Excalidraw file must not create a new `.md` file.
5. Trigger syntax is `![[`, but persisted `node.notebook.link` and `node.link` remain plain `[[...]]` links for compatibility with existing link resolution.
6. Media/Excalidraw nodes keep a hidden fallback `title` in the document model. That title must be the leaf filename including extension, for example `diagram.excalidraw.md` or `photo.png`.
7. When the bound file is deleted or can no longer be resolved, the node automatically converts back to `kind: "text"`, clears file binding, and keeps the fallback title as its visible text.
8. While editing, if the input starts with `![[`, the suggestion list must show only supported image and Excalidraw files.
9. If the editor is in `![[` mode and the user commits without choosing a candidate, the commit is blocked.
10. After choosing a candidate, the node must immediately display embedded preview content and no visible text content.

## Supported File Types

Phase 1 must support these image extensions exactly:

- `png`
- `jpg`
- `jpeg`
- `gif`
- `webp`
- `svg`
- `avif`
- `bmp`

Phase 1 must recognize Excalidraw targets using this exact rule set:

1. Any file path ending with `.excalidraw`
2. Any file path ending with `.excalidraw.md`
3. Any markdown file whose frontmatter contains truthy `excalidraw-plugin`

If a file matches neither image nor Excalidraw rules, it must not appear in the `![[` inline picker.

## Data Contract

### Existing kind

Keep `MindmapNode.kind` unchanged:

- `"text"`
- `"notebook"`

### Extend `NotebookBinding`

Add this field in `src/types/mindmap.ts`:

```ts
export interface NotebookBinding {
  link: string;
  path?: string;
  targetType: "file" | "heading" | "block";
  targetKind?: "markdown" | "image" | "excalidraw";
}
```

Rules:

1. Existing documents without `targetKind` are treated as `markdown`.
2. New image bindings write `targetKind: "image"`.
3. New Excalidraw bindings write `targetKind: "excalidraw"`.
4. Existing markdown notebook creation and rebinding writes `targetKind: "markdown"`.
5. Media and Excalidraw bindings always use `targetType: "file"`.

### Title persistence

For media and Excalidraw file nodes:

1. `title` stores leaf filename including extension.
2. Renderer hides that title at preview detail levels.
3. If the binding is removed automatically because the target disappears, the node converts to `text` and continues using the same title value.

This avoids needing any extra `fallbackTitle` field.

### Link persistence

Do not persist `![[...]]` into `node.link` or `node.notebook.link`.

Persist plain file links:

```ts
node.notebook.link = "[[photo.png]]"
node.link = "[[photo.png]]"
```

`![[` is only an editor trigger and a preview-rendering concern.

## Size Contract

The user requested direct preview plus "notebook medium size".

The current renderer only shows notebook preview content at detail levels 4 and 5, whose visual size is `360x300`. Current detail level 3 (`240x96`) is too small to satisfy direct preview.

To remove ambiguity, implementation must use this exact interpretation:

1. On first bind to image or Excalidraw, set `customWidth = 360` and `customHeight = 300`.
2. Force detail level 5 after binding so the preview is visible immediately.
3. Keep existing notebook resize behavior unchanged.

## Interaction State Machine

### States

1. `idle`
2. `editing-text`
3. `editing-file-embed`
4. `file-candidate-active`
5. `binding-file`
6. `commit-blocked`
7. `committed-text`
8. `committed-file-node`
9. `cancelled`

### Entry

1. Double click node title.
2. Open existing `InlineTitleEditor`.
3. If node is `text`, start in `editing-text`.
4. If node is file-backed `notebook`, start in plain text editing with the visible input value equal to current title. Do not prefill `![[...]]`.

### Transitions

#### `editing-text` -> `editing-file-embed`

When the current raw input, after `trimStart()`, starts with `![[`.

Side effects:

1. Hide notebook length warning.
2. Open an inline suggestion popover anchored to the input.
3. Suggestion source must contain only supported image and Excalidraw files.
4. Normal text commit path is suspended.

#### `editing-file-embed` -> `file-candidate-active`

When the filtered list has at least one result.

Side effects:

1. Arrow up/down moves the highlighted row.
2. Enter chooses the highlighted row.
3. Mouse click chooses the clicked row.
4. Escape closes the editor entirely, same as current cancel.

#### `editing-file-embed` -> `commit-blocked`

When the user presses Enter or the input blurs before choosing a candidate.

Side effects:

1. Do not close the editor.
2. Show inline validation message: `请选择一个图片或 Excalidraw 文件`.
3. Keep focus in the input.

#### `file-candidate-active` -> `binding-file`

When a candidate is chosen.

Side effects:

1. Close the suggestion popover.
2. Disable duplicate commit while binding.
3. Call the file-binding action.

#### `binding-file` -> `committed-file-node`

When binding succeeds.

Side effects:

1. Convert node from `text` to `notebook`.
2. Set `title` to leaf filename including extension.
3. Set `notebook.link` and `link` to plain `[[...]]` file link.
4. Set `notebook.path` to chosen file path.
5. Set `notebook.targetKind` to `image` or `excalidraw`.
6. Set `customWidth = 360`, `customHeight = 300`.
7. Refresh missing-link state.
8. Select the node, focus it, and force detail 5.

#### `editing-text` -> `committed-text`

When the user commits a non-empty value and the input is not in file-embed mode.

Behavior remains current behavior.

#### Any editing state -> `cancelled`

When Escape is pressed.

Behavior remains current behavior.

## UI Rendering Rules

### Node renderer

For `targetKind: "markdown"`:

1. Keep current notebook title and markdown preview behavior.

For `targetKind: "image" | "excalidraw"`:

1. At detail levels below preview threshold, keep existing notebook shell behavior.
2. At detail levels 4 and 5, hide title text entirely.
3. Hide summary badge entirely.
4. Render embedded preview content only.
5. Keep resize handle behavior.
6. Open button text changes from `Open md` to `Open file` for all file-backed nodes.

### Preview renderer

Current markdown notebook preview flow reads markdown lines from the target file and renders them via `MarkdownRenderer`.

Media/Excalidraw preview must use a separate branch:

1. Resolve the target file from `notebook.link` and `notebook.path`.
2. If not found, treat as missing.
3. Build preview markdown as exactly `![[${file.path}]]`.
4. Call `MarkdownRenderer.render(app, previewMarkdown, wrapper, sourcePath, child)`.
5. Do not use line-based incremental loading for media/Excalidraw targets.
6. Use the mindmap source file path as the markdown render source path for embed resolution stability.

This is the simplest way to get both image and Excalidraw embedded rendering through Obsidian instead of implementing custom preview HTML.

## File/Vault Lifecycle Rules

### Rename or move

Existing `rename` handling already refreshes notebook links.

Required behavior after this feature:

1. Renamed or moved image/Excalidraw files stay bound.
2. `syncNotebookPathIfMoved` continues updating `notebook.path`.
3. If the rename changes the leaf filename, also update node `title` for `targetKind !== "markdown"` so fallback title remains accurate.

### Modify

Existing `modify` handling already clears preview cache and rerenders.

Required behavior after this feature:

1. Modified image/Excalidraw files rerender preview.

### Delete

This feature requires new vault delete handling in `src/main.ts`.

Implementation requirement:

1. Register `this.app.vault.on("delete", async (file) => { ... })`.
2. For every open `MindmapView`, detect whether the deleted file backs a file node.
3. If yes, convert that node to `text` immediately.
4. Clear `notebook`, `link`, `customWidth`, and `customHeight` only if they were introduced for file binding.
5. Keep `title` unchanged.
6. Mark dirty, refresh missing-link state, rerender, and autosave.

Do not rely on missing-link warnings alone. The product decision is automatic reversion to text.

## File-by-File Execution Plan

### 1. `src/types/mindmap.ts`

Add `targetKind?: "markdown" | "image" | "excalidraw"` to `NotebookBinding`.

No migration file is required because absence means `markdown`.

### 2. `src/core/file-node-support.ts`

Create a new pure helper module with these exported functions:

```ts
export type SupportedFileNodeTargetKind = "image" | "excalidraw";

export function parseFileNodeEmbedInput(input: string): { query: string } | null;
export function getSupportedFileNodeTargetKind(path: string): SupportedFileNodeTargetKind | null;
export function isSupportedFileNodeTargetPath(path: string): boolean;
export function getFileNodeTitle(path: string): string;
export function buildEmbeddedPreviewMarkdown(path: string): string;
```

This file should stay pure and heavily unit tested.

### 3. `src/ui/file-suggest-modal.ts`

Keep existing markdown modal as-is.

Add a second file picker class for media/Excalidraw if needed for context-menu rebinding later. Do not force the inline editor to reuse modal UX.

### 4. `src/renderer/inline-title-editor.ts`

This file is the main state-machine host.

Required changes:

1. Track raw input value separately from commit value.
2. Detect file-embed mode using `parseFileNodeEmbedInput`.
3. Mount an inline suggestion list under the input.
4. Filter candidates by supported target kind and current query substring.
5. Block Enter and blur commit when in file-embed mode without a chosen candidate.
6. Add a new callback contract for chosen file candidates.

Recommended callback shape:

```ts
onCommitText: (value: string) => Promise<void> | void;
onCommitFile: (file: TFile, targetKind: "image" | "excalidraw") => Promise<void> | void;
```

Do not overload a single string callback for this.

### 5. `src/renderer/shared-mindmap-renderer-base.ts`

Pass `app` and a dedicated file-commit callback into `InlineTitleEditor`.

### 6. `src/view/mindmap-view.ts`

Split current `handleInlineTitleCommit` into:

```ts
private async handleInlineTextCommit(id: string, title: string): Promise<void>
private async handleInlineFileCommit(id: string, file: TFile, targetKind: "image" | "excalidraw"): Promise<void>
```

`handleInlineFileCommit` must:

1. Find the node.
2. If node is not `text`, either reject or convert only if product explicitly wants rebinding through title edit. Phase 1 should reject and do nothing for non-text nodes.
3. Delegate to a new `MindmapNotebookActions.bindExistingFileNode(...)` action.

### 7. `src/view/mindmap-notebook-actions.ts`

Add:

```ts
bindExistingFileNode(id: string, file: TFile, targetKind: "image" | "excalidraw"): void;
handleDeletedBoundFile(file: TFile): void;
```

`bindExistingFileNode` must:

1. Require current node kind `text`.
2. Commit history first.
3. Patch node to `kind: "notebook"`.
4. Set title to leaf filename including extension.
5. Set `notebook.link`, `notebook.path`, `notebook.targetType = "file"`, `notebook.targetKind`.
6. Set `link` to same plain `[[...]]` link.
7. Set `customWidth = 360`, `customHeight = 300`.
8. Refresh missing state and focus preview.

`handleDeletedBoundFile` must:

1. Find all bound nodes resolving to the deleted file path.
2. Convert each to `text`.
3. Keep title unchanged.
4. Remove `notebook` and `link`.
5. Remove `customWidth` and `customHeight`.

### 8. `src/core/notebook-service.ts`

Add helper methods instead of duplicating patch logic in view layer:

```ts
bindExistingFileNode(file: TFile, targetKind: "markdown" | "image" | "excalidraw"): Partial<MindmapNode>
disconnectFileNode(node: MindmapNode): Partial<MindmapNode>
```

Rules:

1. For markdown targets, keep current basename title behavior.
2. For image/excalidraw targets, use leaf filename including extension.
3. `disconnectFileNode` for media/excalidraw preserves title and returns `kind: "text"`.

### 9. `src/renderer/projected-node-renderer.ts`

Branch rendering by `node.notebook?.targetKind ?? "markdown"`.

Required behavior:

1. Markdown nodes keep current title and description behavior.
2. Image/Excalidraw nodes hide title and description when preview is visible.
3. Open button label becomes `Open file`.

### 10. `src/renderer/notebook-preview-renderer.ts`

Split into two render paths:

1. Markdown path: current behavior.
2. Embedded file path: render `![[${file.path}]]` through `MarkdownRenderer`.

Suggested API change:

```ts
renderNotebookPreview({
  app,
  foreignObject,
  link,
  sourcePath,
  storedPath,
  targetKind,
  previewHeight,
  component,
})
```

### 11. `src/ui/context-menu.ts`

Rename user-facing notebook wording to file wording where it refers to generic file-backed nodes.

Phase 1 menu wording:

1. `创建 notebook` stays as-is for the markdown-note creation command.
2. `选择已有 notebook...` becomes `选择已有文件...` only if the command is widened to any file.
3. `预览 notebook` becomes `预览文件`.
4. `重新选择 notebook...` becomes `重新选择文件...`.
5. `转为普通节点` stays unchanged.

### 12. `src/main.ts`

Add a vault delete listener and call a new view handler, for example:

```ts
this.app.vault.on("delete", async (file) => {
  if (!(file instanceof TFile)) return;
  for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)) {
    const view = leaf.view;
    if (view instanceof MindmapView) await view.handleVaultDelete(file);
  }
})
```

### 13. Tests

Add or update at least these tests:

1. `src/test/file-node-support.test.ts`
2. `src/test/notebook-preview-renderer.test.ts`
3. `src/test/projected-node-renderer.test.ts`
4. `src/test/mindmap-view.test.ts`
5. `src/test/notebook-service.test.ts`

## Edge Conditions

1. Input exactly `![[`
Behavior: enter file-embed mode with empty query and show all supported targets.

2. Input `  ![[cat`
Behavior: leading spaces are ignored for mode detection, query is `cat`.

3. Input contains `![[` in the middle, like `hello ![[cat`
Behavior: stay in normal text mode. Only `trimStart().startsWith("![[")` triggers file mode.

4. No matching files
Behavior: show empty suggestion state, keep editor open, block commit.

5. Blur while in file mode without selection
Behavior: block commit and keep focus.

6. User chooses a file and the file is deleted before patching completes
Behavior: binding action re-resolves the file path. If missing, abort binding and keep editor open with error.

7. Existing markdown notebook node title edit
Behavior: unchanged.

8. Existing image/Excalidraw file node title edit
Phase 1 behavior: unchanged plain text rename is not allowed through inline title editing because the title is hidden and is internal fallback state. Double-click title should either do nothing at preview detail levels or open a future rebind flow. Do not silently rename media files.

9. Search indexing
Behavior: search continues using `title`, which for media nodes is the filename with extension.

10. Export behavior
Behavior: existing SVG/PNG export continues to render current visible DOM; no separate export change is required in phase 1.

11. Path conflicts
Behavior: binding stores `notebook.path`, so same-name files in different folders stay stable.

12. Missing `targetKind` on old documents
Behavior: treated as markdown.

## Acceptance Criteria

### Inline trigger

1. Double-click a text node title.
2. Type `![[`.
3. Only supported image and Excalidraw files appear.
4. Markdown notes and other files do not appear.

### Selection and conversion

1. Choose `assets/photo.png`.
2. The text node becomes a file-backed node.
3. No markdown file is created.
4. The node immediately shows image preview.
5. No visible title text remains in preview mode.

### Excalidraw

1. Choose an Excalidraw file.
2. The node immediately shows Excalidraw embedded preview.
3. Opening the node opens the bound file.

### Blocking

1. Enter `![[cat` without choosing a suggestion.
2. Press Enter.
3. The editor does not close.
4. The node is not modified.

### Delete fallback

1. Bind a node to `photo.png`.
2. Delete that file from the vault.
3. The node automatically becomes `kind: "text"`.
4. The node title becomes visible as `photo.png`.
5. There is no stale preview UI.

### Rename fallback consistency

1. Bind a node to `diagram.excalidraw.md`.
2. Rename the file to `diagram-v2.excalidraw.md`.
3. The binding still works.
4. The fallback title updates to `diagram-v2.excalidraw.md`.

## Suggested Implementation Order

1. Add `targetKind` type support with backward-compatible reads.
2. Add pure helper module and tests.
3. Split preview renderer into markdown vs embedded-file path.
4. Add bind/disconnect patch helpers in `NotebookService` and `MindmapNotebookActions`.
5. Add vault delete handling.
6. Add inline editor file-embed state machine and picker UI.
7. Update node renderer to hide text for media targets.
8. Finish integration tests and run full test suite plus `tsc --noEmit`.

## Verification Commands

```bash
npx vitest run src/test/file-node-support.test.ts
npx vitest run src/test/notebook-preview-renderer.test.ts
npx vitest run src/test/mindmap-view.test.ts
npm run test
npm run build
tsc --noEmit
```
