import {
  createContext,
  forwardRef,
  useEffect,
  useContext,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cx } from '../../lib/cx';
import { Icon } from '../icon/Icon';
import './accordion.css';

export const ACCORDION_ROOT_TYPES = ['single', 'multiple'] as const;

export type AccordionRootType = (typeof ACCORDION_ROOT_TYPES)[number];
export type AccordionRootValue = string | string[] | null;

export type AccordionRootProps = Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'value'> & {
  type?: AccordionRootType;
  value?: AccordionRootValue;
  defaultValue?: AccordionRootValue;
  onValueChange?: (value: AccordionRootValue) => void;
  collapsible?: boolean;
};

export type AccordionItemProps = Omit<HTMLAttributes<HTMLDivElement>, 'value'> & {
  value: string;
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  disabled?: boolean;
};

export type AccordionItemHeaderProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  children: ReactNode;
  index?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  expanded?: boolean;
  controlsId?: string;
  onToggle?: () => void;
};

export type AccordionItemBodyProps = HTMLAttributes<HTMLDivElement> & {
  expanded?: boolean;
  labelledBy?: string;
  keepMounted?: boolean;
};

export type AccordionDisclosureProps = HTMLAttributes<HTMLSpanElement> & {
  children?: ReactNode;
  expanded?: boolean;
};

type AccordionRootContextValue = {
  type: AccordionRootType;
  collapsible: boolean;
  isExpanded: (value: string) => boolean;
  setExpanded: (value: string, nextExpanded: boolean) => void;
};

type AccordionItemContextValue = {
  value: string;
  expanded: boolean;
  disabled: boolean;
  triggerId: string;
  bodyId: string;
  hasBody: boolean;
  setHasBody: (hasBody: boolean) => void;
  toggle: () => void;
};

const AccordionRootContext = createContext<AccordionRootContextValue | null>(null);
const AccordionItemContext = createContext<AccordionItemContextValue | null>(null);

const normalizeRootValue = (
  type: AccordionRootType,
  value: AccordionRootValue | undefined,
): AccordionRootValue => {
  if (type === 'multiple') {
    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value === 'string') {
      return [value];
    }

    return [];
  }

  if (typeof value === 'string') {
    return value;
  }

  return null;
};

const isExpandedInRoot = (
  type: AccordionRootType,
  value: AccordionRootValue,
  itemValue: string,
) => {
  if (type === 'multiple') {
    return Array.isArray(value) && value.includes(itemValue);
  }

  return value === itemValue;
};

export const AccordionRoot = forwardRef<HTMLDivElement, AccordionRootProps>(function AccordionRoot(
  {
    type = 'single',
    value,
    defaultValue,
    onValueChange,
    collapsible = true,
    className,
    children,
    ...props
  },
  ref,
) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<AccordionRootValue>(() =>
    normalizeRootValue(type, defaultValue),
  );
  const resolvedValue = normalizeRootValue(type, isControlled ? value : internalValue);

  const setResolvedValue = (nextValue: AccordionRootValue) => {
    if (!isControlled) {
      setInternalValue(nextValue);
    }

    onValueChange?.(nextValue);
  };

  const contextValue: AccordionRootContextValue = {
    type,
    collapsible,
    isExpanded: itemValue => isExpandedInRoot(type, resolvedValue, itemValue),
    setExpanded: (itemValue, nextExpanded) => {
      if (type === 'multiple') {
        const currentValue = Array.isArray(resolvedValue) ? resolvedValue : [];
        const nextValue = nextExpanded
          ? [...new Set([...currentValue, itemValue])]
          : currentValue.filter(currentItem => currentItem !== itemValue);
        setResolvedValue(nextValue);
        return;
      }

      if (nextExpanded) {
        setResolvedValue(itemValue);
        return;
      }

      if (collapsible) {
        setResolvedValue(null);
      }
    },
  };

  return (
    <AccordionRootContext.Provider value={contextValue}>
      <div
        {...props}
        ref={ref}
        className={cx('c-accordion-root', `c-accordion-root--type-${type}`, className)}
      >
        {children}
      </div>
    </AccordionRootContext.Provider>
  );
});

export const AccordionItem = forwardRef<HTMLDivElement, AccordionItemProps>(function AccordionItem(
  {
    value,
    expanded,
    defaultExpanded = false,
    onExpandedChange,
    disabled = false,
    className,
    children,
    ...props
  },
  ref,
) {
  const rootContext = useContext(AccordionRootContext);
  const isStandaloneControlled = expanded !== undefined;
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const [hasBody, setHasBody] = useState(false);
  const itemId = useId();

  const resolvedExpanded = rootContext
    ? rootContext.isExpanded(value)
    : (expanded ?? internalExpanded);
  const previousExpandedRef = useRef(resolvedExpanded);
  const onExpandedChangeRef = useRef(onExpandedChange);

  const setResolvedExpanded = (nextExpanded: boolean) => {
    if (disabled) {
      return;
    }

    if (rootContext) {
      rootContext.setExpanded(value, nextExpanded);
    } else if (!isStandaloneControlled) {
      setInternalExpanded(nextExpanded);
    }

    if (!rootContext) {
      onExpandedChange?.(nextExpanded);
    }
  };

  useEffect(() => {
    onExpandedChangeRef.current = onExpandedChange;
  }, [onExpandedChange]);

  useEffect(() => {
    if (!rootContext) {
      previousExpandedRef.current = resolvedExpanded;
      return;
    }

    if (previousExpandedRef.current === resolvedExpanded) {
      return;
    }

    previousExpandedRef.current = resolvedExpanded;
    onExpandedChangeRef.current?.(resolvedExpanded);
  }, [resolvedExpanded, rootContext]);

  const contextValue: AccordionItemContextValue = {
    value,
    expanded: resolvedExpanded,
    disabled,
    triggerId: `${itemId}-trigger`,
    bodyId: `${itemId}-body`,
    hasBody,
    setHasBody,
    toggle: () => {
      setResolvedExpanded(!resolvedExpanded);
    },
  };

  return (
    <AccordionItemContext.Provider value={contextValue}>
      <div
        {...props}
        ref={ref}
        data-expanded={resolvedExpanded ? 'true' : 'false'}
        data-disabled={disabled ? 'true' : 'false'}
        className={cx('c-accordion-item', className)}
      >
        {children}
      </div>
    </AccordionItemContext.Provider>
  );
});

export const AccordionItemHeader = forwardRef<HTMLButtonElement, AccordionItemHeaderProps>(
  function AccordionItemHeader(
    {
      index,
      meta,
      trailing,
      expanded,
      controlsId,
      onToggle,
      className,
      children,
      id,
      type = 'button',
      disabled,
      onClick,
      ...props
    },
    ref,
  ) {
    const itemContext = useContext(AccordionItemContext);
    const resolvedExpanded = expanded ?? itemContext?.expanded ?? false;
    const resolvedDisabled = disabled ?? itemContext?.disabled ?? false;
    const resolvedControlsId =
      controlsId ?? (itemContext?.hasBody ? itemContext.bodyId : undefined);
    const resolvedId = id ?? itemContext?.triggerId;
    const resolvedTrailing = trailing ?? (
      <AccordionDisclosure expanded={resolvedExpanded}>{meta}</AccordionDisclosure>
    );

    const handleClick: ButtonHTMLAttributes<HTMLButtonElement>['onClick'] = event => {
      onClick?.(event);
      if (event.defaultPrevented || resolvedDisabled) {
        return;
      }

      onToggle?.();
      itemContext?.toggle();
    };

    return (
      <button
        {...props}
        ref={ref}
        id={resolvedId}
        type={type}
        disabled={resolvedDisabled}
        aria-expanded={resolvedExpanded}
        aria-controls={resolvedControlsId}
        onClick={handleClick}
        className={cx('c-accordion-item__header', className)}
      >
        <span className="c-accordion-item__header-main">
          {index !== undefined ? (
            <span className="c-accordion-item__index" aria-hidden="true">
              {index}
            </span>
          ) : null}
          <span className="c-accordion-item__title">{children}</span>
        </span>
        {resolvedTrailing}
      </button>
    );
  },
);

export const AccordionItemBody = forwardRef<HTMLDivElement, AccordionItemBodyProps>(
  function AccordionItemBody(
    { expanded, labelledBy, keepMounted = true, className, children, id, ...props },
    ref,
  ) {
    const itemContext = useContext(AccordionItemContext);
    const resolvedExpanded = expanded ?? itemContext?.expanded ?? true;
    const resolvedId = id ?? itemContext?.bodyId;
    const resolvedLabelledBy = labelledBy ?? itemContext?.triggerId;
    const isRendered = keepMounted || resolvedExpanded;
    const registerBody = itemContext?.setHasBody;

    useEffect(() => {
      if (!registerBody) {
        return;
      }

      registerBody(isRendered);

      return () => {
        registerBody(false);
      };
    }, [isRendered, registerBody]);

    if (!isRendered) {
      return null;
    }

    return (
      <div
        {...props}
        ref={ref}
        id={resolvedId}
        role={resolvedLabelledBy ? 'region' : undefined}
        aria-labelledby={resolvedLabelledBy}
        aria-hidden={!resolvedExpanded}
        data-expanded={resolvedExpanded ? 'true' : 'false'}
        className={cx('c-accordion-item__body', className)}
      >
        {children}
      </div>
    );
  },
);

export const AccordionDisclosure = forwardRef<HTMLSpanElement, AccordionDisclosureProps>(
  function AccordionDisclosure({ expanded, className, children, ...props }, ref) {
    const itemContext = useContext(AccordionItemContext);
    const resolvedExpanded = expanded ?? itemContext?.expanded ?? false;

    return (
      <span
        {...props}
        ref={ref}
        data-expanded={resolvedExpanded ? 'true' : 'false'}
        className={cx('c-accordion-disclosure', className)}
      >
        {children ? <span className="c-accordion-disclosure__value">{children}</span> : null}
        <Icon
          name={resolvedExpanded ? 'chevron-up' : 'chevron-down'}
          size="xs"
          color={resolvedExpanded ? 'brand' : 'text'}
          hierarchy={resolvedExpanded ? 'primary' : 'tertiary'}
          aria-hidden
        />
      </span>
    );
  },
);
