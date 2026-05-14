import { describe, expect, it } from 'vitest';
import type { Tag } from '@/shared/types';
import type { EditableSessionStep } from '@/entities/session-preset';
import {
  formatAutoTagSummary,
  formatStepCount,
  formatStepOptionSummary,
} from './presetSettingsFormat';

const now = '2026-01-01T00:00:00.000Z';

const stringifyOption = (value: unknown, fallback: string) => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return fallback;
};

const t = (key: string, options?: Record<string, unknown>) => {
  const template = typeof options?.defaultValue === 'string' ? options.defaultValue : key;
  return template.replace(/{{(\w+)}}/g, (_match, name: string) =>
    stringifyOption(options?.[name], _match),
  );
};

function tag(id: string, name = id): Tag {
  return { id, name, sortOrder: 1, createdAt: now, updatedAt: now };
}

function step(overrides: Partial<EditableSessionStep> = {}): EditableSessionStep {
  return {
    id: 'step-1',
    timeStepPresetId: 'time-1',
    stepOrder: 1,
    name: 'Step',
    defaultDurationSeconds: 60,
    autoTags: [],
    autoAdvance: true,
    recordSaveEnabled: true,
    captureEnabled: false,
    filterEnabled: false,
    grayscaleEnabled: false,
    blurEnabled: false,
    blurAmount: 0,
    resultRequired: false,
    resultSavePath: null,
    ...overrides,
  };
}

describe('preset settings formatting', () => {
  it('formats step count through the provided translator', () => {
    expect(formatStepCount(1234, t)).toBe('1,234 steps');
  });

  it('summarizes auto tags for empty, visible, and hidden counts', () => {
    expect(formatAutoTagSummary([], t)).toBe('No auto tags');
    expect(formatAutoTagSummary([tag('a', 'A')], t)).toBe('A');
    expect(formatAutoTagSummary([tag('a', 'A'), tag('b', 'B'), tag('c', 'C')], t)).toBe('A, B, C');
    expect(
      formatAutoTagSummary([tag('a', 'A'), tag('b', 'B'), tag('c', 'C'), tag('d', 'D')], t),
    ).toBe('A, B, C +1');
  });

  it('formats enabled and disabled step options', () => {
    expect(
      formatStepOptionSummary(
        step({
          autoAdvance: false,
          recordSaveEnabled: false,
          captureEnabled: true,
          filterEnabled: true,
          grayscaleEnabled: true,
          blurEnabled: true,
          blurAmount: 35,
          resultRequired: true,
        }),
        t,
      ),
    ).toBe('Manual advance · Records off · Capture · Grayscale · Blur 35% · Result required');
  });
});
