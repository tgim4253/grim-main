-- Add folder option columns to virtual_folder_mount.
ALTER TABLE virtual_folder_mount
  ADD COLUMN sync_enabled INTEGER NOT NULL DEFAULT 0;

ALTER TABLE virtual_folder_mount
  ADD COLUMN suppress_warnings INTEGER NOT NULL DEFAULT 0;
