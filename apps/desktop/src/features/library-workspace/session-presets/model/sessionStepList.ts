import type { TimeStepPreset } from '@/shared/types';
import {
  applyTimeStepPresetToStep,
  createStepFromTimeStepPreset,
  normalizeStepOrders,
  type EditableSessionStep,
} from '@/entities/session-preset';

export function createStepFromFirstTimeStepPreset(
  timeStepPresets: readonly TimeStepPreset[],
  stepOrder: number,
) {
  if (timeStepPresets.length === 0) {
    return null;
  }

  return createStepFromTimeStepPreset(timeStepPresets[0], stepOrder);
}

export function refreshSessionStepsFromTimeStepPresets(
  steps: readonly EditableSessionStep[],
  timeStepPresets: readonly TimeStepPreset[],
) {
  const timeStepPresetsById = new Map(timeStepPresets.map(preset => [preset.id, preset]));

  return normalizeStepOrders(
    steps.map(step => {
      const timeStepPreset = step.timeStepPresetId
        ? timeStepPresetsById.get(step.timeStepPresetId)
        : null;

      return timeStepPreset ? applyTimeStepPresetToStep(step, timeStepPreset) : step;
    }),
  );
}
