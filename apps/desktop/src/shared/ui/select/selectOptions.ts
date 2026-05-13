import type { Ref } from 'react';
import type { SelectOption } from './types';

export const assignRef = <T>(ref: Ref<T> | undefined, value: T) => {
  if (typeof ref === 'function') {
    ref(value);
    return;
  }

  if (ref && 'current' in ref) {
    (ref as { current: T }).current = value;
  }
};

export const getOptionDisplayText = (option: SelectOption) => {
  if (typeof option.label === 'string' || typeof option.label === 'number') {
    return String(option.label);
  }

  return option.value;
};

export const getFirstEnabledIndex = (options: SelectOption[]) =>
  options.findIndex(option => !option.disabled);

export const getNextEnabledIndex = (
  options: SelectOption[],
  currentIndex: number,
  direction: 1 | -1,
) => {
  if (options.length === 0) {
    return -1;
  }

  let cursor = currentIndex;
  for (let step = 0; step < options.length; step += 1) {
    cursor = (cursor + direction + options.length) % options.length;
    if (!options[cursor]?.disabled) {
      return cursor;
    }
  }

  return -1;
};
