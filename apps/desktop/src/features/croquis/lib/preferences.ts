import { CroquisOption, CroquisPreferences, CroquisPreset } from '@tgim/types/croquis';

const generatePresetId = (): string => {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return `preset-${Math.random().toString(36).slice(2, 10)}`;
};

export const createDefaultCroquisOption = (): CroquisOption => ({
  window: {
    width: null,
    height: null,
  },
  auto: {
    isSkip: false,
  },
  timer: {
    maxTime: 60,
  },
  isCapture: false,
  savePath: '',
  isGray: false,
  isShuffle: false,
});

export const normaliseCroquisOption = (option?: CroquisOption | null): CroquisOption => {
  const fallback = createDefaultCroquisOption();
  const next = option ?? fallback;

  const maxTimeRaw = next.timer?.maxTime;
  const maxTimeValue = Number.isFinite(maxTimeRaw)
    ? Math.max(0, Math.round(maxTimeRaw as number))
    : fallback.timer.maxTime;

  return {
    window: {
      width: next.window?.width ?? null,
      height: next.window?.height ?? null,
    },
    auto: {
      isSkip: next.auto?.isSkip ?? false,
    },
    timer: {
      maxTime: maxTimeValue,
    },
    isCapture: next.isCapture ?? false,
    savePath: next.savePath ?? '',
    isGray: next.isGray ?? false,
    isShuffle: next.isShuffle ?? false,
  };
};

const resolvePresetName = (name: string | undefined, index: number): string => {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  return `Preset ${index + 1}`;
};

export const createPreset = (
  name: string,
  option?: CroquisOption | null,
  fallbackIndex = 0,
): CroquisPreset => ({
  id: generatePresetId(),
  name: resolvePresetName(name, fallbackIndex),
  option: normaliseCroquisOption(option),
});

export const createDefaultCroquisPreferences = (): CroquisPreferences => {
  const preset = createPreset('Preset 1', createDefaultCroquisOption());
  return {
    presets: [preset],
    activePresetId: preset.id,
  };
};

export const normaliseCroquisPreferences = (
  preferences?: CroquisPreferences | null,
): CroquisPreferences => {
  const rawPresets = preferences?.presets ?? [];
  const presets = rawPresets.length
    ? rawPresets.map((preset, index) => ({
        id: preset?.id ?? generatePresetId(),
        name: resolvePresetName(preset?.name, index),
        option: normaliseCroquisOption(preset?.option),
      }))
    : createDefaultCroquisPreferences().presets;

  const fallbackActiveId = presets[0]?.id ?? createPreset('Preset 1').id;
  const requestedActiveId = preferences?.activePresetId;
  const activePresetId = presets.some(preset => preset.id === requestedActiveId)
    ? (requestedActiveId as string)
    : fallbackActiveId;

  return {
    presets,
    activePresetId,
  };
};
