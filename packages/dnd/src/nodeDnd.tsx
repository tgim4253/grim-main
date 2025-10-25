import React, { createContext, useContext, useMemo, useState } from 'react';
import {
  DndContext,
  type DndContextProps,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { getNodeDragPayload, type NodeDragPayload } from './nodeDrag';

export type NodeDragStartEvent = DragStartEvent & { node: NodeDragPayload | null };
export type NodeDragOverEvent = DragOverEvent & { node: NodeDragPayload | null };
export type NodeDragEndEvent = DragEndEvent & { node: NodeDragPayload | null };
export type NodeDragCancelEvent = DragCancelEvent & { node: NodeDragPayload | null };

type NodeDndContextValue = {
  activeNode: NodeDragPayload | null;
  activeId: UniqueIdentifier | null;
};

const NodeDndContext = createContext<NodeDndContextValue>({
  activeNode: null,
  activeId: null,
});

export const useNodeDndState = () => useContext(NodeDndContext);

type NodeDndProviderProps = React.PropsWithChildren<
  Omit<DndContextProps, 'onDragStart' | 'onDragOver' | 'onDragEnd' | 'onDragCancel'>
> & {
  onNodeDragStart?: (event: NodeDragStartEvent) => void;
  onNodeDragOver?: (event: NodeDragOverEvent) => void;
  onNodeDragEnd?: (event: NodeDragEndEvent) => void;
  onNodeDragCancel?: (event: NodeDragCancelEvent) => void;
};

export const NodeDndProvider: React.FC<NodeDndProviderProps> = ({
  children,
  onNodeDragStart,
  onNodeDragOver,
  onNodeDragEnd,
  onNodeDragCancel,
  ...contextProps
}) => {
  const [activeNode, setActiveNode] = useState<NodeDragPayload | null>(null);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    const node = getNodeDragPayload(event.active.data.current);
    setActiveId(event.active.id);
    setActiveNode(node);
    onNodeDragStart?.({ ...event, node });
  };

  const handleDragOver = (event: DragOverEvent) => {
    const node = getNodeDragPayload(event.active.data.current);
    onNodeDragOver?.({ ...event, node });
  };

  const resetState = () => {
    setActiveId(null);
    setActiveNode(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const node = getNodeDragPayload(event.active.data.current);
    onNodeDragEnd?.({ ...event, node });
    resetState();
  };

  const handleDragCancel = (event: DragCancelEvent) => {
    const node = getNodeDragPayload(event.active.data.current);
    onNodeDragCancel?.({ ...event, node });
    resetState();
  };

  const value = useMemo<NodeDndContextValue>(
    () => ({
      activeNode,
      activeId,
    }),
    [activeId, activeNode],
  );

  return (
    <NodeDndContext.Provider value={value}>
      <DndContext
        {...contextProps}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {children}
      </DndContext>
    </NodeDndContext.Provider>
  );
};
