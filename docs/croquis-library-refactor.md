# Croquis Library Refactor Summary

This document summarizes the current refactor state of the Grim desktop app after the transition away from the old project/graph-oriented structure.

## Product Direction

The desktop app is now oriented around a **single croquis library** instead of multiple projects.

- The app no longer treats the main workflow as a generic file manager.
- The core domain is now:
  - `Asset`
  - `VirtualFolder`
  - `Tag` / `TagGroup`
  - `CroquisRecord`
  - `Session` / `SessionPreset`
- The user flow is centered on:
  - importing reference images
  - linking external work files when needed
  - organizing assets with virtual folders and tags
  - running croquis sessions
  - saving results and reviewing records

## Frontend Structure

The desktop frontend was rebuilt around a simpler feature/page structure.

### Entry / Routing

- `apps/desktop/src/app/index.tsx`
- `apps/desktop/src/main.tsx`

Routes are now limited to:

- `/` for the main library shell
- `/croquis` for the croquis session window
- `/capture` for the capture overlay

### Main App Shell

The main screen is a library-first layout:

- left `Explorer`
- center `tabs-only workspace`

Key areas:

- `apps/desktop/src/pages/library`
- `apps/desktop/src/features/library`
- `apps/desktop/src/entities/library`
- `apps/desktop/src/shared`

The explorer currently provides:

- `Virtual Folders`
- `All Assets`
- `Uncategorized`
- `Recent Records`
- `Sessions`

The workspace currently opens these panel types:

- `Asset Grid`
- `Asset Viewer`
- `Record Detail`
- `Session Detail`
- `Session Preset Manager`
- `Tag Manager`

### State / Controller Simplification

Several previously tangled UI paths were simplified:

- library snapshot loading and refresh logic were separated from workspace tab logic
- modal selection state was extracted into reusable logic
- repeated sidebar list rendering was extracted into reusable components
- direct panel rendering condition chains were reduced

## Backend Structure

The Tauri backend now follows a smaller command/service model aligned with the croquis library domain.

### Main Layout

- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src-tauri/src/main.rs`
- `apps/desktop/src-tauri/src/state`
- `apps/desktop/src-tauri/src/commands`
- `apps/desktop/src-tauri/src/services`
- `apps/desktop/src-tauri/src/models`

### Active Command Domains

The runtime surface is centered on:

- `library`
- `folder`
- `asset`
- `import`
- `record`
- `session`
- `tag`
- `capture`

Legacy command groups such as project/moa/graph/document/memo were removed from the active runtime path.

### Service Layer

The backend now uses thin command modules wired directly to domain services under:

- `apps/desktop/src-tauri/src/services/asset_service.rs`
- `apps/desktop/src-tauri/src/services/folder_service.rs`
- `apps/desktop/src-tauri/src/services/record_service.rs`
- `apps/desktop/src-tauri/src/services/session_service.rs`
- `apps/desktop/src-tauri/src/services/tag_service.rs`
- `apps/desktop/src-tauri/src/services/settings_service.rs`
- `apps/desktop/src-tauri/src/services/capture_service.rs`
- `apps/desktop/src-tauri/src/services/croquis_service.rs`

`LibraryService` remains as a small snapshot aggregation service for the library landing state.

### Model Layout

Backend DTOs are split by domain under `apps/desktop/src-tauri/src/models`:

- `asset.rs`
- `folder.rs`
- `record.rs`
- `session.rs`
- `settings.rs`
- `tag.rs`
- `library.rs` for aggregated library snapshot types

### Croquis Session Handoff

Croquis window payload handoff remains in-memory and one-shot:

- `start_croquis_session` prepares runtime queue data and stores it transiently
- `load_croquis_session` consumes that payload once when the croquis window boots
- persisted state still lives at the step and record level rather than as a durable session snapshot

## Database Model

The old graph-centric schema was replaced by a single-library schema.

Migration:

- `apps/desktop/src-tauri/migrations/001_library.sql`

Current main tables:

- `library_settings`
- `asset`
- `virtual_folder`
- `asset_virtual_folder`
- `tag_group`
- `tag`
- `asset_tag`
- `session_preset`
- `session_step_preset`
- `session_step_preset_tag`
- `session`
- `croquis_record`
- `croquis_record_tag`

### Key Modeling Rules

- Imported images are stored in internal common storage.
- Imported images keep hash-based deduplication.
- External work files are represented as linked assets instead of imported assets.
- Assets and virtual folders are `N:N`.
- Uncategorized assets are derived from missing folder mappings.
- Records can exist without a source image.
- Records can exist without a result image.
- Sessions group records and can optionally be created from presets.

## Removed / Reduced Legacy Areas

The refactor removed or disconnected several older concepts from the main runtime:

- multi-project / `Moa` flow
- graph / node / connection data model
- real-folder mount and sync flow
- generic document / memo / graph viewers
- split-panel workspace layout
- Tailwind-based frontend styling

Some historical files may still exist in git history or in unrelated package areas, but they are no longer part of the current desktop runtime architecture.

## Styling System

The frontend styling system now uses **design-token-driven CSS**, not Tailwind CSS.

Main token/style locations:

- `apps/desktop/src/shared/styles`
- `apps/desktop/src/shared/theme`
- `apps/desktop/src/shared/ui`

Additional cleanup completed in this phase:

- Tailwind utility class usage removed from active shared UI components
- `tailwind-merge` removed from shared utilities
- `apps/desktop/tailwind.config.ts` removed
- desktop PostCSS config reduced to `autoprefixer`

## Validation Status

The refactor work documented here has been checked with:

- `pnpm lint`
- `pnpm --filter @grim/desktop build`
- `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings`

## Notes

- This document describes the **current implemented state**, not the original legacy design.
- If future work changes the runtime surface or data model again, this document should be updated alongside the relevant README entries.
