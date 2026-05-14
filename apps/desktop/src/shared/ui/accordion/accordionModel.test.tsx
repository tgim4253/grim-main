import { createRef, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  getAccordionItemValues,
  isExpandedInRoot,
  normalizeRootValue,
  setForwardedRef,
} from './accordionModel';

type TestItemProps = {
  children?: ReactNode;
  value?: string;
};

function TestItem({ children }: TestItemProps) {
  return <div>{children}</div>;
}

describe('accordion model helpers', () => {
  it('normalizes root values for single and multiple accordions', () => {
    expect(normalizeRootValue('multiple', 'one')).toEqual(['one']);
    expect(normalizeRootValue('multiple', ['one', 'two'])).toEqual(['one', 'two']);
    expect(normalizeRootValue('multiple', null)).toEqual([]);
    expect(normalizeRootValue('single', 'one')).toBe('one');
    expect(normalizeRootValue('single', ['one'])).toBeNull();
  });

  it('checks expanded state for single and multiple roots', () => {
    expect(isExpandedInRoot('multiple', ['one', 'two'], 'two')).toBe(true);
    expect(isExpandedInRoot('multiple', 'two', 'two')).toBe(false);
    expect(isExpandedInRoot('single', 'two', 'two')).toBe(true);
  });

  it('collects item values from nested React children', () => {
    expect(
      getAccordionItemValues(
        <div>
          <TestItem value="first" />
          <div>
            <TestItem value="nested" />
          </div>
          text
        </div>,
      ),
    ).toEqual(['first', 'nested']);
  });

  it('sets callback and object forwarded refs', () => {
    const callbackRef = vi.fn();
    const objectRef = createRef<HTMLDivElement>();
    const element = document.createElement('div');

    setForwardedRef(callbackRef, element);
    setForwardedRef(objectRef, element);

    expect(callbackRef).toHaveBeenCalledWith(element);
    expect(objectRef.current).toBe(element);
  });
});
