import type { IconName } from '../icon/iconGlyphs';

export const CHIP_SHAPES = ['rounded', 'pill'] as const;
export const CHIP_VARIANTS = [
  'neutral-dismiss',
  'accent-outline',
  'accent-solid',
  'add',
  'outline',
  'selected',
] as const;

export type RoundedChipVariant = 'neutral-dismiss' | 'accent-outline' | 'accent-solid' | 'add';
export type PillChipVariant = 'outline' | 'selected';
export type ChipShape = (typeof CHIP_SHAPES)[number];
export type ChipVariant = (typeof CHIP_VARIANTS)[number];

export const CHIP_VARIANT_CLASS_NAMES: Record<ChipVariant, string> = {
  'neutral-dismiss': 'c-chip--neutral-dismiss',
  'accent-outline': 'c-chip--accent-outline',
  'accent-solid': 'c-chip--accent-solid',
  add: 'c-chip--add',
  outline: 'c-chip--outline',
  selected: 'c-chip--selected',
};

type ChipAccessory =
  | {
      kind: 'icon';
      iconName: IconName;
      placement: 'leading' | 'trailing';
    }
  | {
      kind: 'action';
      iconName: IconName;
      placement: 'leading' | 'trailing';
    }
  | null;

export const resolveChipAccessory = (variant: ChipVariant): ChipAccessory => {
  if (variant === 'neutral-dismiss') {
    return {
      kind: 'action',
      iconName: 'close',
      placement: 'trailing',
    };
  }

  if (variant === 'add') {
    return {
      kind: 'icon',
      iconName: 'plus',
      placement: 'leading',
    };
  }

  return null;
};
