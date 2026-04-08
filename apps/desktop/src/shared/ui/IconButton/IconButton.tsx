import type { ButtonHTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import { Icon, type IconSize } from '../Icon/Icon';
import type { StrokeIconName } from '../Icon/iconDefinitions';
import './IconButton.css';

export type IconButtonVariant = 'button' | 'sidebar';
export type IconButtonSize = 'md' | 'lg' | '2xl';

const ICON_SIZE_BY_BUTTON_SIZE: Record<IconButtonSize, IconSize> = {
  md: 'sm',
  lg: 'md',
  '2xl': 'xl',
};

export type IconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'color'
> & {
  icon: StrokeIconName;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  active?: boolean;
  iconClassName?: string;
};

export function IconButton({
  icon,
  variant = 'button',
  size = 'md',
  active = false,
  className,
  iconClassName,
  type = 'button',
  'aria-pressed': ariaPressed,
  ...props
}: IconButtonProps) {
  const iconSize = ICON_SIZE_BY_BUTTON_SIZE[size];
  const isPressed = active || ariaPressed === true || ariaPressed === 'true';

  return (
    <button
      type={type}
      className={cx(
        'c-icon-button',
        `c-icon-button--variant-${variant}`,
        `c-icon-button--size-${size}`,
        isPressed && 'c-icon-button--active',
        className,
      )}
      aria-pressed={ariaPressed ?? (active ? true : undefined)}
      {...props}
    >
      <Icon
        name={icon}
        size={iconSize}
        hierarchy="tertiary"
        className={cx('c-icon-button__icon', iconClassName)}
        aria-hidden
      />
    </button>
  );
}
