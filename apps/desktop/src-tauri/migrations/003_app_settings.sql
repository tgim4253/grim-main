CREATE TABLE IF NOT EXISTS app_setting (
  key        TEXT PRIMARY KEY NOT NULL,
  value      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO app_setting (key, value)
SELECT 'initial_launch_completed', 'true'
WHERE EXISTS (SELECT 1 FROM asset LIMIT 1)
   OR EXISTS (SELECT 1 FROM virtual_folder WHERE kind <> 'system_uncategorized' LIMIT 1)
   OR EXISTS (SELECT 1 FROM tag_group LIMIT 1)
   OR EXISTS (SELECT 1 FROM tag LIMIT 1)
   OR EXISTS (SELECT 1 FROM time_step_preset LIMIT 1)
   OR EXISTS (SELECT 1 FROM session_preset LIMIT 1)
   OR EXISTS (SELECT 1 FROM croquis_record LIMIT 1);
