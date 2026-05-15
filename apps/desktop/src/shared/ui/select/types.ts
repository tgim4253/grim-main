import type { ButtonHTMLAttributes, ReactNode } from 'react';

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
