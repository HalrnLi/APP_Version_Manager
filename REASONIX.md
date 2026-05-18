# REASONIX.md — APP Version Manager

An Obsidian plugin (desktop-only) for managing APP version planning and associated project information. UI is Chinese-language. Data stored as markdown files with YAML frontmatter.

## Stack

- **Language**: TypeScript 4.7.4 (target ES6, ESNext modules)
- **Framework**: Obsidian Plugin API (`obsidian` latest)
- **Bundler**: esbuild 0.17 (`esbuild.config.mjs`)
- **Test**: Vitest 1.6 with jsdom environment
- **Key dep**: `xlsx` for Excel import/export

## Layout

- **`src/main.ts`** — Plugin entry point. Registers view, commands, settings tab, injects CSS.
- **`src/view/`** — UI views: DualPane, Kanban, Table, Gantt, plus modals.
- **`src/services/`** — DataService (file I/O + cache), BackupService, ImportExportService, TodoService.
- **`src/utils/`** — DataCache, frontmatter parser, id/date/link utils, project sorting logic.
- **`src/types.ts`** — All entity types, progress stages, date parsing helpers.
- **`tests/`** — Test files (some colocated in `src/` as `*.test.ts`).
- **`main.js`** — Bundled output (generated, do not edit by hand).

## Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | esbuild watch mode (no typecheck) |
| `npm run build` | `tsc --noEmit --skipLibCheck` + esbuild production bundle |
| `npm run test` | `vitest run` |
| `npm run test:watch` | `vitest` (watch mode) |
| `npm run deploy` | Build then copy `main.js` + `manifest.json` to local Obsidian plugins dir |
| `npm run version` | Bump version, stage manifest + versions.json |

## Conventions

- **Naming**: PascalCase for classes/components, camelCase for functions/variables. Files match export name.
- **Exports**: Named exports for utility functions; default export for plugin class (`AppVersionManagerPlugin`).
- **Tests**: Vitest with `describe`/`it`/`expect` globals. Files named `*.test.ts` — both in `tests/` and colocated in `src/`.
- **Data**: Entities stored as markdown files with YAML frontmatter via custom parser (not Obsidian metadata cache). Files named `{sanitizedName}__{id}.md`.
- **Concurrency**: Every entity has a `version` field. `ConcurrencyConflictError` thrown on mismatch.
- **Null safety**: Optional string fields use `''` (not `undefined`) as "no value". Use `|| ''` in frontmatter construction.
- **Date parsing**: `parseDateInput` in `types.ts` handles Chinese formats + `MM.DD`.
- **Progress history**: Stored as `"stageName@timestamp"` strings in frontmatter.
- **Modal buttons**: Confirm on left, cancel on right — use `createActionButtons`/`createSaveButtons` from `ModalUtils.ts`.
- **Settings**: Obsidian `loadData`/`saveData`. Configurable: data path, backup path, progress stages, overdue warning days.

## Watch out for

- **Dual-path I/O**: DataService supports both vault-relative paths (Obsidian `vault` API) and absolute filesystem paths (Node `fs`). Every path is branched via `isAbsolutePath()`.
- **5s cache**: DataService has an in-memory cache with 5-second TTL. Call `this.cache.invalidate(key)` after mutations, or reads return stale data.
- **main.js is generated**: Edit `src/main.ts`, not `main.js`. The build output overwrites it.
- **No lint/format**: No ESLint, Prettier, or EditorConfig configured. Only `.vscode/settings.json` exists (sets `chat.agent.maxRequests`).
- **tsconfig excludes tests**: `src/**/*.test.ts` and `tests/` are excluded from `tsc` compilation but included by Vitest via `vitest.config.ts`.
