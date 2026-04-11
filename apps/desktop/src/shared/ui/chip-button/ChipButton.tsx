import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { Icon } from '../icon/Icon';
import {
  CHIP_VARIANT_CLASS_NAMES,
  resolveChipAccessory,
  type PillChipVariant,
  type RoundedChipVariant,
} from '../chip/shared';
import '../chip/chip.css';
import './chip-button.css';

type BaseChipButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'color'> & {
  children: ReactNode;
  pressed?: boolean;
};

export type ChipButtonProps =
  | (BaseChipButtonProps & {
      shape?: 'rounded';
      variant?: RoundedChipVariant;
    })
  | (BaseChipButtonProps & {
      shape: 'pill';
      variant: PillChipVariant;
    });

export const ChipButton = forwardRef<HTMLButtonElement, ChipButtonProps>(function ChipButton(
  { shape = 'rounded', variant, children, pressed, className, type = 'button', disabled, ...props },
  ref,
) {
  const resolvedVariant = variant ?? (shape === 'pill' ? 'outline' : 'neutral-dismiss');
  const accessory = resolveChipAccessory(resolvedVariant);

  return (
    <button
      {...props}
      ref={ref}
      type={type}
      disabled={disabled}
      aria-pressed={pressed}
      className={cx(
        'c-chip',
        'c-chip-button',
        `c-chip--shape-${shape}`,
        CHIP_VARIANT_CLASS_NAMES[resolvedVariant],
        accessory?.placement === 'leading' && 'c-chip--icon-leading',
        accessory?.placement === 'trailing' && 'c-chip--icon-trailing',
        pressed && 'c-chip-button--pressed',
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
    </button>
  );
});
