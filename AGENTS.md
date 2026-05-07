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

## Architecture

- `src/main.ts` — plugin entrypoint, registers view/commands/settings
- `src/core/` — domain logic (tree layout, semantic zoom, document store, history, search, notebook service, etc.)
- `src/renderer/` — SVG, Canvas, hybrid renderers; node/edge projection; minimap; export
- `src/view/mindmap-view.ts` — Obsidian `ItemView` subclass, wires renderers to DOM
- `src/types/` — shared type definitions (`mindmap.ts`, `renderer.ts`, `settings.ts`)
- `src/ui/` — settings tab, context menu, modals
- `src/migrations/` — document version migrations
- `src/test/` — tests and `obsidian-stub.ts` / `test-fixtures.ts`

## Build specifics

- esbuild bundles `src/main.ts` → `main.js`; `obsidian` module is **external** (provided by Obsidian at runtime)
- Target: ES2018, CommonJS
- `main.js` and `data.json` are gitignored (build output and Obsidian settings data)
- `d3` is a runtime dependency, not dev — it's bundled into `main.js` by esbuild

## Conventions

- Default node titles and UI strings are in Chinese (e.g. `"中心主题"`, `"新节点"`)
- `styles.css` at repo root is the plugin CSS — Obsidian loads it automatically, do not move into `src/`
- Plugin ID: `semantic-zoom-mindmap`, view type: `semantic-zoom-mindmap-view`, file extension: `.naotu`
