import React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@tgim/utils/index';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?:
    | 'default'
    | 'titlebar'
    | 'list-item'
    | 'icon'
    | 'card'
    | 'primary'
    | 'secondary'
    | 'panel-tab';
  size?: 'sm' | 'md' | 'lg';
};

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  default: 'btn-default',
  titlebar: 'btn-titlebar',
  'list-item': 'btn-list',
  icon: 'btn-icon aspect-square',
  card: 'btn-card',
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  'panel-tab': 'btn-panel-tab',
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', asChild = false, ...props }, ref) => {
    const Comp = (asChild ? Slot : 'button') as React.ElementType;
    return <Comp ref={ref} className={cn('btn', variantClasses[variant], className)} {...props} />;
  },
);
Button.displayName = 'Button';

export default Button;
