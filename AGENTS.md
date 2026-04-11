# Agent Instructions

## Repository Overview

- This is a pnpm-powered monorepo for the Grim desktop application.
- The desktop UI lives in `apps/desktop/src` and is built with React 19, TypeScript, token-driven CSS, and app-local Zustand state.
- Shared front-end code now lives directly under `apps/desktop/src/shared` instead of `packages/*`.
- The Tauri backend is implemented in Rust under `apps/desktop/src-tauri` with commands registered through `tauri::generate_handler!` in `src-tauri/src/lib.rs`, domain logic organized under `src-tauri/src/services`, domain models split under `src-tauri/src/models`, and SQLx migrations located in `src-tauri/migrations`.
- Localisation strings are generated from `scripts/translations.xlsx` into `apps/desktop/public/locales/*/*.json` via the translation script in `scripts/translator.mjs`.

## Getting Started

1. Install dependencies with `pnpm install` (pnpm 10.x is expected by the workspace).
2. Launch the desktop app during development with `pnpm dev`, which proxies to `pnpm --filter @grim/desktop dev` (Tauri dev server).
3. For one-off front-end builds run `pnpm --filter @grim/desktop build`; use `pnpm --filter @grim/desktop tauri build` for a full Tauri bundle.
4. The Rust toolchain (Rustup, Cargo, and the targets required by Tauri) must be installed locally before running the desktop application.

## Required Quality Checks

- Run `pnpm lint` to enforce the workspace ESLint configuration (`eslint.config.js`).
- Run `pnpm format:write` to apply the shared Prettier rules defined in `.prettierrc.json`.
- Ensure the front-end compiles by executing `pnpm --filter @grim/desktop build`.
- For the Rust backend, run `cargo fmt --all` and `cargo clippy --all-targets -- -D warnings` from `apps/desktop/src-tauri` before committing.
- Execute any additional targeted checks (for example `cargo test` once tests exist, or package-level `pnpm --filter <package> build`) that are relevant to the files you modify.

## TypeScript & React Guidelines

- Follow the existing feature-first structure inside `apps/desktop/src/features` when adding new UI flows, and colocate supporting hooks/utilities under the nearest `lib` or `types` folder when practical.
- Reuse existing app-local Zustand stores instead of creating duplicate state containers when new state is required.
- Prefer functional React components with hooks, matching the patterns already in `apps/desktop/src`.
- When adding shared UI, place it under `apps/desktop/src/shared/ui` and keep styles aligned with the app-local design token CSS.
- Keep TypeScript definitions in `apps/desktop/src/shared/types` synchronized with any new IPC payloads or domain models you introduce.

## Rust & Tauri Guidelines

- Place new Tauri commands in the appropriate module under `apps/desktop/src-tauri/src/commands` and register them in the `tauri::generate_handler!` macro inside `src-tauri/src/lib.rs`.
- Encapsulate business logic in the service layer (`apps/desktop/src-tauri/src/services`) and prefer returning `anyhow::Result` for rich error information.
- Keep the command layer thin and wire commands directly to the relevant domain service when possible. Use `LibraryService` only for library snapshot aggregation or cross-domain read composition.
- Update SQLx migrations in `apps/desktop/src-tauri/migrations` when adjusting the SQLite schema, and keep `dev.db` in sync if the development database needs seed data.
- Leverage helper utilities in `apps/desktop/src-tauri/src/utils` (e.g., path helpers, identifiers) rather than reimplementing similar functionality.
- Only use sqlx!(macro). Do not use sqlx.

## Localisation Workflow

- Update `scripts/translations.xlsx` when adding or modifying user-facing strings.
- Regenerate locale JSON files with `pnpm translate` (which runs `scripts/translator.mjs`) so that `apps/desktop/public/locales/{en,ko,jp}/` stays current.
- Verify that `apps/desktop/src/i18n.js` lists the namespace and locale you added before using the translations.

## Dependency Policy

- Avoid introducing new npm/pnpm or Cargo dependencies without prior team approval. Prefer using and extending the utilities already provided in this repository.

## Figma Workflow

- Treat the files under `docs/` as the local reference layer for Figma work before making live MCP calls.
- Start Figma-oriented tasks by checking `docs/figma-snapshot-meta.json` to see whether the local snapshot is current enough to trust.
- Use `docs/figma-component-snapshot.json` and `docs/figma-component-inventory.md` for stable component structure, naming, and reuse decisions.
- Use `docs/figma-component-map.json` plus the specialized `docs/figma-component-map.*.json` files as the cached node-ID and board-location index when navigating an existing library.
- Use `docs/figma-design-tokens.target.json` as the intended token structure, and compare with `docs/figma-design-tokens.origin.json`, `docs/figma-design-tokens.diff.json`, and `docs/figma-design-tokens.dirty.json` when reconciling token drift.
- Treat all snapshot and map files as cached guidance, not source of truth. If a task mutates structure, tokens, variants, or placement, verify the target nodes in live Figma before writing.

## Figma Editing Rules

- Prefer updating an existing page, section, board, or component set recorded in the component map instead of creating a new top-level area.
- Before creating a new reusable component, check the component inventory and component map first to avoid duplicating an existing primitive, shared, or local asset.
- When a component belongs to an existing family such as `Icon`, `IconButton`, `Modal`, or similar sets, extend that set instead of creating a parallel set unless the user explicitly wants a new family.
- Keep Figma writes incremental and atomic. Make one structural change per `use_figma` call, then validate with metadata or screenshots before continuing.
- After changing reusable component structure or naming, update the corresponding docs snapshot or inventory files in the same task when practical.

## Figma Tool Call Pattern

- Prefer low-cost reads first: use `get_metadata` for hierarchy and node discovery, `get_screenshot` for visual confirmation, and `get_variable_defs` for variable inspection.
- Use `get_design_context` when a node needs implementation-level context or code-oriented structure beyond raw metadata.
- Use `use_figma` only after the target location, existing component family, and token dependencies are understood.
- After every meaningful Figma write, re-run `get_metadata` or `get_screenshot` on the changed node to confirm the result instead of assuming the mutation worked as intended.
- If a `use_figma` script fails, assume no mutation happened, fix the script, and retry with a narrower change rather than broadening the write.

## Figma Call Logging

- Track Figma MCP usage in `docs/figma-call-log.json` whenever a task makes non-trivial live Figma reads or writes.
- Log the date, a short task label, estimated call count, confidence, and whether the count came from direct assistant tracking or a rough local estimate.
- Include failed atomic `use_figma` attempts in the log when they consumed calls, but note clearly that they did not mutate the file.
- If a task substantially changes component structure, token topology, or board layout, also update `docs/figma-snapshot-meta.json` so later agents know the local snapshot may be stale.
