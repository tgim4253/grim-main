import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { SelectOptionRow } from './SelectOptionRow';
import type { SelectOption, SelectType } from './types';

type SelectMenuProps = {
  listboxId: string;
  labelId?: string;
  labelledBy?: string;
  type: SelectType;
  options: SelectOption[];
  value?: string;
  highlightedIndex: number;
  emptyMessage: ReactNode;
  menuClassName?: string;
  listClassName?: string;
  onHighlight: (index: number) => void;
  onCommit: (option: SelectOption) => void;
};

export function SelectMenu({
  listboxId,
  labelId,
  labelledBy,
  type,
  options,
  value,
  highlightedIndex,
  emptyMessage,
  menuClassName,
  listClassName,
  onHighlight,
  onCommit,
}: SelectMenuProps) {
  return (
    <div className={cx('c-select__menu', menuClassName)}>
      <div
        id={listboxId}
        role="listbox"
        aria-labelledby={labelledBy ?? labelId}
        className={cx('c-select__list', listClassName)}
      >
        {options.length > 0 ? (
          options.map((option, index) => (
            <SelectOptionRow
              key={option.value}
              option={option}
              index={index}
              listboxId={listboxId}
              type={type}
              selected={option.value === value}
              highlighted={highlightedIndex === index && !option.disabled}
              onHighlight={onHighlight}
              onCommit={onCommit}
            />
          ))
        ) : (
          <div className="c-select__empty" role="status">
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}
