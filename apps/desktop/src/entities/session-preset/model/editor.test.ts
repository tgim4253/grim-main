import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionPreset, Tag, TimeStepPreset } from '@/shared/types';
import {
  applyTimeStepPresetToStep,
  clampDurationSeconds,
  clampFilterPercent,
  composeDurationSeconds,
  createEditableSteps,
  flattenTimeStepPreset,
  formatDurationCompact,
  formatEstimate,
  getDurationParts,
  getRuntimeSessionFilterSettings,
  getStepFilterSettings,
  getStoredTimeStepFilterSettings,
  getUniqueTagIds,
  mergeUniqueTags,
  normalizeDurationUnit,
  normalizeFilterSettings,
  normalizeOptionalString,
  normalizeStepOrders,
  normalizeWindowDimension,
  saveRuntimeSessionFilterSettings,
  saveStoredTimeStepFilterSettings,
  toCroquisRuntimeStep,
  toSaveSessionPresetPayload,
  toSaveTimeStepPresetPayload,
  type EditableSessionStep,
} from './editor';

const now = '2026-01-01T00:00:00.000Z';

function tag(id: string, name = id): Tag {
  return { id, name, sortOrder: 1, createdAt: now, updatedAt: now };
}

function timeStepPreset(overrides: Partial<TimeStepPreset> = {}): TimeStepPreset {
  return {
    id: 'time-1',
    name: 'Gesture',
    defaultDurationSeconds: 90,
    autoAdvance: true,
    recordSaveEnabled: true,
    captureEnabled: false,
    grayscaleEnabled: true,
    resultRequired: false,
    resultSavePath: '/results',
    autoTags: [tag('step-tag')],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function editableStep(overrides: Partial<EditableSessionStep> = {}): EditableSessionStep {
  return {
    id: 'step-1',
    timeStepPresetId: 'time-1',
    stepOrder: 1,
    name: 'Gesture',
    defaultDurationSeconds: 90,
    autoTags: [tag('step-tag')],
    autoAdvance: true,
    recordSaveEnabled: true,
    captureEnabled: false,
    filterEnabled: true,
    grayscaleEnabled: true,
    blurEnabled: false,
    blurAmount: 0,
    resultRequired: false,
    resultSavePath: '/results',
    ...overrides,
  };
}

function sessionPreset(overrides: Partial<SessionPreset> = {}): SessionPreset {
  return {
    id: 'session-1',
    name: 'Session',
    description: 'desc',
    isDefault: true,
    windowWidth: '800',
    windowHeight: '600',
    isShuffle: false,
    autoTags: [tag('session-tag')],
    steps: [
      {
        id: 'session-step-1',
        timeStepPresetId: 'time-1',
        stepOrder: 7,
        timeStep: timeStepPreset(),
      },
    ],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('duration and scalar helpers', () => {
  it('formats, decomposes, composes, and clamps durations', () => {
    expect(formatDurationCompact(null)).toBe('∞');
    expect(formatDurationCompact(3600)).toBe('1h');
    expect(formatDurationCompact(120)).toBe('2m');
    expect(formatDurationCompact(45)).toBe('45s');
    expect(formatEstimate(125)).toBe('2:05');
    expect(getDurationParts(3725)).toEqual({ hours: 1, minutes: 2, seconds: 5 });
    expect(composeDurationSeconds({ hours: 1, minutes: 2, seconds: 5 })).toBe(3725);
    expect(clampDurationSeconds(Number.NaN)).toBe(0);
    expect(clampDurationSeconds(-5)).toBe(0);
  });

  it('normalizes numeric input strings and optional values', () => {
    expect(normalizeDurationUnit('12m', 10)).toBe(10);
    expect(normalizeWindowDimension(' 12x34 px ')).toBe('1234');
    expect(normalizeOptionalString('  value  ')).toBe('value');
    expect(normalizeOptionalString('   ')).toBeNull();
    expect(clampFilterPercent(140)).toBe(100);
    expect(clampFilterPercent(-1)).toBe(0);
  });
});

describe('filter settings', () => {
  it('normalizes filter settings and persists time-step/runtime filter overrides', () => {
    expect(normalizeFilterSettings({ grayscaleEnabled: true, blurAmount: 120 })).toEqual({
      filterEnabled: true,
      grayscaleEnabled: true,
      blurEnabled: false,
      blurAmount: 100,
    });
    expect(getStepFilterSettings({ filterEnabled: false, grayscaleEnabled: true })).toEqual({
      filterEnabled: false,
      grayscaleEnabled: true,
      blurEnabled: false,
      blurAmount: 0,
    });

    saveStoredTimeStepFilterSettings('time-1', { blurEnabled: true, blurAmount: 35 });
    expect(getStoredTimeStepFilterSettings('time-1')).toEqual({
      filterEnabled: true,
      grayscaleEnabled: false,
      blurEnabled: true,
      blurAmount: 35,
    });

    vi.spyOn(Date, 'now').mockReturnValue(123);
    saveRuntimeSessionFilterSettings('session-1', [
      editableStep({ stepOrder: 9, blurEnabled: true, blurAmount: 12 }),
    ]);
    expect(getRuntimeSessionFilterSettings('session-1', 1)).toEqual({
      filterEnabled: true,
      grayscaleEnabled: true,
      blurEnabled: true,
      blurAmount: 12,
    });
  });
});

describe('tag and step helpers', () => {
  it('deduplicates and merges tags by id', () => {
    const first = tag('a', 'First');
    const duplicate = tag('a', 'Duplicate');
    const second = tag('b', 'Second');

    expect(getUniqueTagIds([first, second, duplicate, tag('')])).toEqual(['a', 'b']);
    expect(mergeUniqueTags([first], [duplicate, second])).toEqual([first, second]);
  });

  it('normalizes step order and flattens time-step presets with stored filters', () => {
    saveStoredTimeStepFilterSettings('time-1', { blurEnabled: true, blurAmount: 20 });

    expect(
      normalizeStepOrders([
        editableStep({ stepOrder: 5 }),
        editableStep({ id: 'step-2', stepOrder: 1 }),
      ]),
    ).toMatchObject([
      { id: 'step-1', stepOrder: 1 },
      { id: 'step-2', stepOrder: 2 },
    ]);
    expect(flattenTimeStepPreset(timeStepPreset(), 3, 'flat-step')).toMatchObject({
      id: 'flat-step',
      timeStepPresetId: 'time-1',
      stepOrder: 3,
      name: 'Gesture',
      filterEnabled: true,
      blurEnabled: true,
      blurAmount: 20,
    });
  });

  it('creates editable session steps and applies refreshed time-step preset values', () => {
    expect(createEditableSteps(sessionPreset())).toMatchObject([
      { id: 'session-step-1', stepOrder: 1, name: 'Gesture' },
    ]);
    expect(
      applyTimeStepPresetToStep(
        editableStep({ id: 'kept-step', stepOrder: 4 }),
        timeStepPreset({ name: 'Updated', defaultDurationSeconds: 45 }),
      ),
    ).toMatchObject({ id: 'kept-step', stepOrder: 4, name: 'Updated', defaultDurationSeconds: 45 });
  });
});

describe('payload conversion', () => {
  it('builds session preset payloads with normalized step order and deduped auto tags', () => {
    expect(
      toSaveSessionPresetPayload({
        preset: sessionPreset(),
        name: 'Session',
        description: '  ',
        windowWidth: '1024',
        windowHeight: null,
        isShuffle: true,
        autoTags: [tag('a'), tag('a'), tag('b')],
        steps: [
          editableStep({ id: 'step-2', stepOrder: 8 }),
          editableStep({ id: 'step-1', stepOrder: 1 }),
        ],
      }),
    ).toEqual({
      id: 'session-1',
      name: 'Session',
      description: null,
      isDefault: true,
      windowWidth: '1024',
      windowHeight: null,
      isShuffle: true,
      autoTagIds: ['a', 'b'],
      steps: [
        { id: 'step-2', timeStepPresetId: 'time-1', stepOrder: 1 },
        { id: 'step-1', timeStepPresetId: 'time-1', stepOrder: 2 },
      ],
    });
  });

  it('builds duplicate session and time-step payloads without existing ids', () => {
    expect(
      toSaveSessionPresetPayload({
        preset: sessionPreset(),
        name: 'Copy',
        description: 'copy',
        isShuffle: false,
        autoTags: [],
        steps: [editableStep()],
        duplicate: true,
      }),
    ).toMatchObject({ id: undefined, isDefault: false, steps: [{ id: undefined }] });

    expect(
      toSaveTimeStepPresetPayload({
        preset: timeStepPreset(),
        name: 'Time Copy',
        step: editableStep({ autoTags: [tag('a'), tag('a')], filterEnabled: false }),
        duplicate: true,
      }),
    ).toEqual({
      id: undefined,
      name: 'Time Copy',
      defaultDurationSeconds: 90,
      autoAdvance: true,
      recordSaveEnabled: true,
      captureEnabled: false,
      grayscaleEnabled: false,
      resultRequired: false,
      resultSavePath: '/results',
      autoTagIds: ['a'],
    });
  });

  it('builds runtime steps with session and step auto tags merged', () => {
    expect(
      toCroquisRuntimeStep(
        editableStep({ autoTags: [tag('step'), tag('shared')], blurEnabled: true }),
        [tag('session'), tag('shared')],
      ),
    ).toEqual({
      stepId: 'step-1',
      timeStepPresetId: 'time-1',
      stepOrder: 1,
      name: 'Gesture',
      defaultDurationSeconds: 90,
      tagIds: ['session', 'shared', 'step'],
      autoAdvance: true,
      recordSaveEnabled: true,
      captureEnabled: false,
      grayscaleEnabled: true,
      resultRequired: false,
      resultSavePath: '/results',
    });
  });
});
