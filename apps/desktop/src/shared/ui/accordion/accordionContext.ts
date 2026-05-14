import { createContext } from 'react';
import type { useSortable } from '@dnd-kit/sortable';
import type { AccordionRootType } from './types';

export type AccordionRootContextValue = {
  type: AccordionRootType;
  collapsible: boolean;
  reorderable: boolean;
  isExpanded: (value: string) => boolean;
  setExpanded: (value: string, nextExpanded: boolean) => void;
};

type AccordionSortableReturn = ReturnType<typeof useSortable>;

export type AccordionItemContextValue = {
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

export const AccordionRootContext = createContext<AccordionRootContextValue | null>(null);
export const AccordionItemContext = createContext<AccordionItemContextValue | null>(null);
