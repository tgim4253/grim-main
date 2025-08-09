export const CONTAINER_PREFIX = 'container:' as const;
export const FOLDER_PREFIX = 'folder:' as const;

/* types */
export type ContainerId = `${typeof CONTAINER_PREFIX}${string}`;
export type FolderId = `${typeof FOLDER_PREFIX}${string}`;
export type DropTargetId = ContainerId | FolderId;

export type DropTarget =
  | { kind: 'container'; id: string; full: ContainerId }
  | { kind: 'folder'; id: string; full: FolderId }
  | null;

/* helpers */
export const isContainerId = (v: unknown): v is ContainerId =>
  typeof v === 'string' && v.startsWith(CONTAINER_PREFIX);

export const isFolderId = (v: unknown): v is FolderId =>
  typeof v === 'string' && v.startsWith(FOLDER_PREFIX);

/* creators */
export const createContainerId = (id: string) => `${CONTAINER_PREFIX}${id}`;
export const createFolderId = (id: string) => `${FOLDER_PREFIX}${id}`;

/* parser */
export function parseDropTarget(overId: unknown): DropTarget {
  if (typeof overId !== 'string') return null;
  if (overId.length === 0) return null;

  const s = String(overId);
  if (!s) return null;

  if (isContainerId(s)) {
    const id = overId.slice(CONTAINER_PREFIX.length);
    if (!id) return null;
    return { kind: 'container', id, full: s };
  }
  if (isFolderId(s)) {
    const id = overId.slice(FOLDER_PREFIX.length);
    if (!id) return null;
    return { kind: 'folder', id, full: s };
  }
  return null;
}
