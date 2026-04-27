import type {
  CroquisOption,
  CroquisPreferences,
  LibrarySettings,
  SessionPreset,
} from '../../../shared/types';

export const DEFAULT_OPTION: CroquisOption = {
  window: {
    width: '960',
    height: null,
  },
  auto: {
    isSkip: true,
  },
  timer: {
    maxTime: 180,
  },
  isRecordSave: true,
  isCapture: false,
  savePath: '',
  isGray: false,
  isShuffle: false,
};

export const cloneOption = (option?: CroquisOption | null): CroquisOption => ({
  window: {
    width: option?.window.width ?? DEFAULT_OPTION.window.width,
    height: option?.window.height ?? DEFAULT_OPTION.window.height,
  },
  auto: {
    isSkip: option?.auto.isSkip ?? DEFAULT_OPTION.auto.isSkip,
  },
  timer: {
    maxTime: option?.timer.maxTime ?? DEFAULT_OPTION.timer.maxTime,
  },
  isRecordSave: option?.isRecordSave ?? DEFAULT_OPTION.isRecordSave,
  isCapture: option?.isCapture ?? DEFAULT_OPTION.isCapture,
  savePath: option?.savePath ?? DEFAULT_OPTION.savePath,
  isGray: option?.isGray ?? DEFAULT_OPTION.isGray,
  isShuffle: option?.isShuffle ?? DEFAULT_OPTION.isShuffle,
});

export const buildPreferences = (option: CroquisOption): CroquisPreferences => ({
  presets: [
    {
      id: 'default',
      name: 'Default',
      option,
    },
  ],
  activePresetId: 'default',
});

export const findFallbackPreset = (
  sessionPresets: SessionPreset[],
  librarySettings: LibrarySettings,
) => {
  const activePreset = sessionPresets.find(
    preset => preset.id === librarySettings.activeSessionPresetId,
  );
  if (activePreset) {
    return activePreset;
  }

  const defaultPreset = sessionPresets.find(preset => preset.isDefault);
  if (defaultPreset) {
    return defaultPreset;
  }

  return sessionPresets.length > 0 ? sessionPresets[0] : null;
};
