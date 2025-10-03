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
    | 'panel-tab'
    | 'toggle';
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
};

// Token-driven button variants mapped to utility classes.
const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  default: 'btn-default',
  titlebar: 'btn-titlebar',
  'list-item': 'btn-list',
  icon: 'btn-icon aspect-square',
  card: 'btn-card',
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  'panel-tab': 'btn-panel-tab',
  toggle: 'btn-toggle',
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', asChild = false, active, ...props }, ref) => {
    const Comp = (asChild ? Slot : 'button') as React.ElementType;
    const finalProps = {
      ...props,
    } as React.ButtonHTMLAttributes<HTMLButtonElement> & {
      'data-state'?: string;
    };

    if (active !== undefined && finalProps['data-state'] === undefined) {
      finalProps['data-state'] = active ? 'active' : undefined;
    }

    if (variant === 'toggle' && active !== undefined && finalProps['aria-pressed'] === undefined) {
      finalProps['aria-pressed'] = active;
    }

    return (
      <Comp ref={ref} className={cn('btn', variantClasses[variant], className)} {...finalProps} />
    );
  },
);
Button.displayName = 'Button';

export default Button;
