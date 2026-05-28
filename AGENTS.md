# AGENTS.md

## Project

Obsidian plugin "MindCanvas 思维画布" (`mindcanvas`). Mindmaps saved as `.naotu` JSON files.

## Commands

- `npm run dev` — esbuild watch (no typecheck)
- `npm run build` — `tsc --noEmit --skipLibCheck` THEN esbuild production
- `npm run test` — vitest run
- `npm run test:watch` — vitest watch
- Single test: `npx vitest run src/test/<file>.test.ts`
- `obsidian` module aliased to `src/test/obsidian-stub.ts` in vitest

## Workflow

After every code change, run in order:
1. `npx tsc --noEmit` — catch type errors
2. `npm run test` — catch regressions
3. `npm run build` — verify production bundle

### Bug fixing
- Add/extend regression test before or alongside code change. Create `src/test/<name>.test.ts` if no suitable file exists.
- Check [DEVELOPMENT.md](./DEVELOPMENT.md) for similar past issues when stuck.
- Keep domain logic in `src/core/` testable. Avoid adding new behavior directly in view/render wiring.

### Hotspots (extra care needed)
- `src/view/mindmap-view.ts` — main integration hub, easy to regress
- Changes spanning `src/view/` + `src/renderer/` + `src/core/` — tight verification
- `src/core/semantic-projection.ts` — changes ripple to rendering and zoom

### Mandatory manual checks for cross-feature changes
- Selection and keyboard shortcuts still work
- Tree expand/collapse and semantic zoom behave correctly
- Dragging/resizing marks document dirty and autosaves
- Notebook binding, rename, moved-file sync, missing-link warnings work
- Search, minimap, export render correctly

## Architecture

```
src/
├── main.ts              — entrypoint, registers view/commands/settings
├── constants.ts         — view type, defaults, template
├── core/                — domain logic (50 modules)
│   ├── data: document-store, document-migration, versioning, id, autosave, dirty-state, history
│   ├── layout: tree-layout, tree-control, tree-editing, hierarchy
│   ├── projection: semantic-projection, semantic-zoom-policy, detail-level, subtree-semantic-zoom, focus
│   ├── relaxation: layout-collision, layout-relaxation
│   ├── render-mode: render-mode, render-partition, performance-monitor, viewport-culling, tile-index
│   ├── notebook: notebook-service, notebook-content-extractor, notebook-size, obsidian-link, missing-link-detector, preview-cache
│   ├── file-node: file-node-support, file-dimensions
│   ├── text: text-layout, font-size, branch-color
│   ├── interaction: keyboard-navigation, selection, search, edge-routing, screen-transform, geometry
│   ├── import: mindmap-from-markdown, markdown-heading-parser, local-knowledge-map, sample-data
│   └── infra: accessibility, command-registry, error-boundary, i18n, sanitize-filename, telemetry-disabled
├── renderer/            — SVG/Canvas/hybrid renderers (11 files)
│   shared-mindmap-renderer-base, svg-mindmap-renderer, hybrid-mindmap-renderer,
│   canvas-background-renderer, projected-node-renderer, projected-edge-renderer,
│   notebook-preview-renderer, text-markdown-renderer, inline-title-editor,
│   minimap-renderer, renderer-adapter
├── view/                — ItemView + extracted subsystems (6 files)
│   mindmap-view, mindmap-edit-session, mindmap-interactions,
│   mindmap-notebook-actions, mindmap-tree-actions, mindmap-renderer-coordinator
├── types/               — mindmap.ts, renderer.ts, settings.ts
├── ui/                  — settings-tab, context-menu, mindmap-toolbar, error-notice,
│                          debug-overlay, performance-debug-overlay, file-suggest-modal,
│                          mindmap-file-suggest-modal
├── migrations/          — migration-runner.ts
└── test/                — tests + obsidian-stub.ts + test-fixtures.ts (31 test files)
```

## Build specifics

- esbuild bundles `src/main.ts` → `main.js`; `obsidian` is external (provided at runtime)
- Target: ES2018, CommonJS
- `main.js` and `data.json` are gitignored
- `d3` is bundled as runtime dependency

## Conventions

- Default node titles and UI strings in Chinese (e.g. `"中心主题"`, `"新节点"`)
- `styles.css` at repo root — Obsidian loads it automatically, do not move into `src/`
- Plugin ID: `semantic-zoom-mindmap`, view type: `semantic-zoom-mindmap-view`, file extension: `.naotu`
- No linter or formatter configured
