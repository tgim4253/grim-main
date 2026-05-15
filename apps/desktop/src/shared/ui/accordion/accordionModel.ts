import { Children, isValidElement, type ForwardedRef, type ReactNode } from 'react';
import type { AccordionRootType, AccordionRootValue } from './types';

type AccordionElementProps = {
  children?: ReactNode;
  value?: unknown;
};

export const POINTER_SENSOR_OPTIONS = {
  activationConstraint: {
    distance: 6,
  },
};

export const normalizeRootValue = (
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

export const isExpandedInRoot = (
  type: AccordionRootType,
  value: AccordionRootValue,
  itemValue: string,
) => {
  if (type === 'multiple') {
    return Array.isArray(value) && value.includes(itemValue);
  }

  return value === itemValue;
};

export const getAccordionItemValues = (children: ReactNode): string[] => {
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

export const setForwardedRef = <T>(ref: ForwardedRef<T>, value: T | null) => {
  if (typeof ref === 'function') {
    ref(value);
    return;
  }

  if (ref) {
    (ref as { current: T | null }).current = value;
  }
};
