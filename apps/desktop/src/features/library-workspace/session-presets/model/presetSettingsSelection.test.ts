import { describe, expect, it } from 'vitest';
import { findCreatedPreset, getDuplicateName } from './presetSettingsSelection';

const stringifyOption = (value: unknown, fallback: string) => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return fallback;
};

const t = (_key: string, options?: Record<string, unknown>) => {
  const template = typeof options?.defaultValue === 'string' ? options.defaultValue : '';
  return template.replace(/{{(\w+)}}/g, (_match, name: string) =>
    stringifyOption(options?.[name], _match),
  );
};

describe('preset settings selection helpers', () => {
  it('creates duplicate names from trimmed names or fallback names', () => {
    expect(getDuplicateName(' Original ', 'Fallback', t)).toBe('Original Copy');
    expect(getDuplicateName('   ', 'Fallback', t)).toBe('Fallback Copy');
  });

  it('finds newly created presets by matching name first, then any new id', () => {
    const previous = [{ id: 'old', name: 'Old' }];

    expect(
      findCreatedPreset(
        previous,
        [...previous, { id: 'new-1', name: 'Other' }, { id: 'new-2', name: 'Target' }],
        'Target',
      ),
    ).toEqual({ id: 'new-2', name: 'Target' });
    expect(
      findCreatedPreset(previous, [...previous, { id: 'new-1', name: 'Other' }], 'Missing'),
    ).toEqual({
      id: 'new-1',
      name: 'Other',
    });
    expect(findCreatedPreset(previous, previous, 'Missing')).toBeNull();
  });
});
