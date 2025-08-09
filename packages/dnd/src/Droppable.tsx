import React from "react";
import { useDroppable } from "@dnd-kit/core";

export const Droppable: React.FC<
  React.PropsWithChildren<{ id: string; dragging: boolean; className?: string, render: React.FC }>
> = ({ id, children, dragging, render }) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    render({})
  );
};
