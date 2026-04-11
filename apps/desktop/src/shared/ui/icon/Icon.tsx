import { forwardRef, useId, type SVGProps } from 'react';
import { cx } from '../../lib/cx';
import {
  ICON_GLYPHS,
  type IconColor,
  type IconHierarchy,
  type IconName,
  type IconSize,
} from './iconGlyphs';
import './icon.css';

const COLOR_CLASS_NAMES: Record<IconColor, Record<IconHierarchy, string>> = {
  text: {
    primary: 'c-icon--text-primary',
    tertiary: 'c-icon--text-tertiary',
  },
  brand: {
    primary: 'c-icon--brand-primary',
    tertiary: 'c-icon--brand-tertiary',
  },
};

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'color'> & {
  name: IconName;
  size?: IconSize;
  hierarchy?: IconHierarchy;
  color?: IconColor;
  title?: string;
};

export const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
  {
    name,
    size = 'md',
    hierarchy = 'primary',
    color = 'text',
    className,
    title,
    role,
    'aria-hidden': ariaHidden,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    ...props
  },
  ref,
) {
  const titleId = useId();
  const resolvedAriaLabelledBy =
    ariaLabelledBy ?? (ariaLabel === undefined && title ? titleId : undefined);
  const isDecorative =
    ariaHidden ?? (ariaLabel === undefined && resolvedAriaLabelledBy === undefined);

  // A fixed viewBox keeps each glyph source consistent while stroke weight scales with size.
  return (
    <svg
      {...props}
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cx('c-icon', `c-icon--${size}`, COLOR_CLASS_NAMES[color][hierarchy], className)}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={role ?? (isDecorative ? undefined : 'img')}
      aria-hidden={isDecorative}
      aria-label={ariaLabel}
      aria-labelledby={resolvedAriaLabelledBy}
      focusable="false"
    >
      {title ? <title id={titleId}>{title}</title> : null}
      {ICON_GLYPHS[name]}
    </svg>
  );
});
