PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS node_new (
  id         TEXT PRIMARY KEY NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('folder','file','tag','annotation','memo','crop')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO node_new (id, kind, created_at, updated_at)
SELECT id, kind, created_at, updated_at FROM node;

DROP TABLE node;
ALTER TABLE node_new RENAME TO node;

CREATE INDEX IF NOT EXISTS idx_node_kind ON node(kind);

PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS node_crop (
  node_id                 TEXT PRIMARY KEY NOT NULL REFERENCES node(id) ON DELETE CASCADE,
  origin_hash             TEXT NOT NULL,
  start_x                 REAL NOT NULL,
  start_y                 REAL NOT NULL,
  width                   REAL NOT NULL,
  height                  REAL NOT NULL,
  reference_width         INTEGER,
  reference_height        INTEGER,
  is_relative             INTEGER NOT NULL DEFAULT 0 CHECK (is_relative IN (0,1)),
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

PRAGMA user_version = 2;
