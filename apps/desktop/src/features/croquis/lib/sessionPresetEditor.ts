import type {
  SaveSessionPresetPayload,
  SaveTimeStepPresetPayload,
  SessionPreset,
  SessionPresetStepDraft,
  SessionStepPreset,
  TimeStepPreset,
} from '../../../shared/types';

export const DURATION_OPTIONS = [
  { label: '10s', value: 10 },
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '3m', value: 180 },
  { label: '10m', value: 600 },
  { label: '30m', value: 1800 },
  { label: '1h', value: 3600 },
  { label: '∞', value: 0 },
] as const;

export const DURATION_MIN_SECONDS = 0;
export const DURATION_SLIDER_MAX_SECONDS = 3600;
export const DURATION_STEP_SECONDS = 1;
export const USER_CUSTOM_STEP_VALUE = '__user-custom-step__';
export const USER_CUSTOM_STEP_LABEL = 'User Custom Step';

export type EditableSessionStep = SessionStepPreset;

export const formatDurationCompact = (seconds?: number | null) => {
  if (seconds === null || seconds === undefined || seconds <= 0) {
    return '∞';
  }

  if (seconds % 3600 === 0) {
    return `${String(seconds / 3600)}h`;
  }

  if (seconds % 60 === 0) {
    return `${String(seconds / 60)}m`;
  }

  return `${String(seconds)}s`;
};

export const formatEstimate = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes)}:${String(remainingSeconds).padStart(2, '0')}`;
};

export const normalizeWindowDimension = (value: string) => value.replace(/\D/g, '');

export const clampDurationSeconds = (seconds: number) => {
  return Math.max(DURATION_MIN_SECONDS, Math.trunc(Number.isFinite(seconds) ? seconds : 0));
};

export const normalizeDurationUnit = (value: string, max?: number) => {
  const digits = value.replace(/\D/g, '');
  const unitValue = Math.max(0, digits ? Number(digits) : 0);

  if (!Number.isFinite(unitValue)) {
    return 0;
  }

  return max === undefined ? unitValue : Math.min(max, unitValue);
};

export const getDurationParts = (seconds: number) => {
  const clampedSeconds = clampDurationSeconds(seconds);

  return {
    hours: Math.floor(clampedSeconds / 3600),
    minutes: Math.floor((clampedSeconds % 3600) / 60),
    seconds: clampedSeconds % 60,
  };
};

export const composeDurationSeconds = ({
  hours,
  minutes,
  seconds,
}: {
  hours: number;
  minutes: number;
  seconds: number;
}) => clampDurationSeconds(hours * 3600 + minutes * 60 + seconds);

export const getStepDuration = (
  step: { defaultDurationSeconds?: number | null } | undefined,
  fallbackSeconds: number,
) => step?.defaultDurationSeconds ?? fallbackSeconds;

const createStepId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `custom-step-${String(Date.now())}-${Math.random().toString(36).slice(2)}`;
};

export const normalizeStepOrders = (steps: EditableSessionStep[]) =>
  steps.map((step, index) => ({
    ...step,
    stepOrder: index + 1,
  }));

export const createEditableSteps = (preset: SessionPreset): EditableSessionStep[] =>
  normalizeStepOrders(preset.steps.map(step => ({ ...step })));

export const createCustomStep = (
  fallbackSeconds: number,
  stepOrder: number,
): EditableSessionStep => ({
  id: createStepId(),
  stepOrder,
  name: USER_CUSTOM_STEP_LABEL,
  timeStepPresetId: null,
  defaultDurationSeconds: fallbackSeconds,
  autoTags: [],
  resultRequired: false,
  resultExternalPath: null,
});

export const createStepFromTimeStepPreset = (
  preset: TimeStepPreset,
  stepOrder: number,
): EditableSessionStep => ({
  id: createStepId(),
  timeStepPresetId: preset.id,
  stepOrder,
  name: preset.name,
  defaultDurationSeconds: preset.defaultDurationSeconds,
  autoTags: preset.autoTags,
  resultRequired: preset.resultRequired,
  resultExternalPath: preset.resultExternalPath,
});

export const toSessionStep = (step: EditableSessionStep): SessionStepPreset => step;

export const applyTimeStepPresetToStep = (
  currentStep: EditableSessionStep,
  preset: TimeStepPreset,
): EditableSessionStep => {
  return {
    ...currentStep,
    timeStepPresetId: preset.id,
    name: preset.name,
    defaultDurationSeconds: preset.defaultDurationSeconds,
    autoTags: preset.autoTags,
    resultRequired: preset.resultRequired,
    resultExternalPath: preset.resultExternalPath,
  };
};

export const toSessionPresetStepDraft = (
  step: EditableSessionStep,
  includeStepId: boolean,
): SessionPresetStepDraft => ({
  id: includeStepId ? step.id : undefined,
  timeStepPresetId: step.timeStepPresetId,
  name: step.name,
  stepOrder: step.stepOrder,
  defaultDurationSeconds: step.defaultDurationSeconds,
  autoTagNames: step.autoTags.map(tag => tag.name),
  resultRequired: step.resultRequired,
  resultExternalPath: step.resultExternalPath,
});

export const toSaveSessionPresetPayload = ({
  preset,
  name,
  description,
  steps,
  duplicate = false,
}: {
  preset: SessionPreset | null;
  name: string;
  description: string;
  steps: EditableSessionStep[];
  duplicate?: boolean;
}): SaveSessionPresetPayload => ({
  id: duplicate ? undefined : preset?.id,
  name,
  description: description.trim() ? description.trim() : null,
  isDefault: duplicate ? false : (preset?.isDefault ?? false),
  steps: steps.map(step => toSessionPresetStepDraft(step, !duplicate)),
});

export const toSaveTimeStepPresetPayload = ({
  preset,
  name,
  step,
  duplicate = false,
}: {
  preset: TimeStepPreset | null;
  name: string;
  step: EditableSessionStep;
  duplicate?: boolean;
}): SaveTimeStepPresetPayload => ({
  id: duplicate ? undefined : preset?.id,
  name,
  defaultDurationSeconds: step.defaultDurationSeconds,
  autoTagNames: step.autoTags.map(tag => tag.name),
  resultRequired: step.resultRequired,
  resultExternalPath: step.resultExternalPath,
});
