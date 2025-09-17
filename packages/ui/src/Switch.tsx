import React, { useCallback } from 'react';
import cn from '@tgim/utils/cn';

type SwitchProps<T> = {
  variant?: 'default' | 'language';
  onChanged?: (newVal: T) => void;
  current: T;
  className?: string;
  options: {
    name: string;
    value: T;
  }[];
};

const variantClasses: Record<NonNullable<SwitchProps<unknown>['variant']>, string> = {
  default: 'switch-default',
  language: 'switch-language',
};

// Small select element that reuses button tokens for consistent styling.
const Switch = <T extends string | number>({
  current,
  variant = 'default',
  onChanged,
  className,
  options,
}: SwitchProps<T>) => {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      onChanged?.(event.target.value as T);
    },
    [onChanged],
  );

  return (
    <label>
      <select
        value={current}
        onChange={handleChange}
        className={cn('btn', 'switch', variantClasses[variant], className)}
      >
        {options.map(option => (
          <option key={option.value + option.name} value={option.value}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
};

export default Switch;
