# AGENTS.md

## Project

Obsidian plugin: "Semantic Zoom Mindmap" (`semantic-zoom-mindmap`). Mindmaps saved as `.naotu` JSON files with nodes/edges.

## Commands

```bash
npm run dev          # esbuild watch (no typecheck)
npm run build        # tsc --noEmit --skipLibCheck THEN esbuild production
npm run test         # vitest run
npm run test:watch   # vitest watch
```

- **Build order matters**: `build` runs typecheck first; `dev` does NOT typecheck. Run `tsc --noEmit` manually after dev-session changes.
- No linter or formatter is configured.

## Testing

Vitest aliases `obsidian` to `src/test/obsidian-stub.ts`. This stub is minimal — extend it when tests need more Obsidian API surface.

Run a single test: `npx vitest run src/test/<file>.test.ts`

## Stability workflow

- When fixing a bug, add or extend a regression test in the nearest existing test file before or alongside the code change. If no suitable test file exists, create one in `src/test/` for the touched behavior.
- If the change touches `src/view/mindmap-view.ts`, treat it as integration-sensitive work. Verify both automated coverage and the user flow you changed.
- If the change touches renderer or projection code, run the most relevant focused tests plus `npm run test` before finishing.
- After any `npm run dev` session or incremental edit, run `tsc --noEmit` before considering the work stable.
- Prefer small diffs that keep domain logic in `src/core/` testable. Avoid adding new behavior directly into view/render wiring when it can live in a pure helper.
- Do not close a bugfix after only reproducing it manually. Capture the solved case in a test so the same issue does not re-enter through a later diff.

Manual checks for cross-feature UI changes:

- Selection and keyboard shortcuts still work.
- Tree expand/collapse and semantic zoom still behave correctly.
- Dragging/resizing still marks the document dirty and autosaves.
- Notebook binding, rename, moved-file sync, and missing-link warnings still behave correctly.
- Search, minimap, and export still render after the change.

## Architecture

- `src/main.ts` — plugin entrypoint, registers view/commands/settings
- `src/core/` — domain logic (tree layout, semantic zoom, document store, history, search, notebook service, etc.)
- `src/renderer/` — SVG, Canvas, hybrid renderers; node/edge projection; minimap; export
- `src/view/mindmap-view.ts` — Obsidian `ItemView` subclass, wires renderers to DOM
- `src/types/` — shared type definitions (`mindmap.ts`, `renderer.ts`, `settings.ts`)
- `src/ui/` — settings tab, context menu, modals
- `src/migrations/` — document version migrations
- `src/test/` — tests and `obsidian-stub.ts` / `test-fixtures.ts`

Hotspots:

- `src/view/mindmap-view.ts` is the main integration hub and is easy to regress with broad edits.
- Changes that span `src/view/`, `src/renderer/`, and `src/core/` deserve extra skepticism and a tighter verification loop.

## Build specifics

- esbuild bundles `src/main.ts` → `main.js`; `obsidian` module is **external** (provided by Obsidian at runtime)
- Target: ES2018, CommonJS
- `main.js` and `data.json` are gitignored (build output and Obsidian settings data)
- `d3` is a runtime dependency, not dev — it's bundled into `main.js` by esbuild

## Conventions

- Default node titles and UI strings are in Chinese (e.g. `"中心主题"`, `"新节点"`)
- `styles.css` at repo root is the plugin CSS — Obsidian loads it automatically, do not move into `src/`
- Plugin ID: `semantic-zoom-mindmap`, view type: `semantic-zoom-mindmap-view`, file extension: `.naotu`
