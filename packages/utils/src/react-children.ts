import React from 'react';

export const isReactElement = (child: React.ReactNode): child is React.ReactElement => {
  return React.isValidElement(child);
};
