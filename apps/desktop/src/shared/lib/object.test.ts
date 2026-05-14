import { describe, expect, it } from 'vitest';
import { convertKeysToCamel, omitKey, snakeToCamel } from './object';

describe('object helpers', () => {
  it('converts snake case strings and nested object keys to camel case', () => {
    expect(snakeToCamel('outer_key_1')).toBe('outerKey1');
    expect(
      convertKeysToCamel({
        outer_key: [{ nested_key: 'value' }],
        alreadyCamel: null,
      }),
    ).toEqual({ outerKey: [{ nestedKey: 'value' }], alreadyCamel: null });
  });

  it('keeps primitives untouched and omits keys immutably', () => {
    expect(convertKeysToCamel(1)).toBe(1);
    expect(convertKeysToCamel(null)).toBeNull();
    const source = { keep: 1, remove: 2 };
    expect(omitKey(source, 'remove')).toEqual({ keep: 1 });
    expect(source).toEqual({ keep: 1, remove: 2 });
  });
});
