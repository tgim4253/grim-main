CREATE TABLE IF NOT EXISTS session_preset_tag (
  session_preset_id TEXT NOT NULL REFERENCES session_preset(id) ON DELETE CASCADE,
  tag_id            TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_preset_id, tag_id)
);
