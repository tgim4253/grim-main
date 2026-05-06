import type { SessionPreset } from '../../../shared/types';

export const ACTIVE_SESSION_PRESET_STORAGE_KEY = 'grim.activeSessionPresetId';

export const getStoredActiveSessionPresetId = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(ACTIVE_SESSION_PRESET_STORAGE_KEY);
};

export const setStoredActiveSessionPresetId = (presetId: string | null) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (presetId) {
    window.localStorage.setItem(ACTIVE_SESSION_PRESET_STORAGE_KEY, presetId);
    return;
  }

  window.localStorage.removeItem(ACTIVE_SESSION_PRESET_STORAGE_KEY);
};

export const findFallbackPreset = (
  sessionPresets: SessionPreset[],
  activeSessionPresetId: string | null = getStoredActiveSessionPresetId(),
) => {
  const activePreset = activeSessionPresetId
    ? sessionPresets.find(preset => preset.id === activeSessionPresetId)
    : null;
  if (activePreset) {
    return activePreset;
  }

  const defaultPreset = sessionPresets.find(preset => preset.isDefault);
  if (defaultPreset) {
    return defaultPreset;
  }

  return sessionPresets.length > 0 ? sessionPresets[0] : null;
};
