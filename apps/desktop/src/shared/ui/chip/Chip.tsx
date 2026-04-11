import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { Icon } from '../icon/Icon';
import {
  CHIP_VARIANT_CLASS_NAMES,
  resolveChipAccessory,
  type PillChipVariant,
  type RoundedChipVariant,
} from './shared';
import './chip.css';
export { CHIP_SHAPES, CHIP_VARIANTS } from './shared';
export type { ChipShape, ChipVariant } from './shared';

type BaseChipProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  children: ReactNode;
};

export type ChipProps =
  | (BaseChipProps & {
      shape?: 'rounded';
      variant?: RoundedChipVariant;
    })
  | (BaseChipProps & {
      shape: 'pill';
      variant: PillChipVariant;
    });

export const Chip = forwardRef<HTMLSpanElement, ChipProps>(function Chip(
  { shape = 'rounded', variant, children, className, ...props },
  ref,
) {
  const resolvedVariant = variant ?? (shape === 'pill' ? 'outline' : 'neutral-dismiss');
  const accessory = resolveChipAccessory(resolvedVariant);

  return (
    <span
      {...props}
      ref={ref}
      className={cx(
        'c-chip',
        `c-chip--shape-${shape}`,
        CHIP_VARIANT_CLASS_NAMES[resolvedVariant],
        accessory?.placement === 'leading' && 'c-chip--icon-leading',
        accessory?.placement === 'trailing' && 'c-chip--icon-trailing',
        className,
      )}
    >
      {accessory?.kind === 'icon' && accessory.placement === 'leading' ? (
        <Icon
          aria-hidden
          name={accessory.iconName}
          className="c-chip__icon c-chip__icon--leading"
        />
      ) : null}
      <span className="c-chip__label">
        <span className="c-chip__text">{children}</span>
      </span>
      {accessory?.kind === 'icon' && accessory.placement === 'trailing' ? (
        <Icon
          aria-hidden
          name={accessory.iconName}
          className="c-chip__icon c-chip__icon--trailing"
        />
      ) : null}
      {accessory?.kind === 'action' && accessory.placement === 'trailing' ? (
        <span aria-hidden className="c-chip__action c-chip__action--trailing">
          <Icon name={accessory.iconName} className="c-chip__action-icon" aria-hidden />
        </span>
      ) : null}
    </span>
  );
});
