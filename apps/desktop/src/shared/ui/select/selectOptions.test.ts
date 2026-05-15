import { createElement, createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { SelectOption } from './types';
import {
  assignRef,
  getFirstEnabledIndex,
  getNextEnabledIndex,
  getOptionDisplayText,
} from './selectOptions';

describe('select option helpers', () => {
  const options: SelectOption[] = [
    { value: 'disabled', label: 'Disabled', disabled: true },
    { value: 'one', label: 1 },
    { value: 'node', label: createElement('span', null, 'Node label') },
  ];

  it('derives display text from string, number, or fallback value labels', () => {
    expect(getOptionDisplayText(options[0])).toBe('Disabled');
    expect(getOptionDisplayText(options[1])).toBe('1');
    expect(getOptionDisplayText(options[2])).toBe('node');
  });

  it('finds first and next enabled options with wrapping', () => {
    expect(getFirstEnabledIndex(options)).toBe(1);
    expect(getFirstEnabledIndex([{ value: 'x', label: 'x', disabled: true }])).toBe(-1);
    expect(getNextEnabledIndex(options, 1, 1)).toBe(2);
    expect(getNextEnabledIndex(options, 2, 1)).toBe(1);
    expect(getNextEnabledIndex(options, 1, -1)).toBe(2);
    expect(getNextEnabledIndex([], 0, 1)).toBe(-1);
  });

  it('assigns callback and object refs', () => {
    const callbackRef = vi.fn();
    const objectRef = createRef<HTMLDivElement>();
    const element = document.createElement('div');

    assignRef(callbackRef, element);
    assignRef(objectRef, element);

    expect(callbackRef).toHaveBeenCalledWith(element);
    expect(objectRef.current).toBe(element);
  });
});
