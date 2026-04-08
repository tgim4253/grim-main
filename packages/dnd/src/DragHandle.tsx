import React from 'react';
import './drag-handle.css';

export const DragHandle: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return <div className="drag-handle">{children}</div>;
};
