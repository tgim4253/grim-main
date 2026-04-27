import {
  forwardRef,
  type ChangeEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { cx } from '../../lib/cx';
import { Icon } from '../icon/Icon';
import './select.css';

export const SELECT_TYPES = ['default', 'icon-leading', 'search'] as const;

export type SelectType = (typeof SELECT_TYPES)[number];
export type SelectFilterOptions = (query: string, options: SelectOption[]) => SelectOption[];

export type SelectOption = {
  value: string;
  label: ReactNode;
  supportingText?: ReactNode;
  disabled?: boolean;
  menuLeading?: ReactNode;
  valueLeading?: ReactNode;
};

export type SelectProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'defaultValue' | 'onChange' | 'type' | 'value'
> & {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  type?: SelectType;
  label?: ReactNode;
  placeholder?: ReactNode;
  placeholderLeading?: ReactNode;
  triggerClassName?: string;
  menuClassName?: string;
  listClassName?: string;
  searchValue?: string;
  defaultSearchValue?: string;
  onSearchValueChange?: (value: string) => void;
  filterOptions?: SelectFilterOptions;
  emptyMessage?: ReactNode;
};

const assignRef = <T,>(ref: Ref<T> | undefined, value: T) => {
  if (typeof ref === 'function') {
    ref(value);
    return;
  }

  if (ref && 'current' in ref) {
    (ref as { current: T }).current = value;
  }
};

const getOptionDisplayText = (option: SelectOption) => {
  if (typeof option.label === 'string' || typeof option.label === 'number') {
    return String(option.label);
  }

  return option.value;
};

const getFirstEnabledIndex = (options: SelectOption[]) =>
  options.findIndex(option => !option.disabled);

const getNextEnabledIndex = (options: SelectOption[], currentIndex: number, direction: 1 | -1) => {
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

export const Select = forwardRef<HTMLButtonElement | HTMLInputElement, SelectProps>(function Select(
  {
    id,
    options,
    value,
    defaultValue,
    onValueChange,
    open,
    defaultOpen = false,
    onOpenChange,
    type = 'default',
    label,
    placeholder = 'Select',
    placeholderLeading,
    className,
    triggerClassName,
    menuClassName,
    listClassName,
    searchValue,
    defaultSearchValue = '',
    onSearchValueChange,
    filterOptions,
    emptyMessage = 'No results found',
    disabled = false,
    onClick,
    onKeyDown,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    ...props
  },
  ref,
) {
  const triggerId = useId();
  const listboxId = useId();
  const labelId = useId();
  const triggerRef = useRef<HTMLButtonElement | HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const isValueControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const resolvedValue = isValueControlled ? value : internalValue;
  const isSearch = type === 'search';

  const isOpenControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const resolvedOpen = isOpenControlled ? open : internalOpen;

  const isSearchValueControlled = searchValue !== undefined;
  const [internalSearchValue, setInternalSearchValue] = useState(defaultSearchValue);
  const resolvedSearchValue = isSearchValueControlled ? searchValue : internalSearchValue;

  const displayedOptions = useMemo(
    () => (isSearch && filterOptions ? filterOptions(resolvedSearchValue, options) : options),
    [filterOptions, isSearch, options, resolvedSearchValue],
  );

  const selectedIndex = useMemo(
    () => displayedOptions.findIndex(option => option.value === resolvedValue),
    [displayedOptions, resolvedValue],
  );
  const selectedOption = useMemo(
    () => options.find(option => option.value === resolvedValue) ?? null,
    [options, resolvedValue],
  );

  const [highlightedIndex, setHighlightedIndex] = useState(() =>
    selectedIndex >= 0 && !displayedOptions[selectedIndex]?.disabled
      ? selectedIndex
      : getFirstEnabledIndex(displayedOptions),
  );

  const triggerLeading = useMemo(() => {
    if (type === 'search') {
      return (
        <Icon
          name="search"
          size="md"
          hierarchy="tertiary"
          aria-hidden
          className="c-select__glyph"
        />
      );
    }

    if (type !== 'icon-leading') {
      return null;
    }

    if (selectedOption) {
      return (
        selectedOption.valueLeading ??
        selectedOption.menuLeading ?? (
          <Icon
            name="user"
            size="md"
            hierarchy="tertiary"
            aria-hidden
            className="c-select__glyph"
          />
        )
      );
    }

    return (
      placeholderLeading ?? (
        <Icon name="user" size="md" hierarchy="tertiary" aria-hidden className="c-select__glyph" />
      )
    );
  }, [placeholderLeading, selectedOption, type]);

  const setResolvedOpen = (nextOpen: boolean) => {
    if (!isOpenControlled) {
      setInternalOpen(nextOpen);
    }

    onOpenChange?.(nextOpen);
  };

  const setResolvedValue = (nextValue: string) => {
    if (!isValueControlled) {
      setInternalValue(nextValue);
    }

    onValueChange?.(nextValue);
  };

  const setResolvedSearchValue = (nextValue: string) => {
    if (!isSearchValueControlled) {
      setInternalSearchValue(nextValue);
    }

    onSearchValueChange?.(nextValue);
  };

  const closeMenu = () => {
    setResolvedOpen(false);
  };

  const commitSelection = (option: SelectOption) => {
    setResolvedValue(option.value);
    if (isSearch) {
      setResolvedSearchValue(getOptionDisplayText(option));
    }

    closeMenu();
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!resolvedOpen) {
      return;
    }

    setHighlightedIndex(
      selectedIndex >= 0 && !displayedOptions[selectedIndex]?.disabled
        ? selectedIndex
        : getFirstEnabledIndex(displayedOptions),
    );
  }, [displayedOptions, resolvedOpen, selectedIndex]);

  useEffect(() => {
    if (!resolvedOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }

      closeMenu();
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }

      closeMenu();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, [resolvedOpen]);

  useEffect(() => {
    if (!disabled || !resolvedOpen) {
      return;
    }

    closeMenu();
  }, [disabled, resolvedOpen]);

  const handleTriggerClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || disabled) {
      return;
    }

    setResolvedOpen(!resolvedOpen);
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || disabled) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        if (!resolvedOpen) {
          setResolvedOpen(true);
          return;
        }

        setHighlightedIndex(current => getNextEnabledIndex(displayedOptions, current, 1));
        return;
      }
      case 'ArrowUp': {
        event.preventDefault();
        if (!resolvedOpen) {
          setResolvedOpen(true);
          return;
        }

        setHighlightedIndex(current => getNextEnabledIndex(displayedOptions, current, -1));
        return;
      }
      case 'Home': {
        if (!resolvedOpen) {
          return;
        }

        event.preventDefault();
        setHighlightedIndex(getFirstEnabledIndex(displayedOptions));
        return;
      }
      case 'End': {
        if (!resolvedOpen) {
          return;
        }

        event.preventDefault();
        setHighlightedIndex(getNextEnabledIndex(displayedOptions, 0, -1));
        return;
      }
      case 'Enter':
      case ' ': {
        event.preventDefault();
        if (!resolvedOpen) {
          setResolvedOpen(true);
          return;
        }

        if (highlightedIndex < 0 || highlightedIndex >= displayedOptions.length) {
          return;
        }

        const highlightedOption = displayedOptions[highlightedIndex];
        if (!highlightedOption.disabled) {
          commitSelection(highlightedOption);
        }
        return;
      }
      case 'Escape': {
        if (!resolvedOpen) {
          return;
        }

        event.preventDefault();
        closeMenu();
        return;
      }
      default:
        return;
    }
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setResolvedSearchValue(event.target.value);
    setResolvedOpen(true);
  };

  const handleSearchFocus = () => {
    if (!disabled) {
      setResolvedOpen(true);
    }
  };

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (disabled) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        if (!resolvedOpen) {
          setResolvedOpen(true);
          return;
        }

        setHighlightedIndex(current => getNextEnabledIndex(displayedOptions, current, 1));
        return;
      }
      case 'ArrowUp': {
        event.preventDefault();
        if (!resolvedOpen) {
          setResolvedOpen(true);
          return;
        }

        setHighlightedIndex(current => getNextEnabledIndex(displayedOptions, current, -1));
        return;
      }
      case 'Enter': {
        if (!resolvedOpen) {
          setResolvedOpen(true);
          return;
        }

        if (highlightedIndex < 0 || highlightedIndex >= displayedOptions.length) {
          return;
        }

        const highlightedOption = displayedOptions[highlightedIndex];
        if (!highlightedOption.disabled) {
          event.preventDefault();
          commitSelection(highlightedOption);
        }
        return;
      }
      case 'Escape': {
        if (!resolvedOpen) {
          return;
        }

        event.preventDefault();
        closeMenu();
        return;
      }
      default:
        return;
    }
  };

  const resolvedAriaLabelledBy = [ariaLabelledBy, label ? labelId : undefined]
    .filter(Boolean)
    .join(' ');
  const activeDescendantId =
    resolvedOpen && highlightedIndex >= 0 && displayedOptions[highlightedIndex]
      ? `${listboxId}-option-${String(highlightedIndex)}`
      : undefined;
  const searchPlaceholder = typeof placeholder === 'string' ? placeholder : undefined;

  return (
    <div
      ref={rootRef}
      className={cx('c-select', className)}
      data-open={resolvedOpen ? 'true' : undefined}
      data-disabled={disabled ? 'true' : undefined}
    >
      {label ? (
        <div id={labelId} className="c-select__label">
          {label}
        </div>
      ) : null}

      {isSearch ? (
        <div
          className={cx(
            'c-select__trigger',
            'c-select__trigger--search',
            disabled && 'c-select__trigger--disabled',
            triggerClassName,
          )}
        >
          <span className="c-select__leading">{triggerLeading}</span>
          <input
            id={id ?? triggerId}
            ref={node => {
              triggerRef.current = node;
              assignRef(ref, node);
            }}
            type="text"
            disabled={disabled}
            className="c-select__search-input"
            value={resolvedSearchValue}
            placeholder={searchPlaceholder}
            role="combobox"
            aria-label={ariaLabel}
            aria-labelledby={resolvedAriaLabelledBy || undefined}
            aria-haspopup="listbox"
            aria-expanded={resolvedOpen}
            aria-controls={resolvedOpen ? listboxId : undefined}
            aria-activedescendant={activeDescendantId}
            aria-autocomplete="list"
            autoComplete="off"
            onChange={handleSearchChange}
            onFocus={handleSearchFocus}
            onKeyDown={handleSearchKeyDown}
          />
        </div>
      ) : (
        <button
          {...props}
          id={id ?? triggerId}
          ref={node => {
            triggerRef.current = node;
            assignRef(ref, node);
          }}
          type="button"
          disabled={disabled}
          className={cx(
            'c-select__trigger',
            `c-select__trigger--${type}`,
            !selectedOption && 'c-select__trigger--placeholder',
            triggerClassName,
          )}
          role="combobox"
          aria-label={ariaLabel}
          aria-labelledby={resolvedAriaLabelledBy || undefined}
          aria-haspopup="listbox"
          aria-expanded={resolvedOpen}
          aria-controls={resolvedOpen ? listboxId : undefined}
          aria-activedescendant={activeDescendantId}
          onClick={handleTriggerClick}
          onKeyDown={handleTriggerKeyDown}
        >
          <span className="c-select__content">
            {triggerLeading ? <span className="c-select__leading">{triggerLeading}</span> : null}

            <span className="c-select__text-group">
              <span
                className={cx('c-select__value', !selectedOption && 'c-select__value--placeholder')}
              >
                {selectedOption ? selectedOption.label : placeholder}
              </span>

              {selectedOption?.supportingText ? (
                <span className="c-select__supporting">{selectedOption.supportingText}</span>
              ) : null}
            </span>
          </span>

          <span className="c-select__trailing">
            <Icon
              name={resolvedOpen ? 'chevron-up' : 'chevron-down'}
              size="md"
              hierarchy="tertiary"
              aria-hidden
              className="c-select__glyph"
            />
          </span>
        </button>
      )}

      {resolvedOpen ? (
        <div className={cx('c-select__menu', menuClassName)}>
          <div
            id={listboxId}
            role="listbox"
            aria-labelledby={label ? labelId : undefined}
            className={cx('c-select__list', listClassName)}
          >
            {displayedOptions.length > 0 ? (
              displayedOptions.map((option, index) => {
                const isSelected = option.value === resolvedValue;
                const isHighlighted = highlightedIndex === index && !option.disabled;
                const leading =
                  option.menuLeading ??
                  (type === 'icon-leading' ? (
                    <Icon
                      name="user"
                      size="md"
                      hierarchy="tertiary"
                      aria-hidden
                      className="c-select__glyph"
                    />
                  ) : null);

                return (
                  <div
                    key={option.value}
                    id={`${listboxId}-option-${String(index)}`}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled || undefined}
                    className={cx(
                      'c-select__option',
                      Boolean(leading) && 'c-select__option--with-leading',
                      Boolean(option.supportingText) && 'c-select__option--with-supporting',
                    )}
                    data-selected={isSelected ? 'true' : undefined}
                    data-highlighted={isHighlighted ? 'true' : undefined}
                    data-disabled={option.disabled ? 'true' : undefined}
                    onMouseEnter={() => {
                      if (!option.disabled) {
                        setHighlightedIndex(index);
                      }
                    }}
                    onMouseDown={event => {
                      event.preventDefault();
                    }}
                    onClick={() => {
                      if (!option.disabled) {
                        commitSelection(option);
                      }
                    }}
                  >
                    <span className="c-select__option-content">
                      {leading ? <span className="c-select__option-leading">{leading}</span> : null}

                      <span className="c-select__option-text-group">
                        <span className="c-select__option-label">{option.label}</span>
                        {option.supportingText ? (
                          <span className="c-select__option-supporting">
                            {option.supportingText}
                          </span>
                        ) : null}
                      </span>
                    </span>

                    {isSelected ? (
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
              })
            ) : (
              <div className="c-select__empty" role="status">
                {emptyMessage}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
});
