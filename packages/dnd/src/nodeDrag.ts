import type { NodeKind } from '@tgim/types/index';

export const NODE_DRAG_TYPE = 'node' as const;

export type NodeDragType = typeof NODE_DRAG_TYPE;

export interface NodeDragPayload<TMeta = unknown> {
  type: NodeDragType;
  nodeId: string;
  nodeKind?: NodeKind | string;
  /**
   * Source surface initiating the drag. Consumers can branch on this string
   * (e.g. `file-tree`, `graph`, `grid`, …) to tweak drop behaviour.
   */
  source?: string;
  /**
   * Optional list of node ids that participate in the drag (for multi-select).
   */
  selection?: string[];
  /**
   * Arbitrary metadata scoped to the initiator. Prefer serialisable data so it
   * can be safely inspected across the app.
   */
  meta?: TMeta;
}

export const createNodeDragPayload = <TMeta = unknown>(
  payload: Omit<NodeDragPayload<TMeta>, 'type'>,
): NodeDragPayload<TMeta> => ({
  ...payload,
  type: NODE_DRAG_TYPE,
});

export const isNodeDragPayload = (value: unknown): value is NodeDragPayload => {
  if (!value || typeof value !== 'object') return false;
  if (!('type' in value) || (value as { type: unknown }).type !== NODE_DRAG_TYPE) return false;
  if (!('nodeId' in value) || typeof (value as { nodeId: unknown }).nodeId !== 'string')
    return false;
  return true;
};

export const getNodeDragPayload = (value: unknown): NodeDragPayload | null =>
  isNodeDragPayload(value) ? value : null;
