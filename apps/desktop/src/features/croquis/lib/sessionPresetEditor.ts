import type {
  CroquisRuntimeStep,
  SaveSessionPresetPayload,
  SaveTimeStepPresetPayload,
  SessionPreset,
  SessionPresetStepDraft,
  SessionStepPreset,
  Tag,
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
export const FILTER_PERCENT_MIN = 0;
export const FILTER_PERCENT_MAX = 100;
export const FILTER_PERCENT_STEP = 1;
export const DEFAULT_BLUR_AMOUNT = 0;

const TIME_STEP_FILTER_STORAGE_KEY = 'grim:croquis:time-step-filters:v1';
const RUNTIME_SESSION_FILTER_STORAGE_KEY = 'grim:croquis:runtime-session-filters:v1';

export type EditableSessionStep = {
  id: string;
  timeStepPresetId?: string | null;
  stepOrder: number;
  name: string;
  defaultDurationSeconds?: number | null;
  autoTags: Tag[];
  autoAdvance: boolean;
  recordSaveEnabled: boolean;
  captureEnabled: boolean;
  filterEnabled: boolean;
  grayscaleEnabled: boolean;
  blurEnabled: boolean;
  blurAmount: number;
  resultRequired: boolean;
  resultSavePath?: string | null;
};

export type CroquisFilterSettings = Pick<
  EditableSessionStep,
  'filterEnabled' | 'grayscaleEnabled' | 'blurEnabled' | 'blurAmount'
>;

type StoredRuntimeSessionFilters = {
  updatedAt: number;
  steps: Record<string, CroquisFilterSettings | undefined>;
};
type StoredTimeStepFilterSettings = Record<string, CroquisFilterSettings | undefined>;
type StoredRuntimeSessionFilterSettings = Record<string, StoredRuntimeSessionFilters | undefined>;

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

export const normalizeOptionalString = (value: string) => {
  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
};

export const clampDurationSeconds = (seconds: number) => {
  return Math.max(DURATION_MIN_SECONDS, Math.trunc(Number.isFinite(seconds) ? seconds : 0));
};

export const clampFilterPercent = (value: number) => {
  const percent = Math.trunc(Number.isFinite(value) ? value : FILTER_PERCENT_MIN);

  return Math.min(Math.max(percent, FILTER_PERCENT_MIN), FILTER_PERCENT_MAX);
};

const canUseLocalStorage = () =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const readStorageJson = <TValue>(key: string, fallbackValue: TValue): TValue => {
  if (!canUseLocalStorage()) {
    return fallbackValue;
  }

  try {
    const rawValue = window.localStorage.getItem(key);

    return rawValue ? (JSON.parse(rawValue) as TValue) : fallbackValue;
  } catch {
    return fallbackValue;
  }
};

const writeStorageJson = (key: string, value: unknown) => {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local filter preferences are non-critical; ignore storage failures.
  }
};

export const normalizeFilterSettings = (
  settings?: Partial<CroquisFilterSettings> | null,
): CroquisFilterSettings => {
  const grayscaleEnabled = Boolean(settings?.grayscaleEnabled);
  const blurEnabled = Boolean(settings?.blurEnabled);

  return {
    filterEnabled: settings?.filterEnabled ?? (grayscaleEnabled || blurEnabled),
    grayscaleEnabled,
    blurEnabled,
    blurAmount: clampFilterPercent(settings?.blurAmount ?? DEFAULT_BLUR_AMOUNT),
  };
};

export const getStepFilterSettings = (
  step: Partial<CroquisFilterSettings>,
): CroquisFilterSettings => normalizeFilterSettings(step);

const readTimeStepFilterSettings = () =>
  readStorageJson<StoredTimeStepFilterSettings>(TIME_STEP_FILTER_STORAGE_KEY, {});

export const getStoredTimeStepFilterSettings = (timeStepPresetId?: string | null) => {
  if (!timeStepPresetId) {
    return null;
  }

  const storedSettings = readTimeStepFilterSettings()[timeStepPresetId];

  return storedSettings ? normalizeFilterSettings(storedSettings) : null;
};

export const saveStoredTimeStepFilterSettings = (
  timeStepPresetId: string | null | undefined,
  settings: Partial<CroquisFilterSettings>,
) => {
  if (!timeStepPresetId) {
    return;
  }

  writeStorageJson(TIME_STEP_FILTER_STORAGE_KEY, {
    ...readTimeStepFilterSettings(),
    [timeStepPresetId]: normalizeFilterSettings(settings),
  });
};

export const saveRuntimeSessionFilterSettings = (
  presetId: string,
  steps: readonly EditableSessionStep[],
) => {
  const runtimeFilters = readStorageJson<StoredRuntimeSessionFilterSettings>(
    RUNTIME_SESSION_FILTER_STORAGE_KEY,
    {},
  );
  const nextSteps = normalizeStepOrders([...steps]).reduce<Record<string, CroquisFilterSettings>>(
    (settingsByStepOrder, step) => ({
      ...settingsByStepOrder,
      [String(step.stepOrder)]: getStepFilterSettings(step),
    }),
    {},
  );

  writeStorageJson(RUNTIME_SESSION_FILTER_STORAGE_KEY, {
    ...runtimeFilters,
    [presetId]: {
      updatedAt: Date.now(),
      steps: nextSteps,
    },
  });
};

export const getRuntimeSessionFilterSettings = (
  presetId: string,
  stepIndex: number,
  fallbackSettings?: Partial<CroquisFilterSettings>,
) => {
  const runtimeFilters = readStorageJson<StoredRuntimeSessionFilterSettings>(
    RUNTIME_SESSION_FILTER_STORAGE_KEY,
    {},
  );
  const storedSettings = runtimeFilters[presetId]?.steps[String(stepIndex)];

  return normalizeFilterSettings(storedSettings ?? fallbackSettings);
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

export const getStepDuration = (step: { defaultDurationSeconds?: number | null } | undefined) =>
  step?.defaultDurationSeconds ?? 0;

export const getUniqueTagIds = (tags: readonly Tag[]) =>
  tags.reduce<string[]>((tagIds, tag) => {
    if (tag.id && !tagIds.includes(tag.id)) {
      tagIds.push(tag.id);
    }

    return tagIds;
  }, []);

export const mergeUniqueTags = (primaryTags: readonly Tag[], secondaryTags: readonly Tag[]) => {
  const tagsById = new Map<string, Tag>();

  [...primaryTags, ...secondaryTags].forEach(tag => {
    if (tag.id && !tagsById.has(tag.id)) {
      tagsById.set(tag.id, tag);
    }
  });

  return [...tagsById.values()];
};

const createStepId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `custom-step-${String(Date.now())}-${Math.random().toString(36).slice(2)}`;
};

export const normalizeStepOrders = <TStep extends { stepOrder: number }>(steps: TStep[]) =>
  steps.map((step, index) => ({
    ...step,
    stepOrder: index + 1,
  }));

const applyStoredFilterSettings = (step: EditableSessionStep): EditableSessionStep => {
  const storedSettings = getStoredTimeStepFilterSettings(step.timeStepPresetId);

  return storedSettings ? { ...step, ...storedSettings } : step;
};

export const flattenTimeStepPreset = (
  preset: TimeStepPreset,
  stepOrder: number,
  id = createStepId(),
): EditableSessionStep =>
  applyStoredFilterSettings({
    id,
    timeStepPresetId: preset.id,
    stepOrder,
    name: preset.name,
    defaultDurationSeconds: preset.defaultDurationSeconds,
    autoTags: preset.autoTags,
    autoAdvance: preset.autoAdvance,
    recordSaveEnabled: preset.recordSaveEnabled,
    captureEnabled: preset.captureEnabled,
    filterEnabled: preset.grayscaleEnabled,
    grayscaleEnabled: preset.grayscaleEnabled,
    blurEnabled: false,
    blurAmount: DEFAULT_BLUR_AMOUNT,
    resultRequired: preset.resultRequired,
    resultSavePath: preset.resultSavePath,
  });

export const flattenSessionStep = (step: SessionStepPreset): EditableSessionStep =>
  flattenTimeStepPreset(step.timeStep, step.stepOrder, step.id);

export const createEditableSteps = (preset: SessionPreset): EditableSessionStep[] =>
  normalizeStepOrders(preset.steps.map(step => flattenSessionStep(step)));

export const createCustomStep = (
  stepOrder: number,
  name = USER_CUSTOM_STEP_LABEL,
): EditableSessionStep => ({
  id: createStepId(),
  stepOrder,
  name,
  timeStepPresetId: null,
  defaultDurationSeconds: 180,
  autoTags: [],
  autoAdvance: true,
  recordSaveEnabled: true,
  captureEnabled: false,
  filterEnabled: false,
  grayscaleEnabled: false,
  blurEnabled: false,
  blurAmount: DEFAULT_BLUR_AMOUNT,
  resultRequired: false,
  resultSavePath: null,
});

export const createStepFromTimeStepPreset = (
  preset: TimeStepPreset,
  stepOrder: number,
): EditableSessionStep => flattenTimeStepPreset(preset, stepOrder);

export const applyTimeStepPresetToStep = (
  currentStep: EditableSessionStep,
  preset: TimeStepPreset,
): EditableSessionStep => ({
  ...flattenTimeStepPreset(preset, currentStep.stepOrder, currentStep.id),
});

export const toSessionPresetStepDraft = (
  step: EditableSessionStep,
  includeStepId: boolean,
): SessionPresetStepDraft => ({
  id: includeStepId ? step.id : undefined,
  timeStepPresetId: step.timeStepPresetId ?? '',
  stepOrder: step.stepOrder,
});

export const toSaveSessionPresetPayload = ({
  preset,
  name,
  description,
  windowWidth,
  windowHeight,
  isShuffle,
  autoTags,
  steps,
  duplicate = false,
}: {
  preset: SessionPreset | null;
  name: string;
  description: string;
  windowWidth?: string | null;
  windowHeight?: string | null;
  isShuffle: boolean;
  autoTags: Tag[];
  steps: EditableSessionStep[];
  duplicate?: boolean;
}): SaveSessionPresetPayload => ({
  id: duplicate ? undefined : preset?.id,
  name,
  description: description.trim() ? description.trim() : null,
  isDefault: duplicate ? false : (preset?.isDefault ?? false),
  windowWidth,
  windowHeight,
  isShuffle,
  autoTagIds: getUniqueTagIds(autoTags),
  steps: normalizeStepOrders(steps).map(step => toSessionPresetStepDraft(step, !duplicate)),
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
  autoAdvance: step.autoAdvance,
  recordSaveEnabled: step.recordSaveEnabled,
  captureEnabled: step.captureEnabled,
  grayscaleEnabled: step.filterEnabled && step.grayscaleEnabled,
  resultRequired: step.resultRequired,
  resultSavePath: step.resultSavePath,
  autoTagIds: step.autoTags.map(tag => tag.id).filter(Boolean),
});

export const toCroquisRuntimeStep = (
  step: EditableSessionStep,
  sessionAutoTags: readonly Tag[] = [],
): CroquisRuntimeStep => ({
  stepId: step.id,
  timeStepPresetId: step.timeStepPresetId ?? null,
  stepOrder: step.stepOrder,
  name: step.name,
  defaultDurationSeconds: step.defaultDurationSeconds,
  tagIds: getUniqueTagIds([...sessionAutoTags, ...step.autoTags]),
  autoAdvance: step.autoAdvance,
  recordSaveEnabled: step.recordSaveEnabled,
  captureEnabled: step.captureEnabled,
  grayscaleEnabled: step.filterEnabled && step.grayscaleEnabled,
  resultRequired: step.resultRequired,
  resultSavePath: step.resultSavePath,
});
