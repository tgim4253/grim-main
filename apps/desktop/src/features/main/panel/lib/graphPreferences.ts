import { GraphOption, GraphPreferences, GraphPreset } from '@tgim/types/graph-settings';
import { createNewId } from '@tgim/utils/identifier';

const DEFAULT_PRESET_NAME = '기본 그래프';

export const createDefaultGraphOption = (): GraphOption => ({
  visibleLevels: [],
  perKindLevels: {},
  maxDepth: null,
  hideLevelTwoNodes: false,
  connectionKinds: { include: [], exclude: [] },
  nodeKinds: { include: [], exclude: [] },
  clauses: [],
});

export const normaliseGraphOption = (option?: GraphOption | null): GraphOption => {
  if (!option) {
    return createDefaultGraphOption();
  }

  const normalisedVisibleLevels = Array.isArray(option.visibleLevels)
    ? option.visibleLevels
        .map(level => Number(level))
        .filter(level => Number.isFinite(level))
    : [];

  const perKindLevelsEntries = option.perKindLevels
    ? Object.entries(option.perKindLevels).map(([key, levels]) => [
        key,
        Array.isArray(levels)
          ? levels
              .map(level => Number(level))
              .filter(level => Number.isFinite(level))
          : [],
      ])
    : [];

  return {
    visibleLevels: normalisedVisibleLevels,
    perKindLevels: Object.fromEntries(perKindLevelsEntries),
    maxDepth:
      typeof option.maxDepth === 'number' && Number.isFinite(option.maxDepth)
        ? option.maxDepth
        : null,
    hideLevelTwoNodes: Boolean(option.hideLevelTwoNodes),
    connectionKinds: {
      include: Array.isArray(option.connectionKinds?.include)
        ? option.connectionKinds.include.slice()
        : [],
      exclude: Array.isArray(option.connectionKinds?.exclude)
        ? option.connectionKinds.exclude.slice()
        : [],
    },
    nodeKinds: {
      include: Array.isArray(option.nodeKinds?.include) ? option.nodeKinds.include.slice() : [],
      exclude: Array.isArray(option.nodeKinds?.exclude) ? option.nodeKinds.exclude.slice() : [],
    },
    clauses: Array.isArray(option.clauses)
      ? option.clauses.map(clause => ({ ...clause }))
      : [],
  };
};

export const createPreset = (name: string, option?: GraphOption | null): GraphPreset => ({
  id: createNewId(),
  name,
  option: normaliseGraphOption(option),
});

export const createDefaultGraphPreferences = (): GraphPreferences => {
  const preset = createPreset(DEFAULT_PRESET_NAME, createDefaultGraphOption());
  return {
    presets: [preset],
    activePresetId: preset.id,
  };
};

export const normaliseGraphPreferences = (
  preferences?: GraphPreferences | null,
): GraphPreferences => {
  if (!preferences) {
    return createDefaultGraphPreferences();
  }

  const presets = Array.isArray(preferences.presets)
    ? preferences.presets.map(preset => ({
        ...preset,
        id: preset.id || createNewId(),
        name: preset.name?.trim() || DEFAULT_PRESET_NAME,
        option: normaliseGraphOption(preset.option),
      }))
    : createDefaultGraphPreferences().presets;

  if (presets.length === 0) {
    return createDefaultGraphPreferences();
  }

  const activePresetId =
    presets.some(preset => preset.id === preferences.activePresetId)
      ? preferences.activePresetId
      : presets[0].id;

  return {
    presets,
    activePresetId,
  };
};
