Here’s your **Grim Project Contribution Guide** in English (with the updates applied):

---

# Grim Project Contribution Guide (with Updates)

## Development Environment

- **Node.js & pnpm**: Use Node.js 20+ and **pnpm 10.x** (workspace required).
  Install dependencies with `pnpm install`.
  If scoped packages are blocked in the registry (e.g., `GET https://registry.npmjs.org/@eslint%2Fjs: Forbidden - 403`), request access to the npm registry or set the correct authentication token before retrying.

- **Rust Toolchain**: Install Rustup, Cargo, and Tauri targets in advance to build the Rust backend for the desktop app.

- **Common Scripts**:
  - `pnpm dev` — Run the desktop app
  - `pnpm build:front` — Build frontend bundle
  - `pnpm build` — Generate production Tauri bundle
  - `pnpm tauri` — Run Tauri development/build commands
  - `pnpm lint:ts` — Lint & auto-fix TypeScript code
  - `pnpm lint:rs` — Lint Rust code (Clippy)
  - `pnpm lint` — Run TS + RS linting together
  - `pnpm lint:check` — Check TS lint (no auto-fix)
  - `pnpm format` — Verify Prettier & Cargo formatting
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

## Localization Workflow

1. Update `scripts/translations.xlsx` (add/modify strings).
2. Run `pnpm translate` → regenerates JSON locale files via `scripts/translator.mjs`.
3. Check files under `apps/desktop/public/locales/**/` and verify required namespaces are registered in `apps/desktop/src/i18n.js`.

---

## Frontend & State Management Guidelines

- **React & Tailwind**
  - Implement feature components in `apps/desktop/src/features`.
  - Share styles from `packages/ui/src/styles`.
  - Prefer functional components + hooks.
  - Use Tailwind utilities based on `apps/desktop/tailwind.config.ts` and shared UI design tokens.

- **Zustand Store**
  - For state management, extend/reuse shared stores from `@tgim/stores` (path: `packages/stores`).
  - Avoid creating redundant state containers.

- **Type Definitions**
  - When adding IPC payloads or new domain models, update shared types in `packages/types`.

---

## Additional References

- [React Docs](https://react.dev/learn)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [Zustand Docs](https://docs.pmnd.rs/zustand/getting-started/introduction)
- [Tauri Command Guide](https://tauri.app/v1/guides/features/command)
- [SQLx Migration Guide](https://docs.rs/sqlx/latest/sqlx/macro.migrate!.html)

---
