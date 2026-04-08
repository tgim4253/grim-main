import type { ButtonHTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type ButtonWidth = 'hug' | 'fill';

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  width?: ButtonWidth;
};

export function Button({
  variant = 'primary',
  size = 'md',
  width = 'hug',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'c-button',
        `c-button--variant-${variant}`,
        `c-button--size-${size}`,
        `c-button--width-${width}`,
        className,
      )}
      {...props}
    />
  );
}
