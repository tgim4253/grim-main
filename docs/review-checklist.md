# Code Review Checklist

Reviewers can use the checklist below to decide whether to approve a pull request.

## 1. Quality Checks

- [ ] Do the PR description and the actual changes align, and are the test results clearly documented?
- [ ] Were the required commands (`pnpm lint:check`, `pnpm format:write`, `pnpm --filter @grim/desktop build`, and when applicable `cargo fmt --all`, `cargo clippy --all-targets -- -D warnings`) executed?
- [ ] Do all new or existing tests pass?
- [ ] Are impacts to docs, scripts, and configuration files sufficiently explained?

## 2. Localisation

- [ ] When user-facing strings change, were `scripts/translations.xlsx` and the locale JSON files updated?
- [ ] If translations changed, is there a linked PR/issue or a follow-up plan?

## 3. Technical Guidelines

- [ ] For React/TypeScript updates, does the change respect the existing app-local structure and state management patterns? (`apps/desktop/src`)
- [ ] For Rust/Tauri updates, are command registration, service layering, and SQLx usage policies followed? (`apps/desktop/src-tauri`)
- [ ] Do dependency additions or updates align with repository policy?

## 4. Other Considerations

- [ ] Are there any outstanding security, performance, or accessibility concerns?
- [ ] Have follow-up issues or TODOs been created when necessary?

> Feel free to adapt or extend this checklist as needed for your review.
