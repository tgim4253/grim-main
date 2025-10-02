# Contributing to Grim

## Development Environment

- **Node.js & pnpm**: Use Node.js 20+ with **pnpm 10.x** (workspace expectation). Install dependencies with `pnpm install`. If the registry blocks scoped packages (e.g., `GET https://registry.npmjs.org/@eslint%2Fjs: Forbidden - 403`), request access to the npm registry or configure the proper auth token before continuing.
- **Rust toolchain**: Install Rustup, Cargo, and the Tauri targets required by the desktop app before building the Rust backend.
- **Common scripts**:
  - `pnpm dev` — launches the desktop app (delegates to `pnpm --filter @grim/desktop dev`).
  - `pnpm --filter @grim/desktop build` — builds the front-end bundle.
  - `pnpm --filter @grim/desktop tauri build` — generates a production Tauri bundle.

## Code Quality Checklist

Run these commands before submitting a pull request:

1. `pnpm lint:check`
   - Ensures the workspace ESLint rules are satisfied.
   - **If it fails**: install dependencies (`pnpm install`) and resolve lint errors reported in the output. Authentication issues when downloading ESLint packages must be fixed before retrying.
2. `pnpm format:write`
   - Although the generic checklist references `pnpm format`, the repository-specific guidance in `AGENTS.md` takes precedence, so run the write-mode formatter.
   - **If it fails**: fix formatting issues and rerun. If the formatter cannot be installed, confirm registry credentials.
3. `pnpm --filter @grim/desktop build`
   - Verifies the React desktop app compiles successfully.
   - **If it fails**: address TypeScript build errors or missing assets reported by Vite.
4. `cargo fmt --all`
   - Preferred over `cargo fmt --all -- --check` per `AGENTS.md`. Use `-- --check` only when you must avoid writing changes (e.g., in CI).
   - **If it fails**: install the Rust toolchain or nightly features required by the workspace `rustfmt.toml`.
5. `cargo clippy --all-targets -- -D warnings`
   - Ensures the Rust backend is free of Clippy warnings treated as errors.
   - **If it fails**: follow the diagnostic output to resolve lint violations; install missing toolchain components if necessary.

> ℹ️ When repository documentation conflicts with automated tooling options, always follow `AGENTS.md`. Update the tooling commands (or their flags) in your workflow to match the agent instructions.

## Localisation Workflow

1. Update `scripts/translations.xlsx` with new or modified strings.
2. Run `pnpm translate` to regenerate JSON locale files via `scripts/translator.mjs`.
3. Verify the generated files under `apps/desktop/public/locales/**/` and ensure the required namespaces are listed in `apps/desktop/src/i18n.js` before consuming the new keys.

## Front-end & State Management Guidelines

- **React & Tailwind**: Build feature-first components under `apps/desktop/src/features`, reuse shared styles from `packages/ui/src/styles`, and prefer functional components with hooks. Align Tailwind utility usage with the design tokens defined in `apps/desktop/tailwind.config.ts` and shared UI packages.
- **Zustand stores**: Extend or reuse the shared stores exposed via `@tgim/stores` (located in `packages/stores`) instead of duplicating state containers.
- **Type definitions**: Keep shared types in `packages/types` synchronized with new IPC payloads or domain models introduced in the Tauri backend.

### Further Reading

- React docs: <https://react.dev/learn>
- Tailwind CSS docs: <https://tailwindcss.com/docs>
- Zustand docs: <https://docs.pmnd.rs/zustand/getting-started/introduction>
- Tauri commands: <https://tauri.app/v1/guides/features/command>
- SQLx migrations: <https://docs.rs/sqlx/latest/sqlx/macro.migrate!.html>

By following these practices, you align with the repository-specific workflow and keep the monorepo healthy for every contributor.
