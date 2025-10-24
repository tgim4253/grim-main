/* ------------------------------------ Core graph (virtual) ---------------------------------------- */
CREATE TABLE IF NOT EXISTS node (
  id         TEXT PRIMARY KEY NOT NULL,                               -- uuid  
  kind       TEXT NOT NULL CHECK (kind IN ('folder','file','tag','annotation','memo','crop')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_node_kind ON node(kind);

CREATE TABLE IF NOT EXISTS node_folder (
  id            TEXT PRIMARY KEY NOT NULL,                            -- uuid
  node_id       TEXT NOT NULL REFERENCES node(id) ON DELETE CASCADE,
  display_name  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(node_id)
);

CREATE TABLE IF NOT EXISTS tag (
  id   TEXT PRIMARY KEY NOT NULL,                                     -- uuid
  name TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS node_tag (
  node_id TEXT REFERENCES node(id) ON DELETE CASCADE,
  tag_id  TEXT REFERENCES tag(id) ON DELETE CASCADE,
  PRIMARY KEY (node_id, tag_id)
);

CREATE TABLE IF NOT EXISTS connection_kind_rule (
  id             TEXT PRIMARY KEY NOT NULL,                  -- uuid
  kind           TEXT UNIQUE NOT NULL,                                -- unique identifier
  default_level  INTEGER NOT NULL DEFAULT 0,
  editable       INTEGER,                                    -- boolean
  description    TEXT
);

CREATE TABLE IF NOT EXISTS connection (
  id           TEXT PRIMARY KEY NOT NULL,                             -- uuid
  src_node_id  TEXT NOT NULL REFERENCES node(id) ON DELETE CASCADE,
  dst_node_id  TEXT NOT NULL REFERENCES node(id) ON DELETE CASCADE,
  kind_id      TEXT REFERENCES connection_kind_rule(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (src_node_id, dst_node_id, kind_id)
);

CREATE INDEX IF NOT EXISTS idx_conn_src        ON connection(src_node_id);
CREATE INDEX IF NOT EXISTS idx_conn_dst        ON connection(dst_node_id);
CREATE INDEX IF NOT EXISTS idx_conn_src_dst    ON connection(src_node_id, dst_node_id);
CREATE INDEX IF NOT EXISTS idx_conn_src_kind   ON connection(src_node_id, kind_id);
CREATE INDEX IF NOT EXISTS idx_conn_dst_kind   ON connection(dst_node_id, kind_id);

/* ---------------------------- Storage roots & mounts (portable across OS) -------------------------- */
CREATE TABLE IF NOT EXISTS storage_root (
  id            TEXT PRIMARY KEY NOT NULL,                             -- uuid
  platform      TEXT,                                         -- 'windows'|'macos'|'linux'|'unknown'
  stable_id     TEXT NOT NULL,                                -- Volume GUID/UUID or //host/share
  secondary_id  TEXT,
  kind          TEXT,                                         -- 'internal'|'external'|'network'
  label         TEXT,
  is_available  INTEGER DEFAULT 0,                            -- boolean
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(platform, stable_id)
);

CREATE TABLE IF NOT EXISTS storage_root_mount (
  id               TEXT PRIMARY KEY NOT NULL,                          -- uuid
  storage_root_id  TEXT NOT NULL REFERENCES storage_root(id) ON DELETE CASCADE,
  mount_path       TEXT NOT NULL,                             -- 'E:' | '/Volumes/USB' | '/mnt/share'
  is_primary       INTEGER DEFAULT 1,                         -- boolean
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (storage_root_id, mount_path)
);

CREATE INDEX IF NOT EXISTS idx_mount_root ON storage_root_mount(storage_root_id);

/* --------------------------------- Scanning/session ----------------------------------------------- */
CREATE TABLE IF NOT EXISTS scan_session (
  id          TEXT PRIMARY KEY NOT NULL,                                   -- uuid
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  note        TEXT
);

/* -------------------------------- Real folder tree (physical) ------------------------------------- */
CREATE TABLE IF NOT EXISTS real_folder (
  id                TEXT PRIMARY KEY NOT NULL,                         -- uuid
  storage_root_id   TEXT REFERENCES storage_root(id) ON DELETE SET NULL,
  parent_id         TEXT REFERENCES real_folder(id) ON DELETE CASCADE,
  parent_key        TEXT GENERATED ALWAYS AS (COALESCE(parent_id, '_root_')) STORED,
  name              TEXT NOT NULL,                            -- single segment
  name_norm         TEXT NOT NULL,                                     -- lowercased for case-insensitive FS
  root_rel_path     TEXT,                                     -- optional cache
  abs_path_cached   TEXT,                                     -- optional cache
  mtime             INTEGER NOT NULL,
  error_flag        TEXT CHECK (error_flag IN ('success','notfound','mismatch')),
  error_msg         TEXT,
  last_seen_scan_id TEXT REFERENCES scan_session(id),
  last_seen_at      TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE (storage_root_id, parent_key, name_norm)
);

CREATE INDEX IF NOT EXISTS idx_real_folder_err    ON real_folder(error_flag);
CREATE INDEX IF NOT EXISTS idx_real_folder_parent ON real_folder(parent_id);

/* ---------------------------- File content, paths and binds ------------------------------------ */
CREATE TABLE IF NOT EXISTS file_content (
  id           TEXT PRIMARY KEY NOT NULL,                                  -- uuid
  mime         TEXT NOT NULL,
  size         INTEGER NOT NULL DEFAULT 0 CHECK (size >= 0),
  display_name TEXT NOT NULL DEFAULT '',
  sha256       TEXT,
  xxh3_64      TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'unknown'
               CHECK (kind IN ('image','video','document','graphictool','audio','archive','unknown')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Enforce uniqueness only when sha256 IS NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS uq_file_content_sha256_notnull
  ON file_content(sha256) WHERE sha256 IS NOT NULL;

-- Dedup required media (images, design files) share hashes
CREATE UNIQUE INDEX IF NOT EXISTS uq_file_content_kind_hash
  ON file_content(kind, xxh3_64)
  WHERE xxh3_64 IS NOT NULL AND kind IN ('image','graphictool');


-- Queries by size
CREATE INDEX IF NOT EXISTS idx_file_content_size ON file_content(size);

CREATE TABLE IF NOT EXISTS file_asset (
  id             TEXT PRIMARY KEY NOT NULL,                                  -- uuid
  file_content_id TEXT REFERENCES file_content(id) ON DELETE SET NULL,
  is_dedupable   INTEGER NOT NULL DEFAULT 0 CHECK (is_dedupable IN (0,1)),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_file_asset_content
  ON file_asset(file_content_id) WHERE file_content_id IS NOT NULL;

-- file_path
CREATE TABLE IF NOT EXISTS file_path (
  id                    TEXT PRIMARY KEY NOT NULL,                          -- uuid
  folder_id             TEXT NOT NULL REFERENCES real_folder(id) ON DELETE CASCADE,
  file_name             TEXT NOT NULL,
  file_name_norm        TEXT NOT NULL,
  mtime                 INTEGER CHECK (mtime >= 0),
  is_found              INTEGER NOT NULL DEFAULT 0,                 -- boolean
  error_msg             TEXT,
  last_seen_scan_id     TEXT REFERENCES scan_session(id),
  last_seen_at          TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (folder_id, file_name_norm)
);

CREATE INDEX IF NOT EXISTS idx_file_path_folder_mtime ON file_path(folder_id, mtime);
CREATE INDEX IF NOT EXISTS idx_file_path_err          ON file_path(is_found);

CREATE TABLE IF NOT EXISTS file_path_asset_binding (
  id             TEXT PRIMARY KEY NOT NULL,                              -- uuid
  file_path_id   TEXT NOT NULL REFERENCES file_path(id) ON DELETE CASCADE,
  file_asset_id  TEXT NOT NULL REFERENCES file_asset(id) ON DELETE CASCADE,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE (file_path_id)
);

CREATE INDEX IF NOT EXISTS idx_fpab_asset
  ON file_path_asset_binding(file_asset_id);

CREATE TRIGGER IF NOT EXISTS trg_fpab_enforce_single_path
AFTER INSERT ON file_path_asset_binding
WHEN (SELECT is_dedupable FROM file_asset WHERE id = NEW.file_asset_id) = 0
     AND EXISTS (
       SELECT 1 FROM file_path_asset_binding
       WHERE file_asset_id = NEW.file_asset_id AND id != NEW.id
     )
BEGIN
  SELECT RAISE(ABORT, 'non-dedupable asset cannot bind multiple paths');
END;

CREATE TRIGGER IF NOT EXISTS trg_fpab_enforce_single_path_update
AFTER UPDATE ON file_path_asset_binding
WHEN (SELECT is_dedupable FROM file_asset WHERE id = NEW.file_asset_id) = 0
     AND EXISTS (
       SELECT 1 FROM file_path_asset_binding
       WHERE file_asset_id = NEW.file_asset_id AND id != NEW.id
     )
BEGIN
  SELECT RAISE(ABORT, 'non-dedupable asset cannot bind multiple paths');
END;

CREATE TRIGGER IF NOT EXISTS trg_file_asset_set_nondedupable_guard
AFTER UPDATE OF is_dedupable ON file_asset
WHEN NEW.is_dedupable = 0
     AND EXISTS (
       SELECT 1 FROM file_path_asset_binding
       WHERE file_asset_id = NEW.id
       GROUP BY file_asset_id
       HAVING COUNT(*) > 1
     )
BEGIN
  SELECT RAISE(ABORT, 'non-dedupable asset cannot bind multiple paths');
END;

/* ------------------------- Virtual mounts & direct node bindings ---------------------------------- */
CREATE TABLE IF NOT EXISTS virtual_folder_mount (
  id               TEXT PRIMARY KEY NOT NULL,                            -- uuid
  virtual_node_id  TEXT NOT NULL REFERENCES node(id) ON DELETE CASCADE,  -- must be kind='folder' (enforce by trigger/app)
  real_folder_id   TEXT NOT NULL REFERENCES real_folder(id) ON DELETE CASCADE,
  recursive        INTEGER DEFAULT 1,                           -- boolean
  enabled          INTEGER DEFAULT 1,                           -- boolean
  priority         INTEGER DEFAULT 0,
  include_glob     TEXT,
  exclude_glob     TEXT,
  created_at       TEXT DEFAULT (datetime('now')),
  sync_enabled     INTEGER NOT NULL DEFAULT 0,
  suppress_warnings INTEGER NOT NULL DEFAULT 0,
  UNIQUE (virtual_node_id, real_folder_id)
);

CREATE INDEX IF NOT EXISTS idx_vfm_virtual      ON virtual_folder_mount(virtual_node_id);
CREATE INDEX IF NOT EXISTS idx_vfm_real         ON virtual_folder_mount(real_folder_id);
CREATE INDEX IF NOT EXISTS idx_vfm_virtual_prio ON virtual_folder_mount(virtual_node_id, priority);

CREATE TABLE IF NOT EXISTS node_file_binding (
  id              TEXT PRIMARY KEY NOT NULL,                                   -- uuid
  node_id         TEXT NOT NULL REFERENCES node(id) ON DELETE CASCADE,       -- node.kind='file'
  file_asset_id   TEXT NOT NULL REFERENCES file_asset(id) ON DELETE CASCADE,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (node_id, file_asset_id)
);

CREATE INDEX IF NOT EXISTS idx_nfb_asset ON node_file_binding(file_asset_id);

/* ------------------------- Crop node ---------------------------------- */
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

CREATE TABLE IF NOT EXISTS node_memo (
  node_id     TEXT PRIMARY KEY NOT NULL REFERENCES node(id) ON DELETE CASCADE,
  text        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
/* ------------------------------------ PRAGMA user_version ----------------------------------------- */
-- TODO: Replace `1` with actual TARGET_DB_VERSION value.
PRAGMA user_version = 1;
