import React from 'react';

export const DragHandle: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return (
    <div className="pointer-events-none flex items-center gap-1 rounded-md px-2 py-1 shadow-md">
      {children}
    </div>
  );
};
