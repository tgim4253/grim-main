# Agent Instructions

## Repository Overview

- This is a pnpm-powered monorepo for the Grim desktop application.
- The desktop UI lives in `apps/desktop/src` and is built with React 19, TypeScript, Tailwind CSS, and Zustand state stores that are shared from `packages/stores`.
- Shared front-end packages (UI components, hooks, utilities, dnd helpers, and types) reside under `packages/*` and are consumed through the `@tgim/*` path aliases defined in `tsconfig.base.json` and `apps/desktop/vite.config.ts`.
- The Tauri backend is implemented in Rust under `apps/desktop/src-tauri` with commands registered in `src-tauri/src/commands`, domain logic organized under `src-tauri/src/services`, and SQLx migrations located in `src-tauri/migrations`.
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
- Reuse shared Zustand stores from `@tgim/stores` instead of creating duplicate state containers; extend the existing stores when new state is required.
- Prefer functional React components with hooks, matching the patterns already in `packages/ui` and `apps/desktop/src`.
- When adding shared UI, export it from `packages/ui/src/index.ts` and keep Tailwind classes aligned with the design tokens declared in `packages/ui/src/styles` and `apps/desktop/tailwind.config.ts`.
- Keep TypeScript definitions in `packages/types` synchronized with any new IPC payloads or domain models you introduce.

## Rust & Tauri Guidelines

- Place new Tauri commands in the appropriate module under `apps/desktop/src-tauri/src/commands` and register them in the `tauri::generate_handler!` macro inside `src-tauri/src/main.rs`.
- Encapsulate business logic in the service layer (`apps/desktop/src-tauri/src/services`) and prefer returning `anyhow::Result` for rich error information.
- Update SQLx migrations in `apps/desktop/src-tauri/migrations` when adjusting the SQLite schema, and keep `dev.db` in sync if the development database needs seed data.
- Leverage helper utilities in `apps/desktop/src-tauri/src/utils` (e.g., path helpers, identifiers) rather than reimplementing similar functionality.
- Only use sqlx!(macro). Do not use sqlx.

## Localisation Workflow

- Update `scripts/translations.xlsx` when adding or modifying user-facing strings.
- Regenerate locale JSON files with `pnpm translate` (which runs `scripts/translator.mjs`) so that `apps/desktop/public/locales/{en,ko,jp}/` stays current.
- Verify that `apps/desktop/src/i18n.js` lists the namespace and locale you added before using the translations.

## Dependency Policy

- Avoid introducing new npm/pnpm or Cargo dependencies without prior team approval. Prefer using and extending the utilities already provided in this repository.
