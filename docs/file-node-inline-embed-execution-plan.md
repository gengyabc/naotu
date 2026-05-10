# File-Backed Node Picker Execution Plan

## Goal

Allow converting a text node into a file-backed node by reusing the existing notebook file picker flow.

The picker must support three selectable file categories:

- `图片`
- `Excalidraw`
- `notebook`

This replaces the earlier `![[` inline trigger plan.

## Final Product Decisions

1. Do not add a new `image` or `excalidraw` node kind.
2. Keep reusing `kind: "notebook"` for all file-backed nodes.
3. Do not use `![[` as a title-editor trigger.
4. The inline title editor stays a plain text editor.
5. The existing file-binding entry points reuse one shared file picker UI.
6. The file picker shows three checkbox filters: `图片`, `Excalidraw`, `notebook`.
7. Choosing an image or Excalidraw file must not create a new `.md` file.
8. Choosing a markdown notebook file binds it as a normal notebook-backed node.
9. Image and Excalidraw bindings immediately render direct embedded preview content.
10. Image and Excalidraw bindings use medium notebook preview size immediately.
11. Image and Excalidraw preview nodes hide visible title text while preview is shown.
12. File-backed image/Excalidraw nodes keep a hidden fallback `title` in the document model using the leaf filename with extension.
13. When a bound image or Excalidraw file is deleted, the node automatically converts back to `kind: "text"`, clears binding state, and keeps the fallback title visible.

## Supported File Types

### Image

Phase 1 supports these extensions exactly:

- `png`
- `jpg`
- `jpeg`
- `gif`
- `webp`
- `svg`
- `avif`
- `bmp`

### Excalidraw

Phase 1 recognizes Excalidraw targets using this rule set:

1. Any file path ending with `.excalidraw`
2. Any file path ending with `.excalidraw.md`
3. Any markdown file whose frontmatter contains truthy `excalidraw-plugin`

### Notebook

Phase 1 treats any normal markdown file that is not classified as Excalidraw as `notebook`.

## Data Contract

### Existing kind

Keep `MindmapNode.kind` unchanged:

- `"text"`
- `"notebook"`

### Notebook target kind

`NotebookBinding` includes:

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
4. New markdown notebook bindings write `targetKind: "markdown"`.
5. All three picker categories bind using `targetType: "file"`.

### Title persistence

For image and Excalidraw file nodes:

1. `title` stores the leaf filename including extension.
2. Renderer hides that title at preview detail levels.
3. If binding is removed because the target disappears, the node converts to `text` and continues using the same title value.

For markdown notebook targets:

1. Keep current basename title behavior.
2. Keep current markdown notebook rendering behavior.

### Link persistence

Persist plain file links for all file-backed nodes:

```ts
node.notebook.link = "[[photo.png]]"
node.link = "[[photo.png]]"
```

There is no persisted `![[...]]` syntax in node data.

## Size Contract

Image and Excalidraw bindings must use this exact behavior:

1. On first bind, set `customWidth = 360` and `customHeight = 300`.
2. Force detail level 5 after binding so preview is visible immediately.
3. Hide title text when preview is visible.
4. Keep existing resize behavior unchanged.

Markdown notebook bindings keep current sizing behavior.

## Interaction Model

### Entry points

1. Context menu on a text node: `选择已有文件...`
2. Context menu on a notebook node: `重新选择文件...`

Both entry points open the same shared picker UI.

### Picker behavior

1. The picker is a `FuzzySuggestModal`-based file chooser.
2. The top of the picker shows three checkboxes: `图片`, `Excalidraw`, `notebook`.
3. All three checkboxes are enabled by default.
4. Unchecking a category removes those files from the suggestion list.
5. Choosing a file derives `targetKind` automatically from file path and metadata.

### Binding outcomes

If the chosen file is `markdown`:

1. Convert the node to `kind: "notebook"`.
2. Bind to the chosen markdown file.
3. Keep current notebook title and preview behavior.

If the chosen file is `image` or `excalidraw`:

1. Convert the node to `kind: "notebook"`.
2. Set title to the leaf filename including extension.
3. Set `notebook.link`, `notebook.path`, `notebook.targetType = "file"`, `notebook.targetKind`.
4. Set `link` to the same plain `[[...]]` link.
5. Set `customWidth = 360`, `customHeight = 300`.
6. Refresh missing-link state.
7. Select the node, focus it, and force detail level 5.
8. Render embedded preview immediately with no visible title text.

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
6. Open button text becomes `Open file`.

### Preview renderer

Current markdown notebook preview flow reads markdown lines from the target file and renders them via `MarkdownRenderer`.

Image/Excalidraw preview uses a separate path:

1. Resolve the target file from `notebook.link` and `notebook.path`.
2. If not found, treat as missing.
3. Build preview markdown as exactly `![[${file.path}]]`.
4. Call `MarkdownRenderer.render(app, previewMarkdown, wrapper, sourcePath, child)`.
5. Do not use line-based incremental loading for image/Excalidraw targets.
6. Use the mindmap source file path as the markdown render source path for embed resolution stability.

## File/Vault Lifecycle Rules

### Rename or move

1. Renamed or moved image/Excalidraw files stay bound.
2. `syncNotebookPathIfMoved` continues updating `notebook.path`.
3. If the leaf filename changes and `targetKind !== "markdown"`, also update node `title`.

### Modify

1. Modified markdown notebook files rerender as before.
2. Modified image/Excalidraw files rerender preview.

### Delete

1. Register a vault delete listener in `src/main.ts`.
2. For every open `MindmapView`, detect whether the deleted file backs an image/Excalidraw node.
3. If yes, convert that node to `text` immediately.
4. Clear `notebook`, `link`, `customWidth`, and `customHeight`.
5. Keep `title` unchanged.
6. Mark dirty, refresh missing-link state, rerender, and autosave.

Do not rely on missing-link warnings alone. The product decision is automatic reversion to text for deleted image/Excalidraw bindings.

## File-by-File Execution Plan

### 1. `src/types/mindmap.ts`

Add `targetKind?: "markdown" | "image" | "excalidraw"` to `NotebookBinding`.

### 2. `src/core/file-node-support.ts`

Keep pure helper logic for supported file kinds and embedded preview markdown:

```ts
export type SupportedFileNodeTargetKind = "image" | "excalidraw";

export function getSupportedFileNodeTargetKind(path: string): SupportedFileNodeTargetKind | null;
export function isSupportedFileNodeTargetPath(path: string): boolean;
export function getFileNodeTitle(path: string): string;
export function buildEmbeddedPreviewMarkdown(path: string): string;
```

### 3. `src/ui/file-suggest-modal.ts`

Replace separate markdown/media pickers with one shared `FileBindingSuggestModal`.

Required behavior:

1. Reuse `FuzzySuggestModal`.
2. Show checkbox filters for `图片`, `Excalidraw`, `notebook`.
3. Filter candidates by selected categories.
4. Infer `targetKind` when a file is chosen.

### 4. `src/renderer/inline-title-editor.ts`

Remove the old file-embed state machine. Keep this file focused on plain text title editing only.

### 5. `src/renderer/shared-mindmap-renderer-base.ts`

Remove the dedicated inline file-commit callback path.

### 6. `src/view/mindmap-view.ts`

Keep inline title commit for text and notebook rename only. File binding no longer runs through inline title editing.

### 7. `src/view/mindmap-notebook-actions.ts`

Required behavior:

1. `bindExistingNotebook(id)` opens the shared picker.
2. `rebindNotebook(id)` opens the same shared picker.
3. Apply `targetKind`-specific patching.
4. Apply `360x300` sizing only for image/Excalidraw targets.
5. Keep delete fallback handling for file-backed image/Excalidraw nodes.

### 8. `src/core/notebook-service.ts`

Keep helper methods that centralize file binding and disconnect logic:

```ts
bindExistingFileNode(file: TFile, targetKind: "markdown" | "image" | "excalidraw"): Partial<MindmapNode>
disconnectFileNode(node: MindmapNode): Partial<MindmapNode>
```

### 9. `src/renderer/projected-node-renderer.ts`

Branch rendering by `node.notebook?.targetKind ?? "markdown"`.

### 10. `src/renderer/notebook-preview-renderer.ts`

Keep the split between markdown preview and embedded file preview.

### 11. `src/ui/context-menu.ts`

Use file wording for the generic picker actions:

1. `创建 notebook` stays for markdown-note creation.
2. `选择已有文件...`
3. `预览文件`
4. `重新选择文件...`
5. `转为普通节点` stays unchanged.

### 12. `src/main.ts`

Add vault delete handling for bound image/Excalidraw files.

### 13. Tests

Add or update at least these tests:

1. `src/test/file-node-support.test.ts`
2. `src/test/file-suggest-modal.test.ts`
3. `src/test/notebook-preview-renderer.test.ts`
4. `src/test/mindmap-view.test.ts`
5. `src/test/notebook-service.test.ts`

## Edge Conditions

1. All three filters enabled.
Behavior: show all supported markdown/image/Excalidraw targets.

2. Only `图片` enabled.
Behavior: show only supported image targets.

3. Only `Excalidraw` enabled.
Behavior: show only supported Excalidraw targets.

4. Only `notebook` enabled.
Behavior: show only normal markdown notebook targets.

5. No matching files under current filters.
Behavior: show an empty suggestion state.

6. Existing markdown notebook node title edit.
Behavior: unchanged.

7. Existing image/Excalidraw file node title edit.
Behavior: title remains hidden in preview mode; no inline file rename flow is introduced.

8. Search indexing.
Behavior: search continues using `title`, which for image/Excalidraw nodes is the filename with extension.

9. Export behavior.
Behavior: existing SVG/PNG export continues to render current visible DOM.

10. Path conflicts.
Behavior: binding stores `notebook.path`, so same-name files in different folders stay stable.

11. Missing `targetKind` on old documents.
Behavior: treated as markdown.

## Acceptance Criteria

### Picker filters

1. Open `选择已有文件...`.
2. The picker shows checkboxes for `图片`, `Excalidraw`, `notebook`.
3. Toggling a checkbox updates the candidate list immediately.

### Image selection and conversion

1. Choose `assets/photo.png`.
2. The text node becomes a file-backed node.
3. No markdown file is created.
4. The node immediately shows image preview.
5. The node uses `360x300` size.
6. No visible title text remains in preview mode.

### Excalidraw selection and conversion

1. Choose an Excalidraw file.
2. The node immediately shows Excalidraw embedded preview.
3. The node uses `360x300` size.
4. Opening the node opens the bound file.

### Markdown notebook selection

1. Choose a normal markdown file.
2. The node becomes a markdown notebook node.
3. Existing notebook title and preview behavior remain unchanged.

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
2. Keep pure helper module and tests for supported target detection.
3. Split preview renderer into markdown vs embedded-file path.
4. Centralize bind/disconnect patch helpers in `NotebookService` and `MindmapNotebookActions`.
5. Replace separate pickers with one shared file picker plus checkbox filters.
6. Remove the old inline file-embed path from the title editor and renderer contracts.
7. Update node renderer to hide text for image/Excalidraw preview nodes.
8. Add vault delete handling.
9. Finish integration tests and run full test suite plus build.

## Verification Commands

```bash
npx vitest run src/test/file-node-support.test.ts
npx vitest run src/test/file-suggest-modal.test.ts
npx vitest run src/test/notebook-preview-renderer.test.ts
npx vitest run src/test/mindmap-view.test.ts
npm run test
npm run build
```
