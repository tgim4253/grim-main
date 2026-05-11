import {
  Children,
  createContext,
  forwardRef,
  isValidElement,
  useEffect,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ForwardedRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cx } from '../../lib/cx';
import { Icon } from '../icon/Icon';
import './accordion.css';

export const ACCORDION_ROOT_TYPES = ['single', 'multiple'] as const;

export type AccordionRootType = (typeof ACCORDION_ROOT_TYPES)[number];
export type AccordionRootValue = string | string[] | null;
export type AccordionReorderPosition = 'before' | 'after';
export type AccordionReorderPayload = {
  value: string;
  targetValue: string;
  position: AccordionReorderPosition;
};

export type AccordionRootProps = Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'value'> & {
  type?: AccordionRootType;
  value?: AccordionRootValue;
  defaultValue?: AccordionRootValue;
  onValueChange?: (value: AccordionRootValue) => void;
  collapsible?: boolean;
  reorderable?: boolean;
  onItemReorder?: (payload: AccordionReorderPayload) => void;
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

export type AccordionItemDragHeaderProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  controlsId?: string;
  disabled?: boolean;
  disclosureLabel?: string;
  dragLabel?: string;
  dragTitle?: string;
  expanded?: boolean;
  onToggle?: () => void;
  reorderable?: boolean;
  showDisclosure?: boolean;
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
  reorderable: boolean;
  isExpanded: (value: string) => boolean;
  setExpanded: (value: string, nextExpanded: boolean) => void;
};

type AccordionSortableReturn = ReturnType<typeof useSortable>;

type AccordionItemContextValue = {
  value: string;
  expanded: boolean;
  disabled: boolean;
  triggerId: string;
  bodyId: string;
  hasBody: boolean;
  setHasBody: (hasBody: boolean) => void;
  setDragActivatorNodeRef: AccordionSortableReturn['setActivatorNodeRef'];
  dragAttributes: AccordionSortableReturn['attributes'];
  dragListeners: AccordionSortableReturn['listeners'];
  toggle: () => void;
};

const AccordionRootContext = createContext<AccordionRootContextValue | null>(null);
const AccordionItemContext = createContext<AccordionItemContextValue | null>(null);

type AccordionElementProps = {
  children?: ReactNode;
  value?: unknown;
};

const POINTER_SENSOR_OPTIONS = {
  activationConstraint: {
    distance: 6,
  },
};

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

const getAccordionItemValues = (children: ReactNode): string[] => {
  const values: string[] = [];

  Children.forEach(children, child => {
    if (!isValidElement<AccordionElementProps>(child)) {
      return;
    }

    if (typeof child.props.value === 'string') {
      values.push(child.props.value);
      return;
    }

    if (child.props.children) {
      values.push(...getAccordionItemValues(child.props.children));
    }
  });

  return values;
};

const setForwardedRef = <T,>(ref: ForwardedRef<T>, value: T | null) => {
  if (typeof ref === 'function') {
    ref(value);
    return;
  }

  if (ref) {
    (ref as { current: T | null }).current = value;
  }
};

export const AccordionRoot = forwardRef<HTMLDivElement, AccordionRootProps>(function AccordionRoot(
  {
    type = 'single',
    value,
    defaultValue,
    onValueChange,
    collapsible = true,
    reorderable = false,
    onItemReorder,
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
  const onItemReorderRef = useRef(onItemReorder);
  const resolvedValue = normalizeRootValue(type, isControlled ? value : internalValue);
  const itemValues = useMemo(() => getAccordionItemValues(children), [children]);
  const sensors = useSensors(
    useSensor(PointerSensor, POINTER_SENSOR_OPTIONS),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    onItemReorderRef.current = onItemReorder;
  }, [onItemReorder]);

  const setResolvedValue = (nextValue: AccordionRootValue) => {
    if (!isControlled) {
      setInternalValue(nextValue);
    }

    onValueChange?.(nextValue);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (!reorderable || !event.over || event.active.id === event.over.id) {
      return;
    }

    const activeValue = String(event.active.id);
    const overValue = String(event.over.id);
    const activeIndex = itemValues.indexOf(activeValue);
    const overIndex = itemValues.indexOf(overValue);

    if (activeIndex < 0 || overIndex < 0) {
      return;
    }

    onItemReorderRef.current?.({
      value: activeValue,
      targetValue: overValue,
      position: activeIndex < overIndex ? 'after' : 'before',
    });
  };

  const contextValue: AccordionRootContextValue = {
    type,
    collapsible,
    reorderable,
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
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={itemValues} strategy={verticalListSortingStrategy}>
          <div
            {...props}
            ref={ref}
            className={cx('c-accordion-root', `c-accordion-root--type-${type}`, className)}
          >
            {children}
          </div>
        </SortableContext>
      </DndContext>
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
    style,
    ...props
  },
  ref,
) {
  const rootContext = useContext(AccordionRootContext);
  const isStandaloneControlled = expanded !== undefined;
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const [hasBody, setHasBody] = useState(false);
  const itemId = useId();
  const sortable = useSortable({
    id: value,
    disabled: disabled || !rootContext?.reorderable,
  });

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
    setDragActivatorNodeRef: sortable.setActivatorNodeRef,
    dragAttributes: sortable.attributes,
    dragListeners: sortable.listeners,
    toggle: () => {
      setResolvedExpanded(!resolvedExpanded);
    },
  };
  const sortableStyle: CSSProperties = {
    ...style,
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    zIndex: sortable.isDragging ? 2 : style?.zIndex,
  };

  const setItemRef = (node: HTMLDivElement | null) => {
    sortable.setNodeRef(node);
    setForwardedRef(ref, node);
  };

  return (
    <AccordionItemContext.Provider value={contextValue}>
      <div
        {...props}
        ref={setItemRef}
        style={sortableStyle}
        data-accordion-item-value={value}
        data-expanded={resolvedExpanded ? 'true' : 'false'}
        data-disabled={disabled ? 'true' : 'false'}
        data-reorderable={rootContext?.reorderable ? 'true' : 'false'}
        data-dragging={sortable.isDragging ? 'true' : undefined}
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

export const AccordionItemDragHeader = forwardRef<HTMLDivElement, AccordionItemDragHeaderProps>(
  function AccordionItemDragHeader(
    {
      controlsId,
      disclosureLabel,
      dragLabel,
      dragTitle,
      expanded,
      onToggle,
      reorderable,
      showDisclosure = true,
      disabled,
      className,
      children,
      id,
      ...props
    },
    ref,
  ) {
    const rootContext = useContext(AccordionRootContext);
    const itemContext = useContext(AccordionItemContext);
    const resolvedExpanded = expanded ?? itemContext?.expanded ?? false;
    const resolvedDisabled = disabled ?? itemContext?.disabled ?? false;
    const resolvedReorderable = reorderable ?? rootContext?.reorderable ?? false;
    const resolvedControlsId =
      controlsId ?? (itemContext?.hasBody ? itemContext.bodyId : undefined);
    const resolvedId = id ?? itemContext?.triggerId;
    const dragListeners = itemContext?.dragListeners;

    const handleDisclosureClick: ButtonHTMLAttributes<HTMLButtonElement>['onClick'] = event => {
      if (event.defaultPrevented || resolvedDisabled) {
        return;
      }

      onToggle?.();
      itemContext?.toggle();
    };

    return (
      <div
        {...props}
        ref={ref}
        id={resolvedId}
        className={cx('c-accordion-item__drag-header', className)}
      >
        {resolvedReorderable ? (
          <button
            type="button"
            className="c-accordion-item__drag-handle"
            disabled={resolvedDisabled}
            aria-label={dragLabel ?? 'Drag to reorder'}
            title={dragTitle ?? 'Drag to reorder. Press Space to pick up, then use arrow keys.'}
            ref={node => itemContext?.setDragActivatorNodeRef(node)}
            {...itemContext?.dragAttributes}
            {...dragListeners}
          >
            <Icon name="grip" size="sm" hierarchy="tertiary" aria-hidden />
          </button>
        ) : null}
        {children}
        {showDisclosure ? (
          <button
            type="button"
            className="c-accordion-item__disclosure-button"
            disabled={resolvedDisabled}
            aria-label={
              disclosureLabel ?? `${resolvedExpanded ? 'Collapse' : 'Expand'} accordion item`
            }
            aria-controls={resolvedControlsId}
            aria-expanded={resolvedExpanded}
            onClick={handleDisclosureClick}
          >
            <Icon
              name={resolvedExpanded ? 'chevron-up' : 'chevron-down'}
              size="sm"
              color={resolvedExpanded ? 'brand' : 'text'}
              hierarchy={resolvedExpanded ? 'primary' : 'tertiary'}
              aria-hidden
            />
          </button>
        ) : null}
      </div>
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
