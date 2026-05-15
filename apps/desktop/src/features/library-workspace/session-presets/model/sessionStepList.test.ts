import { describe, expect, it } from 'vitest';
import type { TimeStepPreset } from '@/shared/types';
import type { EditableSessionStep } from '@/entities/session-preset';
import {
  createStepFromFirstTimeStepPreset,
  refreshSessionStepsFromTimeStepPresets,
} from './sessionStepList';

const now = '2026-01-01T00:00:00.000Z';

function preset(id: string, name = id): TimeStepPreset {
  return {
    id,
    name,
    defaultDurationSeconds: 60,
    autoAdvance: true,
    recordSaveEnabled: true,
    captureEnabled: false,
    grayscaleEnabled: false,
    resultRequired: false,
    resultSavePath: null,
    autoTags: [],
    createdAt: now,
    updatedAt: now,
  };
}

function step(overrides: Partial<EditableSessionStep> = {}): EditableSessionStep {
  return {
    id: 'step-1',
    timeStepPresetId: 'time-1',
    stepOrder: 5,
    name: 'Old',
    defaultDurationSeconds: 10,
    autoTags: [],
    autoAdvance: false,
    recordSaveEnabled: false,
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

describe('session step list helpers', () => {
  it('creates a step from the first time-step preset', () => {
    expect(createStepFromFirstTimeStepPreset([], 1)).toBeNull();
    expect(createStepFromFirstTimeStepPreset([preset('time-1', 'First')], 3)).toMatchObject({
      timeStepPresetId: 'time-1',
      stepOrder: 3,
      name: 'First',
    });
  });

  it('refreshes linked steps from time-step presets and normalizes order', () => {
    expect(
      refreshSessionStepsFromTimeStepPresets(
        [step(), step({ id: 'custom', timeStepPresetId: null, stepOrder: 2, name: 'Custom' })],
        [preset('time-1', 'Fresh')],
      ),
    ).toMatchObject([
      { id: 'step-1', name: 'Fresh', stepOrder: 1, autoAdvance: true },
      { id: 'custom', name: 'Custom', stepOrder: 2 },
    ]);
  });
});
