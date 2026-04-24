import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from 'react';
import { cx } from '../../lib/cx';
import { Icon } from '../icon/Icon';
import type { IconColor, IconHierarchy, IconName, IconSize } from '../icon/iconGlyphs';
import './icon-button.css';

export const ICON_BUTTON_KINDS = ['button', 'sidebar'] as const;
export const ICON_BUTTON_SIZES = ['xs', 'sm', 'md', 'lg', '2xl'] as const;

export type IconButtonKind = (typeof ICON_BUTTON_KINDS)[number];
export type IconButtonSize = (typeof ICON_BUTTON_SIZES)[number];
export type IconButtonColor = IconColor | 'auto';
export type IconButtonIconSize = IconSize | '2xs';

const SIZE_CLASS_NAMES: Record<IconButtonSize, string> = {
  xs: 'c-icon-button--size-xs',
  sm: 'c-icon-button--size-sm',
  md: 'c-icon-button--size-md',
  lg: 'c-icon-button--size-lg',
  '2xl': 'c-icon-button--size-2xl',
};

const DEFAULT_ICON_SIZES: Record<IconButtonSize, IconButtonIconSize> = {
  xs: '2xs',
  sm: 'xs',
  md: 'sm',
  lg: 'md',
  '2xl': 'md',
};

const ICON_COLOR_VARIABLES: Record<IconColor, Record<IconHierarchy, string>> = {
  text: {
    primary: 'var(--semantic-colors-text-primary)',
    tertiary: 'var(--semantic-colors-text-teritary)',
  },
  brand: {
    primary: 'var(--semantic-colors-brand-primary)',
    tertiary: 'var(--semantic-colors-brand-teritary)',
  },
};

const ICON_SIZE_VARIABLES: Record<IconButtonIconSize, string> = {
  '2xs': 'var(--semantic-size-icon-2xs)',
  xs: 'var(--semantic-size-icon-xs)',
  sm: 'var(--semantic-size-icon-sm)',
  md: 'var(--semantic-size-icon-md)',
  lg: 'var(--semantic-size-icon-lg)',
  xl: 'var(--semantic-size-icon-xl)',
};

const resolveAutoIconColor = (kind: IconButtonKind, interactive: boolean): IconColor => {
  if (kind === 'sidebar' && interactive) {
    return 'brand';
  }

  return 'text';
};

const resolveAutoIconHierarchy = (interactive: boolean): IconHierarchy =>
  interactive ? 'primary' : 'tertiary';

const resolveIconTokenValue = (color: IconColor, hierarchy: IconHierarchy) =>
  ICON_COLOR_VARIABLES[color][hierarchy];

export type IconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'color'
> & {
  icon: IconName;
  kind?: IconButtonKind;
  size?: IconButtonSize;
  active?: boolean;
  iconSize?: IconButtonIconSize;
  iconColor?: IconButtonColor;
  iconHierarchy?: IconHierarchy;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon,
    kind = 'button',
    size,
    active = false,
    iconSize,
    iconColor = 'auto',
    iconHierarchy,
    className,
    type = 'button',
    disabled,
    style,
    ...props
  },
  ref,
) {
  const resolvedSize = size ?? (kind === 'sidebar' ? '2xl' : 'md');
  const resolvedIconSize = iconSize ?? DEFAULT_ICON_SIZES[resolvedSize];
  const resolvedBaseColor = iconColor === 'auto' ? resolveAutoIconColor(kind, false) : iconColor;
  const resolvedInteractiveColor =
    iconColor === 'auto' ? resolveAutoIconColor(kind, true) : iconColor;
  const resolvedBaseHierarchy = iconHierarchy ?? resolveAutoIconHierarchy(false);
  const resolvedInteractiveHierarchy = iconHierarchy ?? resolveAutoIconHierarchy(true);
  const resolvedStyle = {
    ...style,
    '--_icon-button-icon-size': ICON_SIZE_VARIABLES[resolvedIconSize],
    '--_icon-button-icon-color-base': resolveIconTokenValue(
      resolvedBaseColor,
      resolvedBaseHierarchy,
    ),
    '--_icon-button-icon-color-interactive': resolveIconTokenValue(
      resolvedInteractiveColor,
      resolvedInteractiveHierarchy,
    ),
  } as CSSProperties;

  return (
    <button
      {...props}
      ref={ref}
      type={type}
      disabled={disabled}
      data-active={active ? 'true' : undefined}
      style={resolvedStyle}
      className={cx(
        'c-icon-button',
        `c-icon-button--${kind}`,
        SIZE_CLASS_NAMES[resolvedSize],
        className,
      )}
    >
      <Icon
        name={icon}
        size="md"
        color="text"
        hierarchy="primary"
        aria-hidden
        className="c-icon-button__icon"
      />
    </button>
  );
});
