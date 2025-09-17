import React from 'react';
import { cn } from '@tgim/utils/index';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

// Lightweight input field that shares spacing tokens with buttons.
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input type={type} className={cn('input', className)} ref={ref} {...props} />
  ),
);

Input.displayName = 'Input';

export { Input };
