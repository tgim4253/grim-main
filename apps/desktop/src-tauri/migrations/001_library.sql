CREATE TABLE IF NOT EXISTS library_settings (
  id                       TEXT PRIMARY KEY NOT NULL,
  active_session_preset_id TEXT,
  croquis_preferences_json TEXT,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS asset (
  id             TEXT PRIMARY KEY NOT NULL,
  hash           TEXT NOT NULL,
  file_name      TEXT NOT NULL,
  file_size      INTEGER NOT NULL DEFAULT 0,
  mime_type      TEXT,
  width          INTEGER,
  height         INTEGER,
  modified_at    INTEGER,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_import_hash
  ON asset(hash);

CREATE INDEX IF NOT EXISTS idx_asset_created_at ON asset(created_at DESC);

CREATE TABLE IF NOT EXISTS virtual_folder (
  id         TEXT PRIMARY KEY NOT NULL,
  name       TEXT NOT NULL,
  parent_id  TEXT REFERENCES virtual_folder(id) ON DELETE CASCADE,
  full_path  TEXT NOT NULL,
  alias      TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_virtual_folder_parent ON virtual_folder(parent_id);
CREATE INDEX IF NOT EXISTS idx_virtual_folder_full_path ON virtual_folder(full_path);

CREATE TABLE IF NOT EXISTS asset_virtual_folder (
  asset_id          TEXT NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  virtual_folder_id TEXT NOT NULL REFERENCES virtual_folder(id) ON DELETE CASCADE,
  source_type       TEXT NOT NULL DEFAULT 'manual',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (asset_id, virtual_folder_id)
);

CREATE INDEX IF NOT EXISTS idx_asset_virtual_folder_folder
  ON asset_virtual_folder(virtual_folder_id);

CREATE TABLE IF NOT EXISTS tag_group (
  id         TEXT PRIMARY KEY NOT NULL,
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tag (
  id         TEXT PRIMARY KEY NOT NULL,
  group_id   TEXT REFERENCES tag_group(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  color      TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (group_id, name)
);

CREATE TABLE IF NOT EXISTS session_preset (
  id          TEXT PRIMARY KEY NOT NULL,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  is_default  INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session_step_preset (
  id                       TEXT PRIMARY KEY NOT NULL,
  preset_id                TEXT NOT NULL REFERENCES session_preset(id) ON DELETE CASCADE,
  step_order               INTEGER NOT NULL,
  name                     TEXT NOT NULL,
  default_duration_seconds INTEGER,
  result_required          INTEGER NOT NULL DEFAULT 0 CHECK (result_required IN (0, 1)),
  result_external_path     TEXT,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (preset_id, step_order)
);

CREATE TABLE IF NOT EXISTS session_step_preset_tag (
  step_preset_id TEXT NOT NULL REFERENCES session_step_preset(id) ON DELETE CASCADE,
  tag_id         TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (step_preset_id, tag_id)
);

CREATE TABLE IF NOT EXISTS croquis_record (
  id                       TEXT PRIMARY KEY NOT NULL,
  source_asset_id          TEXT REFERENCES asset(id) ON DELETE SET NULL,
  result_asset_id          TEXT REFERENCES asset(id) ON DELETE SET NULL,
  title                    TEXT NOT NULL DEFAULT '',
  note                     TEXT NOT NULL DEFAULT '',
  target_duration_seconds  INTEGER,
  actual_duration_seconds  REAL,
  started_at               TEXT,
  finished_at              TEXT,
  finalized_at             TEXT,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_croquis_record_created_at
  ON croquis_record(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_croquis_record_source_asset_id
  ON croquis_record(source_asset_id);

CREATE TABLE IF NOT EXISTS croquis_record_tag (
  record_id    TEXT NOT NULL REFERENCES croquis_record(id) ON DELETE CASCADE,
  tag_id       TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (record_id, tag_id)
);
