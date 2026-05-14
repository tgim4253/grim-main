import { cx } from '../../lib/cx';
import { Icon } from '../icon/Icon';
import type { SelectOption, SelectType } from './types';

type SelectOptionRowProps = {
  option: SelectOption;
  index: number;
  listboxId: string;
  type: SelectType;
  selected: boolean;
  highlighted: boolean;
  onHighlight: (index: number) => void;
  onCommit: (option: SelectOption) => void;
};

export function SelectOptionRow({
  option,
  index,
  listboxId,
  type,
  selected,
  highlighted,
  onHighlight,
  onCommit,
}: SelectOptionRowProps) {
  const leading =
    option.menuLeading ??
    (type === 'icon-leading' ? (
      <Icon name="user" size="md" hierarchy="tertiary" aria-hidden className="c-select__glyph" />
    ) : null);

  return (
    <div
      id={`${listboxId}-option-${String(index)}`}
      role="option"
      aria-selected={selected}
      aria-disabled={option.disabled || undefined}
      className={cx(
        'c-select__option',
        Boolean(leading) && 'c-select__option--with-leading',
        Boolean(option.supportingText) && 'c-select__option--with-supporting',
      )}
      data-selected={selected ? 'true' : undefined}
      data-highlighted={highlighted ? 'true' : undefined}
      data-disabled={option.disabled ? 'true' : undefined}
      onMouseEnter={() => {
        if (!option.disabled) {
          onHighlight(index);
        }
      }}
      onMouseDown={event => {
        event.preventDefault();
      }}
      onClick={() => {
        if (!option.disabled) {
          onCommit(option);
        }
      }}
    >
      <span className="c-select__option-content">
        {leading ? <span className="c-select__option-leading">{leading}</span> : null}

        <span className="c-select__option-text-group">
          <span className="c-select__option-label">{option.label}</span>
          {option.supportingText ? (
            <span className="c-select__option-supporting">{option.supportingText}</span>
          ) : null}
        </span>
      </span>

      {selected ? (
        <span className="c-select__option-check">
          <Icon
            name="check"
            size="md"
            hierarchy="primary"
            aria-hidden
            className="c-select__glyph"
          />
        </span>
      ) : null}
    </div>
  );
}
