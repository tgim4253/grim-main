import { describe, expect, test } from 'vitest';

import { convertKeysToCamel, omitKey } from '../object';

describe('convertKeysToCamel', () => {
  test('converts keys for deeply nested objects and arrays', () => {
    const input = {
      first_level: {
        second_level: [
          {
            third_level_key: 'value',
            deep_array: [
              { final_value: 1 },
              { another_final_value: 2 },
            ],
          },
        ],
      },
      mixed_list: [
        { some_key: 'text' },
        ['leaf_array'],
        99,
      ],
    };

    const result = convertKeysToCamel(input);

    expect(result).toStrictEqual({
      firstLevel: {
        secondLevel: [
          {
            thirdLevelKey: 'value',
            deepArray: [
              { finalValue: 1 },
              { anotherFinalValue: 2 },
            ],
          },
        ],
      },
      mixedList: [
        { someKey: 'text' },
        ['leaf_array'],
        99,
      ],
    });
  });

  test('returns primitives without modification', () => {
    const values: unknown[] = [undefined, null, 0, 1.23, 'hello', true, false];

    for (const value of values) {
      expect(convertKeysToCamel(value)).toBe(value);
    }
  });
});

describe('omitKey', () => {
  test('removes only the specified key and preserves the rest of the object', () => {
    const original = {
      keepMe: 'kept',
      removeMe: 'discarded',
      nested: {
        innerValue: 42,
      },
      list: [1, 2, 3],
    } as const;

    const result = omitKey({ ...original }, 'removeMe');

    expect(result).toStrictEqual({
      keepMe: 'kept',
      nested: {
        innerValue: 42,
      },
      list: [1, 2, 3],
    });
    expect('removeMe' in result).toBe(false);
  });
});
