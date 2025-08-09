import cn from '@tgim/utils/cn';
import React from 'react';

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

function Switch<T extends string | number>({
  current,
  variant = 'default',
  onChanged,
  className,
  options,
}: SwitchProps<T>) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChanged?.(e.target.value as T);
  };

  return (
    <label>
      <select
        value={current}
        onChange={handleChange}
        className={cn('btn', 'switch', variantClasses[variant], className)}
      >
        {options.map((option, i) => (
          <option key={option.value + option.name} value={option.value}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export default Switch;
