CREATE TABLE IF NOT EXISTS time_step_preset (
  id                       TEXT PRIMARY KEY NOT NULL,
  name                     TEXT NOT NULL UNIQUE,
  default_duration_seconds INTEGER,
  result_required          INTEGER NOT NULL DEFAULT 0 CHECK (result_required IN (0, 1)),
  result_external_path     TEXT,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS time_step_preset_tag (
  time_step_preset_id TEXT NOT NULL REFERENCES time_step_preset(id) ON DELETE CASCADE,
  tag_id              TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (time_step_preset_id, tag_id)
);

ALTER TABLE session_step_preset
ADD COLUMN time_step_preset_id TEXT REFERENCES time_step_preset(id) ON DELETE SET NULL;
