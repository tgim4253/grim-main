import type { RecordExportGridLayoutConfig } from '@/shared/types';
import {
  DEFAULT_RECORD_EXPORT_GRID_LAYOUT,
  DEFAULT_RECORD_EXPORT_PAIR_LAYOUT,
  type RecordExportImageDraftConfig,
  type RecordExportPairLayoutDraftConfig,
  type RecordExportRatioMode,
} from './types';

const RECORD_EXPORT_SETTINGS_STORAGE_KEY = 'grim.recordExport.settings.v1';
const RATIO_MODES = ['original', '1:1', '1:1.6', '1.6:1', 'custom'] as const;

type StoredRecordExportSettings = {
  version: 1;
  outputDirectory: string;
  skipIncomplete: boolean;
  pairLayout: RecordExportPairLayoutDraftConfig;
  gridLayout: RecordExportGridLayoutConfig;
};

export type RecordExportSettingsSnapshot = Omit<StoredRecordExportSettings, 'version'>;

const fallbackRecordExportSettings: RecordExportSettingsSnapshot = {
  outputDirectory: '',
  skipIncomplete: true,
  pairLayout: DEFAULT_RECORD_EXPORT_PAIR_LAYOUT,
  gridLayout: DEFAULT_RECORD_EXPORT_GRID_LAYOUT,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clampInteger(value: unknown, fallback: number, min: number, max = 10_000) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(value), min), max);
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function readRatioMode(value: unknown, fallback: RecordExportRatioMode): RecordExportRatioMode {
  return RATIO_MODES.includes(value as RecordExportRatioMode)
    ? (value as RecordExportRatioMode)
    : fallback;
}

function readImageConfig(
  value: unknown,
  fallback: RecordExportImageDraftConfig,
): RecordExportImageDraftConfig {
  if (!isObject(value)) {
    return fallback;
  }

  return {
    width: clampInteger(value.width, fallback.width, 1),
    height: clampInteger(value.height, fallback.height, 1),
    useRatio: readBoolean(value.useRatio, fallback.useRatio),
    ratioMode: readRatioMode(value.ratioMode, fallback.ratioMode),
    customRatioWidth:
      value.customRatioWidth === undefined
        ? fallback.customRatioWidth
        : clampInteger(value.customRatioWidth, fallback.customRatioWidth ?? 1, 1),
    customRatioHeight:
      value.customRatioHeight === undefined
        ? fallback.customRatioHeight
        : clampInteger(value.customRatioHeight, fallback.customRatioHeight ?? 1, 1),
  };
}

function readPairLayout(value: unknown): RecordExportPairLayoutDraftConfig {
  const fallback = DEFAULT_RECORD_EXPORT_PAIR_LAYOUT;
  if (!isObject(value)) {
    return fallback;
  }

  return {
    source: readImageConfig(value.source, fallback.source),
    result: readImageConfig(value.result, fallback.result),
    gap: clampInteger(value.gap, fallback.gap, 0),
    padding: clampInteger(value.padding, fallback.padding, 0),
    horizontal: readBoolean(value.horizontal, fallback.horizontal),
  };
}

function readGridLayout(value: unknown): RecordExportGridLayoutConfig {
  const fallback = DEFAULT_RECORD_EXPORT_GRID_LAYOUT;
  if (!isObject(value)) {
    return fallback;
  }

  return {
    hGap: clampInteger(value.hGap, fallback.hGap, 0),
    vGap: clampInteger(value.vGap, fallback.vGap, 0),
    padding: clampInteger(value.padding, fallback.padding, 0),
    limitPerLine: clampInteger(value.limitPerLine, fallback.limitPerLine, 1, 100),
  };
}

function getStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
}

export function loadRecordExportSettings(): RecordExportSettingsSnapshot {
  try {
    const storage = getStorage();
    const rawSettings = storage?.getItem(RECORD_EXPORT_SETTINGS_STORAGE_KEY);
    if (!rawSettings) {
      return fallbackRecordExportSettings;
    }

    const parsed: unknown = JSON.parse(rawSettings);
    if (!isObject(parsed) || parsed.version !== 1) {
      return fallbackRecordExportSettings;
    }

    return {
      outputDirectory: readString(parsed.outputDirectory),
      skipIncomplete: readBoolean(parsed.skipIncomplete, true),
      pairLayout: readPairLayout(parsed.pairLayout),
      gridLayout: readGridLayout(parsed.gridLayout),
    };
  } catch {
    return fallbackRecordExportSettings;
  }
}

export function saveRecordExportSettings(settings: RecordExportSettingsSnapshot) {
  try {
    getStorage()?.setItem(
      RECORD_EXPORT_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        ...settings,
      } satisfies StoredRecordExportSettings),
    );
  } catch {
    // Ignore localStorage failures, export should still work.
  }
}
