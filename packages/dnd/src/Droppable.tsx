import React from 'react';

export const Droppable: React.FC<
  React.PropsWithChildren<{ id: string; dragging: boolean; className?: string; render: React.FC }>
> = ({ render }) => {
  return render({});
};
