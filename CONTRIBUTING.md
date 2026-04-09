Here’s your **Grim Project Contribution Guide** in English (with the updates applied):

---

# Grim Project Contribution Guide

[CI](./.github/workflows/ci.yaml)

## Development Environment

- **Node.js & pnpm**: Use Node.js 20.x (run `nvm use` or the asdf equivalent to match `.nvmrc`) and **pnpm 10.x** (workspace required).
  - Install dependencies with `pnpm install`.

- **Rust Toolchain**: Install Rustup, Cargo, and Tauri targets in advance to build the Rust backend for the desktop app.

- **Common Scripts**:
  - `pnpm dev` — Run the desktop app
  - `pnpm build:front` — Build frontend bundle
  - `pnpm build` — Generate production Tauri bundle
  - `pnpm tauri` — Run Tauri development/build commands
  - `pnpm lint:ts` — Lint & auto-fix TypeScript code
  - `pnpm lint:rs` — Lint Rust code (Clippy)
  - `pnpm lint` — Run TS + RS linting together
  - `pnpm lint:check` — Check TS lint and Cargo Clippy (no auto-fix)
  - `pnpm lint:fix` — Check TS lint (auto-fix)
  - `pnpm format:check` — Check Prettier & Cargo formatting
  - `pnpm format:write` — Apply Prettier & Cargo formatting
  - `pnpm translate` — Run translation script

---

## Code Quality Checklist

Before submitting a PR, run the following:

1. `pnpm lint`
   - Runs TypeScript ESLint rules and Rust Clippy checks.

2. `pnpm format:write`
   - Applies Prettier & Cargo formatting automatically.

3. `pnpm format`
   - Verifies formatting for all code (including Rust).

---

## Branch Strategy

- **Default target branch**: Open pull requests against the `develop` branch unless the work is tied to an open release branch or hotfix.
- **Release branches**: When preparing a release, create a branch named `release/<version>` from `develop`. Only stabilization fixes, documentation updates, and release-specific chores should be merged into the release branch. Merge the release branch back into both `main` and `develop` after the release is cut to keep histories aligned.
- **Hotfixes**: For urgent production fixes, branch off `main`, apply the fix, then merge into both `main` and `develop` once validated.

---

## Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification to keep history readable and automation-friendly.

- **Structure**: `<type>[optional scope]: <short description>`
- **Body**: Provide additional context and motivation. Wrap at ~72 characters.
- **Footer**: Reference issues or breaking changes (e.g., `BREAKING CHANGE: ...`).

### Examples

- `feat(desktop): add draggable timeline markers`
- `fix(stores): correct default workspace selection`
- `chore(ci): update pnpm to 10.1.0`
- `revert: feat(desktop): add draggable timeline markers`

---

## Localization Workflow

1. Update `scripts/translations.xlsx` (add/modify strings).
2. Run `pnpm translate` → regenerates JSON locale files via `scripts/translator.mjs`.
3. Check files under `apps/desktop/public/locales/**/` and verify required namespaces are registered in `apps/desktop/src/i18n.js`.

---

## Frontend & State Management Guidelines

- **React & Tailwind**
  - Implement feature components in `apps/desktop/src/features`.
  - Keep shared styles and design tokens under `apps/desktop/src/shared`.
  - Prefer functional components + hooks.
  - Use the app-local design token CSS system instead of a package-level UI layer.

- **Zustand Store**
  - Reuse existing app-local stores when possible and avoid redundant state containers.

- **Type Definitions**
  - When adding IPC payloads or new domain models, update the app-local types in `apps/desktop/src/shared/types`.

---

## Additional References

- [React Docs](https://react.dev/learn)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [Zustand Docs](https://docs.pmnd.rs/zustand/getting-started/introduction)
- [Tauri Command Guide](https://tauri.app/v1/guides/features/command)
- [SQLx Migration Guide](https://docs.rs/sqlx/latest/sqlx/macro.migrate!.html)

---
