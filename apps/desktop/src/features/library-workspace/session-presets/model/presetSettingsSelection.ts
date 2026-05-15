import type { Translate } from './presetSettingsFormat';

type NamedPreset = { id: string; name: string };

export function getDuplicateName(name: string, fallbackName: string, t: Translate) {
  const trimmedName = name.trim() || fallbackName;
  return t('presets.duplicate_name', {
    name: trimmedName,
    defaultValue: '{{name}} Copy',
  });
}

export function findCreatedPreset<TPreset extends NamedPreset>(
  previousPresets: readonly TPreset[],
  nextPresets: readonly TPreset[],
  name: string,
) {
  const previousIds = new Set(previousPresets.map(preset => preset.id));
  return (
    nextPresets.find(preset => !previousIds.has(preset.id) && preset.name === name) ??
    nextPresets.find(preset => !previousIds.has(preset.id)) ??
    null
  );
}
