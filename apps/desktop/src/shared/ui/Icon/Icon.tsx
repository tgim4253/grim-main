import type { SVGAttributes } from 'react';
import { cx } from '../../lib/cx';
import { ICON_DEFINITIONS, type IconName } from './iconDefinitions';
import './Icon.css';

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type IconHierarchy = 'primary' | 'tertiary';
export type IconColor = 'white' | 'black';

export type IconProps = Omit<SVGAttributes<SVGSVGElement>, 'color'> & {
  name: IconName;
  size?: IconSize;
  hierarchy?: IconHierarchy;
  color?: IconColor;
};

export function Icon({
  name,
  size = 'md',
  hierarchy = 'primary',
  color = 'white',
  className,
  role,
  'aria-label': ariaLabel,
  ...props
}: IconProps) {
  const definition = ICON_DEFINITIONS[name];
  const svg = definition.kind === 'dual' ? definition.variants[color] : definition.svg;

  return (
    <svg
      viewBox={svg.viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cx(
        'c-icon',
        `c-icon--size-${size}`,
        `c-icon--hierarchy-${hierarchy}`,
        `c-icon--kind-${definition.kind}`,
        definition.kind === 'dual' && `c-icon--tone-${color}`,
        className,
      )}
      role={role ?? (ariaLabel ? 'img' : undefined)}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      {...props}
    >
      <g dangerouslySetInnerHTML={{ __html: svg.markup }} />
    </svg>
  );
}
