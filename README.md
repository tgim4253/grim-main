# Grim Desktop Monorepo

- [English](./README.md) | [한국어](./README.ko.md)

> Organize your reference materials with virtual folders and a graph view, and make your gesture drawing practice more effective with the **‘Croquis Window’** that pins selected images at the top. You can also add notes to each drawing, making it easy to capture feedback.

## Recommended Toolchain

- **Node.js 20.x** · Matches the versions in `.nvmrc`/`.node-version`; run `nvm use` (or your asdf equivalent) to align before installing dependencies.
- **pnpm 10.13.1** · Workspace package manager pinned via the root `packageManager` field.
- **Tauri CLI ^2.7.1 & Rust Toolchain** · Required to build and run the desktop bundle and execute Rust commands.

## Project Highlights

- **Cross-platform desktop**: Tauri + Rust deliver a lightweight, secure runtime.
- **React 19 UI**: Built with React, TypeScript, and Tailwind CSS for fast, responsive interfaces.
- **Shared state management**: Zustand stores live under `@tgim/stores` and power multiple apps.
- **Modular architecture**: Shared UI, hooks, utilities, DnD helpers, and types are organised under `packages/*`.

## Repository Overview

```
apps/desktop/        # Tauri front end and Rust backend
apps/api-server/     # API server resources
packages/ui          # Shared UI components
packages/stores      # Global Zustand stores
packages/hooks       # Custom React hooks
packages/utils       # Utility functions and helpers
packages/dnd         # Drag & Drop helpers
packages/types       # Shared type definitions and models
scripts/             # Translation and other automation scripts
```

## Quick Start

1. **Install dependencies**
   ```bash
   pnpm install
   ```
2. **Start the desktop dev server**
   ```bash
   pnpm dev
   ```
   > Internally runs `pnpm --filter @grim/desktop dev` to launch the Tauri development server.
3. **Create a production build**
   ```bash
   pnpm --filter @grim/desktop build
   ```
4. **Generate a Tauri bundle**
   ```bash
   pnpm --filter @grim/desktop tauri build
   ```

## Root Script Reference

| Command             | Description                                                               |
| ------------------- | ------------------------------------------------------------------------- |
| `pnpm dev`          | Launches the desktop development server (proxies to `@grim/desktop dev`). |
| `pnpm build:front`  | Produces a static React/Vite build for the desktop front end.             |
| `pnpm build`        | Runs `tauri build` to bundle the full desktop application.                |
| `pnpm tauri`        | Passthrough helper for arbitrary `tauri` CLI commands.                    |
| `pnpm lint:ts`      | Executes ESLint with auto-fix for TypeScript sources.                     |
| `pnpm lint:rs`      | Runs `cargo clippy` (all targets) against the Rust backend.               |
| `pnpm lint`         | Runs both TypeScript and Rust lint suites.                                |
| `pnpm lint:fix`     | Re-runs TS lint with auto-fix and Rust lint with the `--fix` flag.        |
| `pnpm lint:check`   | Executes ESLint without auto-fix to surface issues quickly.               |
| `pnpm format`       | Checks formatting via Prettier and `cargo fmt --check`.                   |
| `pnpm format:write` | Applies formatting with Prettier and `cargo fmt`.                         |
| `pnpm translate`    | Regenerates locale JSON from `scripts/translator.mjs`.                    |

## Quality Checklist

| Goal                       | Command                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| Enforce ESLint rules       | `pnpm lint:check`                                                                                     |
| Apply workspace formatting | `pnpm format:write`                                                                                   |
| Rust formatting & linting  | `cargo fmt --all` & `cargo clippy --all-targets -- -D warnings` _(run from `apps/desktop/src-tauri`)_ |

## Development Tips

- Follow the feature-first folder layout within `apps/desktop/src/features` when shipping new UI flows.
- Extend shared Zustand stores from `@tgim/stores` instead of creating duplicates.
- Export shared UI components from `packages/ui/src/index.ts` and align Tailwind classes with the shared design tokens.
- Update `scripts/translations.xlsx` and run `pnpm translate` whenever you touch user-facing copy.

## Tech Stack

- **Front end**: React 19, TypeScript, Tailwind CSS
- **Desktop shell**: Tauri, Rust, SQLx
- **Localisation**: i18next with an automated translation pipeline (`scripts/translator.mjs`)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for commit conventions and contribution workflow.

## License

This project is licensed under the terms of [LICENSE](./LICENSE).
