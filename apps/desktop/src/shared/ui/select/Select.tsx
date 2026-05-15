import {
  forwardRef,
  type ChangeEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '../../lib/cx';
import { Icon } from '../icon/Icon';
import { SelectMenu } from './SelectMenu';
import {
  assignRef,
  getFirstEnabledIndex,
  getNextEnabledIndex,
  getOptionDisplayText,
} from './selectOptions';
import { SELECT_TYPES, type SelectOption, type SelectProps } from './types';
import './select.css';

export { SELECT_TYPES };
export type { SelectFilterOptions, SelectOption, SelectProps, SelectType } from './types';

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
    placeholder,
    placeholderLeading,
    className,
    triggerClassName,
    menuClassName,
    listClassName,
    searchValue,
    defaultSearchValue = '',
    onSearchValueChange,
    filterOptions,
    emptyMessage,
    disabled = false,
    onClick,
    onKeyDown,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    ...props
  },
  ref,
) {
  const { t } = useTranslation('common');
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
  const resolvedPlaceholder = placeholder ?? t('common.select', { defaultValue: 'Select' });
  const resolvedEmptyMessage =
    emptyMessage ?? t('common.no_results_found', { defaultValue: 'No results found' });

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
  const searchPlaceholder =
    typeof resolvedPlaceholder === 'string' ? resolvedPlaceholder : undefined;

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
                {selectedOption ? selectedOption.label : resolvedPlaceholder}
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
        <SelectMenu
          listboxId={listboxId}
          labelId={label ? labelId : undefined}
          type={type}
          options={displayedOptions}
          value={resolvedValue}
          highlightedIndex={highlightedIndex}
          emptyMessage={resolvedEmptyMessage}
          menuClassName={menuClassName}
          listClassName={listClassName}
          onHighlight={setHighlightedIndex}
          onCommit={commitSelection}
        />
      ) : null}
    </div>
  );
});
