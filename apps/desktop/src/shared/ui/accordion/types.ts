import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

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
